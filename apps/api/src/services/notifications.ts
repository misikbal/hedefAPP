import type { Types } from 'mongoose';
import { quietHoursEnd, type NotificationType } from '@takip/shared';
import { DeviceToken, Notification, User, type NotificationDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { push } from './push.js';
import { getSettings, type UserContext } from './users.js';

/** Ayarlar'daki 4 anahtardan hangisine bağlı (null: her zaman gönderilir, örn. haftalık rapor) */
export type NotifSetting = 'blocks' | 'motivation' | 'penalties' | 'journal' | null;

export interface DeliverInput {
  type: NotificationType;
  kind: string;
  title: string;
  body: string;
  deepLink?: string | null;
  dedupeKey?: string | null;
  setting: NotifSetting;
}

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * Bildirimi kaydeder ve push'u gönderir. Kayıt her zaman oluşur (uygulamadaki listede görünür);
 * push yalnızca ilgili ayar açıksa gider. Sessiz saatteyse push sıraya alınır.
 * `dedupeKey` daha önce kullanıldıysa hiçbir şey yapmaz ve null döner.
 */
export async function deliver(
  userId: Types.ObjectId,
  input: DeliverInput,
): Promise<NotificationDoc | null> {
  const now = clock.now();
  const [settings, user] = await Promise.all([
    getSettings(userId),
    User.findById(userId).select('timezone').lean(),
  ]);
  const tz = user?.timezone ?? 'Europe/Istanbul';
  const enabled = input.setting === null || settings.notif?.[input.setting] !== false;
  const quietEnd = enabled
    ? quietHoursEnd(now, tz, {
        start: settings.quietHours?.start ?? '00:00',
        end: settings.quietHours?.end ?? '00:00',
      })
    : null;

  let doc: NotificationDoc;
  try {
    doc = await Notification.create({
      userId,
      type: input.type,
      kind: input.kind,
      title: input.title,
      body: input.body,
      deepLink: input.deepLink ?? null,
      dedupeKey: input.dedupeKey ?? null,
      sentAt: now,
      push: {
        status: !enabled ? 'skipped' : quietEnd ? 'queued' : 'pending',
        sendAfter: quietEnd,
      },
    });
  } catch (err) {
    if (isDuplicateKey(err)) return null;
    throw err;
  }
  if (doc.push?.status !== 'pending') return doc;
  await sendPush([doc]);
  return (await Notification.findById(doc._id)) ?? doc;
}

/** Bir dedupeKey daha önce kullanıldı mı (gereksiz hesaplamayı önlemek için). */
export async function wasDelivered(userId: Types.ObjectId, dedupeKey: string): Promise<boolean> {
  return !!(await Notification.exists({ userId, dedupeKey }));
}

async function sendPush(docs: NotificationDoc[]): Promise<void> {
  const userIds = [...new Set(docs.map((d) => String(d.userId)))];
  const tokens = await DeviceToken.find({ userId: { $in: userIds } }).lean();
  const now = clock.now();
  for (const doc of docs) {
    const mine = tokens.filter((t) => String(t.userId) === String(doc.userId));
    if (mine.length === 0) {
      await Notification.updateOne(
        { _id: doc._id },
        { 'push.status': 'skipped', 'push.error': 'NO_DEVICE' },
      );
      continue;
    }
    const results = await push.sender(
      mine.map((t) => ({
        to: t.expoPushToken,
        type: doc.type as NotificationType,
        title: doc.title,
        body: doc.body,
        data: { url: doc.deepLink, notificationId: doc.id as string },
      })),
    );
    const gone = results.filter((r) => r.deviceGone).map((r) => r.to);
    if (gone.length) await DeviceToken.deleteMany({ expoPushToken: { $in: gone } });
    const ok = results.some((r) => r.ok);
    await Notification.updateOne(
      { _id: doc._id },
      ok
        ? { 'push.status': 'sent', 'push.sentAt': now, 'push.error': null }
        : {
            'push.status': 'failed',
            'push.error': results.map((r) => r.error).join('; ') || 'UNKNOWN',
          },
    );
  }
}

/** Sessiz saat bitince sıradaki push'ları gönderir (iş: her 5 dk). */
export async function flushQueuedPush(): Promise<number> {
  const due = await Notification.find({
    'push.status': 'queued',
    'push.sendAfter': { $lte: clock.now() },
  }).limit(200);
  if (due.length === 0) return 0;
  await sendPush(due);
  return due.length;
}

/* ---------- REST ---------- */

export async function listNotifications(user: UserContext, limit: number) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: user.id }).sort({ sentAt: -1 }).limit(limit),
    unreadCount(user),
  ]);
  return { items, unread };
}

export function unreadCount(user: UserContext): Promise<number> {
  return Notification.countDocuments({ userId: user.id, readAt: null });
}

export async function markAllRead(user: UserContext): Promise<number> {
  const r = await Notification.updateMany(
    { userId: user.id, readAt: null },
    { readAt: clock.now() },
  );
  return r.modifiedCount;
}

export async function markRead(user: UserContext, id: string): Promise<NotificationDoc> {
  const doc = await Notification.findOne({ _id: id, userId: user.id });
  if (!doc) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Bildirim bulunamadı');
  if (!doc.readAt) {
    doc.readAt = clock.now();
    await doc.save();
  }
  return doc;
}

export async function registerDevice(
  user: UserContext,
  expoPushToken: string,
  platform: 'android' | 'ios',
): Promise<void> {
  if (!push.isValidToken(expoPushToken))
    throw new AppError(400, 'INVALID_PUSH_TOKEN', 'Geçersiz Expo push token');
  await DeviceToken.updateOne(
    { expoPushToken },
    { $set: { userId: user.id, platform, lastSeenAt: clock.now() } },
    { upsert: true },
  );
}

export async function unregisterDevice(user: UserContext, expoPushToken: string): Promise<void> {
  await DeviceToken.deleteOne({ userId: user.id, expoPushToken });
}
