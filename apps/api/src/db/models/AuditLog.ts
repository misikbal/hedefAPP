import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { AUDIT_ACTORS } from '@takip/shared';
import { clock } from '../../services/clock.js';

/** Değiştirilen varlık türleri (geri alma bu türlere göre yapılır) */
export const AUDIT_ENTITIES = [
  'block',
  'goal',
  'progress',
  'penaltyRule',
  'penalty',
  'journal',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: String, enum: AUDIT_ACTORS, required: true },
    tool: { type: String, default: null },
    entity: { type: String, enum: AUDIT_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    /** Değişiklikten önceki belge (yeni oluşturulduysa null) */
    before: { type: Schema.Types.Mixed, default: null },
    /** Değişiklikten sonraki belge (silindiyse null) */
    after: { type: Schema.Types.Mixed, default: null },
    summary: { type: String, required: true },
    /** Onaylanan bir PendingChange'ten doğduysa */
    pendingChangeId: { type: Schema.Types.ObjectId, default: null },
    undoneAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() }, minimize: false },
);
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, entity: 1, entityId: 1, createdAt: -1 });

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof auditLogSchema>>;
export const AuditLog = model('AuditLog', auditLogSchema);
