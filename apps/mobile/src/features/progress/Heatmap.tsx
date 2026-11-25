import { StyleSheet, View } from 'react-native';
import type { StatsOverview } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';

const OPACITY = [1, 0.35, 0.6, 0.85, 1];

function Cell({ level, future, size }: { level: number; future?: boolean; size?: number }) {
  const { c } = useTheme();
  if (future)
    return (
      <View
        style={[
          styles.cell,
          size ? { width: size, height: size } : null,
          { borderWidth: 1, borderStyle: 'dashed', borderColor: c.line },
        ]}
      />
    );
  return (
    <View
      style={[
        styles.cell,
        size ? { width: size, height: size } : null,
        { backgroundColor: level === 0 ? c.s2 : c.acc, opacity: level === 0 ? 1 : OPACITY[level] },
      ]}
    />
  );
}

/** 12 sütun (hafta) × 7 satır (Pzt–Paz). */
export function Heatmap({ days }: { days: StatsOverview['heatmap'] }) {
  const { c } = useTheme();
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) =>
    days.slice(w * 7, w * 7 + 7),
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {weeks.map((week, w) => (
          <View key={w} style={styles.col}>
            {week.map((d) => (
              <Cell key={d.date} level={d.level} future={d.future} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Txt style={{ fontSize: 11, color: c.mut }}>az</Txt>
        {[0, 1, 2, 3, 4].map((l) => (
          <Cell key={l} level={l} size={12} />
        ))}
        <Txt style={{ fontSize: 11, color: c.mut }}>çok</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 4 },
  col: { flex: 1, gap: 4 },
  cell: { height: 18, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
});
