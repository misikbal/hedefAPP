import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { INSTANCE_STATUSES } from '@takip/shared';

const blockInstanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockId: { type: Schema.Types.ObjectId, ref: 'Block', required: true },
    /** Yerel gün (YYYY-MM-DD) */
    date: { type: String, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: INSTANCE_STATUSES, default: 'planned' },
    doneAt: { type: Date, default: null },
    progressLogId: { type: Schema.Types.ObjectId, ref: 'ProgressLog', default: null },
    overrides: {
      type: new Schema({ title: String, startTime: String, endTime: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);
blockInstanceSchema.index({ userId: 1, date: 1 });
blockInstanceSchema.index({ blockId: 1, date: 1 }, { unique: true });
blockInstanceSchema.index({ status: 1, endAt: 1 });

export type BlockInstanceDoc = HydratedDocument<InferSchemaType<typeof blockInstanceSchema>>;
export const BlockInstance = model('BlockInstance', blockInstanceSchema);
