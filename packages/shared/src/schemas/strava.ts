import { z } from 'zod';
import { objectIdSchema } from './common.js';

/** Seçilebilen Strava etkinlik türleri (Strava `sport_type` değerleri) ve Türkçe adları. */
export const STRAVA_ACTIVITY_TYPES = [
  'Ride',
  'VirtualRide',
  'EBikeRide',
  'GravelRide',
  'MountainBikeRide',
  'EMountainBikeRide',
  'Velomobile',
  'Handcycle',
  'Run',
  'TrailRun',
  'VirtualRun',
  'Walk',
  'Hike',
] as const;
export type StravaActivityType = (typeof STRAVA_ACTIVITY_TYPES)[number];

export const STRAVA_ACTIVITY_TYPE_LABELS: Record<StravaActivityType, string> = {
  Ride: 'Bisiklet',
  VirtualRide: 'Sanal bisiklet',
  EBikeRide: 'Elektrikli bisiklet',
  GravelRide: 'Gravel',
  MountainBikeRide: 'Dağ bisikleti',
  EMountainBikeRide: 'Elektrikli dağ bisikleti',
  Velomobile: 'Velomobil',
  Handcycle: 'El bisikleti',
  Run: 'Koşu',
  TrailRun: 'Arazi koşusu',
  VirtualRun: 'Sanal koşu',
  Walk: 'Yürüyüş',
  Hike: 'Doğa yürüyüşü',
};

export const STRAVA_DEFAULT_ACTIVITY_TYPES: StravaActivityType[] = [
  'Ride',
  'VirtualRide',
  'EBikeRide',
  'GravelRide',
  'MountainBikeRide',
];

/** Strava kayıtları bu birimdeki hedeflere yazılır. */
export const STRAVA_GOAL_UNIT = 'km' as const;

export const stravaStatusSchema = z.object({
  /** Sunucuda STRAVA_CLIENT_ID / SECRET / PUBLIC_API_URL tanımlı mı */
  configured: z.boolean(),
  connected: z.boolean(),
  athleteName: z.string().nullable(),
  goalId: z.string().nullable(),
  activityTypes: z.array(z.string()),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type StravaStatus = z.infer<typeof stravaStatusSchema>;

export const stravaPatchSchema = z
  .object({
    goalId: objectIdSchema.nullable(),
    activityTypes: z
      .array(z.enum(STRAVA_ACTIVITY_TYPES))
      .min(1, 'En az bir etkinlik türü seç')
      .max(STRAVA_ACTIVITY_TYPES.length),
  })
  .partial();
export type StravaPatch = z.input<typeof stravaPatchSchema>;

export const stravaConnectResponseSchema = z.object({ url: z.url() });
export type StravaConnectResponse = z.infer<typeof stravaConnectResponseSchema>;

export const stravaSyncResultSchema = z.object({
  imported: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
});
export type StravaSyncResult = z.infer<typeof stravaSyncResultSchema>;

/** Strava'dan uygulamaya dönüş (`takip://strava?status=...&reason=...`) */
export const STRAVA_RETURN_REASONS = ['denied', 'state', 'scope', 'exchange', 'taken'] as const;
export type StravaReturnReason = (typeof STRAVA_RETURN_REASONS)[number];
