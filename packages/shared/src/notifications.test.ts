import { describe, expect, it } from 'vitest';
import { inQuietHours, inSlotWindow, quietHoursEnd } from './notifications.js';
import { isoWeekId, isoWeekStart } from './time.js';

const TZ = 'Europe/Istanbul';

describe('sessiz saatler', () => {
  it('gece yarısını geçen aralık', () => {
    expect(inQuietHours('23:30', '23:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '23:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00', '23:00', '07:00')).toBe(false);
    expect(inQuietHours('12:00', '23:00', '07:00')).toBe(false);
  });
  it('aynı gün içindeki aralık ve boş aralık', () => {
    expect(inQuietHours('00:00', '00:00', '06:30')).toBe(true);
    expect(inQuietHours('06:30', '00:00', '06:30')).toBe(false);
    expect(inQuietHours('03:00', '05:00', '05:00')).toBe(false);
  });
  it('bitiş anı: gece yarısından önce → ertesi gün, sonra → aynı gün', () => {
    // 23:30 yerel (20:30Z) → ertesi gün 07:00 yerel = 04:00Z
    expect(
      quietHoursEnd(new Date('2026-11-24T20:30:00Z'), TZ, { start: '23:00', end: '07:00' }),
    ).toEqual(new Date('2026-11-25T04:00:00Z'));
    // 02:00 yerel 25 Kasım (24 Kasım 23:00Z) → aynı gün 06:30 yerel = 03:30Z
    expect(
      quietHoursEnd(new Date('2026-11-24T23:00:00Z'), TZ, { start: '00:00', end: '06:30' }),
    ).toEqual(new Date('2026-11-25T03:30:00Z'));
    expect(
      quietHoursEnd(new Date('2026-11-25T09:00:00Z'), TZ, { start: '00:00', end: '06:30' }),
    ).toBeNull();
  });
  it('saat penceresi', () => {
    expect(inSlotWindow('09:00', '09:00', 60)).toBe(true);
    expect(inSlotWindow('09:59', '09:00', 60)).toBe(true);
    expect(inSlotWindow('10:00', '09:00', 60)).toBe(false);
    expect(inSlotWindow('08:59', '09:00', 60)).toBe(false);
  });
});

describe('ISO hafta kimliği', () => {
  it('yıl sınırı', () => {
    expect(isoWeekId('2026-11-25')).toBe('2026-W48');
    expect(isoWeekId('2027-01-01')).toBe('2026-W53');
    expect(isoWeekId('2025-12-29')).toBe('2026-W01');
  });
  it('kimlikten pazartesi', () => {
    expect(isoWeekStart('2026-W48')).toBe('2026-11-23');
    expect(isoWeekStart('2026-W01')).toBe('2025-12-29');
    expect(isoWeekStart('2026-W53')).toBe('2026-12-28');
    expect(isoWeekStart('2025-W53')).toBeNull();
    expect(isoWeekStart('2026-48')).toBeNull();
  });
});
