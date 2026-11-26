import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { formatMoney } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { dayOfMonth, todayLocal } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

interface Props {
  days: { date: string; total: number }[];
  height?: number;
}

/** Ayın günlük harcama çubukları; bugün vurgulu, boş günler ince çizgi. */
export function DailyBars({ days, height = 72 }: Props) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const today = todayLocal();
  const max = Math.max(...days.map((d) => d.total), 0);
  const n = Math.max(days.length, 1);
  const slot = width / n;
  const bar = Math.max(2, slot * 0.62);
  const top = days.reduce<{ date: string; total: number } | null>(
    (a, d) => (d.total > 0 && (!a || d.total > a.total) ? d : a),
    null,
  );

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={
          top
            ? `Günlük harcama grafiği. En yüksek gün ${dayOfMonth(top.date)}, ${formatMoney(top.total)}`
            : 'Günlük harcama grafiği, bu ay harcama yok'
        }
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {days.map((d, i) => {
              const h = max > 0 && d.total > 0 ? Math.max(3, (d.total / max) * (height - 4)) : 2;
              const isToday = d.date === today;
              return (
                <Rect
                  key={d.date}
                  x={i * slot + (slot - bar) / 2}
                  y={height - h}
                  width={bar}
                  height={h}
                  rx={Math.min(2, bar / 2)}
                  fill={d.total > 0 ? (isToday ? c.acc : c.accDim) : c.line}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        <Txt style={styles.mono(c.mut)}>{days[0] ? dayOfMonth(days[0].date) : ''}</Txt>
        {top ? (
          <Txt style={styles.mono(c.mut)}>
            {`en yüksek: ${dayOfMonth(top.date)}. gün · ${formatMoney(top.total)}`}
          </Txt>
        ) : null}
        <Txt style={styles.mono(c.mut)}>{days.at(-1) ? dayOfMonth(days.at(-1)!.date) : ''}</Txt>
      </View>
    </View>
  );
}

const styles = {
  ...StyleSheet.create({
    labels: { flexDirection: 'row', justifyContent: 'space-between' },
  }),
  mono: (color: string) => ({ fontFamily: fonts.mono, fontSize: 10, color }),
};
