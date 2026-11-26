import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { MONEY_CATEGORIES, MONEY_TYPES } from '@takip/shared';

const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: MONEY_TYPES, required: true },
    /** Pozitif tutar (TL); yön `type` ile belirlenir */
    amount: { type: Number, required: true },
    category: { type: String, enum: MONEY_CATEGORIES, required: true },
    /** Yerel gün (YYYY-MM-DD) */
    date: { type: String, required: true },
    note: { type: String, default: null },
    source: { type: String, enum: ['app', 'mcp'], default: 'app' },
  },
  { timestamps: true },
);
transactionSchema.index({ userId: 1, date: -1 });

export type TransactionDoc = HydratedDocument<InferSchemaType<typeof transactionSchema>>;
export const Transaction = model('Transaction', transactionSchema);
