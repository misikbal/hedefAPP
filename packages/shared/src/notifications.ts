import { addDays, localDateOf, localTimeOf, timeToMinutes, zonedDateTimeToUtc } from './time.js';

/** Bildirim türleri (listede renkle ayrılır). */
export const NOTIFICATION_TYPES = ['reminder', 'motivation', 'penalty', 'claude'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Android bildirim kanalları; push mesajı ve yerel bildirim aynı kimlikleri kullanır.
 * Android'de kanalın sesi oluşturulduktan sonra değiştirilemez; ses değişince kimlik sürümü
 * artırılır (`_v2`) ve eski kanallar (`LEGACY_NOTIFICATION_CHANNELS`) cihazda silinir.
 */
export const NOTIFICATION_CHANNELS = {
  reminders: 'reminders_v2',
  penalties: 'penalties_v2',
  motivation: 'motivation_v2',
  claude: 'claude_v2',
  /** Odak seansı ve mola bitişi (yalnız yerel bildirim) */
  focus: 'focus_v2',
} as const;
export type NotificationChannel = keyof typeof NOTIFICATION_CHANNELS;

export const LEGACY_NOTIFICATION_CHANNELS = ['reminders', 'penalties', 'motivation', 'claude'] as const;

/**
 * Uygulamaya özel bildirim sesleri (`apps/mobile/assets/sounds`, `scripts/make-sounds.py`).
 * null = sessiz kanal. Android'de kanal sesi, iOS'ta push `sound` alanı kullanılır.
 */
export const NOTIFICATION_SOUNDS = {
  reminders: 'takip_hatirlatma.wav',
  penalties: 'takip_ceza.wav',
  motivation: null,
  claude: 'takip_bildirim.wav',
  focus: 'takip_zirve.wav',
} as const satisfies Record<NotificationChannel, string | null>;

export const CHANNEL_FOR_TYPE: Record<NotificationType, NotificationChannel> = {
  reminder: 'reminders',
  motivation: 'motivation',
  penalty: 'penalties',
  claude: 'claude',
};

export const MOTIVATION_FREQS = ['low', 'mid', 'high'] as const;
export type MotivationFreq = (typeof MOTIVATION_FREQS)[number];

/** Motivasyon mesajlarının yerel saatleri. `high` ayrıca her bloktan sonra gönderir. */
export const MOTIVATION_SLOTS: Record<MotivationFreq, readonly string[]> = {
  low: ['09:00'],
  mid: ['09:00', '13:00', '19:00'],
  high: ['09:00'],
};

/** Ceza süresinin bitmesine bu kadar kala uyarı gider (dakika). */
export const PENALTY_DUE_SOON_MINUTES = 120;

/**
 * "HH:mm" yerel saat sessiz aralıkta mı? Aralık gece yarısını geçebilir (23:00–07:00).
 * Başlangıç = bitiş ise sessiz saat yoktur.
 */
export function inQuietHours(time: string, start: string, end: string): boolean {
  const t = timeToMinutes(time);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Sessiz saatteyse bitiş anı (UTC), değilse null. */
export function quietHoursEnd(
  now: Date,
  timeZone: string,
  quiet: { start: string; end: string },
): Date | null {
  const time = localTimeOf(now, timeZone);
  if (!inQuietHours(time, quiet.start, quiet.end)) return null;
  const today = localDateOf(now, timeZone);
  const date = timeToMinutes(time) < timeToMinutes(quiet.end) ? today : addDays(today, 1);
  return zonedDateTimeToUtc(date, quiet.end, timeZone);
}

/** `time` saati `[slot, slot + windowMin)` aralığında mı? (iş kaçarsa geç de gönderilsin diye) */
export function inSlotWindow(time: string, slot: string, windowMin: number): boolean {
  const d = timeToMinutes(time) - timeToMinutes(slot);
  return d >= 0 && d < windowMin;
}
