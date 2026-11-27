import { describe, expect, it } from 'vitest';
import {
  WORLD_H,
  WORLD_W,
  ZOOM_BIRD,
  cameraTarget,
  hourOfClock,
  isNightHour,
  lineScale,
  pinOpacity,
  smoothing,
} from './standbyMath';

describe('isNightHour', () => {
  it('22:00 – 06:00 arası gece', () => {
    expect(isNightHour(22)).toBe(true);
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(5)).toBe(true);
    expect(isNightHour(6)).toBe(false);
    expect(isNightHour(12)).toBe(false);
    expect(isNightHour(21)).toBe(false);
  });
  it('saat metninden saat okur', () => {
    expect(hourOfClock('21:47')).toBe(21);
    expect(hourOfClock('00:05')).toBe(0);
  });
});

describe('cameraTarget', () => {
  const aspect = 1.3;

  it('yakınlık 1: bütün arazi ortada', () => {
    const t = cameraTarget(1, aspect, 50, 200);
    expect(t.cx).toBe(160);
    expect(t.cy).toBe(122);
    expect(t.vw).toBeGreaterThanOrEqual(WORLD_W);
  });

  it('yakınlık arttıkça görünen genişlik küçülür', () => {
    const a = cameraTarget(3, aspect, 150, 150).vw;
    const b = cameraTarget(ZOOM_BIRD, aspect, 150, 150).vw;
    expect(b).toBeLessThan(a);
    expect(b).toBeCloseTo(cameraTarget(1, aspect, 0, 0).fitW / ZOOM_BIRD, 6);
  });

  it('kuşa yakınken merkez kuştadır', () => {
    const t = cameraTarget(ZOOM_BIRD, aspect, 150, 120);
    expect(t.cx).toBeCloseTo(150, 6);
    expect(t.cy).toBeCloseTo(120, 6);
  });

  it('kamera dünya sınırının dışına çıkmaz', () => {
    const t = cameraTarget(ZOOM_BIRD, aspect, 2, 2);
    const vh = t.vw / aspect;
    expect(t.cx - t.vw / 2).toBeGreaterThanOrEqual(0);
    expect(t.cy - vh / 2).toBeGreaterThanOrEqual(0);
    const u = cameraTarget(ZOOM_BIRD, aspect, WORLD_W, WORLD_H);
    expect(u.cx + u.vw / 2).toBeLessThanOrEqual(WORLD_W + 1e-9);
    expect(u.cy + u.vw / aspect / 2).toBeLessThanOrEqual(WORLD_H + 1e-9);
  });

  it('geniş kutuda yakınlık 1 hâlâ bütün araziyi gösterir', () => {
    const wide = cameraTarget(1, 2.2, 100, 100);
    expect(wide.vw / 2.2).toBeGreaterThanOrEqual(WORLD_H);
  });
});

describe('lineScale', () => {
  it('3×\'e kadar çizgi küçülmez', () => {
    expect(lineScale(330, 330)).toBe(1);
    expect(lineScale(330, 330 / 3)).toBe(1);
  });
  it('yakınlıkla ters orantılı küçülür, alt sınırı vardır', () => {
    expect(lineScale(330, 330 / 6)).toBeCloseTo(0.5, 6);
    expect(lineScale(330, 330 / 30)).toBeCloseTo(0.1, 6);
    expect(lineScale(330, 330 / 500)).toBe(0.03);
  });
});

describe('pinOpacity', () => {
  it('uzaktayken görünür, yakınlaşınca söner', () => {
    expect(pinOpacity(1)).toBe(1);
    expect(pinOpacity(2)).toBe(1);
    expect(pinOpacity(4)).toBeCloseTo(0.5, 6);
    expect(pinOpacity(6)).toBe(0);
    expect(pinOpacity(30)).toBe(0);
  });
});

describe('smoothing', () => {
  it('0 ile 1 arasındadır ve süre arttıkça büyür', () => {
    const a = smoothing(8, 140);
    const b = smoothing(32, 140);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
  });
  it('kare hızından bağımsız: iki yarım adım = bir tam adım', () => {
    const half = smoothing(8, 140);
    const full = smoothing(16, 140);
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(full, 10);
  });
});
