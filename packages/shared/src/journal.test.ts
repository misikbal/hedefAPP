import { describe, expect, it } from 'vitest';
import {
  dayStatChips,
  dayStatsLine,
  journalDateOf,
  journalPreview,
  monthGrid,
  shiftMonth,
} from './journal.js';

const TZ = 'Europe/Istanbul';

describe('journalDateOf', () => {
  it('04:00 öncesi önceki gün', () => {
    // yerel 25 Kasım 00:30
    expect(journalDateOf(new Date('2026-11-24T21:30:00Z'), TZ)).toBe('2026-11-24');
    // yerel 03:59
    expect(journalDateOf(new Date('2026-11-25T00:59:00Z'), TZ)).toBe('2026-11-24');
  });
  it('04:00 ve sonrası aynı gün', () => {
    expect(journalDateOf(new Date('2026-11-25T01:00:00Z'), TZ)).toBe('2026-11-25');
    expect(journalDateOf(new Date('2026-11-25T20:00:00Z'), TZ)).toBe('2026-11-25');
  });
});

describe('monthGrid', () => {
  it('Kasım 2026 pazar başlar: 6 boş hücre, 30 gün', () => {
    const g = monthGrid('2026-11');
    expect(g.leading).toBe(6);
    expect(g.days).toHaveLength(30);
    expect(g.days[0]).toBe('2026-11-01');
    expect(g.days.at(-1)).toBe('2026-11-30');
  });
  it('Haziran 2026 pazartesi başlar; şubat 28 gün', () => {
    expect(monthGrid('2026-06').leading).toBe(0);
    expect(monthGrid('2026-02').days).toHaveLength(28);
    expect(monthGrid('2028-02').days).toHaveLength(29);
  });
  it('ay kaydırma', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('metinler', () => {
  const stats = {
    goals: [{ name: 'Bisiklet', unit: 'km', amount: 25 }],
    focusMinutes: 100,
    blocks: { done: 4, total: 6 },
    penalties: { created: 1, open: 1 },
  };
  it('çipler', () => {
    expect(dayStatChips(stats).map((c) => c.text)).toEqual([
      '25 km bisiklet',
      '1 sa 40 dk odak',
      '4/6 görev',
      '1 ceza bekliyor',
    ]);
    expect(dayStatChips(stats).at(-1)?.tone).toBe('penalty');
  });
  it('takvim satırı', () => {
    expect(dayStatsLine({ ...stats, penalties: { created: 0, open: 0 } })).toBe(
      '4/6 blok · 1 sa 40 dk odak · ceza yok',
    );
  });
  it('önizleme ilk dolu alan', () => {
    expect(journalPreview({ wentWell: null, hard: ' Zor gün ', tomorrowOne: 'x' })).toBe('Zor gün');
  });
});
