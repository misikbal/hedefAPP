import { z } from 'zod';
import { FOCUS_MINUTES, FOCUS_STATUSES, MAX_INTERRUPTIONS, type FocusMinutes } from '../focus.js';
import { objectIdSchema } from './common.js';

const plannedMinutesSchema = z
  .number()
  .int()
  .refine((m): m is FocusMinutes => (FOCUS_MINUTES as readonly number[]).includes(m), {
    message: 'Süre 25, 50 ya da 90 dakika olmalı',
  });

export const focusStartSchema = z.object({
  label: z.string().trim().min(1, 'Ne üzerinde çalıştığını yaz').max(60),
  plannedMinutes: plannedMinutesSchema,
  goalId: objectIdSchema.nullable().optional(),
});
export type FocusStart = z.input<typeof focusStartSchema>;

export const focusFinishSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  interruptions: z.number().int().min(0).max(MAX_INTERRUPTIONS).optional(),
});
export type FocusFinish = z.input<typeof focusFinishSchema>;

/**
 * `backgroundMs`: uygulama arka planda bu kadar kaldı (seans sürer, bölünme sayılır).
 * `end: true`: seans orada `interrupted` olarak biter (çıkış yapıldı).
 */
export const focusInterruptSchema = z
  .object({
    backgroundMs: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 3_600_000)
      .optional(),
    end: z.boolean().optional(),
  })
  .refine((b) => b.backgroundMs !== undefined || b.end, {
    message: 'backgroundMs ya da end gerekli',
  });
export type FocusInterrupt = z.input<typeof focusInterruptSchema>;

export const focusSessionSchema = z.object({
  id: z.string(),
  label: z.string(),
  plannedMinutes: z.number(),
  /** startedAt'in yerel günü; seans gece yarısını geçse de bu güne sayılır */
  date: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  pausedMs: z.number(),
  pausedAt: z.string().nullable(),
  status: z.enum(FOCUS_STATUSES),
  interruptions: z.number(),
  backgroundMs: z.number(),
  note: z.string().nullable(),
  goalId: z.string().nullable(),
  progressLogId: z.string().nullable(),
  /** Yanıtın üretildiği andaki gerçekleşen süre */
  elapsedMs: z.number(),
  /** Planlanan sürenin tamamı tırmanıldı mı */
  reachedPeak: z.boolean(),
  /** Sunucu saati (istemci saat farkını düzeltmek için) */
  serverNow: z.string(),
});
export type FocusSession = z.infer<typeof focusSessionSchema>;

/** Haftalık odak, saat cinsinden */
export const focusWeekTotalsSchema = z.object({
  before: z.number(),
  after: z.number(),
  target: z.number().nullable(),
});

export const focusFinishResponseSchema = z.object({
  session: focusSessionSchema,
  week: focusWeekTotalsSchema,
});
export type FocusFinishResponse = z.infer<typeof focusFinishResponseSchema>;

export const focusWeekSchema = z.object({
  weekStart: z.string(),
  sessions: z.array(focusSessionSchema),
  /** Bu haftanın odak toplamı (saat, 1 ondalık) */
  totalHours: z.number(),
  /** Odak hedefi haftalıksa hedef saat */
  targetHours: z.number().nullable(),
  today: z.object({ peaks: z.number(), minutes: z.number() }),
});
export type FocusWeek = z.infer<typeof focusWeekSchema>;

export const focusLabelsSchema = z.array(z.string());
