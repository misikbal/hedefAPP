import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { clock } from '../../services/clock.js';

/** Pazar 21:00'de hesaplanan haftalık raporun önbelleği. `data` WeeklyReport DTO'sudur. */
const weeklyReportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isoWeek: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    computedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
weeklyReportSchema.index({ userId: 1, isoWeek: 1 }, { unique: true });

export type WeeklyReportDoc = HydratedDocument<InferSchemaType<typeof weeklyReportSchema>>;
export const WeeklyReport = model('WeeklyReport', weeklyReportSchema);
