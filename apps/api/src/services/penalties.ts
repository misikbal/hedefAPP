import type { Types } from 'mongoose';
import {
  OPEN_PENALTY_STATUSES,
  addDays,
  localDateOf,
  rulesForBlock,
  scalePenaltyText,
  weekStartOf,
  zonedDateTimeToUtc,
  type PenaltyDeadline,
  type PenaltyOnFail,
  type PenaltySourceType,
  type PenaltyStatus,
} from '@takip/shared';
import { Penalty, PenaltyRule, type PenaltyDoc, type PenaltyRuleDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { notify } from './notify.js';
import { deadlineOf, listRules, toMatchable } from './penaltyRules.js';
import type { UserContext } from './users.js';

const HOUR = 3_600_000;

/**
 * Yapma süresinin bittiği an. `end_of_week`: `from` anının yerel haftasının pazar 23:59'u;
 * 24 saatten az kalıyorsa bir sonraki pazar.
 */
export function computeDueAt(from: Date, deadline: PenaltyDeadline, tz: string): Date {
  if (deadline.type === 'hours') return new Date(from.getTime() + deadline.hours * HOUR);
  const sunday = addDays(weekStartOf(localDateOf(from, tz)), 6);
  let due = zonedDateTimeToUtc(sunday, '23:59', tz);
  if (due.getTime() - from.getTime() < 24 * HOUR) {
    due = zonedDateTimeToUtc(addDays(sunday, 7), '23:59', tz);
  }
  return due;
}

export const isOpen = (status: string): boolean =>
  (OPEN_PENALTY_STATUSES as readonly string[]).includes(status);

export const penaltyText = (p: { penalty: string; multiplier: number }): string =>
  scalePenaltyText(p.penalty, p.multiplier);

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

export interface NewPenalty {
  userId: Types.ObjectId;
  rule: { _id: Types.ObjectId; penalty: string; onFail: PenaltyOnFail; deadline: PenaltyDeadline };
  source: { type: PenaltySourceType; id: string };
  reason: string;
  now: Date;
  tz: string;
  goalId?: Types.ObjectId | null;
  /** Yükseltmeden doğan cezada kuralın onFail'i yerine kullanılır */
  onFail?: PenaltyOnFail;
}

/**
 * Ceza oluşturur. Aynı kural ve kaynak için zaten ceza varsa (unique index) null döner;
 * motorun tekrar çalışması bu yüzden güvenlidir.
 */
export async function createPenalty(input: NewPenalty): Promise<PenaltyDoc | null> {
  try {
    const p = await Penalty.create({
      userId: input.userId,
      ruleId: input.rule._id,
      reason: input.reason,
      sourceRef: input.source,
      penalty: input.rule.penalty,
      multiplier: 1,
      dueAt: computeDueAt(input.now, input.rule.deadline, input.tz),
      status: 'pending',
      onFail: input.onFail ?? input.rule.onFail,
      deadline: input.rule.deadline,
      goalId: input.goalId ?? null,
    });
    await notify.send(input.userId, {
      type: 'penalty_created',
      penaltyId: p.id as string,
      title: `Yeni ceza: ${penaltyText(p)}`,
      body: p.reason,
    });
    return p;
  } catch (err) {
    if (isDuplicateKey(err)) return null;
    throw err;
  }
}

export const ruleForPenalty = (r: PenaltyRuleDoc): NewPenalty['rule'] => ({
  _id: r._id,
  penalty: r.penalty,
  onFail: r.onFail,
  deadline: deadlineOf(r.deadline),
});

/* ---------- okuma ---------- */

export async function listPenalties(
  user: UserContext,
  statuses: PenaltyStatus[] | undefined,
  limit: number,
): Promise<PenaltyDoc[]> {
  const q: Record<string, unknown> = { userId: user.id };
  if (statuses?.length) q.status = { $in: statuses };
  const openOnly = statuses?.length && statuses.every(isOpen);
  // Açık cezalar en yakın süreye göre, diğerleri en yeni önce.
  return Penalty.find(q)
    .sort(openOnly ? { dueAt: 1 } : { resolvedAt: -1, createdAt: -1 })
    .limit(limit);
}

/** Bugün ekranındaki uyarı: süresi en yakın dolacak açık ceza */
export async function nextOpenPenalty(user: UserContext): Promise<PenaltyDoc | null> {
  return Penalty.findOne({ userId: user.id, status: { $in: OPEN_PENALTY_STATUSES } }).sort({
    dueAt: 1,
  });
}

/** Blok kimliği → "kaçarsa: …" metni (bloğa uyan ilk açık block_missed kuralı) */
export async function blockPenaltyTexts(
  userId: Types.ObjectId,
  blocks: { id: string; category: string; penaltyRuleId: unknown }[],
): Promise<Map<string, string>> {
  const rules = (await listRules(userId, { trigger: 'block_missed', enabledOnly: true })).map(
    toMatchable,
  );
  const out = new Map<string, string>();
  if (!rules.length) return out;
  for (const b of blocks) {
    const [first] = rulesForBlock(
      {
        id: b.id,
        category: b.category as never,
        penaltyRuleId: b.penaltyRuleId ? String(b.penaltyRuleId) : null,
      },
      rules,
    );
    if (first) out.set(b.id, first.doc.penalty);
  }
  return out;
}

/* ---------- yapıldı / ertele ---------- */

async function getPenalty(user: UserContext, id: string): Promise<PenaltyDoc> {
  const p = await Penalty.findOne({ _id: id, userId: user.id });
  if (!p) throw new AppError(404, 'PENALTY_NOT_FOUND', 'Ceza bulunamadı');
  return p;
}

export async function markPenaltyDone(user: UserContext, id: string): Promise<PenaltyDoc> {
  const p = await getPenalty(user, id);
  if (p.status === 'done') return p;
  p.status = 'done';
  p.resolvedAt = clock.now();
  await p.save();
  return p;
}

/**
 * Ertele (×2): çarpan ikiye katlanır, süre mevcut bitişten (geçtiyse şimdiden) bir süre daha
 * uzar, durum `postponed` olur ve açık `penalty_postponed` kuralları yeni ceza üretir.
 */
export async function postponePenalty(user: UserContext, id: string): Promise<PenaltyDoc> {
  const now = clock.now();
  const p = await getPenalty(user, id);
  if (!isOpen(p.status)) {
    throw new AppError(409, 'PENALTY_CLOSED', 'Kapanmış bir ceza ertelenemez');
  }
  const base = p.dueAt > now ? p.dueAt : now;
  const before = penaltyText(p);
  const updated = await Penalty.findOneAndUpdate(
    { _id: p._id, postponements: p.postponements, status: { $in: OPEN_PENALTY_STATUSES } },
    {
      $mul: { multiplier: 2 },
      $inc: { postponements: 1 },
      $set: {
        status: 'postponed',
        dueAt: computeDueAt(base, deadlineOf(p.deadline), user.timezone),
      },
    },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'PENALTY_CHANGED', 'Ceza bu sırada değişti, yeniden dene');

  const rules = await PenaltyRule.find({
    userId: user.id,
    trigger: 'penalty_postponed',
    enabled: true,
  });
  for (const rule of rules) {
    await createPenalty({
      userId: user.id,
      rule: ruleForPenalty(rule),
      source: { type: 'penalty_postpone', id: `${updated.id as string}:${updated.postponements}` },
      reason: `Ceza ertelendi: ${before}`,
      now,
      tz: user.timezone,
      goalId: updated.goalId,
    });
  }
  return updated;
}
