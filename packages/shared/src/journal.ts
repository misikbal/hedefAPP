import { TZDate } from '@date-fns/tz';
import { addDays, isoDayOfWeek, localDateOf, monthEndOf } from './time.js';
import { formatNumber } from './tr.js';
import { formatDuration } from './focus.js';

/** 0 = Zor … 4 = Harika */
export const MOOD_LABELS = ['Zor', 'Durgun', 'Normal', 'İyi', 'Harika'] as const;
/** Ruh hâli renkleri (tema token adları), MOOD_LABELS ile aynı sırada */
export const MOOD_TONES = ['line2', 'mut', 'tx2', 'oku', 'acc'] as const;

/** Bu saatten önce (yerel) yazılan günlük bir önceki güne sayılır */
export const JOURNAL_DAY_CUTOFF_HOUR = 4;
export const JOURNAL_TEXT_MAX = 1000;

/** Günlük ekranının varsayılan günü: yerel 04:00'e kadar dün. */
export function journalDateOf(instant: Date, timeZone: string): string {
  const today = localDateOf(instant, timeZone);
  const hour = new TZDate(instant.getTime(), timeZone).getHours();
  return hour < JOURNAL_DAY_CUTOFF_HOUR ? addDays(today, -1) : today;
}

/** Ay ızgarası: pazartesiden başlar; `leading` ilk günden önceki boş hücre sayısı. */
export function monthGrid(month: string): { leading: number; days: string[] } {
  const first = `${month}-01`;
  const last = monthEndOf(first);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return { leading: isoDayOfWeek(first) - 1, days };
}

/** "2026-11" → "2026-12" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Önceki günler listesindeki metin: ilk dolu alan */
export function journalPreview(e: {
  wentWell?: string | null;
  hard?: string | null;
  tomorrowOne?: string | null;
}): string {
  return (e.wentWell || e.hard || e.tomorrowOne || '').trim();
}

export interface DayStatsLike {
  goals: { name: string; unit: string; amount: number }[];
  focusMinutes: number;
  blocks: { done: number; total: number };
  penalties: { created: number; open: number };
}

/** Günlük ekranındaki çipler: "25 km bisiklet", "1 sa 40 dk odak", "4/6 görev", "1 ceza bekliyor" */
export function dayStatChips(s: DayStatsLike): { text: string; tone: 'normal' | 'penalty' }[] {
  const chips: { text: string; tone: 'normal' | 'penalty' }[] = s.goals.map((g) => ({
    text: `${formatNumber(g.amount)} ${g.unit} ${g.name.toLocaleLowerCase('tr-TR')}`,
    tone: 'normal',
  }));
  if (s.focusMinutes > 0)
    chips.push({ text: `${formatDuration(s.focusMinutes)} odak`, tone: 'normal' });
  if (s.blocks.total > 0)
    chips.push({ text: `${s.blocks.done}/${s.blocks.total} görev`, tone: 'normal' });
  if (s.penalties.open > 0)
    chips.push({ text: `${s.penalties.open} ceza bekliyor`, tone: 'penalty' });
  return chips;
}

/** Takvimdeki satır: "4/5 blok · 1 sa 40 dk odak · ceza yok" */
export function dayStatsLine(s: DayStatsLike): string {
  const parts: string[] = [];
  if (s.blocks.total > 0) parts.push(`${s.blocks.done}/${s.blocks.total} blok`);
  if (s.focusMinutes > 0) parts.push(`${formatDuration(s.focusMinutes)} odak`);
  if (s.penalties.open > 0) parts.push(`${s.penalties.open} ceza bekliyor`);
  else if (s.penalties.created > 0) parts.push(`${s.penalties.created} ceza`);
  else parts.push('ceza yok');
  return parts.join(' · ');
}
