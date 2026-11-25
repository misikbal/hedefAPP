import type { Types } from 'mongoose';
import {
  MISS_GRACE_MINUTES,
  addDays,
  addMonths,
  daysBetween,
  isoWeekNumber,
  localDateOf,
  localTimeOf,
  monthEndOf,
  nextPeriodStart,
  periodBounds,
  timeToMinutes,
  weekStartOf,
  type Category,
  type GoalHistory,
  type GoalSummary,
  type StatsOverview,
  type StatsRange,
} from '@takip/shared';
import { Block, BlockInstance, Goal, ProgressLog, type GoalDoc } from '../db/models/index.js';
import { toGoalDto } from '../lib/serialize.js';
import { clock } from './clock.js';
import { elapsedOf, endedSessionsBetween } from './focus.js';
import type { UserContext } from './users.js';

/* ---------- aggregation yardımcıları ---------- */

/** goalId → (yerel gün → toplam) */
export async function dailySums(
  userId: Types.ObjectId,
  goalIds: Types.ObjectId[],
  from: string,
  to: string,
): Promise<Map<string, Map<string, number>>> {
  const rows = await ProgressLog.aggregate<{
    _id: { goalId: Types.ObjectId; date: string };
    total: number;
  }>([
    { $match: { userId, goalId: { $in: goalIds }, date: { $gte: from, $lte: to } } },
    { $group: { _id: { goalId: '$goalId', date: '$date' }, total: { $sum: '$amount' } } },
  ]);
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = String(r._id.goalId);
    if (!out.has(key)) out.set(key, new Map());
    out.get(key)!.set(r._id.date, r.total);
  }
  return out;
}

/** goalId → aralık toplamı */
export async function goalTotals(
  userId: Types.ObjectId,
  goalIds: Types.ObjectId[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const rows = await ProgressLog.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { userId, goalId: { $in: goalIds }, date: { $gte: from, $lte: to } } },
    { $group: { _id: '$goalId', total: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.total]));
}

const sumRange = (days: Map<string, number> | undefined, from: string, to: string) => {
  let total = 0;
  days?.forEach((v, d) => {
    if (d >= from && d <= to) total += v;
  });
  return total;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- hedef özeti ---------- */

/** Periyodun ne kadarının geçtiği (0–1). Günlük hedeflerde 07:00–23:00 arası esas alınır. */
function elapsedFraction(
  period: GoalDoc['period'],
  start: string,
  end: string,
  now: Date,
  tz: string,
): number {
  if (period === 'daily') {
    const m = timeToMinutes(localTimeOf(now, tz));
    return Math.min(1, Math.max(0, (m - 7 * 60) / (16 * 60)));
  }
  const today = localDateOf(now, tz);
  return daysBetween(start, today) / (daysBetween(start, end) + 1);
}

export async function goalSummaries(user: UserContext, goals: GoalDoc[]): Promise<GoalSummary[]> {
  const now = clock.now();
  const today = localDateOf(now, user.timezone);
  const bounds = goals.map((g) => periodBounds(g.period, today));
  const from = bounds.reduce((a, b) => (b.start < a ? b.start : a), today);
  const sums = await dailySums(
    user.id,
    goals.map((g) => g._id),
    from,
    today,
  );

  return goals.map((g, i) => {
    const { start, end } = bounds[i]!;
    const current = round1(sumRange(sums.get(g.id as string), start, today));
    const expected = g.target * elapsedFraction(g.period, start, end, now, user.timezone);
    const status = current >= g.target ? 'done' : current >= expected * 0.8 ? 'on_track' : 'behind';
    return {
      ...toGoalDto(g),
      current,
      periodStart: start,
      periodEnd: end,
      daysLeft: daysBetween(today, end),
      status,
    };
  });
}

/* ---------- hedef geçmişi (son N hafta / ay) ---------- */

export async function goalHistory(
  user: UserContext,
  goal: GoalDoc,
  periods: number,
): Promise<GoalHistory> {
  const today = localDateOf(clock.now(), user.timezone);
  const monthly = goal.period === 'monthly';
  const currentStart = monthly ? `${today.slice(0, 7)}-01` : weekStartOf(today);
  const starts = Array.from({ length: periods }, (_, i) =>
    monthly
      ? addMonths(currentStart, i - periods + 1)
      : addDays(currentStart, 7 * (i - periods + 1)),
  );
  const sums = await dailySums(user.id, [goal._id], starts[0]!, today);
  const days = sums.get(goal.id as string);
  const MONTHS = [
    'Oca',
    'Şub',
    'Mar',
    'Nis',
    'May',
    'Haz',
    'Tem',
    'Ağu',
    'Eyl',
    'Eki',
    'Kas',
    'Ara',
  ];

  const buckets = starts.map((start) => {
    const end = monthly ? monthEndOf(start) : addDays(start, 6);
    const current = start === currentStart;
    const total = sumRange(days, start, end);
    let value = total;
    if (goal.period === 'daily') {
      // Günlük hedef: haftalık günlük ortalama (bu hafta için geçen günler üzerinden)
      const counted = current ? daysBetween(start, today) + 1 : 7;
      value = total / counted;
    }
    value = round1(value);
    return {
      start,
      label: monthly ? MONTHS[Number(start.slice(5, 7)) - 1]! : `H${isoWeekNumber(start)}`,
      value,
      met: value >= goal.target,
      current,
    };
  });

  // Yalnızca hedef başladıktan sonraki tamamlanmış periyotlar sayılır.
  const firstBucket = monthly ? `${goal.startDate.slice(0, 7)}-01` : weekStartOf(goal.startDate);
  const done = buckets.filter((b) => !b.current && b.start >= firstBucket);
  return {
    bucket: monthly ? 'month' : 'week',
    aggregate: goal.period === 'daily' ? 'daily_avg' : 'sum',
    target: goal.target,
    unit: goal.unit,
    buckets,
    avg: done.length ? round1(done.reduce((a, b) => a + b.value, 0) / done.length) : null,
    best: done.length ? Math.max(...done.map((b) => b.value)) : null,
    missed: done.filter((b) => !b.met).length,
    completed: done.length,
  };
}

/* ---------- seriler ---------- */

export async function goalStreak(
  user: UserContext,
  goal: GoalDoc,
): Promise<{ current: number; best: number }> {
  const today = localDateOf(clock.now(), user.timezone);
  const first = periodBounds(goal.period, goal.startDate).start;
  if (first > today) return { current: 0, best: 0 };
  const sums = (await dailySums(user.id, [goal._id], first, today)).get(goal.id as string);

  // reset_streak cezası: güncel seri, sıfırlamanın düştüğü periyottan itibaren sayılır.
  const resetFrom = goal.streakResetAt
    ? periodBounds(goal.period, localDateOf(goal.streakResetAt, user.timezone)).start
    : null;

  const met: { start: string; ok: boolean }[] = [];
  let currentMet = false;
  for (let s = first; s <= today; s = nextPeriodStart(goal.period, s)) {
    const { end } = periodBounds(goal.period, s);
    const ok = sumRange(sums, s, end) >= goal.target;
    if (end >= today)
      currentMet = ok; // devam eden periyot
    else met.push({ start: s, ok });
  }
  // Devam eden periyot tamamlandıysa seriye eklenir; tamamlanmadıysa seriyi bozmaz.
  const seq = currentMet ? [...met, { start: today, ok: true }] : met;
  let best = 0;
  let run = 0;
  for (const { ok } of seq) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // En iyi seri geçmişi korur; güncel seri sıfırlamadan sonrasıdır.
  let current = 0;
  for (const { start, ok } of seq) {
    if (resetFrom && start < resetFrom) continue;
    current = ok ? current + 1 : 0;
  }
  return { current, best };
}

/* ---------- tamamlama oranı ---------- */

interface DayCounts {
  done: number;
  missed: number;
}

/**
 * Yerel gün → done/missed sayıları. Ceza motoru `missed` yazar; motor henüz çalışmadıysa
 * bitişinden 30 dakika geçmiş planned kayıtlar da kaçırılmış sayılır.
 */
export async function completionByDay(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<Map<string, DayCounts>> {
  const missCutoff = new Date(clock.now().getTime() - MISS_GRACE_MINUTES * 60_000);
  const rows = await BlockInstance.aggregate<{ _id: string; done: number; missed: number }>([
    { $match: { userId, date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$date',
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        missed: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$status', 'missed'] },
                  { $and: [{ $eq: ['$status', 'planned'] }, { $lte: ['$endAt', missCutoff] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, { done: r.done, missed: r.missed }]));
}

const rate = (c: DayCounts) =>
  c.done + c.missed === 0 ? null : (c.done / (c.done + c.missed)) * 100;

function aggregateCounts(map: Map<string, DayCounts>, from: string, to: string): DayCounts {
  const total = { done: 0, missed: 0 };
  map.forEach((c, d) => {
    if (d >= from && d <= to) {
      total.done += c.done;
      total.missed += c.missed;
    }
  });
  return total;
}

/* ---------- genel bakış ---------- */

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTH_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];

function rangeBounds(range: StatsRange, today: string) {
  const week = weekStartOf(today);
  if (range === 'week') return { from: week, to: addDays(week, 6), prevFrom: addDays(week, -7) };
  if (range === '12w')
    return { from: addDays(week, -77), to: addDays(week, 6), prevFrom: addDays(week, -77 - 84) };
  const y = Number(today.slice(0, 4));
  return { from: `${y}-01-01`, to: `${y}-12-31`, prevFrom: `${y - 1}-01-01` };
}

export async function statsOverview(user: UserContext, range: StatsRange): Promise<StatsOverview> {
  const now = clock.now();
  const today = localDateOf(now, user.timezone);
  const { from, to, prevFrom } = rangeBounds(range, today);
  const until = today < to ? today : to;
  const prevTo = addDays(prevFrom, daysBetween(from, until));
  const heatFrom = addDays(weekStartOf(today), -77);
  const heatTo = addDays(weekStartOf(today), 6);

  const minDate = [prevFrom, heatFrom].sort()[0]!;
  const counts = await completionByDay(user.id, minDate, until);

  // Skor ve önceki döneme göre fark
  const scoreNow = rate(aggregateCounts(counts, from, until));
  const scorePrev = rate(aggregateCounts(counts, prevFrom, prevTo));
  const score = scoreNow === null ? null : Math.round(scoreNow);
  const delta =
    scoreNow === null || scorePrev === null ? null : Math.round(scoreNow) - Math.round(scorePrev);

  // Eğilim
  const trend: StatsOverview['trend'] = [];
  if (range === 'week') {
    for (let d = from, i = 0; d <= until; d = addDays(d, 1), i++) {
      trend.push({ label: DAY_SHORT[i]!, value: roundOrNull(rate(aggregateCounts(counts, d, d))) });
    }
  } else if (range === '12w') {
    for (let w = from; w <= until; w = addDays(w, 7)) {
      trend.push({
        label: `H${isoWeekNumber(w)}`,
        value: roundOrNull(rate(aggregateCounts(counts, w, addDays(w, 6)))),
      });
    }
  } else {
    for (let m = from; m <= until; m = addMonths(m, 1)) {
      trend.push({
        label: MONTH_SHORT[Number(m.slice(5, 7)) - 1]!,
        value: roundOrNull(rate(aggregateCounts(counts, m, monthEndOf(m)))),
      });
    }
  }

  // Isı haritası: bloklardan tamamlama oranı; blok yoksa ilerleme girilen gün 1. seviye
  const goals = await Goal.find({ userId: user.id, archived: false }).sort({ createdAt: 1 });
  const activeDays = new Set(
    (
      await ProgressLog.aggregate<{ _id: string }>([
        { $match: { userId: user.id, date: { $gte: heatFrom, $lte: today } } },
        { $group: { _id: '$date' } },
      ])
    ).map((r) => r._id),
  );
  const heatmap: StatsOverview['heatmap'] = [];
  for (let d = heatFrom; d <= heatTo; d = addDays(d, 1)) {
    const c = counts.get(d);
    const r = c ? rate(c) : null;
    let level = 0;
    if (r !== null && r > 0) level = Math.max(1, Math.ceil(r / 25));
    else if (r === null && activeDays.has(d)) level = 1;
    heatmap.push({ date: d, level: d > today ? 0 : level, future: d > today });
  }

  // Hedef toplamları
  const ids = goals.map((g) => g._id);
  const [curTotals, prevTotals] = await Promise.all([
    goalTotals(user.id, ids, from, until),
    goalTotals(user.id, ids, prevFrom, prevTo),
  ]);
  const totals = goals.map((g) => {
    const value = round1(curTotals.get(g.id as string) ?? 0);
    const prev = prevTotals.get(g.id as string) ?? 0;
    return {
      goalId: g.id as string,
      name: g.name,
      unit: g.unit,
      value,
      change: prev === 0 ? null : Math.round(((value - prev) / prev) * 100) / 100,
    };
  });

  // Seriler
  const streaks = await Promise.all(
    goals
      .filter((g) => g.trackStreak)
      .map(async (g) => ({
        goalId: g.id as string,
        name: g.name,
        period: g.period,
        ...(await goalStreak(user, g)),
      })),
  );

  return {
    range,
    from,
    to,
    score,
    delta,
    trend,
    heatmap,
    totals,
    streaks,
    split: await timeSplit(user.id, from, until),
  };
}

const roundOrNull = (n: number | null) => (n === null ? null : Math.round(n));

/**
 * Kategoriye göre zaman: tamamlanan blokların süresi + tamamlanan/bölünen odak seansları.
 * Seansın kategorisi bağlı hedefin kategorisi, yoksa `project`. Seans ve blok bağımsız sayılır
 * (Faz 4 kararı: kullanıcı blokları Odak hedefine bağlamaz).
 */
export async function timeSplit(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<StatsOverview['split']> {
  const rows = await BlockInstance.aggregate<{ _id: Types.ObjectId; ms: number }>([
    { $match: { userId, status: 'done', date: { $gte: from, $lte: to } } },
    { $group: { _id: '$blockId', ms: { $sum: { $subtract: ['$endAt', '$startAt'] } } } },
  ]);
  const blocks = await Block.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('category')
    .lean();
  const cat = new Map(blocks.map((b) => [String(b._id), b.category as Category]));
  const minutes = new Map<Category, number>();
  for (const r of rows) {
    const c = cat.get(String(r._id)) ?? 'other';
    minutes.set(c, (minutes.get(c) ?? 0) + r.ms / 60_000);
  }
  const sessions = await endedSessionsBetween(userId, from, to);
  const goalIds = [...new Set(sessions.flatMap((s) => (s.goalId ? [String(s.goalId)] : [])))];
  const goalCat = new Map(
    (
      await Goal.find({ _id: { $in: goalIds } })
        .select('category')
        .lean()
    ).map((g) => [String(g._id), g.category as Category]),
  );
  for (const s of sessions) {
    const c = (s.goalId && goalCat.get(String(s.goalId))) || 'project';
    minutes.set(c, (minutes.get(c) ?? 0) + elapsedOf(s) / 60_000);
  }
  const total = [...minutes.values()].reduce((a, b) => a + b, 0);
  return [...minutes.entries()]
    .map(([category, m]) => ({
      category,
      minutes: Math.round(m),
      pct: total ? Math.round((m / total) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}
