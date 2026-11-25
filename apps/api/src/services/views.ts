import type { Types } from 'mongoose';
import {
  MISS_GRACE_MINUTES,
  addDays,
  isoWeekNumber,
  localDateOf,
  weekDates,
  weekStartOf,
  type BlockHistory,
  type Instance,
  type TodayResponse,
  type WeekResponse,
  withPossessive,
} from '@takip/shared';
import { Block, BlockInstance, type BlockDoc, type BlockInstanceDoc } from '../db/models/index.js';
import { toInstanceDto, toPenaltyDto } from '../lib/serialize.js';
import { clock } from './clock.js';
import { getBlock } from './blocks.js';
import { listGoals } from './goals.js';
import { goalSummaries } from './stats.js';
import { skipAllowanceForWeek } from './instances.js';
import { blockPenaltyTexts, nextOpenPenalty } from './penalties.js';
import { ensureWeek } from './schedule.js';
import type { UserContext } from './users.js';

async function instancesBetween(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<Instance[]> {
  const docs = await BlockInstance.find({ userId, date: { $gte: from, $lte: to } });
  const blockIds = [...new Set(docs.map((d) => String(d.blockId)))];
  const blocks = new Map<string, BlockDoc>(
    (await Block.find({ _id: { $in: blockIds } })).map((b) => [b.id as string, b]),
  );
  const penalties = await blockPenaltyTexts(
    userId,
    [...blocks.values()].map((b) => ({
      id: b.id as string,
      category: b.category,
      penaltyRuleId: b.penaltyRuleId,
    })),
  );
  return docs
    .flatMap((d: BlockInstanceDoc) => {
      const b = blocks.get(String(d.blockId));
      return b ? [toInstanceDto(d, b, penalties.get(b.id as string) ?? null)] : [];
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Faz 5'te services/motivation ile değişecek basit şablon. */
function noteFor(instances: Instance[]): string | null {
  const counted = instances.filter((i) => i.status !== 'skipped');
  if (counted.length === 0) return null;
  const done = counted.filter((i) => i.status === 'done').length;
  if (done === counted.length) return `${counted.length} bloğun hepsi bitti. Bugünü kapattın.`;
  return `${counted.length} bloğun ${withPossessive(done)} bitti. Sıradaki blok seni bekliyor.`;
}

export async function getToday(user: UserContext): Promise<TodayResponse> {
  const today = localDateOf(clock.now(), user.timezone);
  const weekStart = weekStartOf(today);
  await ensureWeek(user.id, weekStart, user.timezone);
  const instances = await instancesBetween(user.id, today, today);
  const pending = await nextOpenPenalty(user);
  return {
    date: today,
    instances,
    goals: await goalSummaries(user, await listGoals(user)),
    pendingPenalty: pending ? toPenaltyDto(pending) : null,
    note: noteFor(instances),
    lastClaudeChange: null,
    skip: await skipAllowanceForWeek(user.id, weekStart),
  };
}

export async function getWeek(user: UserContext, start?: string): Promise<WeekResponse> {
  const weekStart = weekStartOf(start ?? localDateOf(clock.now(), user.timezone));
  await ensureWeek(user.id, weekStart, user.timezone);
  const instances = await instancesBetween(user.id, weekStart, addDays(weekStart, 6));
  return {
    weekStart,
    days: weekDates(weekStart).map((date) => ({
      date,
      instances: instances.filter((i) => i.date === date),
    })),
    skip: await skipAllowanceForWeek(user.id, weekStart),
  };
}

/**
 * Son N hafta (bu hafta dahil). Ceza motoru `missed` yazar; motor henüz çalışmadıysa
 * bitişinden 30 dakika geçmiş planned kayıtlar da kaçırılmış sayılır.
 */
export async function getBlockHistory(
  user: UserContext,
  blockId: string,
  weeks: number,
): Promise<BlockHistory> {
  const block = await getBlock(user, blockId);
  const now = clock.now();
  const missCutoff = new Date(now.getTime() - MISS_GRACE_MINUTES * 60_000);
  const current = weekStartOf(localDateOf(now, user.timezone));
  const first = addDays(current, -7 * (weeks - 1));
  const docs = await BlockInstance.find({
    blockId: block._id,
    date: { $gte: first, $lte: addDays(current, 6) },
  });

  const result: BlockHistory['weeks'] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(first, 7 * i);
    const inWeek = docs.filter((d) => weekStartOf(d.date) === ws);
    const statuses = inWeek.map((d) =>
      d.status === 'planned' && d.endAt <= missCutoff ? 'missed' : d.status,
    );
    const status = statuses.includes('missed')
      ? 'missed'
      : statuses.includes('done')
        ? 'done'
        : statuses.includes('skipped')
          ? 'skipped'
          : statuses.length
            ? 'planned'
            : 'none';
    result.push({ weekStart: ws, label: `H${isoWeekNumber(ws)}`, status });
  }
  const counted = result.filter((w) => w.status === 'done' || w.status === 'missed');
  return {
    weeks: result,
    doneWeeks: counted.filter((w) => w.status === 'done').length,
    countedWeeks: counted.length,
  };
}
