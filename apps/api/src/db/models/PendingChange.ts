import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PENDING_CHANGE_STATUSES } from '@takip/shared';
import { clock } from '../../services/clock.js';

const pendingChangeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tool: { type: String, required: true },
    /** Aracın doğrulanmış argümanları; onaylanınca aynı araç bunlarla çalışır */
    args: { type: Schema.Types.Mixed, required: true },
    summary: { type: String, required: true },
    userMessage: { type: String, default: null },
    preview: {
      title: { type: String, required: true },
      lines: { type: [String], default: [] },
      effects: { type: [String], default: [] },
      destructive: { type: Boolean, default: false },
    },
    status: { type: String, enum: PENDING_CHANGE_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    resultMessage: { type: String, default: null },
    /** Onaylanınca yazılan AuditLog kaydı */
    auditId: { type: Schema.Types.ObjectId, default: null },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() }, minimize: false },
);
pendingChangeSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type PendingChangeDoc = HydratedDocument<InferSchemaType<typeof pendingChangeSchema>>;
export const PendingChange = model('PendingChange', pendingChangeSchema);
