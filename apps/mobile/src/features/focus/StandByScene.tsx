import { memo, useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';
import { FOCUS_MINUTES } from '@takip/shared';
import {
  BUDGIE_BOX_H,
  BUDGIE_BOX_W,
  BUDGIE_FEET_X,
  BUDGIE_FEET_Y,
  BUDGIE_UNIT_PX,
  Budgie,
  type BudgieMode,
} from './Budgie';
import {
  Defsets,
  ForestLayer,
  LOOP_MS,
  LevelScene,
  Pin,
  START,
  STREAM_D,
  SUMMIT_X,
  SUMMIT_Y,
  TAU,
  TRAILS,
  Terrain,
  VB_H,
  VB_W,
  confettiD,
  trailAt,
} from './MountainClimb';
import {
  BIRD_DRAW_HEIGHT,
  BIRD_HEIGHT,
  ZOOM_SUMMIT_MAX,
  cameraTarget,
  lineScale,
  pinOpacity,
  smoothing,
} from './standbyMath';

/*
 * Yatay odak ekranının dağ sahnesi. Arazi, dağ, patika ve bütün hareketler MountainClimb ile aynı:
 * tek saat (24 sn döngü, periyotlar tam bölen), 900 ms ilerleme eğrisi, bayrak 900 ms, konfeti 1800 ms,
 * hareketi azalt açıkken saat 0'da durur. Fark: tırmanış noktasının yerini sarı muhabbet kuşu alır ve
 * kamera (viewBox) kuşu yakından izler; yakınlaştıkça çizgiler ve iğneler küçülür.
 */

const AnimatedSvg = Animated.createAnimatedComponent(Svg);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export type StandByStatus = 'idle' | 'running' | 'paused' | 'done';

/** 0 beklemede, 1 çalışıyor, 2 uyuyor (mola), 3 zirvede */
const MODE: Record<StandByStatus, number> = { idle: 0, running: 1, paused: 2, done: 3 };

/** Dağ sahnesinin gökyüzü ucu; kamera dünyanın dışına taşarsa kutu bu renkle dolar */
const SKY_EDGE = '#121519';

// --- bulutlar: aynı süzülme (sin dalgası), svg içinde çizilir ---------------------------------------

interface CloudPart {
  kind: 'e' | 'c';
  x: number;
  y: number;
  a: number;
  b: number;
  fill: string;
  op: number;
}

function cloudParts(x: number, y: number, s: number, opacity: number): CloudPart[] {
  const part = (kind: 'e' | 'c', cx: number, cy: number, a: number, b: number, fill: string, op = 1) => ({
    kind,
    x: x + cx * s,
    y: y + cy * s,
    a: a * s,
    b: b * s,
    fill,
    op: op * opacity,
  });
  return [
    part('e', 0, 4, 20, 5, '#C9D2DA', 0.9),
    part('c', -10, 0, 7, 0, '#F4F7FA'),
    part('c', 0, -4, 9, 0, '#FFFFFF'),
    part('c', 11, -1, 7, 0, '#F4F7FA'),
    part('e', 0, 3, 18, 4, '#FFFFFF'),
  ];
}

const SwayPart = memo(function SwayPart({
  part,
  sway,
}: {
  part: CloudPart;
  sway: SharedValue<number>;
}) {
  const ep = useAnimatedProps(() => ({ cx: part.x + sway.value }));
  return part.kind === 'e' ? (
    <AnimatedEllipse cy={part.y} rx={part.a} ry={part.b} fill={part.fill} opacity={part.op} animatedProps={ep} />
  ) : (
    <AnimatedCircle cy={part.y} r={part.a} fill={part.fill} opacity={part.op} animatedProps={ep} />
  );
});

function SwayCloud({
  x,
  y,
  s,
  opacity,
  sway,
}: {
  x: number;
  y: number;
  s: number;
  opacity: number;
  sway: SharedValue<number>;
}) {
  return (
    <>
      {cloudParts(x, y, s, opacity).map((p, i) => (
        <SwayPart key={i} part={p} sway={sway} />
      ))}
    </>
  );
}

// --- sahne ---------------------------------------------------------------------------------------

export function StandByScene({
  plannedMinutes,
  progress,
  status,
  zoom,
  night,
}: {
  plannedMinutes: number;
  /** 0–1 */
  progress: number;
  status: StandByStatus;
  /** Kamera yakınlığı hedefi (1 = bütün arazi) */
  zoom: number;
  night: boolean;
}) {
  const reduced = useReducedMotion();
  const index = Math.max(0, (FOCUS_MINUTES as readonly number[]).indexOf(plannedMinutes));
  const top = SUMMIT_Y[index]!;
  const trail = TRAILS[index]!;
  const p = Math.min(1, Math.max(0, progress));
  const flag = status === 'done';
  const mode: BudgieMode = status === 'paused' ? 'sleep' : status === 'done' ? 'cheer' : 'run';

  // --- paylaşılan değerler
  const paneW = useSharedValue(1);
  const paneH = useSharedValue(1);
  const reducedV = useSharedValue(reduced ? 1 : 0);
  const modeV = useSharedValue(MODE[status]);
  const zoomV = useSharedValue(zoom);
  const pv = useSharedValue(p);
  const flagV = useSharedValue(flag ? 1 : 0);
  const burst = useSharedValue(1);

  const camReady = useSharedValue(0);
  const camCx = useSharedValue(160);
  const camCy = useSharedValue(122);
  const camVw = useSharedValue(VB_W);
  const camAspect = useSharedValue(VB_W / VB_H);
  const ls = useSharedValue(1);
  const pinO = useSharedValue(1);

  const swayA = useSharedValue(0);
  const swayB = useSharedValue(0);
  const clock = useSharedValue(0);
  const worldX = useSharedValue<number>(START[0]);
  const worldY = useSharedValue<number>(START[1]);
  const dirV = useSharedValue(1);

  const birdX = useSharedValue(0);
  const birdY = useSharedValue(0);
  const birdScale = useSharedValue(0.02);
  const hopPx = useSharedValue(0);
  const breath = useSharedValue(1);
  const wingDeg = useSharedValue(-8);
  const tailDeg = useSharedValue(0);
  const blink = useSharedValue(1);
  const zz = useSharedValue(0);

  useEffect(() => {
    reducedV.value = reduced ? 1 : 0;
  }, [reduced, reducedV]);
  useEffect(() => {
    modeV.value = MODE[status];
  }, [status, modeV]);
  useEffect(() => {
    zoomV.value = zoom;
  }, [zoom, zoomV]);
  useEffect(() => {
    pv.value = reduced ? p : withTiming(p, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [p, reduced, pv]);
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
    return () => {
      cancelAnimation(flagV);
      cancelAnimation(burst);
    };
  }, [flag, reduced, flagV, burst]);

  // --- tek kare döngüsü: saat, kamera, kuşun yeri ve duruşu (hepsi UI thread'de)
  useFrameCallback((f) => {
    const dt = Math.min(50, f.timeSincePreviousFrame ?? 16);
    const still = reducedV.value === 1;
    const ck = still ? 0 : (f.timestamp % LOOP_MS) / LOOP_MS;
    clock.value = ck;
    const m = modeV.value;
    const done = m === 3;
    const prog = pv.value;

    // kuşun dünyadaki yeri ve yönü
    const q = trailAt(trail.pts, trail.cum, trail.len, prog);
    const ahead = trailAt(trail.pts, trail.cum, trail.len, Math.min(1, prog + 0.004));
    const behind = trailAt(trail.pts, trail.cum, trail.len, Math.max(0, prog - 0.004));
    const dirTarget = done ? 1 : ahead.x - behind.x >= 0 ? 1 : -1;
    dirV.value += (dirTarget - dirV.value) * (still ? 1 : smoothing(dt, 90));
    const bx = done ? SUMMIT_X - 11 : q.x;
    const by = done ? top + 2 : q.y;
    worldX.value = bx;
    worldY.value = by;

    // kamera
    const aspect = paneW.value / Math.max(1, paneH.value);
    const z = done ? Math.min(zoomV.value, ZOOM_SUMMIT_MAX) : zoomV.value;
    const fx = done ? SUMMIT_X - 4 : bx;
    const fy = done ? top + 8 : by - BIRD_HEIGHT * 0.45;
    const tg = cameraTarget(z, aspect, fx, fy);
    if (camReady.value === 0 || still) {
      camCx.value = tg.cx;
      camCy.value = tg.cy;
      camVw.value = tg.vw;
      camReady.value = 1;
    } else {
      const kp = smoothing(dt, 140);
      const kk = smoothing(dt, 260);
      camCx.value += (tg.cx - camCx.value) * kp;
      camCy.value += (tg.cy - camCy.value) * kp;
      camVw.value = Math.exp(Math.log(camVw.value) + (Math.log(tg.vw) - Math.log(camVw.value)) * kk);
    }
    camAspect.value = aspect;
    ls.value = lineScale(tg.fitW, camVw.value);
    pinO.value = pinOpacity(tg.fitW / camVw.value);

    // bulutlar
    swayA.value = Math.sin(ck * TAU) * 9;
    swayB.value = -Math.sin(ck * TAU + 1) * 7;

    // kuşun ekrandaki yeri ve boyu
    const vw = camVw.value;
    const vh = vw / aspect;
    const ppu = paneW.value / vw;
    const scale = (BIRD_HEIGHT * ppu) / (BIRD_DRAW_HEIGHT * BUDGIE_UNIT_PX);
    birdX.value = (bx - (camCx.value - vw / 2)) * ppu;
    birdY.value = (by - (camCy.value - vh / 2)) * ppu;
    birdScale.value = scale;

    // duruş: hepsi 24 sn içinde tam sayıda döner
    let hop = 0;
    let wing = -8;
    let tail = 0;
    let br = 1;
    if (m === 1) {
      hop = -Math.abs(Math.sin(ck * TAU * 24)) * 1.8;
      wing = -8 + Math.sin(ck * TAU * 120) * 26;
      tail = Math.sin(ck * TAU * 24) * 5;
    } else if (m === 2) {
      br = 1 + 0.03 * Math.sin(ck * TAU * 8);
      wing = 4;
      zz.value = (ck * 10) % 1;
    } else if (m === 3) {
      hop = -Math.abs(Math.sin(ck * TAU * 12)) * 3.2;
      wing = -78 + Math.sin(ck * TAU * 96) * 10;
    }
    hopPx.value = hop * BUDGIE_UNIT_PX * scale;
    breath.value = br;
    wingDeg.value = wing;
    tailDeg.value = tail;
    blink.value = !still && m !== 2 && (ck * 6) % 1 < 0.035 ? 0 : 1;
  });

  // --- animasyonlu özellikler
  const svgProps = useAnimatedProps(() => {
    const vw = camVw.value;
    const vh = vw / camAspect.value;
    return {
      viewBox: `${(camCx.value - vw / 2).toFixed(4)} ${(camCy.value - vh / 2).toFixed(4)} ${vw.toFixed(4)} ${vh.toFixed(4)}`,
    };
  });
  const fillProps = useAnimatedProps(
    () => ({ strokeDashoffset: trail.len * (1 - pv.value), strokeWidth: 2.6 * ls.value }),
    [trail.len],
  );
  const dashProps = useAnimatedProps(() => ({ strokeWidth: 1.6 * ls.value }));
  const pinProps = useAnimatedProps(() => ({ opacity: pinO.value }));
  const streamProps = useAnimatedProps(() => ({
    strokeDashoffset: -clock.value * 240,
    opacity: modeV.value === 1 && reducedV.value === 0 ? 0.75 : 0,
  }));
  const haloProps = useAnimatedProps(() => {
    const ph = (clock.value * 12) % 1;
    const hs = BIRD_HEIGHT / 17.4;
    const upp = camVw.value / Math.max(1, paneW.value);
    const r = Math.max((5 + ph * 9) * hs, (4 + ph * 8) * upp);
    return {
      cx: worldX.value,
      cy: worldY.value,
      r,
      opacity: modeV.value === 3 ? 0 : 0.55 * (1 - ph),
    };
  });
  const flyProps = useAnimatedProps(() => {
    const t = clock.value;
    const x = -16 + 360 * t;
    const y = 34 + Math.sin(t * TAU * 3) * 5;
    const f = Math.sin(t * TAU * 60) * 2;
    const bird = (bx: number, by: number) =>
      `M${bx - 4},${by - f} Q${bx - 2},${by - 1} ${bx},${by} Q${bx + 2},${by - 1} ${bx + 4},${by - f}`;
    return {
      d: `${bird(x, y)} ${bird(x - 13, y + 7)}`,
      opacity: modeV.value === 1 && reducedV.value === 0 ? 1 : 0,
    };
  });

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
  const confA = useAnimatedProps(
    () => ({ d: confettiD(SUMMIT_X, top - 10, burst.value, 0, 2), opacity: 1 - burst.value * burst.value }),
    [top],
  );
  const confB = useAnimatedProps(
    () => ({ d: confettiD(SUMMIT_X, top - 10, burst.value, 1, 2), opacity: 1 - burst.value * burst.value }),
    [top],
  );

  const birdStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: birdX.value - BUDGIE_FEET_X },
      { translateY: birdY.value - BUDGIE_FEET_Y + hopPx.value },
      { scaleX: dirV.value * birdScale.value },
      { scaleY: birdScale.value * breath.value },
    ],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    paneW.value = e.nativeEvent.layout.width;
    paneH.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      <AnimatedSvg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        animatedProps={svgProps}
      >
        <Defsets isDark />
        <Terrain isDark />
        <LevelScene index={index} flag={false} standby />
        <ForestLayer />

        <AnimatedPath
          d={STREAM_D}
          stroke="#FFFFFF"
          strokeWidth={1}
          strokeDasharray={[2, 10]}
          strokeLinecap="round"
          fill="none"
          animatedProps={streamProps}
        />

        {/* kesikli tam patika ve ilerleme kadar dolan amber çizgi: yakınlaştıkça incelir */}
        <AnimatedPath
          d={trail.d}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.9}
          strokeDasharray={[3, 3.5]}
          strokeLinecap="round"
          strokeLinejoin="round"
          animatedProps={dashProps}
        />
        <AnimatedPath
          d={trail.d}
          fill="none"
          stroke="#F0A63A"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[trail.len, trail.len]}
          animatedProps={fillProps}
        />

        <AnimatedG animatedProps={pinProps}>
          <Pin x={START[0]} y={START[1]} color="#3DBE4F" />
          {flag ? null : <Pin x={SUMMIT_X} y={top + 1} color="#E5483B" />}
        </AnimatedG>

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
              stroke="#F2F2F2"
              strokeWidth={1.6}
              strokeLinecap="round"
              animatedProps={poleProps}
            />
            <AnimatedPath fill="#E5483B" animatedProps={clothProps} />
            <AnimatedPath fill="#FFD27A" animatedProps={confA} />
            <AnimatedPath fill="#FFFFFF" animatedProps={confB} />
          </G>
        ) : null}

        <AnimatedCircle fill="#F0A63A" animatedProps={haloProps} />
        <AnimatedPath
          stroke="#D8DDE2"
          strokeWidth={1}
          strokeLinecap="round"
          fill="none"
          animatedProps={flyProps}
        />

        <SwayCloud x={SUMMIT_X - 40} y={top + 20} s={0.7} opacity={0.85} sway={swayB} />
        <SwayCloud x={SUMMIT_X + 34} y={top + 4} s={0.9} opacity={0.95} sway={swayA} />
        <SwayCloud x={SUMMIT_X + 58} y={top + 12} s={0.55} opacity={0.95} sway={swayA} />
      </AnimatedSvg>

      {/* kuş: kendi Svg'si, dünya koordinatından piksele çevrilip yerleştirilir */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bird,
          { width: BUDGIE_BOX_W, height: BUDGIE_BOX_H, transformOrigin: [BUDGIE_FEET_X, BUDGIE_FEET_Y, 0] },
          birdStyle,
        ]}
      >
        <Budgie mode={mode} wing={wingDeg} tail={tailDeg} blink={blink} zz={zz} />
      </Animated.View>

      {night ? <View pointerEvents="none" style={styles.nightTint} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: SKY_EDGE },
  bird: { position: 'absolute', left: 0, top: 0 },
  nightTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,6,2,0.42)' },
});
