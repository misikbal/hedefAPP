import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { EXPENSE_CATEGORIES } from '@takip/shared';

const budgetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** null = toplam harcama limiti */
    category: { type: String, enum: EXPENSE_CATEGORIES, default: null },
    monthlyLimit: { type: Number, required: true },
  },
  { timestamps: true },
);
budgetSchema.index({ userId: 1, category: 1 }, { unique: true });

export type BudgetDoc = HydratedDocument<InferSchemaType<typeof budgetSchema>>;
export const Budget = model('Budget', budgetSchema);
