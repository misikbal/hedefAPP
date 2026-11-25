import { z } from 'zod';
import { CATEGORIES, GOAL_UNITS } from '../constants.js';

export const STATS_RANGES = ['week', '12w', 'year'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const statsQuerySchema = z.object({ range: z.enum(STATS_RANGES).default('week') });

export const statsOverviewSchema = z.object({
  range: z.enum(STATS_RANGES),
  from: z.string(),
  to: z.string(),
  /** done / (done + missed), 0–100; veri yoksa null */
  score: z.number().nullable(),
  /** Önceki eşit uzunluktaki döneme göre puan farkı */
  delta: z.number().nullable(),
  trend: z.array(z.object({ label: z.string(), value: z.number().nullable() })),
  /** Son 12 hafta, pazartesiden başlayarak 84 gün */
  heatmap: z.array(
    z.object({ date: z.string(), level: z.number().int().min(0).max(4), future: z.boolean() }),
  ),
  totals: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      unit: z.enum(GOAL_UNITS),
      value: z.number(),
      /** Önceki döneme göre oran (0.12 = %12 artış); önceki 0 ise null */
      change: z.number().nullable(),
    }),
  ),
  streaks: z.array(
    z.object({
      goalId: z.string(),
      name: z.string(),
      period: z.enum(['daily', 'weekly', 'monthly']),
      current: z.number(),
      best: z.number(),
    }),
  ),
  split: z.array(z.object({ category: z.enum(CATEGORIES), minutes: z.number(), pct: z.number() })),
});
export type StatsOverview = z.infer<typeof statsOverviewSchema>;
