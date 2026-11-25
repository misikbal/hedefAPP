import { z } from 'zod';
import { JOURNAL_TEXT_MAX } from '../journal.js';
import { localDateSchema } from './common.js';

const text = z
  .string()
  .trim()
  .max(JOURNAL_TEXT_MAX, `En çok ${JOURNAL_TEXT_MAX} karakter`)
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional();

export const journalPutSchema = z.object({
  mood: z.number().int().min(0).max(4),
  wentWell: text,
  hard: text,
  tomorrowOne: text,
});
export type JournalPut = z.input<typeof journalPutSchema>;

export const journalEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  mood: z.number(),
  wentWell: z.string().nullable(),
  hard: z.string().nullable(),
  tomorrowOne: z.string().nullable(),
  updatedAt: z.string(),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const dayStatsSchema = z.object({
  date: z.string(),
  /** O günün ilerleme toplamları (odak hedefi hariç, en çok 2) */
  goals: z.array(
    z.object({ goalId: z.string(), name: z.string(), unit: z.string(), amount: z.number() }),
  ),
  focusMinutes: z.number(),
  /** done / (planned + done + missed); atlananlar sayılmaz */
  blocks: z.object({ done: z.number(), total: z.number() }),
  /** O gün oluşan cezalar ve bunlardan hâlâ açık olanlar */
  penalties: z.object({ created: z.number(), open: z.number() }),
});
export type DayStats = z.infer<typeof dayStatsSchema>;

export const journalDaySchema = z.object({
  date: z.string(),
  entry: journalEntrySchema.nullable(),
  stats: dayStatsSchema,
});
export type JournalDay = z.infer<typeof journalDaySchema>;

export const journalMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı'),
});

export const journalRecentQuerySchema = z.object({
  before: localDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(60).default(5),
});

export const journalDateParamsSchema = z.object({ date: localDateSchema });
