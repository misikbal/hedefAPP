import { memo, useEffect, useMemo } from 'react';
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
import {
  PALETTES,
  START,
  inPoly,
  mountainGeometry,
  rng,
  sceneLabel,
  sceneVariant,
  trailAt,
  type MountainGeometry,
  type Palette,
} from './mountainScene';
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

const pt = (p: readonly [number, number]) => `${p[0]},${p[1]}`;

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

export const Defsets = memo(function Defsets({ isDark, palette }: { isDark: boolean; palette: Palette }) {
  const pl = palette;
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
        <Stop offset="0" stopColor={pl.top[0]} />
        <Stop offset="0.55" stopColor={pl.top[1]} />
        <Stop offset="1" stopColor={pl.top[2]} />
      </LinearGradient>
      <LinearGradient id="mc-left" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.left[0]} />
        <Stop offset="1" stopColor={pl.left[1]} />
      </LinearGradient>
      <LinearGradient id="mc-right" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.right[0]} />
        <Stop offset="1" stopColor={pl.right[1]} />
      </LinearGradient>
      <LinearGradient id="mc-hill" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.hill[0]} />
        <Stop offset="1" stopColor={pl.hill[1]} />
      </LinearGradient>
      <LinearGradient id="mc-mtn" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.mtn[0]} />
        <Stop offset="0.6" stopColor={pl.mtn[1]} />
        <Stop offset="1" stopColor={pl.mtn[2]} />
      </LinearGradient>
      <LinearGradient id="mc-rock" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.rock[0]} />
        <Stop offset="0.5" stopColor={pl.rock[1]} />
        <Stop offset="1" stopColor={pl.mtn[1]} stopOpacity={0} />
      </LinearGradient>
      <LinearGradient id="mc-snow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={pl.snow[0]} />
        <Stop offset="1" stopColor={pl.snow[1]} />
      </LinearGradient>
      <LinearGradient id="mc-shade" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={pl.shade} stopOpacity={0.15} />
        <Stop offset="1" stopColor={pl.shade} stopOpacity={0.5} />
      </LinearGradient>
      <RadialGradient id="mc-glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FFE3A3" stopOpacity={0.9} />
        <Stop offset="1" stopColor="#FFE3A3" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
});

/** Blok: gölge, yan kesitler, üst yüzey, sol tepe, tarlalar, dere, ağaçlar, pusula */
export const Terrain = memo(function Terrain({ isDark, palette }: { isDark: boolean; palette: Palette }) {
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
      <Path d="M120,189.6 L120.6,214" stroke={palette.water[1]} strokeWidth={1.4} strokeOpacity={0.8} />
      {/* üst yüzey */}
      <Polygon points={`${pt(L)} ${pt(B)} ${pt(R)} ${pt(F)}`} fill="url(#mc-top)" />
      {/* teraslı tarlalar */}
      <G opacity={0.55}>
        <Polygon points="70,170 104,160 124,170 92,181" fill={palette.fields[0]} />
        <Polygon points="176,176 214,164 236,172 198,186" fill={palette.fields[1]} />
        <Polygon points="236,160 268,150 284,156 252,167" fill={palette.fields[0]} />
      </G>
      <G stroke={palette.fieldLine} strokeOpacity={0.45} strokeWidth={0.6}>
        <Line x1={76} y1={171} x2={108} y2={162} />
        <Line x1={82} y1={175} x2={114} y2={165} />
        <Line x1={87} y1={178} x2={119} y2={168} />
        <Line x1={183} y1={177} x2={219} y2={166} />
        <Line x1={190} y1={181} x2={226} y2={169} />
        <Line x1={243} y1={160} x2={272} y2={151} />
        <Line x1={248} y1={163} x2={277} y2={154} />
      </G>
      {/* çimen kenarı */}
      <Path d={`M${pt(L)} L${pt(F)} L${pt(R)}`} stroke={palette.edge} strokeWidth={1.6} fill="none" />
      {/* sol tepe */}
      <Path
        d="M20,154 C36,138 52,116 74,111 C92,107 106,122 120,133 C130,141 138,149 146,157 L96,172 Z"
        fill="url(#mc-hill)"
      />
      <Path
        d="M74,111 C92,107 106,122 120,133 C130,141 138,149 146,157 L104,170 C100,150 90,126 74,111 Z"
        fill="url(#mc-shade)"
      />
      <G stroke={palette.hillLine} strokeOpacity={0.3} strokeWidth={0.7} fill="none">
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

export const ForestLayer = memo(function ForestLayer({ palette }: { palette: Palette }) {
  return (
    <G>
      {/* dere (dağ eteğinin önünden akar) */}
      <Path d={STREAM_D} stroke={palette.water[0]} strokeWidth={2.6} strokeOpacity={0.5} fill="none" strokeLinecap="round" />
      <Path d={STREAM_D} stroke={palette.water[1]} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Ellipse cx={126} cy={180} rx={5} ry={2} fill={palette.water[1]} opacity={0.9} />
      {TREES.map((t, i) => (
        <G key={i}>
          <Circle cx={t.x} cy={t.y} r={t.r} fill={palette.trees[i % 3 ? 0 : 1]} />
          <Circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.35} r={t.r * 0.45} fill={palette.treeLight} opacity={0.6} />
        </G>
      ))}
    </G>
  );
});

/** Seviyeye bağlı katman: ana dağ, eş yükselti çizgileri, kesikli patika, iğneler */
export const LevelScene = memo(function LevelScene({
  geo,
  palette,
  flag,
  standby = false,
}: {
  geo: MountainGeometry;
  palette: Palette;
  flag: boolean;
  /** Yatay mod: patika çizgisi ve iğneler sahnede kameraya göre ölçeklenerek ayrıca çizilir */
  standby?: boolean;
}) {
  return (
    <G>
      <Path d={geo.body} fill="url(#mc-mtn)" />
      {geo.rock ? <Path d={geo.rock} fill="url(#mc-rock)" /> : null}
      <Path d={geo.shade} fill="url(#mc-shade)" />
      {geo.snow ? <Path d={geo.snow} fill="url(#mc-snow)" /> : null}
      {geo.snowShade ? <Path d={geo.snowShade} fill="#9DB4C8" opacity={0.45} /> : null}
      <G stroke={palette.contour} strokeOpacity={0.28} strokeWidth={0.7} fill="none">
        {geo.contours.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
      {/* kesikli tam patika */}
      {standby ? null : (
        <Path
          d={geo.trail.d}
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
      {!flag && !standby ? <Pin x={geo.sx} y={geo.top + 1} color="#E5483B" /> : null}
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

const CloudsA = memo(function CloudsA({ top, sx }: { top: number; sx: number }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <G opacity={0.95}>
        <CloudShape x={sx + 34} y={top + 4} s={0.9} />
        <CloudShape x={sx + 58} y={top + 12} s={0.55} />
      </G>
    </Svg>
  );
});

const CloudsB = memo(function CloudsB({ top, sx }: { top: number; sx: number }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <G opacity={0.85}>
        <CloudShape x={sx - 40} y={top + 20} s={0.7} />
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
  sx,
  clock,
  scale,
}: {
  top: number;
  sx: number;
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
        <CloudsB top={top} sx={sx} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, a]} pointerEvents="none">
        <CloudsA top={top} sx={sx} />
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
  sceneSeed,
}: {
  plannedMinutes: number;
  /** 0–1 */
  progress: number;
  /** Zirveye bayrak dikildi */
  flag: boolean;
  /** Seans çalışıyor mu (kuşlar, dere parıltısı) */
  running?: boolean;
  /** Sahne çeşidi (mevsim, zirve yeri, rota); seans boyunca sabit */
  sceneSeed: number;
}) {
  const { c, name } = useTheme();
  const isDark = name === 'dark';
  const reduced = useReducedMotion();
  const level = focusLevel(plannedMinutes);
  const index = Math.max(0, LEVEL_MINUTES.indexOf(level.minutes));
  const variant = useMemo(() => sceneVariant(sceneSeed), [sceneSeed]);
  const palette = PALETTES[variant.biome];
  const geos = useMemo(() => [0, 1, 2].map((i) => mountainGeometry(variant, i)), [variant]);
  const geo = geos[index]!;
  const top = geo.top;
  const sx = geo.sx;
  const trail = geo.trail;
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
    const x = sx;
    return {
      d: `M${x},${t0} Q${x + 7},${t0 - 2 + w} ${x + 15},${t0 + 1 + w2} L${x + 15},${t0 + 9 + w2} Q${x + 7},${t0 + 6 + w} ${x},${t0 + 9} Z`,
      opacity: flagV.value,
    };
  }, [top, sx]);
  const sparkProps = useAnimatedProps(() => ({
    r: 4 + 26 * burst.value,
    opacity: 0.8 * (1 - burst.value),
  }));
  const confA = useAnimatedProps(() => ({
    d: confettiD(sx, top - 10, burst.value, 0, 2),
    opacity: 1 - burst.value * burst.value,
  }), [top, sx]);
  const confB = useAnimatedProps(() => ({
    d: confettiD(sx, top - 10, burst.value, 1, 2),
    opacity: 1 - burst.value * burst.value,
  }), [top, sx]);

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
      accessibilityLabel={`Tırmanış: ${elev} metre, zirve ${level.altitude} metre. ${sceneLabel(variant)}`}
    >
      <View style={styles.art} onLayout={onLayout}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
          <Defsets isDark={isDark} palette={palette} />
          <Terrain isDark={isDark} palette={palette} />
          <AnimatedG animatedProps={g0}>
            <LevelScene geo={geos[0]!} palette={palette} flag={flag && index === 0} />
          </AnimatedG>
          <AnimatedG animatedProps={g1}>
            <LevelScene geo={geos[1]!} palette={palette} flag={flag && index === 1} />
          </AnimatedG>
          <AnimatedG animatedProps={g2}>
            <LevelScene geo={geos[2]!} palette={palette} flag={flag && index === 2} />
          </AnimatedG>
          <ForestLayer palette={palette} />

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
              <Circle cx={sx} cy={top - 8} r={22} fill="url(#mc-glow)" />
              <AnimatedCircle
                cx={sx}
                cy={top - 8}
                fill="none"
                stroke="#FFD27A"
                strokeWidth={1.5}
                animatedProps={sparkProps}
              />
              <AnimatedLine
                x1={sx}
                y1={top + 1}
                x2={sx}
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
        <Clouds top={top} sx={sx} clock={clock} scale={scale} />
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
        <Txt style={[styles.scene, { color: c.mut }]}>{sceneLabel(variant)}</Txt>
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
  scene: { fontSize: 11 },
});
