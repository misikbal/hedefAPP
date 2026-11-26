import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PROGRESS_SOURCES } from '@takip/shared';

const progressLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', required: true },
    amount: { type: Number, required: true },
    /** Yerel gün (YYYY-MM-DD) */
    date: { type: String, required: true },
    source: { type: String, enum: PROGRESS_SOURCES, default: 'app' },
    note: { type: String, default: null },
    /** Dış kaynaktaki kimlik (Strava etkinlik id'si); aynı etkinlik iki kez yazılmaz */
    externalId: { type: String, default: null },
  },
  { timestamps: true },
);
progressLogSchema.index({ userId: 1, goalId: 1, date: 1 });
progressLogSchema.index(
  { userId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);

export type ProgressLogDoc = HydratedDocument<InferSchemaType<typeof progressLogSchema>>;
export const ProgressLog = model('ProgressLog', progressLogSchema);
