import { z } from 'zod';
import { CATEGORIES, GOAL_PERIODS, GOAL_UNITS } from '../constants.js';
import { localDateSchema, objectIdSchema } from './common.js';

const goalFields = {
  name: z.string().trim().min(1, 'Hedef adı gerekli').max(60),
  target: z.number().positive('Miktar sıfırdan büyük olmalı').max(1_000_000),
  unit: z.enum(GOAL_UNITS),
  period: z.enum(GOAL_PERIODS),
  startDate: localDateSchema.optional(),
  trackStreak: z.boolean().default(true),
  category: z.enum(CATEGORIES).default('other'),
  penaltyRuleId: objectIdSchema.nullable().optional(),
};

export const goalCreateSchema = z.object(goalFields);
export type GoalCreate = z.input<typeof goalCreateSchema>;

export const goalUpdateSchema = z
  .object({
    name: goalFields.name,
    target: goalFields.target,
    unit: goalFields.unit,
    period: goalFields.period,
    startDate: localDateSchema,
    trackStreak: z.boolean(),
    category: z.enum(CATEGORIES),
    penaltyRuleId: goalFields.penaltyRuleId,
  })
  .partial();
export type GoalUpdate = z.input<typeof goalUpdateSchema>;

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.number(),
  unit: z.enum(GOAL_UNITS),
  period: z.enum(GOAL_PERIODS),
  startDate: z.string(),
  trackStreak: z.boolean(),
  category: z.enum(CATEGORIES),
  penaltyRuleId: z.string().nullable(),
  archived: z.boolean(),
});
export type Goal = z.infer<typeof goalSchema>;

export const GOAL_STATUSES = ['done', 'on_track', 'behind'] as const;

/** Hedefin içinde bulunulan periyottaki durumu */
export const goalSummarySchema = goalSchema.extend({
  current: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
  daysLeft: z.number(),
  status: z.enum(GOAL_STATUSES),
});
export type GoalSummary = z.infer<typeof goalSummarySchema>;

export const goalHistorySchema = z.object({
  /** daily ve weekly hedefler haftalık, monthly hedefler aylık gösterilir */
  bucket: z.enum(['week', 'month']),
  /** daily hedeflerde değer günlük ortalamadır */
  aggregate: z.enum(['sum', 'daily_avg']),
  target: z.number(),
  unit: z.enum(GOAL_UNITS),
  buckets: z.array(
    z.object({
      start: z.string(),
      label: z.string(),
      value: z.number(),
      met: z.boolean(),
      current: z.boolean(),
    }),
  ),
  /** Tamamlanmış periyotlar üzerinden */
  avg: z.number().nullable(),
  best: z.number().nullable(),
  missed: z.number(),
  completed: z.number(),
});
export type GoalHistory = z.infer<typeof goalHistorySchema>;
