import { Block, Goal, type BlockDoc, type GoalDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { getBlock } from '../services/blocks.js';
import { getGoal } from '../services/goals.js';
import type { UserContext } from '../services/users.js';

/** Claude çoğu zaman kimlik yerine ad verir ("bisiklet"): ada göre hedef / blok bulma. */

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

function pick<T>(items: T[], name: string, label: (t: T) => string, kind: string): T {
  const n = norm(name);
  const exact = items.filter((i) => norm(label(i)) === n);
  if (exact.length === 1) return exact[0]!;
  const partial = exact.length ? exact : items.filter((i) => norm(label(i)).includes(n));
  if (partial.length === 1) return partial[0]!;
  const names = (partial.length ? partial : items).map(label).slice(0, 15).join(', ');
  if (partial.length > 1) {
    throw new AppError(
      409,
      'AMBIGUOUS_NAME',
      `"${name}" birden çok ${kind} ile eşleşti: ${names}. Kimlik ver.`,
    );
  }
  throw new AppError(
    404,
    'NAME_NOT_FOUND',
    `"${name}" adlı ${kind} bulunamadı.${names ? ` Mevcut: ${names}` : ''}`,
  );
}

export async function resolveGoal(
  user: UserContext,
  ref: { goalId?: string | undefined; goalName?: string | undefined },
): Promise<GoalDoc> {
  if (ref.goalId) return getGoal(user, ref.goalId);
  if (!ref.goalName) throw new AppError(400, 'VALIDATION_ERROR', 'goalId ya da goalName gerekli');
  const goals = await Goal.find({ userId: user.id, archived: false });
  return pick(goals, ref.goalName, (g) => g.name, 'hedef');
}

/** Ada göre bulunamazsa null (set_goal yeni hedef oluşturur). */
export async function findGoalByName(user: UserContext, name: string): Promise<GoalDoc | null> {
  const goals = await Goal.find({ userId: user.id, archived: false });
  const n = norm(name);
  const exact = goals.filter((g) => norm(g.name) === n);
  return exact.length === 1 ? exact[0]! : null;
}

export async function resolveBlock(
  user: UserContext,
  ref: { blockId?: string | undefined; blockName?: string | undefined },
): Promise<BlockDoc> {
  if (ref.blockId) return getBlock(user, ref.blockId);
  if (!ref.blockName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'blockId ya da blockName gerekli');
  }
  const blocks = await Block.find({ userId: user.id, archived: false });
  return pick(blocks, ref.blockName, (b) => b.title, 'blok');
}

/** Blok ya da hedef adından kimlik (ceza kuralının hedefi için) */
export async function resolveTargetId(
  user: UserContext,
  targetType: string | undefined,
  targetName: string | undefined,
): Promise<string | undefined> {
  if (!targetName) return undefined;
  if (targetType === 'block')
    return (await resolveBlock(user, { blockName: targetName })).id as string;
  if (targetType === 'goal')
    return (await resolveGoal(user, { goalName: targetName })).id as string;
  throw new AppError(
    400,
    'VALIDATION_ERROR',
    "targetName yalnızca targetType 'block' ya da 'goal' iken kullanılır",
  );
}
