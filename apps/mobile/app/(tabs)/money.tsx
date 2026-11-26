import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatMoney, type MoneyMonthSummary } from '@takip/shared';
import { useMoneySummary, useTransactions } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ForwardIcon, PlusIcon } from '@/components/icons';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { CategoryBar } from '@/features/money/CategoryBar';
import { DailyBars } from '@/features/money/DailyBars';
import { currentMonth, shiftMonth, statusColor, statusTextColor } from '@/features/money/format';
import { PeriodSwitcher } from '@/features/money/PeriodSwitcher';
import { TransactionRow } from '@/features/money/TransactionRow';
import { monthTitle } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const RECENT_LIMIT = 30;

function ExpenseChange({ s }: { s: MoneyMonthSummary }) {
  const { c } = useTheme();
  if (s.previousExpense <= 0) {
    return <Txt style={{ fontSize: 11, color: c.mut }}>geçen ay harcama yok</Txt>;
  }
  const ratio = (s.expense - s.previousExpense) / s.previousExpense;
  const pct = Math.round(Math.abs(ratio) * 100);
  if (pct === 0) return <Txt style={{ fontSize: 11, color: c.mut }}>geçen ayla aynı</Txt>;
  // Harcamanın artması kötü: artış kırmızı, azalış yeşil.
  return (
    <Txt style={{ fontSize: 11, color: ratio > 0 ? c.penTx : c.okTx }}>
      {`${ratio > 0 ? '▲' : '▼'} %${pct} geçen aya göre`}
    </Txt>
  );
}

export default function MoneyScreen() {
  const { c } = useTheme();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const summary = useMoneySummary(month);
  const recent = useTransactions({ month, limit: RECENT_LIMIT });
  const s = summary.data;

  const section = (title: string, right?: string) => (
    <View style={styles.sectionHead}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        {title}
      </Txt>
      {right ? <Txt style={{ fontSize: 12, color: c.mut }}>{right}</Txt> : null}
    </View>
  );

  const link = (label: string, href: '/money/year' | '/money/budgets') => (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.link,
        { borderColor: c.line, backgroundColor: pressed ? c.s2 : c.s1 },
      ]}
    >
      <Txt style={{ fontSize: 15, flex: 1 }}>{label}</Txt>
      <ForwardIcon color={c.mut} size={18} />
    </Pressable>
  );

  const expenseItems = (s?.expenseByCategory ?? [])
    .filter((x) => x.total > 0 || x.limit !== null)
    .sort((a, b) => b.total - a.total);
  const maxExpense = Math.max(...expenseItems.map((x) => x.total), 0);
  const empty = s ? s.income === 0 && s.expense === 0 : false;

  return (
    <Screen
      title="Para"
      eyebrow={month === thisMonth ? 'BU AY' : monthTitle(month).toLocaleUpperCase('tr-TR')}
      refreshing={summary.isRefetching}
      onRefresh={() => {
        void summary.refetch();
        void recent.refetch();
      }}
    >
      <PeriodSwitcher
        label={monthTitle(month)}
        prevLabel="Önceki ay"
        nextLabel="Sonraki ay"
        onPrev={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={() => setMonth((m) => shiftMonth(m, 1))}
        nextDisabled={month >= thisMonth}
      />

      <View style={styles.quickRow}>
        <Button
          label="Harcama"
          icon={<PlusIcon color={c.onAcc} />}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/money/new', params: { type: 'expense' } })}
        />
        <Button
          label="Gelir"
          variant="outline"
          height={52}
          icon={<PlusIcon color={c.tx} />}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/money/new', params: { type: 'income' } })}
        />
      </View>

      {summary.isPending ? <Loading /> : null}
      {summary.isError ? (
        <ErrorCard error={summary.error} onRetry={() => void summary.refetch()} />
      ) : null}

      {s ? (
        <>
          <Card style={{ gap: 4 }}>
            <Txt style={{ fontSize: 13, color: c.mut }}>Net (gelir − harcama)</Txt>
            <Txt
              style={{
                fontFamily: fonts.display,
                fontSize: 40,
                lineHeight: 46,
                letterSpacing: -0.8,
                color: s.net < 0 ? c.penTx : s.net > 0 ? c.okTx : c.tx,
              }}
            >
              {`${s.net > 0 ? '+' : ''}${formatMoney(s.net)}`}
            </Txt>
          </Card>

          <View style={styles.grid}>
            <View style={[styles.tile, { backgroundColor: c.s1, borderColor: c.line }]}>
              <Txt style={{ fontSize: 12, color: c.mut }}>Gelir</Txt>
              <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 20, color: c.okTx }}>
                {formatMoney(s.income)}
              </Txt>
            </View>
            <View style={[styles.tile, { backgroundColor: c.s1, borderColor: c.line }]}>
              <Txt style={{ fontSize: 12, color: c.mut }}>Harcama</Txt>
              <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 20 }}>
                {formatMoney(s.expense)}
              </Txt>
              <ExpenseChange s={s} />
            </View>
          </View>

          {s.budget ? (
            <Card>
              <View style={styles.sectionHead}>
                <Txt style={{ fontSize: 13, color: c.mut }}>Aylık bütçe</Txt>
                <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }}>
                  {`${formatMoney(s.budget.spent)} / ${formatMoney(s.budget.limit)}`}
                </Txt>
              </View>
              <ProgressBar
                height={8}
                value={s.budget.limit > 0 ? s.budget.spent / s.budget.limit : 1}
                color={statusColor(c, s.budget.status)}
              />
              <Txt style={{ fontSize: 13, color: statusTextColor(c, s.budget.status) }}>
                {s.budget.left >= 0
                  ? `${formatMoney(s.budget.left)} kaldı${s.budget.status === 'warn' ? ' · limite yaklaştın' : ''}`
                  : `Bütçe ${formatMoney(-s.budget.left)} aşıldı`}
              </Txt>
            </Card>
          ) : null}

          {empty ? (
            <Card>
              <Txt color="tx2">
                {month === thisMonth
                  ? 'Bu ay henüz kayıt yok. İlk harcamanı yukarıdan ekle.'
                  : 'Bu ayda kayıt yok.'}
              </Txt>
            </Card>
          ) : (
            <>
              {s.expense > 0 ? (
                <View style={{ gap: 10 }}>
                  {section('Günlük harcama')}
                  <Card>
                    <DailyBars days={s.dailyExpense} />
                  </Card>
                </View>
              ) : null}

              {expenseItems.length ? (
                <View style={{ gap: 10 }}>
                  {section('Kategoriler', formatMoney(s.expense))}
                  <Card style={{ gap: 14 }}>
                    {expenseItems.map((x) => (
                      <CategoryBar key={x.category} item={x} scale={maxExpense} />
                    ))}
                  </Card>
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <View style={{ gap: 8 }}>
        {section('Son kayıtlar')}
        {recent.isPending ? <Loading /> : null}
        {recent.isError ? (
          <ErrorCard error={recent.error} onRetry={() => void recent.refetch()} />
        ) : null}
        {recent.data && recent.data.items.length === 0 ? (
          <Txt variant="caption" color="mut">
            Bu ayda kayıt yok.
          </Txt>
        ) : null}
        {recent.data?.items.map((t) => (
          <TransactionRow
            key={t.id}
            t={t}
            onPress={() =>
              router.push({
                pathname: '/money/[id]',
                params: { id: t.id, month: t.date.slice(0, 7) },
              })
            }
          />
        ))}
        {recent.data && recent.data.items.length >= RECENT_LIMIT ? (
          <Txt variant="caption" color="mut">
            {`Son ${RECENT_LIMIT} kayıt gösteriliyor.`}
          </Txt>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        {link('Yıllık özet', '/money/year')}
        {link('Bütçe limitleri', '/money/budgets')}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  grid: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  link: {
    minHeight: HIT + 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
});
