import { memo, useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { focusLevel, formatNumber } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/*
 * İzometrik arazi bloğu (diorama): yeşil üst yüzey, toprak/kaya kesitli yanlar, vadide dere,
 * seviyeye göre değişen ana dağ (Tepe yuvarlak, Dağ kayalık, Zirve karlı). viewBox 0 0 320 240.
 * Bütün sürekli animasyonlar tek bir saat değerinden (`clock`, 0→1 / 24 sn) türetilir;
 * periyotlar bu sürenin tam bölenleri olduğu için döngü dikişsizdir.
 */

export const VB_W = 320;
export const VB_H = 240;
export const LOOP_MS = 24_000;
export const TAU = Math.PI * 2;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

// ---------------------------------------------------------------------------
// Geometri

/** Üst yüzeyin köşeleri: sol, arka, sağ, ön */
const L = [12, 152] as const;
const B = [166, 96] as const;
const R = [308, 138] as const;
const F = [150, 200] as const;
const DEPTH = 30;

const LEVEL_MINUTES: readonly number[] = [25, 50, 90];
export const SUMMIT_X = 208;
/** Seviye başına zirve yüksekliği (y, küçük = yüksek) */
export const SUMMIT_Y = [78, 50, 24] as const;
export const START = [92, 164] as const;

const pt = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

export interface Trail {
  /** düz dizi: x0,y0,x1,y1,... */
  pts: number[];
  /** her noktaya kadar birikmiş uzunluk */
  cum: number[];
  len: number;
  d: string;
}

function buildTrail(top: number): Trail {
  const raw: [number, number][] = [
    [START[0], START[1]],
    [110, 167],
    [126, 161],
    [141, 164],
    [156, 158],
    [168, 150],
  ];
  const n = 5;
  const baseY = 150;
  for (let k = 1; k <= n; k++) {
    const f = k / (n + 1);
    const y = baseY + (top + 4 - baseY) * f;
    const x = SUMMIT_X + (k % 2 ? -1 : 1) * 28 * (1 - f);
    raw.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  raw.push([SUMMIT_X, top + 1]);
  const pts: number[] = [];
  const cum: number[] = [];
  let acc = 0;
  raw.forEach(([x, y], i) => {
    if (i > 0) {
      const [px, py] = raw[i - 1]!;
      acc += Math.hypot(x - px, y - py);
    }
    pts.push(x, y);
    cum.push(acc);
  });
  const d = raw.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return { pts, cum, len: acc, d };
}

export const TRAILS = SUMMIT_Y.map(buildTrail);

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

/** Basit belirli rastgele (her açılışta aynı ağaç dizilişi) */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function inPoly(x: number, y: number, poly: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const SURFACE = [L, B, R, F] as const;

const TREES = (() => {
  const rand = rng(7);
  const clusters: [number, number, number][] = [
    // x, y, adet
    [44, 150, 7],
    [64, 162, 6],
    [104, 182, 5],
    [170, 186, 6],
    [214, 172, 7],
    [262, 152, 6],
    [286, 142, 4],
    [150, 138, 4],
    [36, 140, 3],
  ];
  const out: { x: number; y: number; r: number }[] = [];
  for (const [cx, cy, count] of clusters) {
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - 0.5) * 26;
      const y = cy + (rand() - 0.5) * 10;
      if (!inPoly(x, y + 3, SURFACE)) continue;
      // patika ve derenin üstüne düşmesin
      if (Math.abs(y - (167 - (x - 92) * 0.06)) < 4 && x > 88 && x < 170) continue;
      out.push({ x, y, r: 2.1 + rand() * 1.4 });
    }
  }
  return out.sort((a, b) => a.y - b.y);
})();

export const STREAM_D = 'M134,147 C126,153 140,159 134,167 C129,174 117,177 120,189.6';

// ---------------------------------------------------------------------------
// Statik katmanlar

export const Defsets = memo(function Defsets({ isDark }: { isDark: boolean }) {
  return (
    <Defs>
      <RadialGradient id="mc-sky" cx="50%" cy="35%" r="75%">
        <Stop offset="0" stopColor={isDark ? '#2C3238' : '#F3F5F1'} />
        <Stop offset="1" stopColor={isDark ? '#121519' : '#D3DAD6'} />
      </RadialGradient>
      <RadialGradient id="mc-shadow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#000" stopOpacity={isDark ? 0.55 : 0.28} />
        <Stop offset="1" stopColor="#000" stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id="mc-top" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#8CC152" />
        <Stop offset="0.55" stopColor="#4E9A38" />
        <Stop offset="1" stopColor="#2E6B2B" />
      </LinearGradient>
      <LinearGradient id="mc-left" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#6B4A2E" />
        <Stop offset="1" stopColor="#2E2016" />
      </LinearGradient>
      <LinearGradient id="mc-right" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#47321F" />
        <Stop offset="1" stopColor="#1C140E" />
      </LinearGradient>
      <LinearGradient id="mc-hill" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#A6D163" />
        <Stop offset="1" stopColor="#3E8634" />
      </LinearGradient>
      <LinearGradient id="mc-mtn" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#9FCB5C" />
        <Stop offset="0.6" stopColor="#4F9A3A" />
        <Stop offset="1" stopColor="#2F6E2C" />
      </LinearGradient>
      <LinearGradient id="mc-rock" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#A39A86" />
        <Stop offset="0.5" stopColor="#7C7766" />
        <Stop offset="1" stopColor="#4F9A3A" stopOpacity={0} />
      </LinearGradient>
      <LinearGradient id="mc-snow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#DCE8F0" />
      </LinearGradient>
      <LinearGradient id="mc-shade" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#0B2410" stopOpacity={0.15} />
        <Stop offset="1" stopColor="#0B2410" stopOpacity={0.5} />
      </LinearGradient>
      <RadialGradient id="mc-glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFE3A3" stopOpacity={0.9} />
        <Stop offset="1" stopColor="#FFE3A3" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
});

/** Blok: gölge, yan kesitler, üst yüzey, sol tepe, tarlalar, dere, ağaçlar, pusula */
export const Terrain = memo(function Terrain({ isDark }: { isDark: boolean }) {
  const lB: [number, number] = [L[0], L[1] + DEPTH];
  const fB: [number, number] = [F[0], F[1] + DEPTH];
  const rB: [number, number] = [R[0], R[1] + DEPTH];
  return (
    <G>
      <Rect0 />
      <Ellipse cx={162} cy={226} rx={150} ry={12} fill="url(#mc-shadow)" />
      {/* yan yüzeyler */}
      <Polygon points={`${pt(L)} ${pt(F)} ${pt(fB)} ${pt(lB)}`} fill="url(#mc-left)" />
      <Polygon points={`${pt(F)} ${pt(R)} ${pt(rB)} ${pt(fB)}`} fill="url(#mc-right)" />
      {/* katman çizgileri */}
      {[9, 18, 24].map((dy, i) => (
        <Path
          key={dy}
          d={`M${L[0]},${L[1] + dy} L${F[0]},${F[1] + dy} L${R[0]},${R[1] + dy}`}
          stroke={i === 0 ? '#8A6440' : '#24180F'}
          strokeOpacity={i === 0 ? 0.55 : 0.6}
          strokeWidth={i === 0 ? 0.8 : 0.6}
          fill="none"
        />
      ))}
      {/* kaya parçaları */}
      <Path d="M40,170 l6,-2 l4,3 l-5,3 Z M88,184 l7,-1 l3,4 l-6,2 Z M200,200 l6,-3 l5,2 l-4,4 Z M262,184 l5,-2 l4,3 l-6,2 Z" fill="#000" opacity={0.22} />
      {/* şelale */}
      <Path d="M120,189.6 L120.6,214" stroke="#8FD3F4" strokeWidth={1.4} strokeOpacity={0.8} />
      {/* üst yüzey */}
      <Polygon points={`${pt(L)} ${pt(B)} ${pt(R)} ${pt(F)}`} fill="url(#mc-top)" />
      {/* teraslı tarlalar */}
      <G opacity={0.55}>
        <Polygon points="70,170 104,160 124,170 92,181" fill="#B7DB6B" />
        <Polygon points="176,176 214,164 236,172 198,186" fill="#9DCB56" />
        <Polygon points="236,160 268,150 284,156 252,167" fill="#B7DB6B" />
      </G>
      <G stroke="#2F6B2B" strokeOpacity={0.45} strokeWidth={0.6}>
        <Line x1={76} y1={171} x2={108} y2={162} />
        <Line x1={82} y1={175} x2={114} y2={165} />
        <Line x1={87} y1={178} x2={119} y2={168} />
        <Line x1={183} y1={177} x2={219} y2={166} />
        <Line x1={190} y1={181} x2={226} y2={169} />
        <Line x1={243} y1={160} x2={272} y2={151} />
        <Line x1={248} y1={163} x2={277} y2={154} />
      </G>
      {/* çimen kenarı */}
      <Path d={`M${pt(L)} L${pt(F)} L${pt(R)}`} stroke="#6FAE45" strokeWidth={1.6} fill="none" />
      {/* sol tepe */}
      <Path
        d="M20,154 C36,138 52,116 74,111 C92,107 106,122 120,133 C130,141 138,149 146,157 L96,172 Z"
        fill="url(#mc-hill)"
      />
      <Path
        d="M74,111 C92,107 106,122 120,133 C130,141 138,149 146,157 L104,170 C100,150 90,126 74,111 Z"
        fill="url(#mc-shade)"
      />
      <G stroke="#D8F0A0" strokeOpacity={0.3} strokeWidth={0.7} fill="none">
        <Path d="M50,128 Q74,136 104,124" />
        <Path d="M38,141 Q72,152 120,137" />
      </G>
      {/* pusula */}
      <G opacity={isDark ? 0.7 : 0.55}>
        <Ellipse cx={288} cy={214} rx={18} ry={8} stroke={isDark ? '#E8E8E8' : '#3A3F47'} strokeWidth={0.8} fill="none" />
        <Line x1={270} y1={214} x2={306} y2={214} stroke={isDark ? '#E8E8E8' : '#3A3F47'} strokeWidth={0.5} />
        <Line x1={288} y1={205} x2={288} y2={223} stroke={isDark ? '#E8E8E8' : '#3A3F47'} strokeWidth={0.5} />
        <Polygon points="288,214 284,210 291,206" fill="#E5483B" />
        <Polygon points="288,214 292,218 285,222" fill={isDark ? '#E8E8E8' : '#3A3F47'} />
      </G>
    </G>
  );
});

function Rect0() {
  return <Polygon points={`0,0 ${VB_W},0 ${VB_W},${VB_H} 0,${VB_H}`} fill="url(#mc-sky)" />;
}

export const ForestLayer = memo(function ForestLayer() {
  return (
    <G>
      {/* dere (dağ eteğinin önünden akar) */}
      <Path d={STREAM_D} stroke="#2F7FA8" strokeWidth={2.6} strokeOpacity={0.5} fill="none" strokeLinecap="round" />
      <Path d={STREAM_D} stroke="#6CC4EE" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Ellipse cx={126} cy={180} rx={5} ry={2} fill="#6CC4EE" opacity={0.9} />
      {TREES.map((t, i) => (
        <G key={i}>
          <Circle cx={t.x} cy={t.y} r={t.r} fill={i % 3 ? '#1F5A27' : '#2A6F30'} />
          <Circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.35} r={t.r * 0.45} fill="#5FA444" opacity={0.6} />
        </G>
      ))}
    </G>
  );
});

/** Ana dağ — seviyeye göre üç biçim */
const MAIN_SHAPES = [
  {
    body: 'M108,150 C132,118 172,80 208,78 C246,80 280,112 306,137 L250,162 L150,165 Z',
    shade: 'M208,78 C246,80 280,112 306,137 L250,162 C236,140 222,104 208,78 Z',
    rock: null as string | null,
    snow: null as string | null,
  },
  {
    body: 'M104,150 L132,124 L150,112 L168,90 L184,80 L198,58 L208,50 L218,60 L232,72 L246,84 L262,100 L284,118 L306,137 L250,162 L150,165 Z',
    shade: 'M208,50 L218,60 L232,72 L246,84 L262,100 L284,118 L306,137 L250,162 L230,140 L218,112 L214,86 Z',
    rock: 'M184,80 L198,58 L208,50 L218,60 L232,72 L222,76 L214,70 L206,80 L196,76 L190,86 Z',
    snow: null,
  },
  {
    body: 'M100,150 L128,120 L150,100 L170,78 L186,56 L200,34 L208,24 L216,34 L230,52 L248,74 L268,98 L288,118 L306,137 L250,162 L150,165 Z',
    shade: 'M208,24 L216,34 L230,52 L248,74 L268,98 L288,118 L306,137 L250,162 L230,138 L218,100 L214,60 Z',
    rock: 'M170,78 L186,56 L230,52 L248,74 L236,80 L224,72 L212,82 L198,74 L186,84 Z',
    snow: 'M186,56 L200,34 L208,24 L216,34 L230,52 L222,50 L216,58 L210,50 L202,58 L194,54 Z',
  },
];

function contourLines(top: number) {
  const out: string[] = [];
  for (let k = 1; k <= 4; k++) {
    const y = top + ((150 - top) * k) / 5;
    const xl = SUMMIT_X - ((SUMMIT_X - 104) * (y - top)) / (150 - top) + 5;
    const xr = SUMMIT_X + ((306 - SUMMIT_X) * (y - top)) / (137 - top) - 6;
    out.push(`M${xl.toFixed(1)},${y.toFixed(1)} Q${SUMMIT_X},${(y + (xr - xl) * 0.14).toFixed(1)} ${xr.toFixed(1)},${(y - 2).toFixed(1)}`);
  }
  return out;
}

/** Seviyeye bağlı katman: ana dağ, eş yükselti çizgileri, kesikli patika, iğneler */
export const LevelScene = memo(function LevelScene({
  index,
  flag,
  standby = false,
}: {
  index: number;
  flag: boolean;
  /** Yatay mod: patika çizgisi ve iğneler sahnede kameraya göre ölçeklenerek ayrıca çizilir */
  standby?: boolean;
}) {
  const shape = MAIN_SHAPES[index]!;
  const top = SUMMIT_Y[index]!;
  const trail = TRAILS[index]!;
  return (
    <G>
      <Path d={shape.body} fill="url(#mc-mtn)" />
      {shape.rock ? <Path d={shape.rock} fill="url(#mc-rock)" /> : null}
      <Path d={shape.shade} fill="url(#mc-shade)" />
      {shape.snow ? (
        <>
          <Path d={shape.snow} fill="url(#mc-snow)" />
          <Path d={`M208,${top} L216,34 L230,52 L222,50 L216,58 L212,40 Z`} fill="#9DB4C8" opacity={0.45} />
        </>
      ) : null}
      <G stroke="#E3F5B0" strokeOpacity={0.28} strokeWidth={0.7} fill="none">
        {contourLines(top).map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
      {/* kesikli tam patika */}
      {standby ? null : (
      <Path
        d={trail.d}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.9}
        strokeWidth={1.6}
        strokeDasharray={[3, 3.5]}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      )}
      {/* zirve iğnesi (kırmızı); bayrak dikilince yerini bayrağa bırakır */}
      {!flag && !standby ? <Pin x={SUMMIT_X} y={top + 1} color="#E5483B" /> : null}
    </G>
  );
});

export function Pin({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <G transform={`translate(${x},${y}) scale(0.8)`}>
      <Ellipse cx={0} cy={0} rx={4} ry={1.4} fill="#000" opacity={0.3} />
      <Path d="M0,0 C-3,-6 -8,-10 -8,-16 A8,8 0 1 1 8,-16 C8,-10 3,-6 0,0 Z" fill={color} />
      <Path d="M0,0 C3,-6 8,-10 8,-16 A8,8 0 0 0 2,-23.7 C6,-18 4,-8 0,0 Z" fill="#000" opacity={0.15} />
      <Circle cx={0} cy={-16} r={3.2} fill="#FFFFFF" />
    </G>
  );
}

/** Bulutlar (ayrı Svg, kaydırma View dönüşümüyle) */
function CloudShape({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <G transform={`translate(${x},${y}) scale(${s})`}>
      <Ellipse cx={0} cy={4} rx={20} ry={5} fill="#C9D2DA" opacity={0.9} />
      <Circle cx={-10} cy={0} r={7} fill="#F4F7FA" />
      <Circle cx={0} cy={-4} r={9} fill="#FFFFFF" />
      <Circle cx={11} cy={-1} r={7} fill="#F4F7FA" />
      <Ellipse cx={0} cy={3} rx={18} ry={4} fill="#FFFFFF" />
    </G>
  );
}

const CloudsA = memo(function CloudsA({ top }: { top: number }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <G opacity={0.95}>
        <CloudShape x={SUMMIT_X + 34} y={top + 4} s={0.9} />
        <CloudShape x={SUMMIT_X + 58} y={top + 12} s={0.55} />
      </G>
    </Svg>
  );
});

const CloudsB = memo(function CloudsB({ top }: { top: number }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <G opacity={0.85}>
        <CloudShape x={SUMMIT_X - 40} y={top + 20} s={0.7} />
      </G>
      <Ellipse cx={58} cy={128} rx={22} ry={3} fill="#FFFFFF" opacity={0.18} />
    </Svg>
  );
});

// ---------------------------------------------------------------------------
// Animasyonlu parçalar

export const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const a = -Math.PI / 2 + ((i / 13) - 0.5) * Math.PI * 1.4;
  return { a, s: 18 + ((i * 37) % 17) };
});

export function confettiD(cx: number, cy: number, b: number, from: number, step: number) {
  'worklet';
  let d = '';
  for (let i = from; i < CONFETTI.length; i += step) {
    const c = CONFETTI[i]!;
    const x = cx + Math.cos(c.a) * c.s * b;
    const y = cy + Math.sin(c.a) * c.s * b + 22 * b * b;
    d += `M${x.toFixed(1)},${y.toFixed(1)}h2.2v2.2h-2.2Z`;
  }
  return d;
}

function Clouds({
  top,
  clock,
  scale,
}: {
  top: number;
  clock: SharedValue<number>;
  scale: SharedValue<number>;
}) {
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.sin(clock.value * TAU) * 9 * scale.value }],
  }));
  const b = useAnimatedStyle(() => ({
    transform: [{ translateX: -Math.sin(clock.value * TAU + 1) * 7 * scale.value }],
  }));
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, b]} pointerEvents="none">
        <CloudsB top={top} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, a]} pointerEvents="none">
        <CloudsA top={top} />
      </Animated.View>
    </>
  );
}

/** Dağ tırmanışı figürü: izometrik arazi bloğu, viewBox 0 0 320 240. */
export function MountainClimb({
  plannedMinutes,
  progress,
  flag,
  running = false,
}: {
  plannedMinutes: number;
  /** 0–1 */
  progress: number;
  /** Zirveye bayrak dikildi */
  flag: boolean;
  /** Seans çalışıyor mu (kuşlar, dere parıltısı) */
  running?: boolean;
}) {
  const { c, name } = useTheme();
  const isDark = name === 'dark';
  const reduced = useReducedMotion();
  const level = focusLevel(plannedMinutes);
  const index = Math.max(0, LEVEL_MINUTES.indexOf(level.minutes));
  const top = SUMMIT_Y[index]!;
  const trail = TRAILS[index]!;
  const p = Math.min(1, Math.max(0, progress));
  const elev = Math.round(level.altitude * p);

  // --- paylaşılan değerler
  const clock = useSharedValue(0);
  const scale = useSharedValue(1);
  const pv = useSharedValue(p);
  const flagV = useSharedValue(flag ? 1 : 0);
  const burst = useSharedValue(1);
  const o0 = useSharedValue(index === 0 ? 1 : 0);
  const o1 = useSharedValue(index === 1 ? 1 : 0);
  const o2 = useSharedValue(index === 2 ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(clock);
      clock.value = 0;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [reduced, clock]);

  useEffect(() => {
    pv.value = reduced ? p : withTiming(p, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [p, reduced, pv]);

  useEffect(() => {
    const set = (sv: SharedValue<number>, v: number) => {
      sv.value = reduced ? v : withTiming(v, { duration: 550, easing: Easing.inOut(Easing.quad) });
    };
    set(o0, index === 0 ? 1 : 0);
    set(o1, index === 1 ? 1 : 0);
    set(o2, index === 2 ? 1 : 0);
  }, [index, reduced, o0, o1, o2]);

  useEffect(() => {
    if (!flag) {
      flagV.value = 0;
      burst.value = 1;
      return;
    }
    if (reduced) {
      flagV.value = 1;
      return;
    }
    flagV.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.6)) });
    burst.value = 0;
    burst.value = withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) });
  }, [flag, reduced, flagV, burst]);

  const onLayout = (e: LayoutChangeEvent) => {
    scale.value = e.nativeEvent.layout.width / VB_W;
  };

  // --- animasyonlu SVG özellikleri
  const g0 = useAnimatedProps(() => ({ opacity: o0.value }));
  const g1 = useAnimatedProps(() => ({ opacity: o1.value }));
  const g2 = useAnimatedProps(() => ({ opacity: o2.value }));

  const fillProps = useAnimatedProps(
    () => ({ strokeDashoffset: trail.len * (1 - pv.value) }),
    [trail.len],
  );
  const dotProps = useAnimatedProps(() => {
    const q = trailAt(trail.pts, trail.cum, trail.len, pv.value);
    return { cx: q.x, cy: q.y };
  }, [trail]);
  const haloProps = useAnimatedProps(() => {
    const q = trailAt(trail.pts, trail.cum, trail.len, pv.value);
    const ph = (clock.value * 12) % 1;
    return { cx: q.x, cy: q.y, r: 5 + ph * 9, opacity: 0.55 * (1 - ph) };
  }, [trail]);

  const poleProps = useAnimatedProps(() => ({ y2: top + 1 - 18 * flagV.value }), [top]);
  const clothProps = useAnimatedProps(() => {
    const t0 = top + 1 - 18 * flagV.value;
    const w = Math.sin(clock.value * TAU * 24) * 1.8;
    const w2 = Math.sin(clock.value * TAU * 24 + 1.4) * 1.6;
    const x = SUMMIT_X;
    return {
      d: `M${x},${t0} Q${x + 7},${t0 - 2 + w} ${x + 15},${t0 + 1 + w2} L${x + 15},${t0 + 9 + w2} Q${x + 7},${t0 + 6 + w} ${x},${t0 + 9} Z`,
      opacity: flagV.value,
    };
  }, [top]);
  const sparkProps = useAnimatedProps(() => ({
    r: 4 + 26 * burst.value,
    opacity: 0.8 * (1 - burst.value),
  }));
  const confA = useAnimatedProps(() => ({
    d: confettiD(SUMMIT_X, top - 10, burst.value, 0, 2),
    opacity: 1 - burst.value * burst.value,
  }), [top]);
  const confB = useAnimatedProps(() => ({
    d: confettiD(SUMMIT_X, top - 10, burst.value, 1, 2),
    opacity: 1 - burst.value * burst.value,
  }), [top]);

  const streamProps = useAnimatedProps(() => ({ strokeDashoffset: -clock.value * 240 }));
  const birdProps = useAnimatedProps(() => {
    const t = clock.value;
    const x = -16 + 360 * t;
    const y = 34 + Math.sin(t * TAU * 3) * 5;
    const f = Math.sin(t * TAU * 60) * 2;
    const bird = (bx: number, by: number) =>
      `M${bx - 4},${by - f} Q${bx - 2},${by - 1} ${bx},${by} Q${bx + 2},${by - 1} ${bx + 4},${by - f}`;
    return { d: `${bird(x, y)} ${bird(x - 13, y + 7)}` };
  });

  return (
    <View
      style={[styles.card, { borderColor: c.line, backgroundColor: isDark ? '#121519' : '#D3DAD6' }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Tırmanış: ${elev} metre, zirve ${level.altitude} metre`}
    >
      <View style={styles.art} onLayout={onLayout}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defsets isDark={isDark} />
          <Terrain isDark={isDark} />
          <AnimatedG animatedProps={g0}>
            <LevelScene index={0} flag={flag && index === 0} />
          </AnimatedG>
          <AnimatedG animatedProps={g1}>
            <LevelScene index={1} flag={flag && index === 1} />
          </AnimatedG>
          <AnimatedG animatedProps={g2}>
            <LevelScene index={2} flag={flag && index === 2} />
          </AnimatedG>
          <ForestLayer />

          {running && !reduced ? (
            <AnimatedPath
              d={STREAM_D}
              stroke="#FFFFFF"
              strokeOpacity={0.75}
              strokeWidth={1}
              strokeDasharray={[2, 10]}
              strokeLinecap="round"
              fill="none"
              animatedProps={streamProps}
            />
          ) : null}

          {/* ilerleme kadar dolan çizgi */}
          <AnimatedPath
            d={trail.d}
            fill="none"
            stroke={c.acc}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[trail.len, trail.len]}
            animatedProps={fillProps}
          />

          <Pin x={START[0]} y={START[1]} color="#3DBE4F" />

          {/* bayrak + kutlama */}
          {flag ? (
            <G>
              <Circle cx={SUMMIT_X} cy={top - 8} r={22} fill="url(#mc-glow)" />
              <AnimatedCircle
                cx={SUMMIT_X}
                cy={top - 8}
                fill="none"
                stroke="#FFD27A"
                strokeWidth={1.5}
                animatedProps={sparkProps}
              />
              <AnimatedLine
                x1={SUMMIT_X}
                y1={top + 1}
                x2={SUMMIT_X}
                stroke={isDark ? '#F2F2F2' : '#2B2F35'}
                strokeWidth={1.6}
                strokeLinecap="round"
                animatedProps={poleProps}
              />
              <AnimatedPath fill="#E5483B" animatedProps={clothProps} />
              <AnimatedPath fill="#FFD27A" animatedProps={confA} />
              <AnimatedPath fill="#FFFFFF" animatedProps={confB} />
            </G>
          ) : null}

          {/* tırmanan işaretçi */}
          <AnimatedCircle fill={c.acc} animatedProps={haloProps} />
          <AnimatedCircle r={4.2} fill={c.acc} stroke="#FFFFFF" strokeWidth={1.6} animatedProps={dotProps} />

          {running && !reduced ? (
            <AnimatedPath
              stroke={isDark ? '#D8DDE2' : '#2B3137'}
              strokeWidth={1}
              strokeLinecap="round"
              fill="none"
              animatedProps={birdProps}
            />
          ) : null}
        </Svg>
        <Clouds top={top} clock={clock} scale={scale} />
      </View>
      <View
        style={[styles.overlay, { backgroundColor: isDark ? 'rgba(14,17,22,0.62)' : 'rgba(255,255,255,0.72)' }]}
        pointerEvents="none"
      >
        <Txt style={[styles.peak, { color: c.mut }]}>
          {upper(level.name)} · {plannedMinutes} DK
        </Txt>
        <Txt style={[styles.elev, { color: c.tx }]}>
          {formatNumber(elev)}
          <Txt style={[styles.elev, { color: c.mut }]}> / {formatNumber(level.altitude)} m</Txt>
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  art: { width: '100%', aspectRatio: VB_W / VB_H },
  overlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  peak: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.9 },
  elev: { fontFamily: fonts.mono, fontSize: 16 },
});
