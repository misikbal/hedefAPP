import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PENALTY_ON_FAIL, PENALTY_SOURCE_TYPES, PENALTY_STATUSES } from '@takip/shared';
import { clock } from '../../services/clock.js';

const penaltySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'PenaltyRule', required: true },
    reason: { type: String, required: true },
    sourceRef: {
      type: new Schema(
        {
          type: { type: String, enum: PENALTY_SOURCE_TYPES, required: true },
          id: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    /** Kuraldaki temel metin; gösterilen metin çarpanla üretilir */
    penalty: { type: String, required: true },
    multiplier: { type: Number, default: 1 },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: PENALTY_STATUSES, default: 'pending' },
    resolvedAt: { type: Date, default: null },
    /** Ceza oluştuğu andaki kural ayarları (kural sonradan değişse de ceza aynı kalır) */
    onFail: { type: String, enum: PENALTY_ON_FAIL, required: true },
    deadline: {
      type: new Schema(
        {
          type: { type: String, enum: ['hours', 'end_of_week'], required: true },
          hours: { type: Number, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    /** reset_streak için serisi sıfırlanacak hedef */
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    escalations: { type: Number, default: 0 },
    postponements: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
// Motorun idempotent olmasının dayanağı: aynı kaynak ve kural için tek ceza.
penaltySchema.index(
  { userId: 1, ruleId: 1, 'sourceRef.type': 1, 'sourceRef.id': 1 },
  { unique: true },
);
penaltySchema.index({ status: 1, dueAt: 1 });
penaltySchema.index({ userId: 1, createdAt: -1 });

export type PenaltyDoc = HydratedDocument<InferSchemaType<typeof penaltySchema>>;
export const Penalty = model('Penalty', penaltySchema);
