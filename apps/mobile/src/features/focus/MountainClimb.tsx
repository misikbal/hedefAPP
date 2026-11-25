import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline } from 'react-native-svg';
import { TRAIL_LENGTH, TRAIL_POINTS, focusLevel, formatNumber, trailPoint } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const TRAIL = TRAIL_POINTS.map((p) => p.join(',')).join(' ');
const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

/** Dağ tırmanışı figürü (tasarım 03, viewBox 0 0 320 220). */
export function MountainClimb({
  plannedMinutes,
  progress,
  flag,
}: {
  plannedMinutes: number;
  /** 0–1 */
  progress: number;
  /** Zirveye bayrak dikildi */
  flag: boolean;
}) {
  const { c } = useTheme();
  const level = focusLevel(plannedMinutes);
  const p = Math.min(1, Math.max(0, progress));
  const { x, y } = trailPoint(p);
  const elev = Math.round(level.altitude * p);
  return (
    <View
      style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Tırmanış: ${elev} metre, zirve ${level.altitude} metre`}
    >
      <View style={styles.art}>
        <Svg width="100%" height="100%" viewBox="0 0 320 220">
          <Polygon points="0,220 70,128 120,168 205,96 260,140 320,104 320,220" fill={c.s2} />
          <Polygon points="10,220 200,24 310,220" fill={c.line} />
          <Polygon points="200,24 226,58 214,55 205,66 194,55 178,59" fill={c.tx2} opacity={0.55} />
          <Polyline
            points={TRAIL}
            fill="none"
            stroke={c.line2}
            strokeWidth={2}
            strokeDasharray={[3, 5]}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points={TRAIL}
            fill="none"
            stroke={c.acc}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[TRAIL_LENGTH, TRAIL_LENGTH]}
            strokeDashoffset={TRAIL_LENGTH * (1 - p)}
          />
          <G opacity={flag ? 1 : 0}>
            <Line x1={200} y1={26} x2={200} y2={4} stroke={c.tx} strokeWidth={2} />
            <Polygon points="200,4 218,9 200,14" fill={c.acc} />
          </G>
          <Circle cx={x} cy={y} r={9} fill={c.acc} opacity={0.25} />
          <Circle cx={x} cy={y} r={5} fill={c.acc} stroke={c.bg} strokeWidth={2} />
        </Svg>
      </View>
      <View style={styles.overlay} pointerEvents="none">
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
  art: { width: '100%', aspectRatio: 320 / 220 },
  overlay: { position: 'absolute', top: 12, left: 14, gap: 2 },
  peak: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.9 },
  elev: { fontFamily: fonts.mono, fontSize: 16 },
});
