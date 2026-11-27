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
    /** 0 … 4, ruh hâlinden ayrı */
    energy: { type: Number, default: null, min: 0, max: 4 },
    /** Küçük harf, en çok 5; öneri listesi dışındakiler `other:` önekli */
    tags: { type: [String], default: [] },
    /** Tek cümle özet */
    summary: { type: String, default: null },
    /** Kullanıcının kendi cümlesi (Claude'dan; ayarla kapatılabilir) */
    rawNote: { type: String, default: null },
    /** Kaydı ilk kim yazdı */
    source: { type: String, enum: ['app', 'claude'], default: 'app' },
    /** Kayıt anında dondurulan gün durumu (sunucu doldurur) */
    daySnapshot: {
      type: new Schema(
        {
          blocksPlanned: Number,
          blocksDone: Number,
          blocksMissed: Number,
          missedCategories: [String],
          missedStarts: [String],
          sportDone: { type: Boolean, default: null },
          goalProgress: { type: Schema.Types.Mixed, default: {} },
          takenAt: Date,
        },
        { _id: false, minimize: false },
      ),
      default: null,
    },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
journalEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export type JournalEntryDoc = HydratedDocument<InferSchemaType<typeof journalEntrySchema>>;
export const JournalEntry = model('JournalEntry', journalEntrySchema);
