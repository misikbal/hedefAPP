import type { Types } from 'mongoose';
import { addDays, localDateOf, weekStartOf, type SkipAllowance } from '@takip/shared';
import {
  Block,
  BlockInstance,
  Goal,
  ProgressLog,
  type BlockInstanceDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { getSettings, type UserContext } from './users.js';

async function getInstance(user: UserContext, id: string): Promise<BlockInstanceDoc> {
  const inst = await BlockInstance.findOne({ _id: id, userId: user.id });
  if (!inst) throw new AppError(404, 'INSTANCE_NOT_FOUND', 'Kayıt bulunamadı');
  return inst;
}

export async function skipAllowanceForWeek(
  userId: Types.ObjectId,
  weekStart: string,
): Promise<SkipAllowance> {
  const settings = await getSettings(userId);
  const used = await BlockInstance.countDocuments({
    userId,
    status: 'skipped',
    date: { $gte: weekStart, $lte: addDays(weekStart, 6) },
  });
  return { used, allowance: settings.skipAllowancePerWeek };
}

export async function markDone(user: UserContext, id: string): Promise<BlockInstanceDoc> {
  const inst = await getInstance(user, id);
  const today = localDateOf(clock.now(), user.timezone);
  if (inst.date > today) {
    throw new AppError(409, 'INSTANCE_IN_FUTURE', 'İleri tarihli bir blok tamamlanamaz');
  }
  if (inst.status === 'done') return inst;
  if (inst.status === 'skipped') {
    throw new AppError(409, 'INSTANCE_SKIPPED', 'Atlanan blok önce geri alınmalı');
  }
  inst.status = 'done';
  inst.doneAt = clock.now();
  // Hedefe bağlı blok: miktar kadar otomatik ilerleme kaydı.
  const block = await Block.findById(inst.blockId).select('goalId goalAmount').lean();
  if (block?.goalId && block.goalAmount) {
    const goalActive = await Goal.exists({ _id: block.goalId, archived: false });
    if (goalActive) {
      const log = await ProgressLog.create({
        userId: inst.userId,
        goalId: block.goalId,
        amount: block.goalAmount,
        date: inst.date,
        source: 'block',
      });
      inst.progressLogId = log._id;
    }
  }
  await inst.save();
  return inst;
}

export async function undo(user: UserContext, id: string): Promise<BlockInstanceDoc> {
  const inst = await getInstance(user, id);
  if (inst.status !== 'done' && inst.status !== 'skipped') return inst;
  inst.status = 'planned';
  inst.doneAt = null;
  if (inst.progressLogId) {
    await ProgressLog.deleteOne({ _id: inst.progressLogId });
    inst.progressLogId = null;
  }
  await inst.save();
  return inst;
}

export async function skip(user: UserContext, id: string): Promise<BlockInstanceDoc> {
  const inst = await getInstance(user, id);
  if (inst.status === 'skipped') return inst;
  if (inst.status !== 'planned') {
    throw new AppError(409, 'INSTANCE_NOT_PLANNED', 'Yalnızca planlanmış bir blok atlanabilir');
  }
  const { used, allowance } = await skipAllowanceForWeek(user.id, weekStartOf(inst.date));
  if (used >= allowance) {
    throw new AppError(409, 'SKIP_LIMIT_REACHED', 'Bu haftaki atlama hakkın doldu', {
      used,
      allowance,
    });
  }
  inst.status = 'skipped';
  await inst.save();
  return inst;
}
