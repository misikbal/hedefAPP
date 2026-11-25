import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORIES } from '@takip/shared';
import { clock } from '../../services/clock.js';

const blockSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    category: { type: String, enum: CATEGORIES, required: true },
    daysOfWeek: { type: [Number], required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    repeatWeekly: { type: Boolean, default: true },
    /** Yerel gün (YYYY-MM-DD) */
    validFrom: { type: String, required: true },
    validTo: { type: String, default: null },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    goalAmount: { type: Number, default: null },
    penaltyRuleId: { type: Schema.Types.ObjectId, ref: 'PenaltyRule', default: null },
    reminderMinutes: { type: Number, default: null },
    archived: { type: Boolean, default: false },
  },
  // createdAt, hafta üretiminde "blok o saatte var mıydı" kontrolü için kullanılır.
  { timestamps: { currentTime: () => clock.now() } },
);

export type BlockDoc = HydratedDocument<InferSchemaType<typeof blockSchema>>;
export const Block = model('Block', blockSchema);
