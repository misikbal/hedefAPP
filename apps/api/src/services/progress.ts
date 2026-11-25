import type { Types } from 'mongoose';
import { localDateOf, progressCreateSchema, type ProgressCreate } from '@takip/shared';
import { Goal, ProgressLog, type ProgressLogDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import type { UserContext } from './users.js';

type Source = 'app' | 'mcp' | 'block' | 'focus';

export async function logProgress(
  user: UserContext,
  input: ProgressCreate,
  source: Source = 'app',
): Promise<ProgressLogDoc> {
  const data = progressCreateSchema.parse(input);
  const goal = await Goal.findOne({ _id: data.goalId, userId: user.id });
  if (!goal) throw new AppError(404, 'GOAL_NOT_FOUND', 'Hedef bulunamadı');
  if (goal.archived) throw new AppError(409, 'GOAL_ARCHIVED', 'Silinmiş hedefe ilerleme girilemez');
  const today = localDateOf(clock.now(), user.timezone);
  const date = data.date ?? today;
  if (date > today)
    throw new AppError(400, 'DATE_IN_FUTURE', 'İleri bir tarihe ilerleme girilemez');
  return ProgressLog.create({
    userId: user.id,
    goalId: goal._id,
    amount: data.amount,
    date,
    source,
    note: data.note ?? null,
  });
}

export async function deleteProgress(
  user: UserContext,
  id: string | Types.ObjectId,
): Promise<void> {
  const res = await ProgressLog.deleteOne({ _id: id, userId: user.id });
  if (res.deletedCount === 0) throw new AppError(404, 'PROGRESS_NOT_FOUND', 'Kayıt bulunamadı');
}
