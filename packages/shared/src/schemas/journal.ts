import { z } from 'zod';
import { JOURNAL_SUMMARY_MAX, JOURNAL_TEXT_MAX, normalizeJournalTags } from '../journal.js';
import { localDateSchema } from './common.js';

const text = z
  .string()
  .trim()
  .max(JOURNAL_TEXT_MAX, `En çok ${JOURNAL_TEXT_MAX} karakter`)
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional();

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En çok ${max} karakter`)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

export const JOURNAL_SOURCES = ['app', 'claude'] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/**
 * mood ve üç metin alanı her kayıtta yazılır (gönderilmeyen metin boşalır).
 * energy, tags, summary, rawNote: gönderilmezse eski değer kalır, null/[] ile temizlenir.
 */
export const journalPutSchema = z.object({
  mood: z.number().int().min(0).max(4),
  wentWell: text,
  hard: text,
  tomorrowOne: text,
  energy: z.number().int().min(0).max(4).nullable().optional(),
  tags: z
    .array(z.string().max(60))
    .max(20)
    .transform((t) => normalizeJournalTags(t))
    .optional(),
  summary: shortText(JOURNAL_SUMMARY_MAX),
  rawNote: text,
});
export type JournalPut = z.input<typeof journalPutSchema>;

export const journalEntrySchema = z.object({
  id: z.string(),
  date: z.string(),
  mood: z.number(),
  wentWell: z.string().nullable(),
  hard: z.string().nullable(),
  tomorrowOne: z.string().nullable(),
  energy: z.number().nullable(),
  tags: z.array(z.string()),
  summary: z.string().nullable(),
  rawNote: z.string().nullable(),
  /** Kaydı ilk kim yazdı */
  source: z.enum(JOURNAL_SOURCES),
  daySnapshot: z.lazy(() => daySnapshotSchema).nullable(),
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

/** Kayıt anında sunucunun dondurduğu gün durumu (Claude göndermez). */
export const daySnapshotSchema = z.object({
  /** Atlananlar hariç blok sayısı */
  blocksPlanned: z.number(),
  blocksDone: z.number(),
  /** status missed ya da bitişinden 30 dk geçmiş planned */
  blocksMissed: z.number(),
  missedCategories: z.array(z.string()),
  /** Kaçan blokların başlangıç saatleri (SS:dd) */
  missedStarts: z.array(z.string()),
  /** O gün spor bloğu yoksa null */
  sportDone: z.boolean().nullable(),
  /** Hedef adı → o günkü ilerleme */
  goalProgress: z.record(z.string(), z.number()),
  takenAt: z.string(),
});
export type DaySnapshot = z.infer<typeof daySnapshotSchema>;

export const JOURNAL_INSIGHT_RANGES = ['week', 'month'] as const;
export type JournalInsightRange = (typeof JOURNAL_INSIGHT_RANGES)[number];

export const journalInsightsQuerySchema = z.object({
  range: z.enum(JOURNAL_INSIGHT_RANGES).default('week'),
  date: localDateSchema.optional(),
});

export const journalInsightsSchema = z.object({
  range: z.string(),
  from: z.string(),
  to: z.string(),
  entries: z.number(),
  moodAvg: z.number().nullable(),
  moodTrend: z.enum(['up', 'down', 'flat']).nullable(),
  energyAvg: z.number().nullable(),
  completionRate: z.number().nullable(),
  moodWhenSportDone: z.number().nullable(),
  moodWhenSportMissed: z.number().nullable(),
  completionByEnergy: z.object({ low: z.number().nullable(), high: z.number().nullable() }),
  topTags: z.array(z.tuple([z.string(), z.number()])),
  mostMissedCategory: z.string().nullable(),
  mostMissedTimeSlot: z.string().nullable(),
  streaks: z.object({ journal: z.number(), sport: z.number() }),
  lowMoodStreak: z.number(),
  lowestDay: z
    .object({ date: z.string(), mood: z.number(), summary: z.string().nullable() })
    .nullable(),
  days: z.array(
    z.object({
      date: z.string(),
      mood: z.number().nullable(),
      energy: z.number().nullable(),
      completion: z.number().nullable(),
    }),
  ),
  /** Kural tabanlı kısa bulgular (en çok 3) */
  findings: z.array(z.string()),
});
export type JournalInsights = z.infer<typeof journalInsightsSchema>;
