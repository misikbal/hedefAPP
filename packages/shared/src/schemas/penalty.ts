import { z } from 'zod';
import { CATEGORIES } from '../constants.js';
import { objectIdSchema } from './common.js';

export const PENALTY_TRIGGERS = ['block_missed', 'goal_failed', 'penalty_postponed'] as const;
export type PenaltyTrigger = (typeof PENALTY_TRIGGERS)[number];

export const PENALTY_TARGET_TYPES = ['block', 'goal', 'category', 'any'] as const;
export type PenaltyTargetType = (typeof PENALTY_TARGET_TYPES)[number];

export const PENALTY_ON_FAIL = ['double', 'plus_one', 'reset_streak'] as const;
export type PenaltyOnFail = (typeof PENALTY_ON_FAIL)[number];

export const PENALTY_STATUSES = ['pending', 'done', 'postponed', 'escalated'] as const;
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number];
/** Henüz yapılmamış (borç devam eden) durumlar */
export const OPEN_PENALTY_STATUSES = ['pending', 'postponed', 'escalated'] as const;

export const PENALTY_SOURCE_TYPES = [
  'instance',
  'goal_period',
  'penalty_postpone',
  'penalty_escalation',
] as const;
export type PenaltySourceType = (typeof PENALTY_SOURCE_TYPES)[number];

/** Blok bitişinden sonra "kaçırıldı" sayılmadan önce tanınan süre (dakika) */
export const MISS_GRACE_MINUTES = 30;

/**
 * Yapma süresi. `end_of_week`: ceza oluştuğu haftanın pazar 23:59'una kadar
 * (24 saatten az kalıyorsa bir sonraki pazar).
 */
export const penaltyDeadlineSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hours'),
    hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 14),
  }),
  z.object({ type: z.literal('end_of_week') }),
]);
export type PenaltyDeadline = z.infer<typeof penaltyDeadlineSchema>;

/** Hangi tetikleyici hangi hedef türleriyle kullanılabilir */
export const TRIGGER_TARGETS: Record<PenaltyTrigger, readonly PenaltyTargetType[]> = {
  block_missed: ['block', 'category', 'any'],
  goal_failed: ['goal', 'category', 'any'],
  penalty_postponed: ['any'],
};

const ruleFields = {
  trigger: z.enum(PENALTY_TRIGGERS),
  targetType: z.enum(PENALTY_TARGET_TYPES),
  targetId: objectIdSchema.nullable().optional(),
  category: z.enum(CATEGORIES).nullable().optional(),
  penalty: z.string().trim().min(1, 'Ceza metni gerekli').max(80),
  deadline: penaltyDeadlineSchema.default({ type: 'hours', hours: 24 }),
  onFail: z.enum(PENALTY_ON_FAIL).default('double'),
  enabled: z.boolean().default(true),
};

interface RuleShape {
  trigger?: PenaltyTrigger;
  targetType?: PenaltyTargetType;
  targetId?: string | null;
  category?: string | null;
}

/** Tetikleyici ile hedef türü uyumlu mu, gerekli alanlar dolu mu. Hata mesajı ya da null döner. */
export function ruleShapeIssue(r: Required<Pick<RuleShape, 'trigger' | 'targetType'>> & RuleShape) {
  if (!TRIGGER_TARGETS[r.trigger].includes(r.targetType)) {
    return { message: 'Bu tetikleyici için seçilen hedef uygun değil', path: ['targetType'] };
  }
  if ((r.targetType === 'block' || r.targetType === 'goal') && !r.targetId) {
    return { message: 'Blok ya da hedef seç', path: ['targetId'] };
  }
  if (r.targetType === 'category' && !r.category) {
    return { message: 'Kategori seç', path: ['category'] };
  }
  return null;
}

export const penaltyRuleCreateSchema = z.object(ruleFields).superRefine((r, ctx) => {
  const issue = ruleShapeIssue(r);
  if (issue) ctx.addIssue({ code: 'custom', ...issue });
});
export type PenaltyRuleCreate = z.input<typeof penaltyRuleCreateSchema>;

export const penaltyRuleUpdateSchema = z
  .object({
    trigger: ruleFields.trigger,
    targetType: ruleFields.targetType,
    targetId: ruleFields.targetId,
    category: ruleFields.category,
    penalty: ruleFields.penalty,
    deadline: penaltyDeadlineSchema,
    onFail: z.enum(PENALTY_ON_FAIL),
    enabled: z.boolean(),
  })
  .partial();
export type PenaltyRuleUpdate = z.input<typeof penaltyRuleUpdateSchema>;

export const penaltyRuleSchema = z.object({
  id: z.string(),
  trigger: z.enum(PENALTY_TRIGGERS),
  targetType: z.enum(PENALTY_TARGET_TYPES),
  targetId: z.string().nullable(),
  category: z.enum(CATEGORIES).nullable(),
  penalty: z.string(),
  deadline: penaltyDeadlineSchema,
  onFail: z.enum(PENALTY_ON_FAIL),
  enabled: z.boolean(),
  /** "Spor bloğu kaçarsa" */
  when: z.string(),
  /** "3 dk soğuk duş · 24 saat içinde" */
  then: z.string(),
  /** "Spor bloğu kaçarsa → 24 saat içinde 3 dk soğuk duş. Yapmazsan iki katı." */
  sentence: z.string(),
});
export type PenaltyRule = z.infer<typeof penaltyRuleSchema>;

export const penaltySchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  /** "Pazartesi 13:00 Almanca bloğu yapılmadı" */
  reason: z.string(),
  sourceRef: z.object({ type: z.enum(PENALTY_SOURCE_TYPES), id: z.string() }),
  /** Kuraldaki temel ceza metni */
  penalty: z.string(),
  multiplier: z.number(),
  /** Çarpan uygulanmış metin: "6 dk soğuk duş" */
  text: z.string(),
  /** "24 saat içinde yapılmazsa iki katına çıkar." */
  consequence: z.string(),
  onFail: z.enum(PENALTY_ON_FAIL),
  dueAt: z.string(),
  status: z.enum(PENALTY_STATUSES),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Penalty = z.infer<typeof penaltySchema>;

export const penaltyListQuerySchema = z.object({
  /** Tek durum, virgülle ayrılmış liste ya da `open` (pending + postponed + escalated) */
  status: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      const parts = s.split(',').flatMap((p) => (p === 'open' ? [...OPEN_PENALTY_STATUSES] : [p]));
      const parsed = z.array(z.enum(PENALTY_STATUSES)).safeParse(parts);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', message: 'Geçersiz durum' });
        return z.NEVER;
      }
      return [...new Set(parsed.data)];
    }),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
