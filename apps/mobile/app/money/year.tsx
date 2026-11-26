import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney, type MoneyCategoryTotal } from '@takip/shared';
import { useMoneyYear } from '@/api/hooks';
import { Card } from '@/components/Card';
import { ErrorCard, Loading } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { CategoryBar } from '@/features/money/CategoryBar';
import { currentYear } from '@/features/money/format';
import { PeriodSwitcher } from '@/features/money/PeriodSwitcher';
import { YearBars } from '@/features/money/YearBars';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/** Yıllık görünümde aylık limitler anlamsız: çubuk yalnız toplama göre. */
const withoutLimit = (x: MoneyCategoryTotal): MoneyCategoryTotal => ({
  ...x,
  limit: null,
  status: null,
});

export default function MoneyYearScreen() {
  const { c } = useTheme();
  const thisYear = currentYear();
  const [year, setYear] = useState(thisYear);
  const q = useMoneyYear(year);
  const s = q.data;

  const breakdown = (title: string, items: MoneyCategoryTotal[], total: number, color: string) => {
    const list = items.filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
    if (!list.length) return null;
    const max = Math.max(...list.map((x) => x.total));
    return (
      <View style={{ gap: 10 }}>
        <View style={styles.sectionHead}>
          <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
            {title}
          </Txt>
          <Txt style={{ fontSize: 12, color: c.mut }}>{formatMoney(total)}</Txt>
        </View>
        <Card style={{ gap: 14 }}>
          {list.map((x) => (
            <CategoryBar key={x.category} item={withoutLimit(x)} scale={max} color={color} />
          ))}
        </Card>
      </View>
    );
  };

  const empty = s ? s.income === 0 && s.expense === 0 : false;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Yıllık özet" />
      <ScrollView contentContainerStyle={styles.content}>
        <PeriodSwitcher
          label={String(year)}
          prevLabel="Önceki yıl"
          nextLabel="Sonraki yıl"
          onPrev={() => setYear((y) => y - 1)}
          onNext={() => setYear((y) => y + 1)}
          nextDisabled={year >= thisYear}
        />
        {q.isPending ? <Loading /> : null}
        {q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} /> : null}

        {s ? (
          <>
            <View style={styles.grid}>
              <View style={[styles.tile, { backgroundColor: c.s1, borderColor: c.line }]}>
                <Txt style={{ fontSize: 12, color: c.mut }}>Gelir</Txt>
                <Txt style={[styles.num, { color: c.okTx }]}>{formatMoney(s.income)}</Txt>
              </View>
              <View style={[styles.tile, { backgroundColor: c.s1, borderColor: c.line }]}>
                <Txt style={{ fontSize: 12, color: c.mut }}>Harcama</Txt>
                <Txt style={styles.num}>{formatMoney(s.expense)}</Txt>
              </View>
            </View>
            <Card style={{ gap: 4 }}>
              <Txt style={{ fontSize: 13, color: c.mut }}>Net</Txt>
              <Txt
                style={{
                  fontFamily: fonts.display,
                  fontSize: 34,
                  lineHeight: 40,
                  color: s.net < 0 ? c.penTx : s.net > 0 ? c.okTx : c.tx,
                }}
              >
                {`${s.net > 0 ? '+' : ''}${formatMoney(s.net)}`}
              </Txt>
            </Card>

            {empty ? (
              <Card>
                <Txt color="tx2">{`${year} yılında kayıt yok.`}</Txt>
              </Card>
            ) : (
              <>
                <Card>
                  <YearBars months={s.months} />
                </Card>
                {breakdown('Harcama kategorileri', s.expenseByCategory, s.expense, c.acc)}
                {breakdown('Gelir kategorileri', s.incomeByCategory, s.income, c.ok)}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  num: { fontFamily: fonts.monoMedium, fontSize: 20 },
});
