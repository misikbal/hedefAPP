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

import {
  computeJournalInsights,
  journalFindings,
  journalTagLabel,
  normalizeJournalTags,
  type InsightEntryInput,
} from './journal.js';

describe('etiketler', () => {
  it('küçük harf, tekrarsız, en çok 5; liste dışı other: önekli', () => {
    expect(
      normalizeJournalTags([
        'Yorgunluk',
        'yorgunluk',
        ' #KOD ',
        'Bahçe',
        'other:bahçe',
        '',
        'spor',
        'dil',
        'uyku',
      ]),
    ).toEqual(['yorgunluk', 'kod', 'other:bahçe', 'spor', 'dil']);
    expect(normalizeJournalTags(['İŞ'])).toEqual(['iş']);
    expect(journalTagLabel('other:bahçe')).toBe('bahçe');
  });
});

describe('computeJournalInsights', () => {
  const e = (
    date: string,
    mood: number,
    energy: number | null,
    sportDone: boolean | null,
    done: number,
    missed: number,
    tags: string[] = [],
  ): InsightEntryInput => ({
    date,
    mood,
    energy,
    tags,
    summary: `${date} özeti`,
    snapshot: { blocksDone: done, blocksMissed: missed, sportDone },
  });
  const base = {
    from: '2026-11-23',
    to: '2026-11-29',
    asOf: '2026-11-29',
    completion: new Map([
      ['2026-11-23', { done: 3, missed: 1 }],
      ['2026-11-24', { done: 1, missed: 3 }],
    ]),
    missed: [
      { category: 'language', startTime: '15:00' },
      { category: 'language', startTime: '15:30' },
      { category: 'sport', startTime: '07:00' },
    ],
    sportResults: [false, true, true, true],
    journalDates: new Set(['2026-11-27', '2026-11-28', '2026-11-29']),
  };

  it('az veride karşılaştırmalar null', () => {
    const r = computeJournalInsights({ ...base, entries: [e('2026-11-23', 3, 2, true, 1, 0)] });
    expect(r.moodWhenSportDone).toBeNull();
    expect(r.moodWhenSportMissed).toBeNull();
    expect(r.completionByEnergy).toEqual({ low: null, high: null });
    expect(r.moodTrend).toBeNull();
    expect(r.entries).toBe(1);
    expect(journalFindings(r).some((f) => f.includes('Spor'))).toBe(false);
  });

  it('ortalamalar, eğilim, gruplar, etiketler, kaçanlar, seriler', () => {
    const entries = [
      e('2026-11-23', 4, 4, true, 4, 0, ['kod', 'spor']),
      e('2026-11-24', 3, 3, true, 3, 1, ['kod']),
      e('2026-11-25', 4, 4, true, 4, 0, ['kod', 'yorgunluk']),
      e('2026-11-26', 1, 1, false, 1, 3, ['yorgunluk']),
      e('2026-11-27', 1, 0, false, 1, 2, ['yorgunluk']),
      e('2026-11-28', 2, 1, false, 2, 2),
    ];
    const r = computeJournalInsights({ ...base, entries });
    expect(r.range).toBe('2026-11-23..2026-11-29');
    expect(r.entries).toBe(6);
    expect(r.moodAvg).toBe(2.5);
    expect(r.moodTrend).toBe('down');
    expect(r.energyAvg).toBe(2.2);
    expect(r.completionRate).toBe(0.5);
    expect(r.moodWhenSportDone).toBe(3.7);
    expect(r.moodWhenSportMissed).toBe(1.3);
    expect(r.completionByEnergy).toEqual({ high: 0.92, low: 0.36 });
    expect(r.topTags).toEqual([
      ['kod', 3],
      ['yorgunluk', 3],
      ['spor', 1],
    ]);
    expect(r.mostMissedCategory).toBe('language');
    expect(r.mostMissedTimeSlot).toBe('14:00-16:00');
    expect(r.streaks).toEqual({ journal: 3, sport: 3 });
    expect(r.lowMoodStreak).toBe(0);
    expect(r.lowestDay).toEqual({ date: '2026-11-27', mood: 1, summary: '2026-11-27 özeti' });
    expect(r.days).toHaveLength(7);
    expect(r.days[1]).toEqual({ date: '2026-11-24', mood: 3, energy: 3, completion: 0.25 });
    expect(r.days[6]).toEqual({ date: '2026-11-29', mood: null, energy: null, completion: null });

    const f = journalFindings(r);
    expect(f).toHaveLength(3);
    expect(f[0]).toBe('Spor yaptığın günlerde ruh hâli ortalaman 3,7, yapmadığın günlerde 1,3.');
    expect(f[1]).toBe('Enerjin yüksek günlerde tamamlama %92, düşük günlerde %36.');
    expect(f[2]).toBe('En çok Dil blokları kaçtı; çoğu 14:00–16:00 arası.');
  });

  it('art arda düşük ruh hâli sayılır', () => {
    const r = computeJournalInsights({
      ...base,
      entries: [
        e('2026-11-25', 3, null, null, 0, 0),
        e('2026-11-26', 1, null, null, 0, 0),
        e('2026-11-27', 0, null, null, 0, 0),
      ],
    });
    expect(r.lowMoodStreak).toBe(2);
    expect(r.energyAvg).toBeNull();
  });
});
