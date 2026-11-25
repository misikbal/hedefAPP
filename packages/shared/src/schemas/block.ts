import { z } from 'zod';
import { CATEGORIES } from '../constants.js';
import { timeToMinutes } from '../time.js';
import { localDateSchema, objectIdSchema, timeOfDaySchema } from './common.js';

export const dayOfWeekSchema = z.number().int().min(1).max(7);

const blockFields = {
  title: z.string().trim().min(1, 'Ad gerekli').max(80),
  description: z.string().trim().max(120).optional(),
  category: z.enum(CATEGORIES),
  daysOfWeek: z
    .array(dayOfWeekSchema)
    .min(1, 'En az bir gün seç')
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  repeatWeekly: z.boolean().default(true),
  validFrom: localDateSchema.optional(),
  goalId: objectIdSchema.nullable().optional(),
  goalAmount: z.number().positive().nullable().optional(),
  penaltyRuleId: objectIdSchema.nullable().optional(),
  reminderMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .nullable()
    .default(null),
};

const endAfterStart = (v: { startTime?: string; endTime?: string }) =>
  !v.startTime || !v.endTime || timeToMinutes(v.endTime) > timeToMinutes(v.startTime);
const endAfterStartIssue = { message: 'Bitiş saati başlangıçtan sonra olmalı', path: ['endTime'] };

export const blockCreateSchema = z.object(blockFields).refine(endAfterStart, endAfterStartIssue);
export type BlockCreate = z.input<typeof blockCreateSchema>;

export const blockUpdateSchema = z
  .object({
    title: blockFields.title,
    description: blockFields.description.nullable(),
    category: blockFields.category,
    daysOfWeek: blockFields.daysOfWeek,
    startTime: blockFields.startTime,
    endTime: blockFields.endTime,
    repeatWeekly: z.boolean(),
    goalId: blockFields.goalId,
    goalAmount: blockFields.goalAmount,
    penaltyRuleId: blockFields.penaltyRuleId,
    reminderMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .nullable(),
  })
  .partial()
  .refine(endAfterStart, endAfterStartIssue);
export type BlockUpdate = z.input<typeof blockUpdateSchema>;

export const blockSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(CATEGORIES),
  daysOfWeek: z.array(dayOfWeekSchema),
  startTime: z.string(),
  endTime: z.string(),
  repeatWeekly: z.boolean(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  goalId: z.string().nullable(),
  goalAmount: z.number().nullable(),
  penaltyRuleId: z.string().nullable(),
  reminderMinutes: z.number().nullable(),
  archived: z.boolean(),
});
export type Block = z.infer<typeof blockSchema>;

export const blockHistoryWeekSchema = z.object({
  weekStart: z.string(),
  label: z.string(),
  status: z.enum(['done', 'missed', 'skipped', 'planned', 'none']),
});
export const blockHistorySchema = z.object({
  weeks: z.array(blockHistoryWeekSchema),
  doneWeeks: z.number(),
  countedWeeks: z.number(),
});
export type BlockHistory = z.infer<typeof blockHistorySchema>;
