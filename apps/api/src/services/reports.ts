import {
  DAY_NAMES,
  OPEN_PENALTY_STATUSES,
  addDays,
  daysBetween,
  formatNumber,
  isoDayOfWeek,
  isoWeekId,
  isoWeekNumber,
  isoWeekStart,
  localDateOf,
  localTimeOf,
  weekDates,
  weekStartOf,
  zonedDateTimeToUtc,
  UNIT_LABELS,
  type GoalUnit,
  type WeeklyReport,
} from '@takip/shared';
import { Goal, Penalty, WeeklyReport as WeeklyReportModel } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { completionByDay, goalTotals } from './stats.js';
import type { UserContext } from './users.js';

/** Haftalık rapor pazar bu saatte hazırlanır (yerel). */
export const WEEKLY_REPORT_TIME = '21:00';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "Bisiklet", "Bisiklet ve Almanca", "Bisiklet, Kitap ve Almanca" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ve ${names.at(-1)!}`;
}

function buildNote(r: Omit<WeeklyReport, 'note' | 'computedAt'>): string {
  const met = r.goals.filter((g) => g.met);
  const missed = r.goals
    .filter((g) => !g.met)
    .map((g) => ({ ...g, gap: (g.target - g.value) / g.target }))
    .sort((a, b) => b.gap - a.gap);
  const parts: string[] = [];
  if (r.goals.length === 0) {
    parts.push(
      r.blocks.total
        ? `Bu hafta ${r.blocks.done}/${r.blocks.total} blok tamamlandı.`
        : 'Bu hafta programda blok yoktu.',
    );
  } else if (missed.length === 0) {
    parts.push('Bütün hedefler tuttu. Gelecek hafta aynı tempoyu koru.');
  } else {
    if (met.length) parts.push(`${joinNames(met.map((g) => g.name))} tuttu.`);
    const worst = missed[0]!;
    const unit = UNIT_LABELS[worst.unit as GoalUnit] ?? worst.unit;
    const gap = formatNumber(round1(worst.target - worst.value));
    parts.push(
      worst.period === 'daily'
        ? `${worst.name} günlük ortalaması ${gap} ${unit} eksik kaldı; her güne küçük bir blok eklemek açığı kapatır.`
        : `${worst.name} ${gap} ${unit} geride kaldı; gelecek hafta bunun için bir blok eklemek açığı kapatır.`,
    );
  }
  if (r.penalties.postponed) parts.push(`${r.penalties.postponed} ceza ertelendi.`);
  return parts.join(' ');
}

/** Haftanın raporunu hesaplar (önbelleğe yazmaz). */
export async function computeWeeklyReport(
  user: UserContext,
  weekStart: string,
): Promise<WeeklyReport> {
  const now = clock.now();
  const tz = user.timezone;
  const today = localDateOf(now, tz);
  const weekEnd = addDays(weekStart, 6);
  const until = today < weekEnd ? today : weekEnd;

  const byDay = await completionByDay(user.id, weekStart, weekEnd);
  const days = weekDates(weekStart).map((date) => {
    const c = byDay.get(date) ?? { done: 0, missed: 0 };
    const total = c.done + c.missed;
    return { date, done: c.done, total, ratio: total ? c.done / total : null };
  });
  const done = days.reduce((a, d) => a + d.done, 0);
  const total = days.reduce((a, d) => a + d.total, 0);
  const best = days
    .filter((d) => d.ratio !== null && d.done > 0)
    .sort((a, b) => b.ratio! - a.ratio! || b.done - a.done)[0];

  const goals = await Goal.find({
    userId: user.id,
    archived: false,
    period: { $in: ['daily', 'weekly'] },
    startDate: { $lte: weekEnd },
  }).sort({ createdAt: 1 });
  const totals = await goalTotals(
    user.id,
    goals.map((g) => g._id),
    weekStart,
    weekEnd,
  );
  const goalRows = goals.map((g) => {
    const sum = totals.get(g.id as string) ?? 0;
    let value = sum;
    if (g.period === 'daily') {
      const from = g.startDate > weekStart ? g.startDate : weekStart;
      const counted = Math.max(1, daysBetween(from, until) + 1);
      value = sum / counted;
    }
    value = round1(value);
    return {
      goalId: g.id as string,
      name: g.name,
      unit: g.unit,
      period: g.period as 'daily' | 'weekly',
      value,
      target: g.target,
      met: value >= g.target,
    };
  });

  const from = zonedDateTimeToUtc(weekStart, '00:00', tz);
  const to = zonedDateTimeToUtc(addDays(weekEnd, 1), '00:00', tz);
  const penalties = await Penalty.find({ userId: user.id, createdAt: { $gte: from, $lt: to } })
    .select('status resolvedAt dueAt postponements escalations')
    .lean();
  const penaltySummary = {
    created: penalties.length,
    doneOnTime: penalties.filter(
      (p) =>
        p.status === 'done' &&
        !p.postponements &&
        !p.escalations &&
        p.resolvedAt &&
        p.resolvedAt <= p.dueAt,
    ).length,
    postponed: penalties.filter((p) => (p.postponements ?? 0) > 0).length,
    open: penalties.filter((p) => (OPEN_PENALTY_STATUSES as readonly string[]).includes(p.status))
      .length,
  };

  const base = {
    isoWeek: isoWeekId(weekStart),
    weekNumber: isoWeekNumber(weekStart),
    weekStart,
    weekEnd,
    complete: today > weekEnd,
    blocks: { done, total, percent: total ? Math.round((done / total) * 100) : null },
    days,
    bestDay: best?.date ?? null,
    goals: goalRows,
    penalties: penaltySummary,
  };
  return { ...base, note: buildNote(base), computedAt: now.toISOString() };
}

/** "latest": pazar 21:00'den sonra bu hafta, öncesinde geçen hafta. */
export function latestReportWeek(now: Date, tz: string): string {
  const today = localDateOf(now, tz);
  const thisWeek = weekStartOf(today);
  const ready = isoDayOfWeek(today) === 7 && localTimeOf(now, tz) >= WEEKLY_REPORT_TIME;
  return ready ? thisWeek : addDays(thisWeek, -7);
}

/** Bitmiş haftalar önbellekten okunur; bitmemiş hafta her istekte yeniden hesaplanır. */
export async function getWeeklyReport(user: UserContext, isoWeek: string): Promise<WeeklyReport> {
  const start =
    isoWeek === 'latest' ? latestReportWeek(clock.now(), user.timezone) : isoWeekStart(isoWeek);
  if (!start) throw new AppError(400, 'INVALID_WEEK', 'Geçersiz hafta');
  const id = isoWeekId(start);
  const cached = await WeeklyReportModel.findOne({ userId: user.id, isoWeek: id }).lean();
  if (cached && (cached.data as WeeklyReport).complete) return cached.data as WeeklyReport;
  const report = await computeWeeklyReport(user, start);
  if (report.complete || cached) await saveReport(user, report);
  return report;
}

async function saveReport(user: UserContext, report: WeeklyReport): Promise<void> {
  await WeeklyReportModel.updateOne(
    { userId: user.id, isoWeek: report.isoWeek },
    { $set: { data: report, computedAt: clock.now() } },
    { upsert: true },
  );
}

/** Pazar 21:00 işi: bu haftanın raporu hesaplanır, önbelleğe yazılır; push metni döner. */
export async function prepareWeeklyReport(
  user: UserContext,
): Promise<{ report: WeeklyReport; title: string; body: string }> {
  const start = weekStartOf(localDateOf(clock.now(), user.timezone));
  const report = await computeWeeklyReport(user, start);
  await saveReport(user, report);
  const pct = report.blocks.percent === null ? '' : `%${report.blocks.percent} · `;
  const bestDay = report.bestDay
    ? ` En iyi gün ${DAY_NAMES[isoDayOfWeek(report.bestDay) - 1]}.`
    : '';
  return {
    report,
    title: `Hafta ${report.weekNumber} raporu hazır`,
    body: `${pct}${report.blocks.done}/${report.blocks.total} blok.${bestDay}`,
  };
}
