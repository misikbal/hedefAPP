import {
  MISS_GRACE_MINUTES,
  OPEN_PENALTY_STATUSES,
  addDays,
  computeJournalInsights,
  journalDateOf,
  journalFindings,
  journalPreview,
  journalPutSchema,
  localDateOf,
  localTimeOf,
  monthEndOf,
  monthStartOf,
  weekStartOf,
  zonedDateTimeToUtc,
  type DayStats,
  type JournalDay,
  type JournalInsightRange,
  type JournalInsights,
  type JournalPut,
  type JournalSource,
} from '@takip/shared';
import type { Types } from 'mongoose';
import {
  Block,
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

export interface PutJournalOptions {
  /** Kaydı yazan; yalnızca ilk kayıtta saklanır */
  source?: JournalSource;
}

export async function putJournal(
  user: UserContext,
  date: string,
  input: JournalPut,
  opts: PutJournalOptions = {},
): Promise<JournalEntryDoc> {
  const data = journalPutSchema.parse(input);
  const today = localDateOf(clock.now(), user.timezone);
  if (date > today) {
    throw new AppError(400, 'DATE_IN_FUTURE', 'İleri bir tarihe günlük yazılamaz');
  }
  const set: Record<string, unknown> = {
    mood: data.mood,
    wentWell: data.wentWell ?? null,
    hard: data.hard ?? null,
    tomorrowOne: data.tomorrowOne ?? null,
    daySnapshot: await buildDaySnapshot(user, date),
  };
  // Gönderilmeyen yeni alanlar korunur (eski istemciler ve kısmi Claude yazımı).
  if (data.energy !== undefined) set.energy = data.energy;
  if (data.tags !== undefined) set.tags = data.tags;
  if (data.summary !== undefined) set.summary = data.summary;
  if (data.rawNote !== undefined) set.rawNote = data.rawNote;
  return JournalEntry.findOneAndUpdate(
    { userId: user.id, date },
    { $set: set, $setOnInsert: { source: opts.source ?? 'app' } },
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

/* ---------- günlük analizi ---------- */

interface InstanceRow {
  date: string;
  status: string;
  startAt: Date;
  endAt: Date;
  category: string;
}

/** Bloğun kategorisiyle birlikte gün aralığındaki kayıtlar (atlananlar hariç) */
async function instancesBetween(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<InstanceRow[]> {
  const rows = await BlockInstance.find({
    userId,
    date: { $gte: from, $lte: to },
    status: { $ne: 'skipped' },
  })
    .select('blockId date status startAt endAt')
    .lean();
  const blocks = await Block.find({ _id: { $in: [...new Set(rows.map((r) => r.blockId))] } })
    .select('category')
    .lean();
  const cat = new Map(blocks.map((b) => [String(b._id), b.category as string]));
  return rows.map((r) => ({
    date: r.date,
    status: r.status as string,
    startAt: r.startAt,
    endAt: r.endAt,
    category: cat.get(String(r.blockId)) ?? 'other',
  }));
}

/** Ceza motoruyla aynı kural: missed ya da bitişinden 30 dk geçmiş planned */
function isMissed(i: InstanceRow, now: Date): boolean {
  return (
    i.status === 'missed' ||
    (i.status === 'planned' && i.endAt.getTime() + MISS_GRACE_MINUTES * 60_000 <= now.getTime())
  );
}

/** Gün kesinleşme anı: ertesi gün 00:00 + kaçırma toleransı */
function dayFinalAt(date: string, timezone: string): Date {
  return new Date(
    zonedDateTimeToUtc(addDays(date, 1), '00:00', timezone).getTime() + MISS_GRACE_MINUTES * 60_000,
  );
}

/** Kayıt anındaki gün durumu: blok sayıları, kaçan kategoriler, spor, hedef ilerlemesi. */
export async function buildDaySnapshot(user: UserContext, date: string) {
  const now = clock.now();
  const instances = await instancesBetween(user.id, date, date);
  const missed = instances.filter((i) => isMissed(i, now));
  const sport = instances.filter((i) => i.category === 'sport');

  const goals = await Goal.find({ userId: user.id, archived: false })
    .select('name')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const sums = await ProgressLog.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { userId: user.id, date } },
    { $group: { _id: '$goalId', total: { $sum: '$amount' } } },
  ]);
  const totals = new Map(sums.map((r) => [String(r._id), r.total]));
  const goalProgress: Record<string, number> = {};
  for (const g of goals) goalProgress[g.name] = round1(totals.get(String(g._id)) ?? 0);

  return {
    blocksPlanned: instances.length,
    blocksDone: instances.filter((i) => i.status === 'done').length,
    blocksMissed: missed.length,
    missedCategories: [...new Set(missed.map((i) => i.category))],
    missedStarts: missed.map((i) => localTimeOf(i.startAt, user.timezone)),
    sportDone: sport.length ? sport.some((i) => i.status === 'done') : null,
    goalProgress,
    takenAt: now,
  };
}

/**
 * Gün bitmeden alınmış anlık görüntüleri, gün kesinleşince bir kez yeniler (gündüz yazılan
 * günlükte akşam blokları henüz "planned" olur). Kesinleşmiş görüntü bir daha değişmez.
 */
async function finalizeSnapshots(user: UserContext, entries: JournalEntryDoc[]): Promise<void> {
  const now = clock.now();
  for (const e of entries) {
    const finalAt = dayFinalAt(e.date, user.timezone);
    if (now < finalAt) continue;
    const takenAt = e.daySnapshot?.takenAt;
    if (takenAt && takenAt >= finalAt) continue;
    const snap = await buildDaySnapshot(user, e.date);
    await JournalEntry.updateOne(
      { _id: e._id },
      { $set: { daySnapshot: snap } },
      { timestamps: false },
    );
    e.set('daySnapshot', snap);
  }
}

const STREAK_LOOKBACK_DAYS = 120;

/** Hafta (pazartesi–pazar) ya da ay için günlük örüntüleri; hesap `@takip/shared`te. */
export async function journalInsights(
  user: UserContext,
  range: JournalInsightRange,
  date?: string,
): Promise<JournalInsights> {
  const journalToday = journalDateOf(clock.now(), user.timezone);
  const ref = date ?? journalToday;
  const from = range === 'week' ? weekStartOf(ref) : monthStartOf(ref);
  const to = range === 'week' ? addDays(from, 6) : monthEndOf(from);
  const calendarToday = localDateOf(clock.now(), user.timezone);
  const asOf = to < calendarToday ? to : calendarToday;
  const now = clock.now();

  const entries = await JournalEntry.find({
    userId: user.id,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });
  await finalizeSnapshots(user, entries);

  const lookbackFrom = addDays(asOf, -STREAK_LOOKBACK_DAYS);
  const instances = await instancesBetween(user.id, lookbackFrom < from ? lookbackFrom : from, to);
  const inRange = instances.filter((i) => i.date >= from && i.date <= to);

  const completion = new Map<string, { done: number; missed: number }>();
  for (const i of inRange) {
    const c = completion.get(i.date) ?? { done: 0, missed: 0 };
    if (i.status === 'done') c.done++;
    else if (isMissed(i, now)) c.missed++;
    completion.set(i.date, c);
  }

  const sportResults = instances
    .filter((i) => i.category === 'sport' && i.date <= asOf)
    .filter((i) => i.status === 'done' || isMissed(i, now))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((i) => i.status === 'done');

  const streakAnchor = to < journalToday ? to : journalToday;
  const journalDates = new Set(
    (
      await JournalEntry.find({ userId: user.id, date: { $gte: lookbackFrom, $lte: asOf } })
        .select('date')
        .lean()
    ).map((e) => e.date),
  );

  const core = computeJournalInsights({
    from,
    to,
    // Bugünün günlüğü henüz yazılmadıysa seri dünden sayılır.
    asOf:
      journalDates.has(streakAnchor) || streakAnchor !== journalToday
        ? streakAnchor
        : addDays(streakAnchor, -1),
    entries: entries.map((e) => ({
      date: e.date,
      mood: e.mood,
      energy: e.energy ?? null,
      tags: [...(e.tags ?? [])],
      summary: e.summary ?? (journalPreview(e) || null),
      snapshot: e.daySnapshot
        ? {
            blocksDone: e.daySnapshot.blocksDone ?? 0,
            blocksMissed: e.daySnapshot.blocksMissed ?? 0,
            sportDone: e.daySnapshot.sportDone ?? null,
          }
        : null,
    })),
    completion,
    missed: inRange
      .filter((i) => isMissed(i, now))
      .map((i) => ({ category: i.category, startTime: localTimeOf(i.startAt, user.timezone) })),
    sportResults,
    journalDates,
  });
  return { ...core, findings: journalFindings(core) };
}
