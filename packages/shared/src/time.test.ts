import { describe, expect, it } from 'vitest';
import {
  addDays,
  isoDayOfWeek,
  isoWeekNumber,
  localDateOf,
  weekStartOf,
  zonedDateTimeToUtc,
} from './time.js';

const TZ = 'Europe/Istanbul';

describe('time helpers (Europe/Istanbul)', () => {
  it('00:00–03:00 yerel saat UTC’de önceki güne düşer ama yerel gün doğru hesaplanır', () => {
    // 2026-11-25 01:30 İstanbul = 2026-11-24 22:30 UTC
    const instant = new Date('2026-11-24T22:30:00Z');
    expect(localDateOf(instant, TZ)).toBe('2026-11-25');
    expect(localDateOf(new Date('2026-11-24T20:59:59Z'), TZ)).toBe('2026-11-24');
    expect(localDateOf(new Date('2026-11-24T21:00:00Z'), TZ)).toBe('2026-11-25');
  });

  it('yerel gün + saat UTC’ye çevrilir (+03:00)', () => {
    expect(zonedDateTimeToUtc('2026-11-25', '07:00', TZ).toISOString()).toBe(
      '2026-11-25T04:00:00.000Z',
    );
    expect(zonedDateTimeToUtc('2026-11-25', '00:30', TZ).toISOString()).toBe(
      '2026-11-24T21:30:00.000Z',
    );
  });

  it('hafta pazartesi başlar', () => {
    expect(isoDayOfWeek('2026-11-23')).toBe(1);
    expect(isoDayOfWeek('2026-11-29')).toBe(7);
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-30')).toBe('2026-11-30');
  });

  it('ay ve yıl sınırında gün ekler', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('ISO hafta numarası', () => {
    expect(isoWeekNumber('2026-11-24')).toBe(48);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
  });
});

import { daysBetween, monthEndOf, periodBounds } from './time.js';

describe('period helpers', () => {
  it('periyot sınırları', () => {
    expect(periodBounds('daily', '2026-11-25')).toEqual({ start: '2026-11-25', end: '2026-11-25' });
    expect(periodBounds('weekly', '2026-11-25')).toEqual({
      start: '2026-11-23',
      end: '2026-11-29',
    });
    expect(periodBounds('monthly', '2026-02-10')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(monthEndOf('2028-02-03')).toBe('2028-02-29');
    expect(daysBetween('2026-11-23', '2026-12-01')).toBe(8);
  });
});
