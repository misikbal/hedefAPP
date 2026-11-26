import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { MONTH_SHORT } from './format';

interface Props {
  months: { month: string; income: number; expense: number }[];
  height?: number;
}

/** 12 ay: her ayda yan yana gelir (yeşil) ve harcama (amber) çubuğu. */
export function YearBars({ months, height = 120 }: Props) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 0);
  const n = Math.max(months.length, 1);
  const slot = width / n;
  const bar = Math.max(2, (slot - 6) / 2);
  const h = (v: number) => (max > 0 && v > 0 ? Math.max(3, (v / max) * (height - 4)) : 0);

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Aylara göre gelir ve harcama grafiği"
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Rect x={0} y={height - 1} width={width} height={1} fill={c.line} />
            {months.map((m, i) => {
              const x = i * slot + 3;
              const hi = h(m.income);
              const he = h(m.expense);
              return [
                <Rect
                  key={`${m.month}-i`}
                  x={x}
                  y={height - hi}
                  width={bar}
                  height={hi}
                  rx={2}
                  fill={c.ok}
                />,
                <Rect
                  key={`${m.month}-e`}
                  x={x + bar}
                  y={height - he}
                  width={bar}
                  height={he}
                  rx={2}
                  fill={c.acc}
                />,
              ];
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        {months.map((m) => (
          <Txt key={m.month} style={[styles.label, { color: c.mut }]}>
            {MONTH_SHORT[Number(m.month.slice(5, 7)) - 1] ?? ''}
          </Txt>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.ok }]} />
          <Txt style={{ fontSize: 12, color: c.tx2 }}>Gelir</Txt>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.acc }]} />
          <Txt style={{ fontSize: 12, color: c.tx2 }}>Harcama</Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row' },
  label: { flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 9 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 2 },
});
