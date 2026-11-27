/*
 * Dağ sahnesi çeşitleri: mevsim (renk paleti), zirvenin yeri, sırt çizgisinin biçimi ve patika türü
 * tek bir tam sayı tohumdan (seed) belirli biçimde üretilir. Saf modül: React ve native bağımlılığı yok,
 * DB'siz/cihazsız test edilir. Seviye (Tepe / Dağ / Zirve) yüksekliği ve temel biçimi korur:
 * 0 yuvarlak, 1 kayalık, 2 karlı.
 */

/** Seviye başına zirve yüksekliği (y, küçük = yüksek) */
export const LEVEL_TOPS = [78, 50, 24] as const;
/** Başlangıç iğnesi */
export const START = [92, 164] as const;

/** Dağın taban köşeleri (arazi bloğunun üst yüzeyinde) */
const LEFT_FOOT_Y = 150;
const RIGHT_FOOT: readonly [number, number] = [306, 137];
const BOTTOM_RIGHT: readonly [number, number] = [250, 162];
const BOTTOM_LEFT: readonly [number, number] = [150, 165];
/** Patikanın dağa girdiği yer ve tırmanışın başladığı yükseklik */
const ENTRY: readonly [number, number] = [168, 150];
const CLIMB_BASE_Y = 150;

/** Zirvenin yatay aralığı */
export const SUMMIT_X_MIN = 192;
export const SUMMIT_X_MAX = 226;

export type Biome = 'summer' | 'autumn' | 'winter' | 'desert';
export type RouteKind = 'switchback' | 'wide' | 'tight' | 'ridge' | 'traverse';

export const BIOMES: readonly Biome[] = ['summer', 'autumn', 'winter', 'desert'];
export const ROUTES: readonly RouteKind[] = ['switchback', 'wide', 'tight', 'ridge', 'traverse'];

export const BIOME_LABELS: Record<Biome, string> = {
  summer: 'Yaz',
  autumn: 'Sonbahar',
  winter: 'Kış',
  desert: 'Kanyon',
};

export const ROUTE_LABELS: Record<RouteKind, string> = {
  switchback: 'Zikzak patika',
  wide: 'Geniş kıvrımlar',
  tight: 'Sık virajlar',
  ridge: 'Batı sırtı',
  traverse: 'Doğu yamacı',
};

export interface Palette {
  top: readonly [string, string, string];
  left: readonly [string, string];
  right: readonly [string, string];
  hill: readonly [string, string];
  mtn: readonly [string, string, string];
  rock: readonly [string, string];
  snow: readonly [string, string];
  shade: string;
  edge: string;
  fields: readonly [string, string];
  fieldLine: string;
  trees: readonly [string, string];
  treeLight: string;
  contour: string;
  hillLine: string;
  water: readonly [string, string];
}

export const PALETTES: Record<Biome, Palette> = {
  summer: {
    top: ['#8CC152', '#4E9A38', '#2E6B2B'],
    left: ['#6B4A2E', '#2E2016'],
    right: ['#47321F', '#1C140E'],
    hill: ['#A6D163', '#3E8634'],
    mtn: ['#9FCB5C', '#4F9A3A', '#2F6E2C'],
    rock: ['#A39A86', '#7C7766'],
    snow: ['#FFFFFF', '#DCE8F0'],
    shade: '#0B2410',
    edge: '#6FAE45',
    fields: ['#B7DB6B', '#9DCB56'],
    fieldLine: '#2F6B2B',
    trees: ['#1F5A27', '#2A6F30'],
    treeLight: '#5FA444',
    contour: '#E3F5B0',
    hillLine: '#D8F0A0',
    water: ['#2F7FA8', '#6CC4EE'],
  },
  autumn: {
    top: ['#C9B04E', '#A0782F', '#6B4A22'],
    left: ['#6B4A2E', '#2E2016'],
    right: ['#47321F', '#1C140E'],
    hill: ['#D9B85C', '#93652A'],
    mtn: ['#CDA557', '#9A6B30', '#62431F'],
    rock: ['#9C9282', '#776F62'],
    snow: ['#FFFFFF', '#DCE8F0'],
    shade: '#2A1606',
    edge: '#C29A45',
    fields: ['#E6C871', '#D2A851'],
    fieldLine: '#7A5222',
    trees: ['#8C3A1C', '#B0522A'],
    treeLight: '#E9A23B',
    contour: '#FBE7B0',
    hillLine: '#F6DE9E',
    water: ['#2F7FA8', '#6CC4EE'],
  },
  winter: {
    top: ['#F4F8FB', '#D6E2EC', '#AFC2D2'],
    left: ['#5A4A3E', '#241C16'],
    right: ['#3E3229', '#17110D'],
    hill: ['#FFFFFF', '#BCCDDB'],
    mtn: ['#F2F6FA', '#C3D3E0', '#8FA5B8'],
    rock: ['#6E7884', '#525B66'],
    snow: ['#FFFFFF', '#E6EEF5'],
    shade: '#1C3550',
    edge: '#E2EBF2',
    fields: ['#FFFFFF', '#E8F0F6'],
    fieldLine: '#9AB0C2',
    trees: ['#24463A', '#2F5646'],
    treeLight: '#EEF4F8',
    contour: '#6F8BA3',
    hillLine: '#8EA6BA',
    water: ['#4E7E9C', '#BFE3F5'],
  },
  desert: {
    top: ['#E6BE82', '#C98D52', '#93582F'],
    left: ['#9A5A34', '#4A2716'],
    right: ['#74401F', '#33190C'],
    hill: ['#ECC48D', '#BC7C43'],
    mtn: ['#DE9A62', '#B3683C', '#7C3F22'],
    rock: ['#A6765A', '#8A5A40'],
    snow: ['#FFFFFF', '#F4E6DA'],
    shade: '#3B1708',
    edge: '#D9A86A',
    fields: ['#F2D59E', '#E4BF82'],
    fieldLine: '#9A6A3A',
    trees: ['#4F6B33', '#647E3C'],
    treeLight: '#A9BB62',
    contour: '#FFE6C2',
    hillLine: '#FFE3BC',
    water: ['#2F8FA0', '#7FD6E0'],
  },
};

export interface SceneVariant {
  seed: number;
  biome: Biome;
  route: RouteKind;
  /** zirvenin x'i */
  sx: number;
  /** sağ sırtta ikinci, alçak tepe (Dağ ve Zirve seviyesinde) */
  twin: boolean;
  /** patikanın sağdan mı soldan mı başladığı */
  flip: boolean;
}

export interface Trail {
  /** düz dizi: x0,y0,x1,y1,... */
  pts: number[];
  /** her noktaya kadar birikmiş uzunluk */
  cum: number[];
  len: number;
  d: string;
}

export interface MountainGeometry {
  sx: number;
  top: number;
  body: string;
  shade: string;
  rock: string | null;
  snow: string | null;
  snowShade: string | null;
  contours: string[];
  trail: Trail;
  /** `trail.pts` içinde dağın üstündeki ilk noktanın sırası (öncesi vadideki yaklaşım) */
  climbStart: number;
  /** dağ gövdesinin çokgeni (test ve sınır hesabı için) */
  outline: [number, number][];
  /** zirvede bayrağın solunda, sırtın üstünde durma noktası (kuş) */
  perch: [number, number];
}

type P = [number, number];

/** Basit belirli rastgele (LCG) */
export function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 4294967296) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Yeni sahne tohumu (bir öncekinden farklı mevsim ya da rota çıkar) */
export function nextSceneSeed(prev?: number): number {
  for (let i = 0; i < 8; i++) {
    const s = Math.floor(Math.random() * 1_000_000);
    if (prev == null) return s;
    const a = sceneVariant(prev);
    const b = sceneVariant(s);
    if (a.biome !== b.biome || a.route !== b.route) return s;
  }
  return (prev ?? 0) + 1;
}

export function sceneVariant(seed: number): SceneVariant {
  const n = Math.abs(Math.floor(seed));
  const rand = rng(n * 7919 + 17);
  const biome = BIOMES[n % BIOMES.length]!;
  const route = ROUTES[Math.floor(n / BIOMES.length) % ROUTES.length]!;
  const sx = Math.round(SUMMIT_X_MIN + rand() * (SUMMIT_X_MAX - SUMMIT_X_MIN));
  const twin = rand() < 0.5;
  const flip = rand() < 0.5;
  return { seed: n, biome, route, sx, twin, flip };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const pts = (ps: readonly P[]) => ps.map(([x, y]) => `${r1(x)},${r1(y)}`);
const polyD = (ps: readonly P[]) =>
  ps.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)},${r1(y)}`).join(' ') + ' Z';

/** Yuvarlak dağ için: noktalar arası orta noktalarla ikinci derece eğri */
function smoothOpen(ps: readonly P[]): string {
  let d = `M${pts([ps[0]!])[0]}`;
  for (let i = 1; i < ps.length - 1; i++) {
    const [x, y] = ps[i]!;
    const [nx, ny] = ps[i + 1]!;
    d += ` Q${r1(x)},${r1(y)} ${r1((x + nx) / 2)},${r1((y + ny) / 2)}`;
  }
  const last = ps[ps.length - 1]!;
  return `${d} L${r1(last[0])},${r1(last[1])}`;
}

/** Çoklu çizginin y yatayını kestiği x'ler */
function crossings(poly: readonly P[], y: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < poly.length; i++) {
    const [ax, ay] = poly[i - 1]!;
    const [bx, by] = poly[i]!;
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    out.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
  }
  return out;
}

/**
 * Sırt çizgisi. Sol: taban → zirve, sağ: zirve → taban. Seviye 0 yumuşak kubbe, 1–2 pürüzlü;
 * ara noktalar her zaman zirveden alçakta kalır.
 */
function ridges(v: SceneVariant, index: number) {
  const top = LEVEL_TOPS[index]!;
  const rand = rng(v.seed * 31 + index * 101 + 5);
  const leftFoot: P = [104 - index * 2, LEFT_FOOT_Y];
  const rocky = index > 0;
  const n = rocky ? 8 : 5;
  const profile = (f: number) => (rocky ? Math.pow(f, 1.2) : 1 - Math.pow(1 - f, 1.7));

  const side = (from: P, sign: 1 | -1): P[] => {
    const h = from[1] - top;
    const out: P[] = [];
    for (let i = 1; i <= n; i++) {
      const f = i / (n + 1);
      let x = from[0] + (v.sx - from[0]) * f;
      let y = from[1] - h * profile(f);
      if (rocky) {
        const notch = i % 2 ? -1 : 1;
        y += notch * h * (0.025 + rand() * 0.04) * (1 - f * 0.4);
        x += (rand() - 0.5) * 5;
      } else {
        y += (rand() - 0.5) * h * 0.02;
      }
      // ikinci tepe: sağ sırtta, zirveden ~%45 uzakta
      if (sign === 1 && v.twin && rocky) {
        const g = 1 - f; // zirveden uzaklık
        const bump = Math.exp(-(((g - 0.45) / 0.13) ** 2));
        y -= bump * h * 0.3;
      }
      y = Math.max(y, top + 3 + (1 - f) * 3);
      out.push([x, y]);
    }
    return out;
  };

  const left: P[] = [leftFoot, ...side(leftFoot, -1), [v.sx, top]];
  const rightUp = side([RIGHT_FOOT[0], RIGHT_FOOT[1]], 1);
  const right: P[] = [[v.sx, top], ...rightUp.reverse(), [RIGHT_FOOT[0], RIGHT_FOOT[1]]];
  return { top, left, right, leftFoot };
}

/** Gövdenin içinde, y yüksekliğinde sol ve sağ sınır (en içteki kesişim) */
function makeBounds(left: readonly P[], right: readonly P[]) {
  const leftPoly: P[] = [[BOTTOM_LEFT[0], BOTTOM_LEFT[1]], ...left];
  const rightPoly: P[] = [...right, [BOTTOM_RIGHT[0], BOTTOM_RIGHT[1]]];
  return (y: number): [number, number] => {
    const l = crossings(leftPoly, y);
    const r = crossings(rightPoly, y);
    return [l.length ? Math.max(...l) : leftPoly[1]![0], r.length ? Math.min(...r) : rightPoly[0]![0]];
  };
}

/** Sırtın `limitY`'den yüksekte kalan kısmı: sol kesişim → zirve → sağ kesişim */
function capAbove(left: readonly P[], right: readonly P[], limitY: number): { cap: P[]; xl: number; xr: number } {
  const cap: P[] = [];
  // sol: zirveden geriye doğru ilk kesişime kadar
  const leftPart: P[] = [];
  let xl = left[left.length - 1]![0];
  for (let i = left.length - 1; i > 0; i--) {
    const a = left[i]!;
    const b = left[i - 1]!;
    leftPart.unshift(a);
    if (b[1] >= limitY) {
      xl = a[0] + ((limitY - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      break;
    }
  }
  cap.push([xl, limitY], ...leftPart);
  let xr = right[0]![0];
  for (let i = 1; i < right.length; i++) {
    const a = right[i - 1]!;
    const b = right[i]!;
    if (i > 1) cap.push(a);
    if (b[1] >= limitY) {
      xr = a[0] + ((limitY - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      break;
    }
  }
  cap.push([xr, limitY]);
  return { cap, xl, xr };
}

/** Sağdan sola dişli alt kenar */
function jaggedEdge(xl: number, xr: number, y: number, amp: number, rand: () => number, count = 6): P[] {
  const out: P[] = [];
  for (let i = count - 1; i >= 1; i--) {
    const f = i / count;
    const x = xl + (xr - xl) * f;
    out.push([x, y + (i % 2 ? amp * (0.6 + rand() * 0.6) : -amp * 0.3)]);
  }
  return out;
}

function buildTrail(raw: readonly P[]): Trail {
  const flat: number[] = [];
  const cum: number[] = [];
  let acc = 0;
  raw.forEach(([x, y], i) => {
    if (i > 0) {
      const [px, py] = raw[i - 1]!;
      acc += Math.hypot(x - px, y - py);
    }
    flat.push(x, y);
    cum.push(acc);
  });
  const d = raw.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return { pts: flat, cum, len: acc, d };
}

const APPROACH: readonly P[] = [
  [START[0], START[1]],
  [110, 167],
  [126, 161],
  [141, 164],
  [156, 158],
  [ENTRY[0], ENTRY[1]],
];

/** Rota türüne göre (yükseklik oranı, genişlik oranı) noktaları */
function routeStops(route: RouteKind, flip: boolean, rand: () => number): { pre: number[]; stops: [number, number][] } {
  const a = (lo: number, hi: number, k: number) => ((k % 2 === 0) !== flip ? lo : hi);
  const stops: [number, number][] = [];
  const pre: number[] = [];
  const wob = () => (rand() - 0.5) * 0.06;
  switch (route) {
    case 'switchback':
      for (let k = 1; k <= 5; k++) stops.push([k / 6, a(0.28, 0.72, k) + wob()]);
      break;
    case 'wide':
      for (let k = 1; k <= 3; k++) stops.push([k / 4, a(0.14, 0.86, k) + wob() * 0.5]);
      break;
    case 'tight':
      for (let k = 1; k <= 8; k++) stops.push([k / 9, a(0.38, 0.62, k) + wob() * 0.5]);
      break;
    case 'ridge':
      for (let k = 1; k <= 6; k++) stops.push([k / 7, (k % 2 ? 0.1 : 0.2) + Math.abs(wob())]);
      break;
    case 'traverse':
      // önce tabanda doğuya, sonra doğu yamacından zikzak
      pre.push(0.55, 0.82);
      for (let k = 1; k <= 4; k++) stops.push([k / 5, (k % 2 ? 0.66 : 0.88) + wob() * 0.5]);
      break;
  }
  return { pre, stops };
}

export function mountainGeometry(v: SceneVariant, index: number): MountainGeometry {
  const { top, left, right } = ridges(v, index);
  const rand = rng(v.seed * 13 + index * 7 + 3);
  const bounds = makeBounds(left, right);
  const span = CLIMB_BASE_Y - top;
  const rocky = index > 0;

  // --- gövde
  const ridgeLine: P[] = [...left, ...right.slice(1)];
  const tail = ` L${BOTTOM_RIGHT[0]},${BOTTOM_RIGHT[1]} L${BOTTOM_LEFT[0]},${BOTTOM_LEFT[1]} Z`;
  const body = (rocky ? polyD(ridgeLine).slice(0, -2) : smoothOpen(ridgeLine)) + tail;

  // --- gölgeli doğu yüzü: sağ sırt + tabandan zirveye kıvrılan omurga
  const spine: P[] = [];
  for (const f of [0.18, 0.4, 0.62, 0.82, 0.94]) {
    const y = BOTTOM_RIGHT[1] + (top - BOTTOM_RIGHT[1]) * f;
    const x = v.sx + 3 + (BOTTOM_RIGHT[0] - v.sx - 3) * Math.pow(1 - f, 1.3);
    const [, xr] = bounds(y);
    spine.push([Math.min(x, xr - 2), y]);
  }
  const shadePts: P[] = [...right, [BOTTOM_RIGHT[0], BOTTOM_RIGHT[1]], ...spine];
  const shade = rocky ? polyD(shadePts) : smoothOpen([...shadePts, right[0]!]) + ' Z';

  // --- kaya ve kar
  let rock: string | null = null;
  let snow: string | null = null;
  let snowShade: string | null = null;
  if (rocky) {
    const yRock = top + span * (index === 2 ? 0.42 : 0.5);
    const c = capAbove(left, right, yRock);
    rock = polyD([...c.cap, ...jaggedEdge(c.xl, c.xr, yRock, 7, rand)]);
  }
  if (index === 2) {
    const ySnow = top + span * 0.26;
    const c = capAbove(left, right, ySnow);
    snow = polyD([...c.cap, ...jaggedEdge(c.xl, c.xr, ySnow, 5, rand, 7)]);
    const rightCap = c.cap.filter(([x]) => x >= v.sx);
    snowShade = polyD([
      ...rightCap,
      [v.sx + (c.xr - v.sx) * 0.45, ySnow + 3],
      [v.sx + 3, top + (ySnow - top) * 0.45],
    ]);
  }

  // --- eş yükselti çizgileri
  const contours: string[] = [];
  for (let k = 1; k <= 4; k++) {
    const y = top + (span * k) / 5;
    const [l, r] = bounds(y);
    const xl = l + 5;
    const xr = r - 6;
    if (xr - xl < 6) continue;
    const mid = (xl + xr) / 2;
    contours.push(`M${r1(xl)},${r1(y)} Q${r1(mid)},${r1(y + (xr - xl) * 0.14)} ${r1(xr)},${r1(y - 2)}`);
  }

  // --- patika
  const { pre, stops } = routeStops(v.route, v.flip, rand);
  const raw: P[] = APPROACH.map(([x, y]) => [x, y]);
  const climbStart = raw.length;
  const at = (y: number, frac: number): P => {
    const [l, r] = bounds(y);
    const f = Math.min(0.92, Math.max(0.08, frac));
    return [r1(l + (r - l) * f), r1(y)];
  };
  for (const frac of pre) raw.push(at(CLIMB_BASE_Y + 2, frac));
  const topY = top + 4;
  for (const [fy, frac] of stops) {
    const y = CLIMB_BASE_Y + (topY - CLIMB_BASE_Y) * fy + (rand() - 0.5) * 2;
    raw.push(at(y, frac));
  }
  raw.push(at(topY, 0.5));
  raw.push([v.sx, top + 1]);

  // --- zirvede durma noktası: sol sırtta, zirvenin ~10 birim solu
  const px = v.sx - 10;
  let perch: P = [px, top + 4];
  for (let i = left.length - 1; i > 0; i--) {
    const a = left[i]!;
    const b = left[i - 1]!;
    if (b[0] <= px) {
      const f = (px - a[0]) / (b[0] - a[0] || 1);
      perch = [r1(px), r1(a[1] + (b[1] - a[1]) * f + 0.5)];
      break;
    }
  }

  const outline: P[] = [...ridgeLine, [BOTTOM_RIGHT[0], BOTTOM_RIGHT[1]], [BOTTOM_LEFT[0], BOTTOM_LEFT[1]]];
  return {
    sx: v.sx,
    top,
    body,
    shade,
    rock,
    snow,
    snowShade,
    contours,
    trail: buildTrail(raw),
    climbStart,
    outline,
    perch,
  };
}

/** Patika üzerinde p (0–1) oranındaki nokta; UI thread'de çalışır. */
export function trailAt(pts: number[], cum: number[], len: number, p: number): { x: number; y: number } {
  'worklet';
  const target = len * Math.min(1, Math.max(0, p));
  const n = cum.length;
  for (let i = 1; i < n; i++) {
    if (cum[i]! >= target) {
      const seg = cum[i]! - cum[i - 1]!;
      const f = seg > 0 ? (target - cum[i - 1]!) / seg : 0;
      const ax = pts[(i - 1) * 2]!;
      const ay = pts[(i - 1) * 2 + 1]!;
      return { x: ax + (pts[i * 2]! - ax) * f, y: ay + (pts[i * 2 + 1]! - ay) * f };
    }
  }
  return { x: pts[(n - 1) * 2]!, y: pts[(n - 1) * 2 + 1]! };
}

export function inPoly(x: number, y: number, poly: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Sahne adı: "Sonbahar · Batı sırtı" */
export function sceneLabel(v: SceneVariant): string {
  return `${BIOME_LABELS[v.biome]} · ${ROUTE_LABELS[v.route]}`;
}
