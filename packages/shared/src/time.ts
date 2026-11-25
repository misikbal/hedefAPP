import { TZDate } from '@date-fns/tz';

/**
 * Yerel gün hesapları. "Yerel gün" her zaman YYYY-MM-DD string'idir ve bir saat dilimine göre yorumlanır.
 * Gün aritmetiği UTC gece yarısı üzerinden yapılır (yaz saati kaymalarından etkilenmez).
 */

const pad = (n: number) => String(n).padStart(2, '0');

function parseLocalDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function fromUtcMidnight(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Verilen anın, verilen saat dilimindeki yerel günü. */
export function localDateOf(instant: Date, timeZone: string): string {
  const z = new TZDate(instant.getTime(), timeZone);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Verilen anın yerel saati, "HH:mm". */
export function localTimeOf(instant: Date, timeZone: string): string {
  const z = new TZDate(instant.getTime(), timeZone);
  return `${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseLocalDate(date);
  return fromUtcMidnight(Date.UTC(y, m - 1, d + days));
}

/** ISO haftanın günü: 1 = Pazartesi … 7 = Pazar */
export function isoDayOfWeek(date: string): number {
  const { y, m, d } = parseLocalDate(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Günün içinde bulunduğu haftanın pazartesisi. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoDayOfWeek(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Yerel gün + "HH:mm" → UTC an. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const { y, m, d } = parseLocalDate(date);
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, timeZone).getTime());
}

/** ISO 8601 hafta numarası (H48 gibi etiketler için). */
export function isoWeekNumber(date: string): number {
  const thursday = addDays(date, 4 - isoDayOfWeek(date));
  const { y } = parseLocalDate(thursday);
  const jan1 = Date.UTC(y, 0, 1);
  const { m, d } = parseLocalDate(thursday);
  return Math.floor((Date.UTC(y, m - 1, d) - jan1) / 86_400_000 / 7) + 1;
}

export function timeToMinutes(time: string): number {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return hh * 60 + mm;
}

export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEndOf(date: string): string {
  const { y, m } = parseLocalDate(date);
  return fromUtcMidnight(Date.UTC(y, m, 0));
}

export function addMonths(date: string, months: number): string {
  const { y, m } = parseLocalDate(date);
  return fromUtcMidnight(Date.UTC(y, m - 1 + months, 1));
}

/** İki yerel gün arasındaki gün farkı (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export type Period = 'daily' | 'weekly' | 'monthly';

/** Verilen günü içeren periyodun ilk ve son yerel günü. */
export function periodBounds(period: Period, date: string): { start: string; end: string } {
  if (period === 'daily') return { start: date, end: date };
  if (period === 'weekly') {
    const start = weekStartOf(date);
    return { start, end: addDays(start, 6) };
  }
  return { start: monthStartOf(date), end: monthEndOf(date) };
}

/** Bir sonraki periyodun başlangıç günü. */
export function nextPeriodStart(period: Period, start: string): string {
  if (period === 'daily') return addDays(start, 1);
  if (period === 'weekly') return addDays(start, 7);
  return addMonths(start, 1);
}

/** ISO hafta kimliği: "2026-W48" (yıl, haftanın perşembesine göre). */
export function isoWeekId(date: string): string {
  const thursday = addDays(date, 4 - isoDayOfWeek(date));
  return `${thursday.slice(0, 4)}-W${pad(isoWeekNumber(date))}`;
}

/** "2026-W48" → o haftanın pazartesisi. Geçersiz kimlikte null. */
export function isoWeekStart(id: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // 4 Ocak her zaman 1. haftadadır.
  const start = addDays(weekStartOf(`${year}-01-04`), (week - 1) * 7);
  return isoWeekId(start) === id ? start : null;
}
