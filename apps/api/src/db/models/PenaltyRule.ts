import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORIES, PENALTY_ON_FAIL, PENALTY_TARGET_TYPES, PENALTY_TRIGGERS } from '@takip/shared';
import { clock } from '../../services/clock.js';

const deadlineSchema = new Schema(
  {
    type: { type: String, enum: ['hours', 'end_of_week'], required: true },
    hours: { type: Number, default: null },
  },
  { _id: false },
);

const penaltyRuleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trigger: { type: String, enum: PENALTY_TRIGGERS, required: true },
    targetType: { type: String, enum: PENALTY_TARGET_TYPES, required: true },
    /** targetType 'block' ise Block, 'goal' ise Goal kimliği */
    targetId: { type: Schema.Types.ObjectId, default: null },
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    penalty: { type: String, required: true },
    deadline: { type: deadlineSchema, required: true },
    onFail: { type: String, enum: PENALTY_ON_FAIL, default: 'double' },
    enabled: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  // createdAt: kural, oluşturulmadan önce biten blok ve periyotlara geriye dönük uygulanmaz.
  { timestamps: { currentTime: () => clock.now() } },
);

export type PenaltyRuleDoc = HydratedDocument<InferSchemaType<typeof penaltyRuleSchema>>;
export const PenaltyRule = model('PenaltyRule', penaltyRuleSchema);
