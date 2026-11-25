import { APP_TIMEZONE, localDateOf, localTimeOf } from '@takip/shared';

export const DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;
/** Hafta şeridi */
export const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
/** Gün seçici (blok formu) */
export const DAY_MIN = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] as const;
const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

export const todayLocal = (now: Date = new Date()) => localDateOf(now, APP_TIMEZONE);

/** ISO gün (1=Pzt) → ad */
export const dayName = (isoDow: number) => DAY_NAMES[isoDow - 1] ?? '';

const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};

export function isoDow(date: string): number {
  const { y, m, d } = parts(date);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export const dayOfMonth = (date: string) => parts(date).d;

/** "ÇARŞAMBA · 25 KASIM" */
export function todayEyebrow(date: string = todayLocal()): string {
  const { m, d } = parts(date);
  return upper(`${dayName(isoDow(date))} · ${d} ${MONTHS[m - 1]}`);
}

/** "23 – 29 KASIM" ya da "30 KASIM – 6 ARALIK" */
export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const a = parts(weekStart);
  const b = parts(weekEnd);
  return a.m === b.m
    ? upper(`${a.d} – ${b.d} ${MONTHS[b.m - 1]}`)
    : upper(`${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`);
}

export function greeting(now: Date = new Date()): string {
  const h = Number(localTimeOf(now, APP_TIMEZONE).slice(0, 2));
  if (h >= 5 && h < 12) return 'Günaydın.';
  if (h >= 12 && h < 18) return 'İyi günler.';
  if (h >= 18 && h < 22) return 'İyi akşamlar.';
  return 'İyi geceler.';
}

/** [1,2,3,5] → "Pzt, Sal, Çar, Cum" */
export const daysLabel = (days: number[]) => days.map((d) => DAY_SHORT[d - 1]).join(', ');

export function reminderLabel(min: number | null): string {
  if (min == null) return 'Kapalı';
  if (min === 0) return 'Başlarken';
  if (min % 60 === 0) return `${min / 60} saat önce`;
  return `${min} dk önce`;
}

/** "24 KASIM" */
export function dayMonthLabel(date: string): string {
  const { m, d } = parts(date);
  return upper(`${d} ${MONTHS[m - 1]}`);
}

/** "2026-11" → "Kasım 2026" */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export const nowTimeLocal = (now: Date = new Date()) => localTimeOf(now, APP_TIMEZONE);
