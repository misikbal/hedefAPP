import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { STRAVA_DEFAULT_ACTIVITY_TYPES } from '@takip/shared';

/**
 * Kullanıcının Strava bağlantısı. accessToken/refreshToken dışa aktarılmaz ve loglanmaz
 * (pino redact `*.accessToken`, `*.refreshToken`).
 */
const stravaConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    athleteId: { type: Number, required: true, unique: true },
    athleteName: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    scope: { type: String, default: '' },
    /** İlerlemenin yazılacağı km birimli hedef; yoksa etkinlikler atlanır */
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    activityTypes: { type: [String], default: () => [...STRAVA_DEFAULT_ACTIVITY_TYPES] },
    lastSyncAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export type StravaConnectionDoc = HydratedDocument<InferSchemaType<typeof stravaConnectionSchema>>;
export const StravaConnection = model('StravaConnection', stravaConnectionSchema);
