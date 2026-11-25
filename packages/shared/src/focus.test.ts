import { describe, expect, it } from 'vitest';
import {
  TRAIL_LENGTH,
  TRAIL_POINTS,
  focusElapsedMs,
  focusMinutesOf,
  formatClock,
  formatDuration,
  interruptionsFromChoice,
  minutesToGoalAmount,
  peakHeight,
  trailPoint,
} from './focus.js';
import { localDateOf } from './time.js';

const MIN = 60_000;
const t0 = Date.parse('2026-11-25T07:00:00Z');

describe('focusElapsedMs', () => {
  const base = { plannedMinutes: 50, startedAt: new Date(t0).toISOString(), pausedMs: 0 };

  it('duvar saatinden hesaplar', () => {
    expect(focusElapsedMs(base, t0 + 12 * MIN)).toBe(12 * MIN);
  });

  it('başlangıçtan önceki an için 0', () => {
    expect(focusElapsedMs(base, t0 - MIN)).toBe(0);
  });

  it('süren duraklamayı saymaz', () => {
    const s = { ...base, pausedAt: t0 + 10 * MIN };
    expect(focusElapsedMs(s, t0 + 25 * MIN)).toBe(10 * MIN);
  });

  it('devam ettikten sonra biriken duraklamayı düşer', () => {
    const s = { ...base, pausedMs: 5 * MIN };
    expect(focusElapsedMs(s, t0 + 25 * MIN)).toBe(20 * MIN);
  });

  it('planlanan süreyle sınırlanır', () => {
    expect(focusElapsedMs(base, t0 + 3 * 60 * MIN)).toBe(50 * MIN);
  });

  it('bitmiş seansta endedAt esas alınır', () => {
    const s = { ...base, endedAt: t0 + 32 * MIN };
    expect(focusElapsedMs(s, t0 + 5 * 60 * MIN)).toBe(32 * MIN);
  });

  it('duraklatılmışken bitirilen seans', () => {
    const s = { ...base, pausedMs: 2 * MIN, pausedAt: t0 + 20 * MIN, endedAt: t0 + 30 * MIN };
    expect(focusElapsedMs(s, t0 + 60 * MIN)).toBe(18 * MIN);
  });

  it('gece yarısını aşan seans: süre doğru, gün başladığı gün', () => {
    // yerel 23:50 → 00:40 (UTC 20:50 → 21:40)
    const start = Date.parse('2026-11-24T20:50:00Z');
    const s = { plannedMinutes: 50, startedAt: start, pausedMs: 0 };
    expect(focusElapsedMs(s, Date.parse('2026-11-24T21:40:00Z'))).toBe(50 * MIN);
    expect(localDateOf(new Date(start), 'Europe/Istanbul')).toBe('2026-11-24');
  });
});

describe('birim ve biçim', () => {
  it('dakika → hedef birimi', () => {
    expect(minutesToGoalAmount(50, 'saat')).toBe(0.8);
    expect(minutesToGoalAmount(90, 'saat')).toBe(1.5);
    expect(minutesToGoalAmount(50, 'dakika')).toBe(50);
    expect(minutesToGoalAmount(50, 'km')).toBeNull();
  });
  it('tam dakika', () => {
    expect(focusMinutesOf(32 * MIN + 59_000)).toBe(32);
  });
  it('sayaç ve süre metni', () => {
    expect(formatClock(50 * MIN)).toBe('50:00');
    expect(formatClock(61_500)).toBe('01:02');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatDuration(100)).toBe('1 sa 40 dk');
    expect(formatDuration(45)).toBe('45 dk');
    expect(formatDuration(120)).toBe('2 sa');
  });
  it('bölünme seçimi', () => {
    expect(interruptionsFromChoice('none', 2)).toBe(0);
    expect(interruptionsFromChoice('some', 2)).toBe(2);
    expect(interruptionsFromChoice('some', 0)).toBe(1);
    expect(interruptionsFromChoice('many', 1)).toBe(3);
  });
});

describe('dağ patikası', () => {
  it('uçlar ilk ve son nokta', () => {
    expect(trailPoint(0)).toEqual({ x: 80, y: 206 });
    for (const v of [1, 2]) {
      expect(trailPoint(v).x).toBeCloseTo(200, 6);
      expect(trailPoint(v).y).toBeCloseTo(26, 6);
    }
  });
  it('ilk segmentin ortası', () => {
    const first = Math.hypot(150, 22);
    const p = trailPoint(first / 2 / TRAIL_LENGTH);
    expect(p.x).toBeCloseTo(155, 5);
    expect(p.y).toBeCloseTo(195, 5);
  });
  it('ara noktalardan geçer', () => {
    let acc = 0;
    for (let i = 1; i < TRAIL_POINTS.length; i++) {
      acc += Math.hypot(
        TRAIL_POINTS[i]![0] - TRAIL_POINTS[i - 1]![0],
        TRAIL_POINTS[i]![1] - TRAIL_POINTS[i - 1]![1],
      );
      const p = trailPoint(acc / TRAIL_LENGTH);
      expect(p.x).toBeCloseTo(TRAIL_POINTS[i]![0], 5);
      expect(p.y).toBeCloseTo(TRAIL_POINTS[i]![1], 5);
    }
  });
  it('zirve yükseklikleri', () => {
    expect(peakHeight(90)).toBe(60);
    expect(peakHeight(50)).toBe(37);
    expect(peakHeight(25)).toBe(18);
    expect(peakHeight(50, 0.5)).toBe(18);
  });
});
