import type { Types } from 'mongoose';
import {
  addDays,
  isoDayOfWeek,
  localDateOf,
  weekDates,
  weekStartOf,
  zonedDateTimeToUtc,
} from '@takip/shared';
import { Block, BlockInstance, type BlockDoc } from '../db/models/index.js';
import { clock } from './clock.js';

type Id = Types.ObjectId | string;

/** Blok kuralı verilen yerel güne düşüyor mu? */
export function blockOccursOn(
  block: Pick<BlockDoc, 'daysOfWeek' | 'validFrom' | 'validTo' | 'repeatWeekly'>,
  date: string,
): boolean {
  if (date < block.validFrom) return false;
  if (block.validTo && date > block.validTo) return false;
  if (!block.daysOfWeek.includes(isoDayOfWeek(date))) return false;
  if (!block.repeatWeekly && weekStartOf(date) !== weekStartOf(block.validFrom)) return false;
  return true;
}

interface EnsureOptions {
  /** Yalnızca bu bloklar için üret (varsayılan: kullanıcının tüm aktif blokları). */
  blockIds?: Id[];
  /** Bu andan önce başlayan instance'lar üretilmez (blok düzenlemesinde "şimdi"). */
  notBefore?: Date;
}

/**
 * Haftanın instance'larını kurallardan üretir. İdempotenttir: unique {blockId,date} + $setOnInsert.
 * Geçmiş günler için hiçbir zaman yeni kayıt üretilmez; blok oluşturulmadan önceki saatler de atlanır.
 */
export async function ensureWeek(
  userId: Id,
  weekStart: string,
  timeZone: string,
  opts: EnsureOptions = {},
): Promise<number> {
  const now = clock.now();
  const today = localDateOf(now, timeZone);
  const filter: Record<string, unknown> = { userId, archived: false };
  if (opts.blockIds) filter._id = { $in: opts.blockIds };
  const blocks = await Block.find(filter);

  const ops = [];
  for (const block of blocks) {
    const createdAt = (block as unknown as { createdAt: Date }).createdAt;
    const notBefore = opts.notBefore && opts.notBefore > createdAt ? opts.notBefore : createdAt;
    for (const date of weekDates(weekStart)) {
      if (date < today || !blockOccursOn(block, date)) continue;
      const startAt = zonedDateTimeToUtc(date, block.startTime, timeZone);
      if (startAt < notBefore) continue;
      const endAt = zonedDateTimeToUtc(date, block.endTime, timeZone);
      ops.push({
        updateOne: {
          filter: { blockId: block._id, date },
          update: {
            $setOnInsert: {
              userId: block.userId,
              blockId: block._id,
              date,
              startAt,
              endAt,
              status: 'planned',
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (ops.length === 0) return 0;
  const res = await BlockInstance.bulkWrite(ops, { ordered: false });
  return res.upsertedCount;
}

/** Bugünden itibaren, hâlihazırda üretilmiş son haftaya kadar olan hafta başları (en az bu hafta). */
async function materializedWeeks(userId: Id, timeZone: string): Promise<string[]> {
  const current = weekStartOf(localDateOf(clock.now(), timeZone));
  const last = await BlockInstance.findOne({ userId }).sort({ date: -1 }).select('date').lean();
  const lastWeek = last && last.date > current ? weekStartOf(last.date) : current;
  const weeks: string[] = [];
  for (let w = current; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

/**
 * Blok düzenlendiğinde/silindiğinde: gelecekteki planned instance'ları siler, sonra yeniden üretir.
 * Başlamış ya da işaretlenmiş (done/skipped/missed) kayıtlara dokunulmaz.
 */
export async function regenerateFuture(block: BlockDoc, timeZone: string): Promise<void> {
  const now = clock.now();
  // Silmeden önce hesaplanmalı: silme, üretilmiş son haftanın kaydını da götürebilir.
  const weeks = await materializedWeeks(block.userId, timeZone);
  await BlockInstance.deleteMany({ blockId: block._id, status: 'planned', startAt: { $gt: now } });
  if (block.archived) return;
  for (const week of weeks) {
    await ensureWeek(block.userId, week, timeZone, { blockIds: [block._id], notBefore: now });
  }
}

/** Yeni blok için: bu hafta ve zaten üretilmiş sonraki haftalar. */
export async function generateForNewBlock(block: BlockDoc, timeZone: string): Promise<void> {
  for (const week of await materializedWeeks(block.userId, timeZone)) {
    await ensureWeek(block.userId, week, timeZone, { blockIds: [block._id] });
  }
}
