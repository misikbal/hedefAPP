import { Pressable, StyleSheet, View } from 'react-native';
import type { WeekResponse } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { DAY_SHORT, dayOfMonth } from '@/lib/date';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

interface Props {
  days: WeekResponse['days'];
  selected: number;
  onSelect: (index: number) => void;
}

/** 7 günlük şerit: gün adı, tarih ve o günün yükünü gösteren kategori renkli çizgiler (en çok 4). */
export function DayStrip({ days, selected, onSelect }: Props) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      {days.map((d, i) => {
        const on = i === selected;
        const fg = on ? c.onInv : c.tx;
        return (
          <Pressable
            key={d.date}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${DAY_SHORT[i]} ${dayOfMonth(d.date)}, ${d.instances.length} blok`}
            onPress={() => onSelect(i)}
            style={[
              styles.day,
              { backgroundColor: on ? c.inv : c.s1, borderColor: on ? c.inv : c.line },
            ]}
          >
            <Txt style={{ fontSize: 11, color: fg, fontFamily: fonts.body }}>{DAY_SHORT[i]}</Txt>
            <Txt style={{ fontSize: 16, color: fg, fontFamily: fonts.monoMedium }}>
              {dayOfMonth(d.date)}
            </Txt>
            <View style={styles.load}>
              {d.instances.slice(0, 4).map((inst) => (
                <View
                  key={inst.id}
                  style={[styles.bar, { backgroundColor: categoryColor(c, inst.category) }]}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  load: { width: 18, height: 26, gap: 2, justifyContent: 'flex-end' },
  bar: { height: 5, borderRadius: 1 },
});
