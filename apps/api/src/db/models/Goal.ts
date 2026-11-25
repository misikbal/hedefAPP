import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORIES, GOAL_PERIODS, GOAL_UNITS } from '@takip/shared';

const goalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    unit: { type: String, enum: GOAL_UNITS, required: true },
    target: { type: Number, required: true },
    period: { type: String, enum: GOAL_PERIODS, required: true },
    /** Yerel gün (YYYY-MM-DD) */
    startDate: { type: String, required: true },
    penaltyRuleId: { type: Schema.Types.ObjectId, ref: 'PenaltyRule', default: null },
    trackStreak: { type: Boolean, default: true },
    /** reset_streak cezasıyla seri bu andan itibaren yeniden sayılır */
    streakResetAt: { type: Date, default: null },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type GoalDoc = HydratedDocument<InferSchemaType<typeof goalSchema>>;
export const Goal = model('Goal', goalSchema);
