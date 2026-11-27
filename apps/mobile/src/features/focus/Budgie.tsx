import { memo } from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/*
 * Sarı muhabbet kuşu. Yüzü sağa dönük; çizim birimiyle ayak tabanı (0,0), tepe tüyü y = −20,5.
 * Gövde, baş ve bacaklar sabit; kanat, kuyruk, göz kırpma ve uyku harfleri UI thread'de
 * `d` / `opacity` ile oynar (MountainClimb'daki bayrak bezi gibi). Yön çevirme, hop ve ölçek
 * dışarıdan, kuşu saran View'da yapılır.
 */

export type BudgieMode = 'run' | 'sleep' | 'cheer';

/** Kuşun Svg'sinin piksel boyutu (ölçek 1'de). Dışarıdaki View bu kutuyu ölçekler. */
export const BUDGIE_BOX_W = 160;
const VB = { x: -18, y: -28, w: 36, h: 34 } as const;
export const BUDGIE_BOX_H = (BUDGIE_BOX_W * VB.h) / VB.w;
/** Kutunun içinde ayak tabanının yeri (px) */
export const BUDGIE_FEET_X = ((0 - VB.x) / VB.w) * BUDGIE_BOX_W;
export const BUDGIE_FEET_Y = ((0 - VB.y) / VB.h) * BUDGIE_BOX_H;
/** Çizim biriminin ölçek 1'deki piksel karşılığı */
export const BUDGIE_UNIT_PX = BUDGIE_BOX_W / VB.w;

interface Seg {
  c: 'M' | 'L' | 'C' | 'Q' | 'Z';
  p: number[];
}

const WING: Seg[] = [
  { c: 'M', p: [-3.9, -10.6] },
  { c: 'C', p: [-6.2, -6.6, -5.4, -3, -2.7, -1.8] },
  { c: 'C', p: [0.6, -2.6, 2.3, -6.2, 1.2, -10.6] },
  { c: 'C', p: [-0.2, -12.2, -2.6, -12.2, -3.9, -10.6] },
  { c: 'Z', p: [] },
];
const WING_FEATHERS: Seg[] = [
  { c: 'M', p: [-3.1, -9.6] },
  { c: 'Q', p: [-1.6, -8.6, -0.1, -9.6] },
  { c: 'M', p: [-3.5, -7.3] },
  { c: 'Q', p: [-1.75, -6.3, 0, -7.3] },
  { c: 'M', p: [-3.1, -5] },
  { c: 'Q', p: [-1.65, -4, -0.2, -5] },
];
const TAIL: Seg[] = [
  { c: 'M', p: [-2.5, -7] },
  { c: 'C', p: [-6, -4, -10, 0, -13.5, 3.4] },
  { c: 'L', p: [-11.4, 4.8] },
  { c: 'C', p: [-7.6, 2.8, -4, -0.6, -0.4, -3.4] },
  { c: 'Z', p: [] },
];
const TAIL_TIP: Seg[] = [
  { c: 'M', p: [-9.6, 1.6] },
  { c: 'L', p: [-13.5, 3.4] },
  { c: 'L', p: [-11.4, 4.8] },
  { c: 'L', p: [-8.6, 3] },
  { c: 'Z', p: [] },
];
const TAIL_LINE: Seg[] = [
  { c: 'M', p: [-2.5, -7] },
  { c: 'C', p: [-5, -4.6, -8, -1.6, -10.8, 1] },
];

/** Parçayı (px, py) çevresinde `deg` derece döndürüp SVG yol metnine çevirir. */
function rot(segs: Seg[], deg: number, px: number, py: number): string {
  'worklet';
  const a = (deg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  let d = '';
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]!;
    d += s.c;
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i]! - px;
      const y = s.p[i + 1]! - py;
      d += `${(px + x * cs - y * sn).toFixed(3)},${(py + x * sn + y * cs).toFixed(3)} `;
    }
  }
  return d;
}

/** Küçük "z" harfi (zikzak çizgi) */
function zPath(x: number, y: number, s: number): string {
  'worklet';
  return `M${x.toFixed(2)},${y.toFixed(2)}h${s}l${-s},${s}h${s}`;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const Body = memo(function Body({ mode }: { mode: BudgieMode }) {
  const sleep = mode === 'sleep';
  return (
    <>
      <Ellipse cx={0} cy={0} rx={6.5} ry={1.8} fill="#000" opacity={0.3} />
      <Path
        d="M-1.2,-2.2 V0 M-2.6,0 H0 M2.2,-2.2 V0 M.8,0 H3.4"
        stroke="#E8913A"
        strokeWidth={1.1}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M-4.4,-10 C-6.2,-6 -4.6,-1 0,-.6 C4.4,-.4 6.4,-4.6 5.4,-9.6 C4.7,-12.8 -2.6,-13.6 -4.4,-10 Z"
        fill="#FFD93D"
      />
      <Ellipse cx={2.6} cy={-5.2} rx={2.5} ry={4.2} fill="#FFEC8A" opacity={0.9} />
      <G transform={sleep ? 'rotate(16 0 -11)' : undefined}>
        <Circle cx={2.2} cy={-15.6} r={4.9} fill="#FFE55C" />
        <Ellipse cx={4.1} cy={-15} rx={3} ry={3.5} fill="#FFF3A6" />
        <Path
          d="M-.8,-18.9 q1.2,-.9 2.4,0 M-1.4,-17 q1.3,-.9 2.6,0 M-1.3,-15.1 q1.2,-.9 2.4,0"
          stroke="#B9A22A"
          strokeWidth={0.45}
          strokeLinecap="round"
          fill="none"
        />
        <Ellipse cx={2.5} cy={-13.5} rx={1.6} ry={1} fill="#8F7AE0" />
        <Circle cx={4.1} cy={-12.2} r={0.4} fill="#5A4BAF" />
        <Circle cx={5.2} cy={-12.9} r={0.4} fill="#5A4BAF" />
        <Ellipse cx={6.5} cy={-16.3} rx={1.4} ry={1} fill="#6FA8F0" />
        <Path
          d="M6.7,-15.6 C8.7,-15.6 9.7,-14.2 8.7,-13 C7.9,-13.6 6.9,-13.6 6.5,-14 Z"
          fill="#F4A93C"
        />
        {mode === 'cheer' ? (
          <Path
            d="M6.6,-14 C8.5,-13.1 8.8,-11.7 7.5,-11.6 C7,-12.4 6.6,-12.8 6.3,-13 Z"
            fill="#E8902B"
          />
        ) : null}
        {sleep ? (
          <Path
            d="M3,-16.7 q1.4,1.3 2.8,0"
            stroke="#2B2517"
            strokeWidth={0.7}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </G>
    </>
  );
});

/**
 * @param wing kanat açısı (derece, omuz çevresinde)
 * @param tail kuyruk açısı (derece)
 * @param blink 1 = gözler açık, 0 = kırpıyor
 * @param zz uyku harflerinin evresi 0–1
 */
export const Budgie = memo(function Budgie({
  mode,
  wing,
  tail,
  blink,
  zz,
}: {
  mode: BudgieMode;
  wing: SharedValue<number>;
  tail: SharedValue<number>;
  blink: SharedValue<number>;
  zz: SharedValue<number>;
}) {
  const tailProps = useAnimatedProps(() => ({ d: rot(TAIL, tail.value, -2.5, -7) }));
  const tipProps = useAnimatedProps(() => ({ d: rot(TAIL_TIP, tail.value, -2.5, -7) }));
  const lineProps = useAnimatedProps(() => ({ d: rot(TAIL_LINE, tail.value, -2.5, -7) }));
  const wingProps = useAnimatedProps(() => ({ d: rot(WING, wing.value, -1.5, -10.5) }));
  const featherProps = useAnimatedProps(() => ({ d: rot(WING_FEATHERS, wing.value, -1.5, -10.5) }));
  const eyeProps = useAnimatedProps(() => ({ opacity: blink.value }));
  const lidProps = useAnimatedProps(() => ({ opacity: 1 - blink.value }));
  const z1 = useAnimatedProps(() => {
    const a = zz.value;
    return { d: zPath(7 + a * 5, -21 - a * 9, 3.2), opacity: 1 - a };
  });
  const z2 = useAnimatedProps(() => {
    const a = (zz.value + 0.5) % 1;
    return { d: zPath(10 + a * 5, -25 - a * 9, 2.4), opacity: 1 - a };
  });

  return (
    <Svg
      width={BUDGIE_BOX_W}
      height={BUDGIE_BOX_H}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
    >
      <AnimatedPath fill="#F2C230" animatedProps={tailProps} />
      <AnimatedPath fill="#FFF2B0" animatedProps={tipProps} />
      <AnimatedPath stroke="#DDA91B" strokeWidth={0.5} fill="none" animatedProps={lineProps} />
      <Body mode={mode} />
      <AnimatedPath fill="#F2B91E" animatedProps={wingProps} />
      <AnimatedPath
        stroke="#B9830F"
        strokeWidth={0.55}
        strokeLinecap="round"
        fill="none"
        animatedProps={featherProps}
      />
      {mode === 'sleep' ? (
        <>
          <AnimatedPath
            stroke="#BFD4F2"
            strokeWidth={0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            animatedProps={z1}
          />
          <AnimatedPath
            stroke="#BFD4F2"
            strokeWidth={0.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            animatedProps={z2}
          />
        </>
      ) : (
        <>
          <AnimatedG animatedProps={eyeProps}>
            <Circle cx={4.2} cy={-16.9} r={1.75} fill="#FFFFFF" />
            <Circle cx={4.5} cy={-16.9} r={1.05} fill="#1D1A12" />
            <Circle cx={4.8} cy={-17.2} r={0.32} fill="#FFFFFF" />
          </AnimatedG>
          <AnimatedPath
            d="M3,-16.7 q1.4,1.3 2.8,0"
            stroke="#2B2517"
            strokeWidth={0.7}
            strokeLinecap="round"
            fill="none"
            animatedProps={lidProps}
          />
        </>
      )}
    </Svg>
  );
});
