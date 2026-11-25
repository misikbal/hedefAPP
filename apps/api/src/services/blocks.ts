import type { Types } from 'mongoose';
import { localDateOf, type BlockCreate, type BlockUpdate } from '@takip/shared';
import { blockCreateSchema, blockUpdateSchema } from '@takip/shared';
import { Block, type BlockDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { assertGoalUsable } from './goals.js';
import { assertRuleUsable } from './penaltyRules.js';
import { generateForNewBlock, regenerateFuture } from './schedule.js';
import type { UserContext } from './users.js';

/** REST ve MCP aynı servis katmanını kullanır. */

export async function listBlocks(user: UserContext, includeArchived = false): Promise<BlockDoc[]> {
  const filter: Record<string, unknown> = { userId: user.id };
  if (!includeArchived) filter.archived = false;
  return Block.find(filter).sort({ startTime: 1, title: 1 });
}

export async function getBlock(
  user: UserContext,
  blockId: string | Types.ObjectId,
): Promise<BlockDoc> {
  const block = await Block.findOne({ _id: blockId, userId: user.id });
  if (!block) throw new AppError(404, 'BLOCK_NOT_FOUND', 'Blok bulunamadı');
  return block;
}

export async function createBlock(user: UserContext, input: BlockCreate): Promise<BlockDoc> {
  const data = blockCreateSchema.parse(input);
  await assertGoalUsable(user, data.goalId);
  await assertRuleUsable(user, data.penaltyRuleId, 'block_missed');
  assertGoalAmount(data.goalId, data.goalAmount);
  const today = localDateOf(clock.now(), user.timezone);
  const block = await Block.create({
    ...data,
    userId: user.id,
    validFrom: data.validFrom && data.validFrom > today ? data.validFrom : today,
  });
  await generateForNewBlock(block, user.timezone);
  return block;
}

export async function updateBlock(
  user: UserContext,
  blockId: string,
  input: BlockUpdate,
): Promise<BlockDoc> {
  const changes = blockUpdateSchema.parse(input);
  const block = await getBlock(user, blockId);
  if (block.archived) throw new AppError(409, 'BLOCK_ARCHIVED', 'Silinmiş blok düzenlenemez');
  if (changes.goalId !== undefined) await assertGoalUsable(user, changes.goalId);
  if (changes.penaltyRuleId !== undefined) {
    await assertRuleUsable(user, changes.penaltyRuleId, 'block_missed');
  }
  block.set(changes);
  if (!block.goalId) block.goalAmount = null;
  assertGoalAmount(block.goalId, block.goalAmount);
  // Yalnızca bir alan değiştiğinde de bitiş > başlangıç kuralı korunmalı.
  if (block.endTime <= block.startTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Bitiş saati başlangıçtan sonra olmalı');
  }
  await block.save();
  await regenerateFuture(block, user.timezone);
  return block;
}

/** Silme = arşivleme. Geçmiş kayıtlar ve istatistikler kalır, gelecekteki planlar silinir. */
export async function archiveBlock(user: UserContext, blockId: string): Promise<BlockDoc> {
  const block = await getBlock(user, blockId);
  if (!block.archived) {
    block.archived = true;
    block.validTo = localDateOf(clock.now(), user.timezone);
    await block.save();
  }
  await regenerateFuture(block, user.timezone);
  return block;
}

function assertGoalAmount(goalId: unknown, goalAmount: number | null | undefined): void {
  if (goalId && !goalAmount) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Hedefe sayılacak miktarı gir');
  }
}
