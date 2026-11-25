import type { Types } from 'mongoose';
import {
  DAY_NAMES,
  MISS_GRACE_MINUTES,
  MONTH_NAMES,
  OPEN_PENALTY_STATUSES,
  PENALTY_DUE_SOON_MINUTES,
  addDays,
  addMonths,
  blockShortTitle,
  formatNumber,
  isoDayOfWeek,
  isoWeekNumber,
  localDateOf,
  periodBounds,
  rulesForBlock,
  rulesForGoal,
  zonedDateTimeToUtc,
  type GoalPeriod,
} from '@takip/shared';
import {
  Block,
  BlockInstance,
  Goal,
  Penalty,
  User,
  type GoalDoc,
  type PenaltyDoc,
} from '../db/models/index.js';
import { clock } from './clock.js';
import { notify } from './notify.js';
import { deadlineOf, listRules, toMatchable } from './penaltyRules.js';
import {
  computeDueAt,
  createPenalty,
  penaltyText,
  ruleForPenalty,
  type NewPenalty,
} from './penalties.js';
import { dailySums } from './stats.js';

const MINUTE = 60_000;
/** Periyot kapanışı yerel saatle ertesi periyodun ilk gününün 00:05'i */
const PERIOD_CLOSE_TIME = '00:05';
/** Sunucu uzun süre kapalı kalırsa en fazla bu kadar geriye bakılır */
const GOAL_LOOKBACK_DAYS = 35;

export interface EngineResult {
  missed: number;
  created: number;
  escalated: number;
}

/**
 * Ceza motoru. Agenda her 15 dakikada bir çağırır; testler doğrudan çağırır.
 * Her adım idempotenttir: aynı `now` ile iki kez çalışmak ikinci kez ceza üretmez.
 */
export async function runPenaltyEngine(now: Date = clock.now()): Promise<EngineResult> {
  const result: EngineResult = { missed: 0, created: 0, escalated: 0 };
  const users = await User.find().select('timezone').lean();
  const tzOf = new Map(users.map((u) => [String(u._id), u.timezone ?? 'Europe/Istanbul']));

  await markMissedInstances(now, tzOf, result);
  for (const u of users) await closeGoalPeriods(u._id, tzOf.get(String(u._id))!, now, result);
  await escalateOverdue(now, tzOf, result);
  await warnDueSoon(now);
  return result;
}

/* ---------- 4. süresi bitmek üzere olan cezalar ---------- */

const remainingText = (ms: number): string => {
  const min = Math.max(1, Math.round(ms / MINUTE));
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
};

/**
 * Süresinin bitmesine 2 saatten az kalan açık cezalar için bir kez uyarı gönderir
 * (`dueAt` değişirse — erteleme, yükseltme — yeni süre için yeniden). Süresi zaten 2 saatten
 * kısa verilmiş cezalar ("Yeni ceza" bildirimi yeter) uyarılmaz.
 */
export async function warnDueSoon(now: Date = clock.now()): Promise<number> {
  const windowEnd = new Date(now.getTime() + PENALTY_DUE_SOON_MINUTES * MINUTE);
  const due = await Penalty.find({
    status: { $in: OPEN_PENALTY_STATUSES },
    dueAt: { $gt: now, $lte: windowEnd },
  });
  let sent = 0;
  for (const p of due) {
    const windowStart = p.dueAt.getTime() - PENALTY_DUE_SOON_MINUTES * MINUTE;
    if (p.updatedAt && p.updatedAt.getTime() > windowStart) continue;
    await notify.send(p.userId, {
      type: 'penalty_due_soon',
      penaltyId: p.id as string,
      dueKey: p.dueAt.toISOString(),
      title: 'Ceza süresi bitiyor',
      body: `${penaltyText(p)} · ${remainingText(p.dueAt.getTime() - now.getTime())} kaldı`,
    });
    sent++;
  }
  return sent;
}

/* ---------- 1. kaçırılan bloklar ---------- */

async function markMissedInstances(
  now: Date,
  tzOf: Map<string, string>,
  result: EngineResult,
): Promise<void> {
  const cutoff = new Date(now.getTime() - MISS_GRACE_MINUTES * MINUTE);
  const instances = await BlockInstance.find({ status: 'planned', endAt: { $lte: cutoff } });
  if (!instances.length) return;

  const blocks = new Map(
    (await Block.find({ _id: { $in: instances.map((i) => i.blockId) } })).map((b) => [
      b.id as string,
      b,
    ]),
  );
  const rulesByUser = new Map<string, ReturnType<typeof toMatchable>[]>();
  for (const userId of new Set(instances.map((i) => String(i.userId)))) {
    const rules = await listRules(instances.find((i) => String(i.userId) === userId)!.userId, {
      trigger: 'block_missed',
      enabledOnly: true,
    });
    rulesByUser.set(userId, rules.map(toMatchable));
  }

  for (const inst of instances) {
    const block = blocks.get(String(inst.blockId));
    const tz = tzOf.get(String(inst.userId)) ?? 'Europe/Istanbul';
    if (block) {
      const missedAt = new Date(inst.endAt.getTime() + MISS_GRACE_MINUTES * MINUTE);
      const rules = rulesForBlock(
        {
          id: block.id as string,
          category: block.category,
          penaltyRuleId: block.penaltyRuleId ? String(block.penaltyRuleId) : null,
        },
        rulesByUser.get(String(inst.userId)) ?? [],
      )
        // Kural, blok kaçırılmış sayıldıktan sonra oluşturulduysa geriye dönük uygulanmaz.
        .filter((r) => r.doc.createdAt <= missedAt);

      const title = inst.overrides?.title ?? block.title;
      const start = inst.overrides?.startTime ?? block.startTime;
      const reason = `${DAY_NAMES[isoDayOfWeek(inst.date) - 1]} ${start} ${blockShortTitle(title)} bloğu yapılmadı`;
      for (const r of rules) {
        const p = await createPenalty({
          userId: inst.userId,
          rule: ruleForPenalty(r.doc),
          source: { type: 'instance', id: inst.id as string },
          reason,
          now,
          tz,
          goalId: block.goalId,
        });
        if (p) result.created++;
      }
    }
    // Ceza önce yazılır, durum sonra: arada çökse bile tekrar çalışınca ceza kaybolmaz.
    const res = await BlockInstance.updateOne(
      { _id: inst._id, status: 'planned' },
      { status: 'missed' },
    );
    result.missed += res.modifiedCount;
  }
}

/* ---------- 2. hedef periyot kapanışı ---------- */

const prevPeriodStart = (period: GoalPeriod, start: string): string =>
  period === 'daily'
    ? addDays(start, -1)
    : period === 'weekly'
      ? addDays(start, -7)
      : addMonths(start, -1);

function goalReason(goal: GoalDoc, start: string, total: number): string {
  const label =
    goal.period === 'daily'
      ? `${Number(start.slice(8, 10))} ${MONTH_NAMES[Number(start.slice(5, 7)) - 1]}`
      : goal.period === 'weekly'
        ? `Hafta ${isoWeekNumber(start)}`
        : MONTH_NAMES[Number(start.slice(5, 7)) - 1]!;
  return `${label} ${goal.name} hedefi tutmadı (${formatNumber(total)}/${formatNumber(goal.target)} ${goal.unit})`;
}

async function closeGoalPeriods(
  userId: Types.ObjectId,
  tz: string,
  now: Date,
  result: EngineResult,
): Promise<void> {
  const rules = (await listRules(userId, { trigger: 'goal_failed', enabledOnly: true })).map(
    toMatchable,
  );
  if (!rules.length) return;
  const goals = await Goal.find({ userId, archived: false });
  const today = localDateOf(now, tz);
  const oldest = now.getTime() - GOAL_LOOKBACK_DAYS * 24 * 60 * MINUTE;

  for (const goal of goals) {
    const matched = rulesForGoal(
      {
        id: goal.id as string,
        category: goal.category,
        penaltyRuleId: goal.penaltyRuleId ? String(goal.penaltyRuleId) : null,
      },
      rules,
    );
    if (!matched.length) continue;
    const earliestRule = Math.min(...matched.map((r) => r.doc.createdAt.getTime()));

    // İçinde bulunulan periyottan geriye doğru kapanmış periyotlar.
    const periods: { start: string; end: string; closeAt: Date }[] = [];
    let start = prevPeriodStart(goal.period, periodBounds(goal.period, today).start);
    for (;;) {
      const { end } = periodBounds(goal.period, start);
      const closeAt = zonedDateTimeToUtc(addDays(end, 1), PERIOD_CLOSE_TIME, tz);
      if (closeAt.getTime() < oldest || closeAt.getTime() <= earliestRule) break;
      // Yalnızca hedefin başlangıcından sonra tam olarak yaşanmış periyotlar.
      if (start < goal.startDate) break;
      if (closeAt <= now) periods.push({ start, end, closeAt });
      start = prevPeriodStart(goal.period, start);
    }
    // Bir önceki periyot henüz kapanmadıysa (00:00–00:05 arası) döngü onu atladı; sorun değil.
    if (!periods.length) continue;

    const first = periods[periods.length - 1]!.start;
    const days = (await dailySums(userId, [goal._id], first, today)).get(goal.id as string);
    const existing = new Set(
      (
        await Penalty.find({
          userId,
          'sourceRef.type': 'goal_period',
          'sourceRef.id': { $in: periods.map((p) => `${goal.id as string}:${p.start}`) },
        })
          .select('ruleId sourceRef')
          .lean()
      ).map((p) => `${String(p.ruleId)}|${p.sourceRef.id}`),
    );

    for (const period of periods) {
      let total = 0;
      days?.forEach((v, d) => {
        if (d >= period.start && d <= period.end) total += v;
      });
      total = Math.round(total * 10) / 10;
      if (total >= goal.target) continue;
      const sourceId = `${goal.id as string}:${period.start}`;
      for (const r of matched) {
        if (r.doc.createdAt >= period.closeAt) continue;
        if (existing.has(`${r.id}|${sourceId}`)) continue;
        const p = await createPenalty({
          userId,
          rule: ruleForPenalty(r.doc),
          source: { type: 'goal_period', id: sourceId },
          reason: goalReason(goal, period.start, total),
          now,
          tz,
          goalId: goal._id,
        });
        if (p) result.created++;
      }
    }
  }
}

/* ---------- 3. süresi geçen cezalar ---------- */

async function escalateOverdue(
  now: Date,
  tzOf: Map<string, string>,
  result: EngineResult,
): Promise<void> {
  const overdue = await Penalty.find({
    status: { $in: OPEN_PENALTY_STATUSES },
    dueAt: { $lt: now },
  });
  for (const p of overdue) {
    const tz = tzOf.get(String(p.userId)) ?? 'Europe/Istanbul';
    if (await escalate(p, now, tz)) result.escalated++;
  }
}

/**
 * Yükseltme: `double` çarpanı ikiye katlar; `plus_one` aynı cezadan bir tane daha ekler
 * (eklenen ceza kendi süresi geçerse çoğalmaz, iki katına çıkar); `reset_streak` bağlı
 * hedefin serisini sıfırlar. Her durumda borç sürer: yeni bir süre verilir ve durum
 * `escalated` olur.
 */
async function escalate(p: PenaltyDoc, now: Date, tz: string): Promise<boolean> {
  const deadline = deadlineOf(p.deadline);
  const nextDue = computeDueAt(now, deadline, tz);
  const plusOne = p.onFail === 'plus_one' && p.sourceRef.type !== 'penalty_escalation';
  const doubles = p.onFail === 'double' || (p.onFail === 'plus_one' && !plusOne);

  // Aynı süre bitişi için yalnızca bir kez yükseltilir (eşzamanlı çalışmaya karşı).
  const claimed = await Penalty.findOneAndUpdate(
    { _id: p._id, dueAt: p.dueAt, status: { $in: OPEN_PENALTY_STATUSES } },
    {
      ...(doubles ? { $mul: { multiplier: 2 } } : {}),
      $inc: { escalations: 1 },
      $set: { status: 'escalated', dueAt: nextDue },
    },
    { new: true },
  );
  if (!claimed) return false;

  if (plusOne) {
    const extra: NewPenalty = {
      userId: claimed.userId,
      rule: { _id: claimed.ruleId, penalty: claimed.penalty, onFail: 'double', deadline },
      source: { type: 'penalty_escalation', id: `${claimed.id as string}:${claimed.escalations}` },
      reason: `Süresinde yapılmadı: ${penaltyText(claimed)}`,
      now,
      tz,
      goalId: claimed.goalId,
      onFail: 'double',
    };
    await createPenalty(extra);
  } else if (p.onFail === 'reset_streak' && claimed.goalId) {
    await Goal.updateOne({ _id: claimed.goalId }, { streakResetAt: now });
  }

  await notify.send(claimed.userId, {
    type: 'penalty_escalated',
    penaltyId: claimed.id as string,
    escalations: claimed.escalations,
    title:
      p.onFail === 'reset_streak'
        ? 'Ceza süresinde yapılmadı, seri sıfırlandı'
        : `Ceza büyüdü: ${penaltyText(claimed)}`,
    body: claimed.reason,
  });
  return true;
}
