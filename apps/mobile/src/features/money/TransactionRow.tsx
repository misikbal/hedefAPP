import { Pressable, StyleSheet, View } from 'react-native';
import { MONEY_CATEGORY_LABELS, formatMoney, type Transaction } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { dayMonthLabel } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/** Son kayıtlar satırı; dokununca düzenleme ekranı açılır. */
export function TransactionRow({ t, onPress }: { t: Transaction; onPress: () => void }) {
  const { c } = useTheme();
  const income = t.type === 'income';
  const label = MONEY_CATEGORY_LABELS[t.category];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${income ? 'gelir' : 'harcama'} ${formatMoney(t.amount)}, düzenle`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.line, backgroundColor: pressed ? c.s2 : c.s1 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: income ? c.ok : c.acc }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontSize: 15 }} numberOfLines={1}>
          {label}
        </Txt>
        <Txt style={{ fontSize: 12, color: c.mut }} numberOfLines={1}>
          {t.note ? `${dayMonthLabel(t.date)} · ${t.note}` : dayMonthLabel(t.date)}
        </Txt>
      </View>
      <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: income ? c.okTx : c.tx }}>
        {`${income ? '+' : '−'}${formatMoney(t.amount)}`}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 2 },
});
