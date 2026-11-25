import type { Types } from 'mongoose';
import {
  BACKGROUND_INTERRUPT_MS,
  FOCUS_ABANDON_AFTER_HOURS,
  FOCUS_GOAL_UNITS,
  MAX_INTERRUPTIONS,
  OPEN_FOCUS_STATUSES,
  addDays,
  focusElapsedMs,
  focusFinishSchema,
  focusInterruptSchema,
  focusMinutesOf,
  focusStartSchema,
  localDateOf,
  minutesToGoalAmount,
  weekStartOf,
  type FocusFinish,
  type FocusFinishResponse,
  type FocusInterrupt,
  type FocusStart,
  type FocusStatus,
  type FocusWeek,
} from '@takip/shared';
import {
  FocusSession,
  Goal,
  ProgressLog,
  type FocusSessionDoc,
  type GoalDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { toFocusDto } from '../lib/serialize.js';
import { clock } from './clock.js';
import type { UserContext } from './users.js';

const OPEN: FocusStatus[] = [...OPEN_FOCUS_STATUSES];
const ENDED_COUNTED: FocusStatus[] = ['completed', 'interrupted'];
const round1 = (n: number) => Math.round(n * 10) / 10;

const isOpen = (s: { status: FocusStatus }) => OPEN.includes(s.status);
const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

const STATE_MESSAGES: Record<string, string> = {
  completed: 'Bu seans zaten tamamlandı',
  interrupted: 'Bu seans bölünerek bitti',
  abandoned: 'Bu seans sıfırlandı',
  running: 'Seans zaten sürüyor',
  paused: 'Seans duraklatılmış',
};
const invalidState = (status: string) =>
  new AppError(409, 'FOCUS_INVALID_STATE', STATE_MESSAGES[status] ?? 'Bu işlem yapılamaz');

export const elapsedOf = (s: FocusSessionDoc, now: Date = clock.now()) =>
  focusElapsedMs(
    {
      plannedMinutes: s.plannedMinutes,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      pausedMs: s.pausedMs,
      pausedAt: s.pausedAt,
    },
    now,
  );

async function getSession(user: UserContext, id: string): Promise<FocusSessionDoc> {
  const s = await FocusSession.findOne({ _id: id, userId: user.id });
  if (!s) throw new AppError(404, 'FOCUS_NOT_FOUND', 'Odak seansı bulunamadı');
  return s;
}

/**
 * Seansın süresinin yazılacağı hedef. `goalId` verilmezse birimi saat/dakika olan ilk aktif hedef.
 */
export async function resolveFocusGoal(
  user: UserContext,
  goalId?: string | Types.ObjectId | null,
): Promise<GoalDoc | null> {
  if (goalId) {
    const goal = await Goal.findOne({ _id: goalId, userId: user.id, archived: false });
    if (!goal) throw new AppError(400, 'GOAL_NOT_FOUND', 'Seçilen hedef bulunamadı');
    if (!(FOCUS_GOAL_UNITS as readonly string[]).includes(goal.unit)) {
      throw new AppError(
        400,
        'GOAL_UNIT_INVALID',
        'Odak süresi yalnızca saat ya da dakika birimli bir hedefe yazılabilir',
      );
    }
    return goal;
  }
  return Goal.findOne({
    userId: user.id,
    archived: false,
    unit: { $in: FOCUS_GOAL_UNITS },
  }).sort({ createdAt: 1, _id: 1 });
}

/* ---------- durum geçişleri ---------- */

export async function startFocus(user: UserContext, input: FocusStart): Promise<FocusSessionDoc> {
  const data = focusStartSchema.parse(input);
  await abandonStaleSessions(user.id);
  const goal = await resolveFocusGoal(user, data.goalId);
  const now = clock.now();
  try {
    return await FocusSession.create({
      userId: user.id,
      label: data.label,
      plannedMinutes: data.plannedMinutes,
      date: localDateOf(now, user.timezone),
      startedAt: now,
      status: 'running',
      goalId: goal?._id ?? null,
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new AppError(409, 'FOCUS_ALREADY_OPEN', 'Zaten açık bir odak seansın var');
    }
    throw err;
  }
}

export async function pauseFocus(user: UserContext, id: string): Promise<FocusSessionDoc> {
  const s = await getSession(user, id);
  if (s.status !== 'running') throw invalidState(s.status);
  const updated = await FocusSession.findOneAndUpdate(
    { _id: s._id, status: 'running' },
    { $set: { status: 'paused', pausedAt: clock.now() } },
    { new: true },
  );
  if (!updated) return pauseFocus(user, id);
  return updated;
}

export async function resumeFocus(user: UserContext, id: string): Promise<FocusSessionDoc> {
  const s = await getSession(user, id);
  if (s.status !== 'paused') throw invalidState(s.status);
  const now = clock.now();
  const extra = s.pausedAt ? Math.max(0, now.getTime() - s.pausedAt.getTime()) : 0;
  const updated = await FocusSession.findOneAndUpdate(
    { _id: s._id, status: 'paused', pausedAt: s.pausedAt },
    { $set: { status: 'running', pausedAt: null, pausedMs: s.pausedMs + extra } },
    { new: true },
  );
  if (!updated) return resumeFocus(user, id);
  return updated;
}

/** Açık seansı kapatır (duraklama varsa toplamına eklenir). Yarış olursa yeniden dener. */
async function closeSession(
  s: FocusSessionDoc,
  status: 'completed' | 'interrupted' | 'abandoned',
): Promise<FocusSessionDoc> {
  const now = clock.now();
  const extra = s.pausedAt ? Math.max(0, now.getTime() - s.pausedAt.getTime()) : 0;
  const updated = await FocusSession.findOneAndUpdate(
    { _id: s._id, status: s.status, pausedAt: s.pausedAt },
    { $set: { status, endedAt: now, pausedAt: null, pausedMs: s.pausedMs + extra } },
    { new: true },
  );
  if (updated) return updated;
  const fresh = await FocusSession.findById(s._id).orFail();
  return isOpen(fresh) ? closeSession(fresh, status) : fresh;
}

/**
 * Gerçekleşen süreyi hedefe `ProgressLog { source: 'focus' }` olarak yazar. İdempotent:
 * seansta `progressLogId` varsa ya da başka bir istek önce yazdıysa yeni kayıt kalmaz.
 */
async function writeProgress(s: FocusSessionDoc): Promise<FocusSessionDoc> {
  if (!s.goalId || s.progressLogId || s.status === 'abandoned') return s;
  const goal = await Goal.findOne({ _id: s.goalId, archived: false });
  if (!goal) return s;
  const amount = minutesToGoalAmount(focusMinutesOf(elapsedOf(s)), goal.unit);
  if (!amount || amount <= 0) return s;
  const log = await ProgressLog.create({
    userId: s.userId,
    goalId: goal._id,
    amount,
    date: s.date,
    source: 'focus',
    note: s.label,
  });
  const updated = await FocusSession.findOneAndUpdate(
    { _id: s._id, progressLogId: null },
    { $set: { progressLogId: log._id } },
    { new: true },
  );
  if (!updated) {
    await ProgressLog.deleteOne({ _id: log._id });
    return FocusSession.findById(s._id).orFail();
  }
  return updated;
}

export async function finishFocus(
  user: UserContext,
  id: string,
  input: FocusFinish = {},
): Promise<FocusFinishResponse> {
  const data = focusFinishSchema.parse(input);
  let s = await getSession(user, id);
  if (s.status === 'abandoned') throw invalidState(s.status);
  if (isOpen(s)) s = await closeSession(s, 'completed');
  s = await writeProgress(s);

  const set: Record<string, unknown> = {};
  if (data.note !== undefined) set.note = data.note === '' ? null : data.note;
  if (data.interruptions !== undefined) set.interruptions = data.interruptions;
  if (Object.keys(set).length) {
    s = await FocusSession.findByIdAndUpdate(s._id, { $set: set }, { new: true }).orFail();
  }
  return { session: toFocusDto(s, clock.now()), week: await finishWeekTotals(user, s) };
}

export async function interruptFocus(
  user: UserContext,
  id: string,
  input: FocusInterrupt,
): Promise<FocusSessionDoc> {
  const data = focusInterruptSchema.parse(input);
  const s = await getSession(user, id);
  if (data.end) {
    if (!isOpen(s)) return s;
    return writeProgress(await closeSession(s, 'interrupted'));
  }
  if (!isOpen(s)) throw invalidState(s.status);
  const bg = data.backgroundMs ?? 0;
  if (bg < BACKGROUND_INTERRUPT_MS) return s;
  const updated = await FocusSession.findOneAndUpdate(
    { _id: s._id, interruptions: s.interruptions, backgroundMs: s.backgroundMs },
    {
      $set: {
        interruptions: Math.min(MAX_INTERRUPTIONS, s.interruptions + 1),
        backgroundMs: s.backgroundMs + bg,
      },
    },
    { new: true },
  );
  return updated ?? interruptFocus(user, id, input);
}

/** "Sıfırla": seans terk edilir, hedefe yazılmaz. */
export async function abandonFocus(user: UserContext, id: string): Promise<FocusSessionDoc> {
  const s = await getSession(user, id);
  if (s.status === 'abandoned') return s;
  if (!isOpen(s)) throw invalidState(s.status);
  return closeSession(s, 'abandoned');
}

export async function activeFocus(user: UserContext): Promise<FocusSessionDoc | null> {
  await abandonStaleSessions(user.id);
  return FocusSession.findOne({ userId: user.id, status: { $in: OPEN } });
}

/**
 * `startedAt + plannedMinutes + 6 saat` geçmiş açık seanslar `abandoned` olur.
 * Agenda işi ve seans başlatma/geri yükleme çağırır.
 */
export async function abandonStaleSessions(userId?: Types.ObjectId): Promise<number> {
  const now = clock.now();
  const graceMs = FOCUS_ABANDON_AFTER_HOURS * 3_600_000;
  const minCutoff = new Date(now.getTime() - graceMs - 25 * 60_000);
  const candidates = await FocusSession.find({
    ...(userId ? { userId } : {}),
    status: { $in: OPEN },
    startedAt: { $lt: minCutoff },
  });
  let n = 0;
  for (const s of candidates) {
    const deadline = s.startedAt.getTime() + s.plannedMinutes * 60_000 + graceMs;
    if (deadline >= now.getTime()) continue;
    const res = await FocusSession.updateOne(
      { _id: s._id, status: s.status },
      { $set: { status: 'abandoned', endedAt: now, pausedAt: null } },
    );
    n += res.modifiedCount;
  }
  return n;
}

/* ---------- haftalık özet ---------- */

const toHours = (amount: number, unit: string) => (unit === 'dakika' ? amount / 60 : amount);

/** Haftalık odak toplamı (saat). Hedef haftalıksa hedefin kayıtları, değilse seans süreleri. */
async function weeklyHours(
  user: UserContext,
  weekStart: string,
  goal: GoalDoc | null,
): Promise<{ total: number; target: number | null; goalBased: boolean }> {
  const weekEnd = addDays(weekStart, 6);
  if (goal && goal.period === 'weekly') {
    const [row] = await ProgressLog.aggregate<{ total: number }>([
      { $match: { userId: user.id, goalId: goal._id, date: { $gte: weekStart, $lte: weekEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return {
      total: toHours(row?.total ?? 0, goal.unit),
      target: toHours(goal.target, goal.unit),
      goalBased: true,
    };
  }
  const sessions = await FocusSession.find({
    userId: user.id,
    date: { $gte: weekStart, $lte: weekEnd },
    status: { $in: ENDED_COUNTED },
  });
  const minutes = sessions.reduce((a, s) => a + focusMinutesOf(elapsedOf(s)), 0);
  return { total: minutes / 60, target: null, goalBased: false };
}

async function finishWeekTotals(user: UserContext, s: FocusSessionDoc) {
  const goal = s.goalId
    ? await Goal.findOne({ _id: s.goalId, archived: false })
    : await resolveFocusGoal(user);
  const { total, target, goalBased } = await weeklyHours(user, weekStartOf(s.date), goal);
  let contribution = focusMinutesOf(elapsedOf(s)) / 60;
  if (goalBased) {
    const log = s.progressLogId ? await ProgressLog.findById(s.progressLogId) : null;
    contribution = log && goal ? toHours(log.amount, goal.unit) : 0;
  }
  return {
    before: round1(Math.max(0, total - contribution)),
    after: round1(total),
    target: target === null ? null : round1(target),
  };
}

export async function focusWeek(user: UserContext): Promise<FocusWeek> {
  const now = clock.now();
  const today = localDateOf(now, user.timezone);
  const weekStart = weekStartOf(today);
  const sessions = await FocusSession.find({
    userId: user.id,
    date: { $gte: weekStart, $lte: addDays(weekStart, 6) },
    status: { $ne: 'abandoned' },
  }).sort({ startedAt: 1 });
  const { total, target } = await weeklyHours(user, weekStart, await resolveFocusGoal(user));
  const dtos = sessions.map((s) => toFocusDto(s, now));
  const endedToday = dtos.filter((s) => s.date === today && ENDED_COUNTED.includes(s.status));
  return {
    weekStart,
    sessions: dtos,
    totalHours: round1(total),
    targetHours: target === null ? null : round1(target),
    today: {
      peaks: endedToday.filter((s) => s.status === 'completed' && s.reachedPeak).length,
      minutes: endedToday.reduce((a, s) => a + focusMinutesOf(s.elapsedMs), 0),
    },
  };
}

/** Son kullanılan etiketler (en yeni önce, tekil). */
export async function recentLabels(user: UserContext, limit = 6): Promise<string[]> {
  const rows = await FocusSession.aggregate<{ _id: string; last: Date }>([
    { $match: { userId: user.id } },
    { $group: { _id: '$label', last: { $max: '$startedAt' } } },
    { $sort: { last: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => r._id);
}

/** Günün tamamlanan odak süresi (dakika); dayStats ve timeSplit kullanır. */
export async function endedSessionsBetween(
  userId: Types.ObjectId,
  from: string,
  to: string,
): Promise<FocusSessionDoc[]> {
  return FocusSession.find({
    userId,
    date: { $gte: from, $lte: to },
    status: { $in: ENDED_COUNTED },
  });
}
