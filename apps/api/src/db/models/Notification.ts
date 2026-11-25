import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { NOTIFICATION_TYPES } from '@takip/shared';
import { clock } from '../../services/clock.js';

export const PUSH_STATUSES = ['pending', 'queued', 'sent', 'skipped', 'failed'] as const;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    /** Ayrıntılı olay adı: penalty_created, motivation, journal_reminder, weekly_report… */
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    deepLink: { type: String, default: null },
    /** Aynı olayın iki kez bildirilmesini önler (örn. "journal:2026-11-25") */
    dedupeKey: { type: String, default: null },
    readAt: { type: Date, default: null },
    sentAt: { type: Date, default: () => clock.now() },
    push: {
      status: { type: String, enum: PUSH_STATUSES, default: 'pending' },
      /** Sessiz saatte sıraya alınan bildirimin gönderileceği an */
      sendAfter: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      error: { type: String, default: null },
    },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
notificationSchema.index({ userId: 1, sentAt: -1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
notificationSchema.index({ 'push.status': 1, 'push.sendAfter': 1 });

export type NotificationDoc = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const Notification = model('Notification', notificationSchema);
