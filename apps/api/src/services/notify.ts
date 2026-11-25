import type { Types } from 'mongoose';
import { deliver, type DeliverInput } from './notifications.js';

/**
 * Sunucu olayları. Her olay bir Notification kaydına ve (ayar açıksa) Expo push'una dönüşür.
 * Claude değişiklikleri (Faz 6) buraya eklenecek.
 */
export type NotifyEvent =
  | { type: 'penalty_created'; penaltyId: string; title: string; body: string }
  | {
      type: 'penalty_escalated';
      penaltyId: string;
      escalations: number;
      title: string;
      body: string;
    }
  | { type: 'penalty_due_soon'; penaltyId: string; dueKey: string; title: string; body: string }
  | { type: 'motivation'; dedupeKey: string; title: string; body: string; deepLink: string }
  | { type: 'journal_reminder'; date: string }
  | { type: 'weekly_report'; isoWeek: string; title: string; body: string };

export function toDeliverInput(e: NotifyEvent): DeliverInput {
  switch (e.type) {
    case 'penalty_created':
      return {
        type: 'penalty',
        kind: e.type,
        title: e.title,
        body: e.body,
        deepLink: '/penalties',
        dedupeKey: `penalty_created:${e.penaltyId}`,
        setting: 'penalties',
      };
    case 'penalty_escalated':
      return {
        type: 'penalty',
        kind: e.type,
        title: e.title,
        body: e.body,
        deepLink: '/penalties',
        dedupeKey: `penalty_escalated:${e.penaltyId}:${e.escalations}`,
        setting: 'penalties',
      };
    case 'penalty_due_soon':
      return {
        type: 'penalty',
        kind: e.type,
        title: e.title,
        body: e.body,
        deepLink: '/penalties',
        dedupeKey: `penalty_due_soon:${e.penaltyId}:${e.dueKey}`,
        setting: 'penalties',
      };
    case 'motivation':
      return {
        type: 'motivation',
        kind: e.type,
        title: e.title,
        body: e.body,
        deepLink: e.deepLink,
        dedupeKey: e.dedupeKey,
        setting: 'motivation',
      };
    case 'journal_reminder':
      return {
        type: 'reminder',
        kind: e.type,
        title: 'Günlük vakti',
        body: 'Bugünü 3 dakikada değerlendir.',
        deepLink: '/journal',
        dedupeKey: `journal:${e.date}`,
        setting: 'journal',
      };
    case 'weekly_report':
      return {
        type: 'reminder',
        kind: e.type,
        title: e.title,
        body: e.body,
        deepLink: `/reports/${e.isoWeek}`,
        dedupeKey: `weekly_report:${e.isoWeek}`,
        setting: null,
      };
  }
}

/** Push bildirimi için tek giriş noktası. Testler `notify.handler` ile çağrıları izleyebilir. */
export const notify = {
  handler: async (userId: Types.ObjectId, event: NotifyEvent): Promise<void> => {
    await deliver(userId, toDeliverInput(event));
  },
  send(userId: Types.ObjectId, event: NotifyEvent): Promise<void> {
    return this.handler(userId, event);
  },
};
