import { z } from 'zod';
import { localDateSchema, objectIdSchema } from './common.js';

export const PROGRESS_SOURCES = ['app', 'mcp', 'block', 'focus', 'strava'] as const;
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

export const progressCreateSchema = z.object({
  goalId: objectIdSchema,
  amount: z.number().positive('Miktar sıfırdan büyük olmalı').max(100_000),
  date: localDateSchema.optional(),
  note: z.string().trim().max(200).optional(),
});
export type ProgressCreate = z.input<typeof progressCreateSchema>;

export const progressLogSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  amount: z.number(),
  date: z.string(),
  source: z.enum(PROGRESS_SOURCES),
  note: z.string().nullable(),
});
export type ProgressLog = z.infer<typeof progressLogSchema>;
