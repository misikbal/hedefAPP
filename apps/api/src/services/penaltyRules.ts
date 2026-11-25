import { Types } from 'mongoose';
import {
  blockShortTitle,
  goalPhrase,
  penaltyRuleCreateSchema,
  penaltyRuleUpdateSchema,
  ruleCondition,
  ruleSentence,
  ruleShapeIssue,
  ruleThen,
  type MatchableRule,
  type PenaltyDeadline,
  type PenaltyRule as PenaltyRuleDto,
  type PenaltyRuleCreate,
  type PenaltyRuleUpdate,
  type PenaltyTrigger,
} from '@takip/shared';
import { Block, Goal, PenaltyRule, type PenaltyRuleDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import type { UserContext } from './users.js';

export function deadlineOf(doc: { type: string; hours?: number | null }): PenaltyDeadline {
  return doc.type === 'end_of_week'
    ? { type: 'end_of_week' }
    : { type: 'hours', hours: doc.hours ?? 24 };
}

/** Shared eşleştirme fonksiyonlarının beklediği düz biçim */
export function toMatchable(r: PenaltyRuleDoc): MatchableRule & { doc: PenaltyRuleDoc } {
  return {
    id: r.id as string,
    trigger: r.trigger,
    targetType: r.targetType,
    targetId: r.targetId ? String(r.targetId) : null,
    category: r.category ?? null,
    enabled: r.enabled,
    doc: r,
  };
}

export async function listRules(
  userId: Types.ObjectId,
  filter: { trigger?: PenaltyTrigger; enabledOnly?: boolean } = {},
): Promise<PenaltyRuleDoc[]> {
  const q: Record<string, unknown> = { userId };
  if (filter.trigger) q.trigger = filter.trigger;
  if (filter.enabledOnly) q.enabled = true;
  return PenaltyRule.find(q).sort({ createdAt: 1 });
}

export async function getRule(user: UserContext, id: string): Promise<PenaltyRuleDoc> {
  const rule = await PenaltyRule.findOne({ _id: id, userId: user.id });
  if (!rule) throw new AppError(404, 'PENALTY_RULE_NOT_FOUND', 'Ceza kuralı bulunamadı');
  return rule;
}

/** Kural DTO'ları; "ne olunca" metni için hedef blok/hedef adları tek sorguda alınır. */
export async function toRuleDtos(rules: PenaltyRuleDoc[]): Promise<PenaltyRuleDto[]> {
  const ids = (type: 'block' | 'goal') =>
    rules.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!);
  const [blocks, goals] = await Promise.all([
    Block.find({ _id: { $in: ids('block') } })
      .select('title')
      .lean(),
    Goal.find({ _id: { $in: ids('goal') } })
      .select('name period target unit')
      .lean(),
  ]);
  const labels = new Map<string, string>([
    ...blocks.map((b) => [String(b._id), blockShortTitle(b.title)] as const),
    ...goals.map((g) => [String(g._id), goalPhrase(g)] as const),
  ]);

  return rules.map((r) => {
    const deadline = deadlineOf(r.deadline);
    const input = {
      trigger: r.trigger,
      targetType: r.targetType,
      category: r.category ?? null,
      targetLabel: r.targetId ? (labels.get(String(r.targetId)) ?? null) : null,
    };
    return {
      id: r.id as string,
      trigger: r.trigger,
      targetType: r.targetType,
      targetId: r.targetId ? String(r.targetId) : null,
      category: r.category ?? null,
      penalty: r.penalty,
      deadline,
      onFail: r.onFail,
      enabled: r.enabled,
      when: ruleCondition(input),
      then: ruleThen(r.penalty, deadline),
      sentence: ruleSentence({ ...input, penalty: r.penalty, deadline, onFail: r.onFail }),
    };
  });
}

async function assertTargetUsable(
  user: UserContext,
  targetType: string,
  targetId: string | null | undefined,
): Promise<void> {
  if (targetType === 'block') {
    if (!(await Block.exists({ _id: targetId, userId: user.id, archived: false }))) {
      throw new AppError(400, 'BLOCK_NOT_FOUND', 'Seçilen blok bulunamadı');
    }
  } else if (targetType === 'goal') {
    if (!(await Goal.exists({ _id: targetId, userId: user.id, archived: false }))) {
      throw new AppError(400, 'GOAL_NOT_FOUND', 'Seçilen hedef bulunamadı');
    }
  }
}

/** Hedef türü 'block'/'goal' değilse targetId, 'category' değilse category temizlenir. */
function normalizeTarget<T extends { targetType: string; targetId?: unknown; category?: unknown }>(
  r: T,
): T {
  return {
    ...r,
    targetId: r.targetType === 'block' || r.targetType === 'goal' ? (r.targetId ?? null) : null,
    category: r.targetType === 'category' ? (r.category ?? null) : null,
  };
}

export async function createRule(
  user: UserContext,
  input: PenaltyRuleCreate,
): Promise<PenaltyRuleDoc> {
  const data = normalizeTarget(penaltyRuleCreateSchema.parse(input));
  await assertTargetUsable(user, data.targetType, data.targetId);
  return PenaltyRule.create({ ...data, userId: user.id });
}

export async function updateRule(
  user: UserContext,
  id: string,
  input: PenaltyRuleUpdate,
): Promise<PenaltyRuleDoc> {
  const changes = penaltyRuleUpdateSchema.parse(input);
  const rule = await getRule(user, id);
  const merged = normalizeTarget({
    trigger: changes.trigger ?? rule.trigger,
    targetType: changes.targetType ?? rule.targetType,
    targetId:
      changes.targetId !== undefined
        ? changes.targetId
        : rule.targetId
          ? String(rule.targetId)
          : null,
    category: changes.category !== undefined ? changes.category : (rule.category ?? null),
  });
  const issue = ruleShapeIssue(merged);
  if (issue) throw new AppError(400, 'VALIDATION_ERROR', issue.message, [issue]);
  const targetChanged = changes.targetType !== undefined || changes.targetId !== undefined;
  if (targetChanged) await assertTargetUsable(user, merged.targetType, merged.targetId);
  rule.set({ ...changes, ...merged });
  await rule.save();
  return rule;
}

/** Kural silinir; bağlı blok ve hedeflerden bağ kaldırılır. Oluşmuş cezalar geçmiş için kalır. */
export async function deleteRule(user: UserContext, id: string): Promise<PenaltyRuleDoc> {
  const rule = await getRule(user, id);
  await Promise.all([
    Block.updateMany({ userId: user.id, penaltyRuleId: rule._id }, { penaltyRuleId: null }),
    Goal.updateMany({ userId: user.id, penaltyRuleId: rule._id }, { penaltyRuleId: null }),
  ]);
  await rule.deleteOne();
  return rule;
}

/** Blok/hedef bir kurala bağlanırken kuralın kullanıcıya ait ve doğru tetikleyicili olduğu doğrulanır. */
export async function assertRuleUsable(
  user: UserContext,
  ruleId: string | null | undefined,
  trigger: PenaltyTrigger,
): Promise<void> {
  if (!ruleId) return;
  const rule = await PenaltyRule.findOne({ _id: new Types.ObjectId(ruleId), userId: user.id })
    .select('trigger')
    .lean();
  if (!rule) throw new AppError(400, 'PENALTY_RULE_NOT_FOUND', 'Seçilen ceza kuralı bulunamadı');
  if (rule.trigger !== trigger) {
    throw new AppError(400, 'PENALTY_RULE_MISMATCH', 'Seçilen ceza kuralı bu kayda uygun değil');
  }
}
