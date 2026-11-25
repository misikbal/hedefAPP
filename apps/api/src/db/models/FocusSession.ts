import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { FOCUS_MINUTES, FOCUS_STATUSES, OPEN_FOCUS_STATUSES } from '@takip/shared';
import { clock } from '../../services/clock.js';

const focusSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, required: true },
    plannedMinutes: { type: Number, enum: FOCUS_MINUTES, required: true },
    /** startedAt'in yerel günü (YYYY-MM-DD); hafta ve gün hesapları bu alandan yapılır */
    date: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    /** Tamamlanmış duraklamaların toplamı */
    pausedMs: { type: Number, default: 0 },
    /** Süren duraklamanın başlangıcı */
    pausedAt: { type: Date, default: null },
    status: { type: String, enum: FOCUS_STATUSES, default: 'running' },
    interruptions: { type: Number, default: 0, min: 0, max: 3 },
    /** Tespit edilen arka plan süresi toplamı */
    backgroundMs: { type: Number, default: 0 },
    note: { type: String, default: null },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    /** Hedefe yazılan kayıt (idempotent bitiş için) */
    progressLogId: { type: Schema.Types.ObjectId, ref: 'ProgressLog', default: null },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
focusSessionSchema.index({ userId: 1, startedAt: -1 });
focusSessionSchema.index({ userId: 1, date: 1 });
// Aynı anda en fazla bir açık seans.
focusSessionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...OPEN_FOCUS_STATUSES] } },
    name: 'one_open_session',
  },
);

export type FocusSessionDoc = HydratedDocument<InferSchemaType<typeof focusSessionSchema>>;
export const FocusSession = model('FocusSession', focusSessionSchema);
