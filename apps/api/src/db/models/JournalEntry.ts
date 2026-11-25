import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { clock } from '../../services/clock.js';

const journalEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Yerel gün (YYYY-MM-DD) */
    date: { type: String, required: true },
    mood: { type: Number, required: true, min: 0, max: 4 },
    wentWell: { type: String, default: null },
    hard: { type: String, default: null },
    tomorrowOne: { type: String, default: null },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
journalEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export type JournalEntryDoc = HydratedDocument<InferSchemaType<typeof journalEntrySchema>>;
export const JournalEntry = model('JournalEntry', journalEntrySchema);
