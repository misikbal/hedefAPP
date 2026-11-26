import { StyleSheet, View } from 'react-native';
import { MONEY_CATEGORY_LABELS, formatMoney, type MoneyCategoryTotal } from '@takip/shared';
import { ProgressBar } from '@/components/ProgressBar';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { statusColor, statusTextColor } from './format';

interface Props {
  item: MoneyCategoryTotal;
  /** Limit yoksa çubuk bu değere göre (ör. en büyük kategori) */
  scale: number;
  /** Varsayılan: amber; gelirde yeşil */
  color?: string;
}

/** Kategori satırı: ad, tutar, çubuk; limit varsa çubuk limite göre ve durum renginde. */
export function CategoryBar({ item, scale, color }: Props) {
  const { c } = useTheme();
  const hasLimit = item.limit !== null && item.limit > 0;
  const value = hasLimit ? item.total / item.limit! : scale > 0 ? item.total / scale : 0;
  const barColor = hasLimit ? statusColor(c, item.status) : (color ?? c.acc);
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Txt style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>
          {MONEY_CATEGORY_LABELS[item.category]}
          <Txt style={{ fontSize: 12, color: c.mut }}>{`  ${item.count} kayıt`}</Txt>
        </Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }}>
          {formatMoney(item.total)}
          {hasLimit ? (
            <Txt
              style={{
                fontFamily: fonts.mono,
                fontSize: 12,
                color: statusTextColor(c, item.status),
              }}
            >{` / ${formatMoney(item.limit!)}`}</Txt>
          ) : null}
        </Txt>
      </View>
      <ProgressBar value={value} height={6} color={barColor} />
      {hasLimit && item.status === 'over' ? (
        <Txt style={{ fontSize: 12, color: c.penTx }}>
          {`Limit ${formatMoney(item.total - item.limit!)} aşıldı`}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
});
