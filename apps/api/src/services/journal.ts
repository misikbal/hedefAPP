import {
  OPEN_PENALTY_STATUSES,
  addDays,
  journalDateOf,
  journalPutSchema,
  localDateOf,
  monthEndOf,
  zonedDateTimeToUtc,
  type DayStats,
  type JournalDay,
  type JournalPut,
} from '@takip/shared';
import type { Types } from 'mongoose';
import {
  BlockInstance,
  Goal,
  JournalEntry,
  Penalty,
  ProgressLog,
  type JournalEntryDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { toJournalDto } from '../lib/serialize.js';
import { clock } from './clock.js';
import { elapsedOf, endedSessionsBetween, resolveFocusGoal } from './focus.js';
import type { UserContext } from './users.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Günün istatistik çipleri: ilerleme toplamları (odak hedefi hariç, en çok 2 hedef),
 * tamamlanan odak süresi, blok sayısı ve o gün oluşan cezalar.
 */
export async function dayStats(user: UserContext, date: string): Promise<DayStats> {
  const sessions = await endedSessionsBetween(user.id, date, date);
  const focusMinutes = sessions.reduce((a, s) => a + Math.floor(elapsedOf(s) / 60_000), 0);

  const focusGoal = await resolveFocusGoal(user);
  const excluded = new Set<string>(
    [focusGoal?._id, ...sessions.map((s) => s.goalId)].filter(Boolean).map(String),
  );
  const sums = await ProgressLog.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { userId: user.id, date } },
    { $group: { _id: '$goalId', total: { $sum: '$amount' } } },
  ]);
  const ids = sums.map((r) => r._id).filter((id) => !excluded.has(String(id)));
  const goals = await Goal.find({ _id: { $in: ids } }).sort({ createdAt: 1, _id: 1 });
  const totals = new Map(sums.map((r) => [String(r._id), r.total]));

  const instances = await BlockInstance.find({ userId: user.id, date }).select('status').lean();
  const counted = instances.filter((i) => i.status !== 'skipped');

  const from = zonedDateTimeToUtc(date, '00:00', user.timezone);
  const to = zonedDateTimeToUtc(addDays(date, 1), '00:00', user.timezone);
  const penalties = await Penalty.find({ userId: user.id, createdAt: { $gte: from, $lt: to } })
    .select('status')
    .lean();

  return {
    date,
    goals: goals.slice(0, 2).map((g) => ({
      goalId: g.id as string,
      name: g.name,
      unit: g.unit,
      amount: round1(totals.get(g.id as string) ?? 0),
    })),
    focusMinutes,
    blocks: { done: counted.filter((i) => i.status === 'done').length, total: counted.length },
    penalties: {
      created: penalties.length,
      open: penalties.filter((p) => (OPEN_PENALTY_STATUSES as readonly string[]).includes(p.status))
        .length,
    },
  };
}

export async function getJournalDay(user: UserContext, date: string): Promise<JournalDay> {
  const entry = await JournalEntry.findOne({ userId: user.id, date });
  return { date, entry: entry ? toJournalDto(entry) : null, stats: await dayStats(user, date) };
}

export async function putJournal(
  user: UserContext,
  date: string,
  input: JournalPut,
): Promise<JournalEntryDoc> {
  const data = journalPutSchema.parse(input);
  const today = localDateOf(clock.now(), user.timezone);
  if (date > today) {
    throw new AppError(400, 'DATE_IN_FUTURE', 'İleri bir tarihe günlük yazılamaz');
  }
  return JournalEntry.findOneAndUpdate(
    { userId: user.id, date },
    {
      $set: {
        mood: data.mood,
        wentWell: data.wentWell ?? null,
        hard: data.hard ?? null,
        tomorrowOne: data.tomorrowOne ?? null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).orFail();
}

/** Ayın kayıtları (takvim). `month`: YYYY-MM */
export async function journalMonth(user: UserContext, month: string): Promise<JournalEntryDoc[]> {
  const first = `${month}-01`;
  return JournalEntry.find({
    userId: user.id,
    date: { $gte: first, $lte: monthEndOf(first) },
  }).sort({ date: 1 });
}

/** Önceki günler: `before`dan (varsayılan günlüğün bugünü) eski kayıtlar, en yeni önce. */
export async function journalRecent(
  user: UserContext,
  before: string | undefined,
  limit: number,
): Promise<JournalEntryDoc[]> {
  const until = before ?? journalDateOf(clock.now(), user.timezone);
  return JournalEntry.find({ userId: user.id, date: { $lt: until } })
    .sort({ date: -1 })
    .limit(limit);
}
