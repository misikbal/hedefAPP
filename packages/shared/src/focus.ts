import { FOCUS_LEVELS, type GoalUnit } from './constants.js';

export const FOCUS_MINUTES = [25, 50, 90] as const;
export type FocusMinutes = (typeof FOCUS_MINUTES)[number];

export const FOCUS_STATUSES = [
  'running',
  'paused',
  'completed',
  'interrupted',
  'abandoned',
] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];
/** Aynı anda en fazla bir açık seans olabilir */
export const OPEN_FOCUS_STATUSES = ['running', 'paused'] as const;

/** Arka planda bu süreden uzun kalınırsa seans "bölündü" sayılır */
export const BACKGROUND_INTERRUPT_MS = 10_000;
export const MAX_INTERRUPTIONS = 3;
/** startedAt + plannedMinutes + bu kadar saat geçmiş açık seanslar terk edilmiş sayılır */
export const FOCUS_ABANDON_AFTER_HOURS = 6;
/** "Kaydet ve 10 dk mola" */
export const FOCUS_BREAK_MINUTES = 10;
/** Hedefe yazılabilecek birimler */
export const FOCUS_GOAL_UNITS = ['saat', 'dakika'] as const satisfies readonly GoalUnit[];

export function focusLevel(minutes: number) {
  return FOCUS_LEVELS.find((l) => l.minutes === minutes) ?? FOCUS_LEVELS[1];
}

export interface FocusClock {
  plannedMinutes: number;
  /** ISO string, Date ya da epoch ms */
  startedAt: string | Date | number;
  endedAt?: string | Date | number | null;
  pausedMs: number;
  pausedAt?: string | Date | number | null;
}

const ms = (v: string | Date | number): number =>
  typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : v.getTime();

/**
 * Seansın gerçekleşen süresi. Her zaman duvar saatinden hesaplanır:
 * (endedAt ?? now) − startedAt − pausedMs − (süren duraklama), planlanan süreyle sınırlı.
 */
export function focusElapsedMs(s: FocusClock, now: number | Date): number {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const end = s.endedAt != null ? ms(s.endedAt) : nowMs;
  const openPause = s.pausedAt != null ? Math.max(0, end - ms(s.pausedAt)) : 0;
  const raw = end - ms(s.startedAt) - s.pausedMs - openPause;
  return Math.min(Math.max(0, raw), s.plannedMinutes * 60_000);
}

export const focusRemainingMs = (s: FocusClock, now: number | Date): number =>
  s.plannedMinutes * 60_000 - focusElapsedMs(s, now);

/** 0–1 */
export const focusProgress = (s: FocusClock, now: number | Date): number =>
  focusElapsedMs(s, now) / (s.plannedMinutes * 60_000);

/** Gerçekleşen tam dakika (hedefe yazılan ve "32 dakika" başlığındaki değer) */
export const focusMinutesOf = (elapsedMs: number): number => Math.floor(elapsedMs / 60_000);

/** Dakikayı hedef birimine çevirir; saat için 1 ondalık. Başka birim için null. */
export function minutesToGoalAmount(minutes: number, unit: GoalUnit): number | null {
  if (unit === 'dakika') return minutes;
  if (unit === 'saat') return Math.round((minutes / 60) * 10) / 10;
  return null;
}

/** Kalan süre "MM:SS" (90 dk için "90:00") */
export function formatClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 100 → "1 sa 40 dk", 45 → "45 dk", 120 → "2 sa" */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} dk`;
  return rest === 0 ? `${h} sa` : `${h} sa ${rest} dk`;
}

/** Odak bitti ekranındaki "Hiç / 1–2 / 3+" seçimi */
export type InterruptionChoice = 'none' | 'some' | 'many';
export function interruptionChoiceOf(n: number): InterruptionChoice {
  return n <= 0 ? 'none' : n >= 3 ? 'many' : 'some';
}
export function interruptionsFromChoice(choice: InterruptionChoice, detected: number): number {
  if (choice === 'none') return 0;
  if (choice === 'many') return 3;
  return detected === 1 || detected === 2 ? detected : 1;
}

/* ---------- dağ figürü (viewBox 0 0 320 220) ---------- */

export const TRAIL_POINTS: readonly (readonly [number, number])[] = [
  [80, 206],
  [230, 184],
  [120, 160],
  [235, 136],
  [150, 112],
  [226, 90],
  [175, 70],
  [208, 50],
  [200, 26],
];

const SEGMENTS = TRAIL_POINTS.slice(1).map((p, i) => {
  const q = TRAIL_POINTS[i]!;
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
});
export const TRAIL_LENGTH = SEGMENTS.reduce((a, b) => a + b, 0);

/** Patika üzerinde p oranındaki nokta (tasarımdaki hesapla aynı). */
export function trailPoint(progress: number): { x: number; y: number } {
  const p = Math.min(1, Math.max(0, progress));
  let rem = TRAIL_LENGTH * p;
  let [x, y] = TRAIL_POINTS[0]!;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i]!;
    const a = TRAIL_POINTS[i]!;
    const b = TRAIL_POINTS[i + 1]!;
    if (rem <= seg) {
      const k = seg === 0 ? 0 : rem / seg;
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
    }
    rem -= seg;
    [x, y] = b;
  }
  return { x, y };
}

/** Haftalık zirve üçgeninin yüksekliği (px): en yüksek dağ 60 px */
export function peakHeight(plannedMinutes: number, progress = 1): number {
  return Math.round((focusLevel(plannedMinutes).altitude / 4100) * 60 * progress);
}
