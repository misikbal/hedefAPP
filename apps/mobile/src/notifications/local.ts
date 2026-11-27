import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  LEGACY_NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_SOUNDS,
  type NotificationChannel,
} from '@takip/shared';

/**
 * Yerel bildirimler ve Android kanalları. Push (sunucu) mesajları da aynı kanal kimliklerini
 * kullanır (`@takip/shared` → NOTIFICATION_CHANNELS). Web'de ve izin yoksa sessizce atlanır.
 */
export const SUPPORTED = Platform.OS !== 'web';

if (SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      // Odak paneli (focusPanel.ts) sessizce çekmecede durur; afiş ve ses yok.
      const quiet = (n.request.content.data as { kind?: string } | null)?.kind === 'focus_panel';
      return {
        shouldShowBanner: !quiet,
        shouldShowList: true,
        shouldPlaySound: !quiet,
        shouldSetBadge: false,
      };
    },
  });
}

const CHANNEL_SETUP: Record<
  NotificationChannel,
  { name: string; importance: Notifications.AndroidImportance; description: string }
> = {
  reminders: {
    name: 'Hatırlatmalar',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Blok, odak, günlük ve haftalık rapor',
  },
  penalties: {
    name: 'Cezalar',
    importance: Notifications.AndroidImportance.MAX,
    description: 'Ceza geldi, büyüdü ya da süresi bitiyor',
  },
  motivation: {
    name: 'Motivasyon',
    importance: Notifications.AndroidImportance.LOW,
    description: 'Gün içindeki motivasyon mesajları',
  },
  claude: {
    name: 'Claude',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Claude değişiklikleri ve onay istekleri',
  },
  focus: {
    name: 'Odak ve mola',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Odak seansı ya da mola bittiğinde',
  },
};

/** Kanal başına titreşim (ms: bekle, titre, bekle, titre…) */
const VIBRATION: Record<NotificationChannel, number[] | null> = {
  reminders: [0, 180, 120, 180],
  penalties: [0, 320, 140, 320, 140, 320],
  motivation: null,
  claude: [0, 120],
  focus: [0, 140, 90, 140, 90, 420],
};

let channelsReady: Promise<void> | null = null;

/** Android 13+ izin istemeden önce en az bir kanal oluşturulmalı. */
export function ensureChannels(): Promise<void> {
  channelsReady ??= (async () => {
    if (Platform.OS !== 'android') return;
    // Ses kanal oluşturulurken sabitlenir; eski (sesi varsayılan) kanallar kaldırılır.
    for (const id of LEGACY_NOTIFICATION_CHANNELS) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => undefined);
    }
    for (const key of Object.keys(CHANNEL_SETUP) as NotificationChannel[]) {
      const ch = CHANNEL_SETUP[key];
      const vibration = VIBRATION[key];
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS[key], {
        name: ch.name,
        importance: ch.importance,
        description: ch.description,
        sound: NOTIFICATION_SOUNDS[key],
        enableVibrate: vibration !== null,
        ...(vibration ? { vibrationPattern: vibration } : {}),
        lightColor: '#F0A63A',
      }).catch(() => undefined);
    }
  })();
  return channelsReady;
}

let permission: Promise<boolean> | null = null;

/** Kanalları kurar ve izni ister (bir kez). Reddedilirse false. */
export function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    if (!SUPPORTED) return false;
    try {
      await ensureChannels();
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      return (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  })();
  return permission;
}

export interface LocalOptions {
  channel?: NotificationChannel;
  /** Dokununca açılacak expo-router yolu */
  url?: string;
  /** Planlı bildirimleri ayırt etmek için (örn. "block_reminder") */
  kind?: string;
  /** Aynı kimlikle yeniden planlanırsa eskisinin yerine geçer */
  identifier?: string;
}

export async function scheduleLocal(
  at: Date,
  title: string,
  body: string,
  opts: LocalOptions = {},
): Promise<string | null> {
  if (at.getTime() <= Date.now() || !(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      ...(opts.identifier ? { identifier: opts.identifier } : {}),
      content: {
        title,
        body,
        // iOS ve Android 8 öncesi; Android 8+ kanalın sesini çalar
        sound: NOTIFICATION_SOUNDS[opts.channel ?? 'reminders'] ?? false,
        data: { ...(opts.url ? { url: opts.url } : {}), ...(opts.kind ? { kind: opts.kind } : {}) },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: NOTIFICATION_CHANNELS[opts.channel ?? 'reminders'],
      },
    });
  } catch {
    return null;
  }
}

export async function cancelLocal(id: string | null | undefined): Promise<void> {
  if (!id || !SUPPORTED) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // zaten gönderilmiş ya da silinmiş
  }
}

/** Verilen türdeki bütün planlı bildirimleri iptal eder. */
export async function cancelLocalKind(kind: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content.data as { kind?: string } | null)?.kind === kind)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    // planlı bildirim listesi okunamadı
  }
}
