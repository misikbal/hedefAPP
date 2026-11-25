import type { FastifyInstance } from 'fastify';
import {
  deviceRegisterSchema,
  deviceUnregisterSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
} from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toNotificationDto } from '../../lib/serialize.js';
import { motivationMessage } from '../../services/motivation.js';
import {
  deliver,
  listNotifications,
  markAllRead,
  markRead,
  registerDevice,
  unreadCount,
  unregisterDevice,
} from '../../services/notifications.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', async (req) => {
    const { limit } = parse(notificationListQuerySchema, req.query);
    const { items, unread } = await listNotifications(req.user, limit);
    return { items: items.map(toNotificationDto), unread };
  });
  app.get('/notifications/unread-count', async (req) => ({ unread: await unreadCount(req.user) }));
  app.post('/notifications/read-all', async (req) => ({ updated: await markAllRead(req.user) }));
  app.post('/notifications/:id/read', async (req) => {
    const { id } = parse(notificationIdParamsSchema, req.params);
    return toNotificationDto(await markRead(req.user, id));
  });

  // Ayarlar → "Test bildirimi": gerçek akıştan (kayıt + sessiz saat + push) bir motivasyon mesajı.
  app.post('/notifications/test', async (req) => {
    const msg = await motivationMessage(req.user, Date.now());
    const n = await deliver(req.user.id, {
      type: 'motivation',
      kind: 'test',
      ...msg,
      setting: null,
    });
    return { id: n?.id ?? null, push: n?.push?.status ?? null };
  });

  app.post('/devices', async (req, reply) => {
    const { expoPushToken, platform } = parse(deviceRegisterSchema, req.body ?? {});
    await registerDevice(req.user, expoPushToken, platform);
    return reply.status(204).send();
  });
  app.delete('/devices', async (req, reply) => {
    const { expoPushToken } = parse(deviceUnregisterSchema, req.body ?? {});
    await unregisterDevice(req.user, expoPushToken);
    return reply.status(204).send();
  });
}
