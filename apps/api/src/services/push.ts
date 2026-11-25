import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { CHANNEL_FOR_TYPE, type NotificationType } from '@takip/shared';

export interface PushMessage {
  to: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface PushResult {
  to: string;
  ok: boolean;
  error?: string;
  /** Token artık geçersiz (uygulama silindi vb.); kaydı silinmeli */
  deviceGone?: boolean;
}

let client: Expo | null = null;

/** server.ts çağırır. EXPO_ACCESS_TOKEN tanımlıysa Expo "enhanced security" ile gönderilir. */
export function configurePush(opts: { accessToken?: string | undefined }): void {
  client = new Expo(opts.accessToken ? { accessToken: opts.accessToken } : {});
}

function toExpo(m: PushMessage): ExpoPushMessage {
  return {
    to: m.to,
    title: m.title,
    body: m.body,
    data: m.data,
    sound: 'default',
    channelId: CHANNEL_FOR_TYPE[m.type],
    priority: m.type === 'penalty' || m.type === 'claude' ? 'high' : 'normal',
  };
}

async function expoSender(messages: PushMessage[]): Promise<PushResult[]> {
  client ??= new Expo();
  const results: PushResult[] = [];
  for (const chunk of client.chunkPushNotifications(messages.map(toExpo))) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await client.sendPushNotificationsAsync(chunk);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const m of chunk) results.push({ to: String(m.to), ok: false, error: msg });
      continue;
    }
    tickets.forEach((t, i) => {
      const to = String(chunk[i]!.to);
      if (t.status === 'ok') results.push({ to, ok: true });
      else
        results.push({
          to,
          ok: false,
          error: t.details?.error ?? t.message,
          deviceGone: t.details?.error === 'DeviceNotRegistered',
        });
    });
  }
  return results;
}

/**
 * Push gönderimi için tek nokta. Testler `push.sender`'ı değiştirir (ağa çıkılmaz).
 * Not: Expo makbuzları (receipts) ayrıca sorgulanmıyor; anında dönen hatalar yeterli.
 */
export const push = {
  sender: expoSender as (messages: PushMessage[]) => Promise<PushResult[]>,
  isValidToken: (t: string): boolean => Expo.isExpoPushToken(t),
};
