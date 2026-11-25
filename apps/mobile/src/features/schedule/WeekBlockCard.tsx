import { Pressable, StyleSheet, View } from 'react-native';
import { CATEGORY_LABELS, type Instance } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const STATUS_TEXT: Partial<Record<Instance['status'], string>> = {
  done: 'yapıldı',
  skipped: 'atlandı',
  missed: 'kaçtı',
};

export function WeekBlockCard({ item, onPress }: { item: Instance; onPress: () => void }) {
  const { c } = useTheme();
  const faded = item.status === 'done' || item.status === 'skipped';
  const status = STATUS_TEXT[item.status];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? c.s2 : c.s1, borderColor: c.line },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: categoryColor(c, item.category) }]} />
      <View style={styles.body}>
        <Txt
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontFamily: fonts.bodyMedium,
            color: faded ? c.mut : c.tx,
            textDecorationLine: faded ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </Txt>
        <Txt numberOfLines={1} style={{ fontSize: 12, color: c.mut, fontFamily: fonts.body }}>
          {[item.description ?? CATEGORY_LABELS[item.category], status].filter(Boolean).join(' · ')}
        </Txt>
        {item.penalty ? (
          <View style={[styles.pen, { backgroundColor: c.penBg }]}>
            <Txt
              style={{ fontSize: 11, color: c.penTx, fontFamily: fonts.body }}
            >{`kaçarsa: ${item.penalty}`}</Txt>
          </View>
        ) : null}
      </View>
      <Txt style={[styles.time, { color: c.mut }]}>{`${item.startTime}\n${item.endTime}`}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minHeight: 64,
  },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  pen: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  time: { fontFamily: fonts.mono, fontSize: 12, textAlign: 'right', lineHeight: 17 },
});
