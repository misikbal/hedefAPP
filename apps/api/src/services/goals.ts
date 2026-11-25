import type { Types } from 'mongoose';
import {
  goalCreateSchema,
  goalUpdateSchema,
  localDateOf,
  type GoalCreate,
  type GoalUpdate,
} from '@takip/shared';
import { Block, Goal, type GoalDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { assertRuleUsable } from './penaltyRules.js';
import type { UserContext } from './users.js';

export async function listGoals(user: UserContext, includeArchived = false): Promise<GoalDoc[]> {
  const filter: Record<string, unknown> = { userId: user.id };
  if (!includeArchived) filter.archived = false;
  return Goal.find(filter).sort({ createdAt: 1 });
}

export async function getGoal(user: UserContext, id: string | Types.ObjectId): Promise<GoalDoc> {
  const goal = await Goal.findOne({ _id: id, userId: user.id });
  if (!goal) throw new AppError(404, 'GOAL_NOT_FOUND', 'Hedef bulunamadı');
  return goal;
}

export async function createGoal(user: UserContext, input: GoalCreate): Promise<GoalDoc> {
  const data = goalCreateSchema.parse(input);
  await assertRuleUsable(user, data.penaltyRuleId, 'goal_failed');
  return Goal.create({
    ...data,
    userId: user.id,
    startDate: data.startDate ?? localDateOf(clock.now(), user.timezone),
  });
}

export async function updateGoal(
  user: UserContext,
  id: string,
  input: GoalUpdate,
): Promise<GoalDoc> {
  const changes = goalUpdateSchema.parse(input);
  const goal = await getGoal(user, id);
  if (goal.archived) throw new AppError(409, 'GOAL_ARCHIVED', 'Silinmiş hedef düzenlenemez');
  if (changes.penaltyRuleId !== undefined) {
    await assertRuleUsable(user, changes.penaltyRuleId, 'goal_failed');
  }
  goal.set(changes);
  await goal.save();
  return goal;
}

/** Silme = arşivleme. İlerleme kayıtları istatistik için kalır; bloklarla bağı kopar. */
export async function archiveGoal(user: UserContext, id: string): Promise<GoalDoc> {
  const goal = await getGoal(user, id);
  goal.archived = true;
  await goal.save();
  await Block.updateMany({ userId: user.id, goalId: goal._id }, { goalId: null, goalAmount: null });
  return goal;
}

/** Blok bir hedefe bağlanırken hedefin kullanıcıya ait ve aktif olduğu doğrulanır. */
export async function assertGoalUsable(
  user: UserContext,
  goalId: string | null | undefined,
): Promise<void> {
  if (!goalId) return;
  const goal = await Goal.findOne({ _id: goalId, userId: user.id, archived: false })
    .select('_id')
    .lean();
  if (!goal) throw new AppError(400, 'GOAL_NOT_FOUND', 'Seçilen hedef bulunamadı');
}
