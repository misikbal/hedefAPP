import { describe, expect, it } from 'vitest';
import {
  BIOMES,
  LEVEL_TOPS,
  ROUTES,
  SUMMIT_X_MAX,
  SUMMIT_X_MIN,
  inPoly,
  mountainGeometry,
  nextSceneSeed,
  sceneLabel,
  sceneVariant,
} from './mountainScene';

const SEEDS = Array.from({ length: 240 }, (_, i) => i * 37 + 11);

describe('sceneVariant', () => {
  it('aynı tohum aynı sahneyi verir', () => {
    expect(sceneVariant(123)).toEqual(sceneVariant(123));
    expect(mountainGeometry(sceneVariant(123), 1)).toEqual(mountainGeometry(sceneVariant(123), 1));
  });

  it('bütün mevsimler ve rotalar çıkar, zirve aralıkta', () => {
    const vs = SEEDS.map(sceneVariant);
    expect(new Set(vs.map((v) => v.biome)).size).toBe(BIOMES.length);
    expect(new Set(vs.map((v) => v.route)).size).toBe(ROUTES.length);
    for (const v of vs) {
      expect(v.sx).toBeGreaterThanOrEqual(SUMMIT_X_MIN);
      expect(v.sx).toBeLessThanOrEqual(SUMMIT_X_MAX);
    }
    expect(sceneLabel(sceneVariant(0))).toMatch(/·/);
  });

  it('yeni tohum mevsim ya da rotada farklıdır', () => {
    for (let i = 0; i < 30; i++) {
      const prev = SEEDS[i]!;
      const a = sceneVariant(prev);
      const b = sceneVariant(nextSceneSeed(prev));
      expect(a.biome !== b.biome || a.route !== b.route).toBe(true);
    }
  });
});

describe('mountainGeometry', () => {
  it('tırmanış noktaları dağın içinde, patika zirvede biter', () => {
    for (const seed of SEEDS) {
      const v = sceneVariant(seed);
      for (const index of [0, 1, 2]) {
        const g = mountainGeometry(v, index);
        const n = g.trail.pts.length / 2;
        for (let i = g.climbStart; i < n; i++) {
          const x = g.trail.pts[i * 2]!;
          const y = g.trail.pts[i * 2 + 1]!;
          expect(inPoly(x, y, g.outline), `seed ${seed} seviye ${index} nokta ${i} (${x},${y})`).toBe(true);
        }
        expect(g.trail.pts[(n - 1) * 2]).toBe(v.sx);
        expect(g.trail.pts[(n - 1) * 2 + 1]).toBe(LEVEL_TOPS[index]! + 1);
        expect(g.trail.len).toBeGreaterThan(100);
        expect(g.trail.cum[g.trail.cum.length - 1]).toBeCloseTo(g.trail.len);
      }
    }
  });

  it('zirve sırtın en yüksek noktası; kar yalnız en yüksek seviyede', () => {
    for (const seed of SEEDS) {
      const v = sceneVariant(seed);
      for (const index of [0, 1, 2]) {
        const g = mountainGeometry(v, index);
        const top = LEVEL_TOPS[index]!;
        const others = g.outline.filter(([x, y]) => !(x === v.sx && y === top));
        expect(Math.min(...others.map(([, y]) => y))).toBeGreaterThan(top);
        expect(g.snow !== null).toBe(index === 2);
        expect(g.rock !== null).toBe(index > 0);
        expect(g.body).not.toMatch(/NaN/);
        expect(g.shade).not.toMatch(/NaN/);
        expect(g.contours.join(' ')).not.toMatch(/NaN|Infinity/);
      }
    }
  });
});
