import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { focusElapsedMs, peakHeight, type FocusSession } from '@takip/shared';
import { useTheme } from '@/theme/ThemeProvider';

const MIN_SLOTS = 8;
const MAX_SLOTS = 14;

function Peak({ height, color, opacity }: { height: number; color: string; opacity: number }) {
  const h = Math.max(1, height);
  return (
    <View style={{ flex: 1, height: h, opacity }}>
      <Svg width="100%" height="100%" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none">
        <Polygon points={`50,0 100,${h} 0,${h}`} fill={color} />
      </Svg>
    </View>
  );
}

/**
 * Bu haftanın zirveleri: tamamlanan seans `ok`, sürmekte olan `acc` (ilerledikçe büyür),
 * yarım kalan soluk; sağda boş yer tutucular.
 */
export function WeekPeaks({
  sessions,
  active,
  now,
}: {
  sessions: FocusSession[];
  active: FocusSession | null;
  now: number;
}) {
  const { c } = useTheme();
  const ended = sessions.filter((s) => s.status === 'completed' || s.status === 'interrupted');
  const items = ended.slice(-(MAX_SLOTS - 1)).map((s) => {
    const p = s.elapsedMs / (s.plannedMinutes * 60_000);
    return s.reachedPeak
      ? { key: s.id, height: peakHeight(s.plannedMinutes), color: c.ok, opacity: 1 }
      : {
          key: s.id,
          height: Math.max(6, peakHeight(s.plannedMinutes, p)),
          color: c.line2,
          opacity: 0.6,
        };
  });
  if (active) {
    const p = focusElapsedMs(active, now) / (active.plannedMinutes * 60_000);
    items.push({
      key: active.id,
      height: Math.max(6, peakHeight(active.plannedMinutes, p)),
      color: c.acc,
      opacity: 1,
    });
  }
  const placeholders = Math.max(0, MIN_SLOTS - items.length);
  for (let i = 0; i < placeholders; i++) {
    items.push({ key: `empty-${i}`, height: 14, color: c.line2, opacity: 0.6 });
  }
  return (
    <View style={[styles.row, { borderBottomColor: c.line }]}>
      {items.map(({ key, ...rest }) => (
        <Peak key={key} {...rest} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-end',
    height: 64,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
  },
});
