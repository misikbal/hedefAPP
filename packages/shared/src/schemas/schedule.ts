import { z } from 'zod';
import { CATEGORIES } from '../constants.js';
import { goalSummarySchema } from './goal.js';
import { auditEntrySchema } from './mcp.js';
import { penaltySchema } from './penalty.js';

export const INSTANCE_STATUSES = ['planned', 'done', 'missed', 'skipped'] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

export const instanceSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  date: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(INSTANCE_STATUSES),
  doneAt: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.enum(CATEGORIES),
  /** "kaçarsa: …" etiketi: bloğa uyan ilk açık block_missed kuralının ceza metni */
  penalty: z.string().nullable(),
});
export type Instance = z.infer<typeof instanceSchema>;

export const skipAllowanceSchema = z.object({ used: z.number(), allowance: z.number() });
export type SkipAllowance = z.infer<typeof skipAllowanceSchema>;

export const todayResponseSchema = z.object({
  date: z.string(),
  instances: z.array(instanceSchema),
  goals: z.array(goalSummarySchema),
  /** Süresi en yakın dolacak açık ceza */
  pendingPenalty: penaltySchema.nullable(),
  note: z.string().nullable(),
  /** Claude'un (MCP) geri alınmamış son değişikliği */
  lastClaudeChange: auditEntrySchema.nullable(),
  skip: skipAllowanceSchema,
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const weekResponseSchema = z.object({
  weekStart: z.string(),
  days: z.array(z.object({ date: z.string(), instances: z.array(instanceSchema) })),
  skip: skipAllowanceSchema,
});
export type WeekResponse = z.infer<typeof weekResponseSchema>;

export const weekQuerySchema = z.object({
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
