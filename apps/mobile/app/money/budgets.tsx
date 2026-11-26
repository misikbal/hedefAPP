import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  EXPENSE_CATEGORIES,
  MONEY_CATEGORY_LABELS,
  formatMoney,
  moneyAmountSchema,
  type Budget,
  type MoneyMonthSummary,
} from '@takip/shared';
import { useBudgets, useMoneySummary, useSetBudget } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Field';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { currentMonth, moneyToInput, parseMoneyInput } from '@/features/money/format';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

type BudgetCategory = Budget['category'];

interface RowProps {
  category: BudgetCategory;
  label: string;
  limit: number | null;
  spent: number | null;
  first?: boolean;
}

/** Tek limit satırı: alan + değişince Kaydet, limit varsa Kaldır. */
function BudgetRow({ category, label, limit, spent, first }: RowProps) {
  const { c } = useTheme();
  const set = useSetBudget();
  const initial = limit === null ? '' : moneyToInput(limit);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string>();
  const dirty = text.trim() !== initial;

  const save = () => {
    if (!text.trim()) {
      if (limit !== null) set.mutate({ category, monthlyLimit: null });
      return;
    }
    const n = parseMoneyInput(text);
    const parsed = moneyAmountSchema.safeParse(n ?? Number.NaN);
    if (!parsed.success) {
      setError(n === null ? 'Geçerli bir tutar gir' : parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    set.mutate(
      { category, monthlyLimit: parsed.data },
      { onSuccess: () => setText(moneyToInput(parsed.data)) },
    );
  };

  return (
    <View style={[styles.row, { borderColor: c.line, borderTopWidth: first ? 0 : 1 }]}>
      <View style={styles.rowHead}>
        <Txt style={{ fontSize: 15, flex: 1 }}>{label}</Txt>
        {spent !== null ? (
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12, color: c.mut }}>
            {`bu ay ${formatMoney(spent)}`}
          </Txt>
        ) : null}
      </View>
      <View style={styles.rowInput}>
        <Input
          mono
          value={text}
          onChangeText={(t) => {
            setError(undefined);
            setText(t.replace(/[^\d.,]/g, ''));
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="Limit yok"
          accessibilityLabel={`${label} aylık limit`}
          returnKeyType="done"
          onSubmitEditing={save}
          maxLength={14}
          style={{ flex: 1 }}
        />
        {dirty ? (
          <Button
            label="Kaydet"
            height={44}
            loading={set.isPending}
            onPress={save}
            style={{ minWidth: 96 }}
          />
        ) : limit !== null ? (
          <Button
            label="Kaldır"
            variant="outline"
            height={44}
            loading={set.isPending}
            onPress={() =>
              set.mutate({ category, monthlyLimit: null }, { onSuccess: () => setText('') })
            }
            style={{ minWidth: 96 }}
          />
        ) : null}
      </View>
      {error ? (
        <Txt variant="caption" color="penTx">
          {error}
        </Txt>
      ) : null}
      {set.isError ? (
        <Txt variant="caption" color="penTx">
          {errorMessage(set.error)}
        </Txt>
      ) : null}
    </View>
  );
}

const spentOf = (s: MoneyMonthSummary | undefined, category: BudgetCategory) => {
  if (!s) return null;
  if (category === null) return s.expense;
  return s.expenseByCategory.find((x) => x.category === category)?.total ?? 0;
};

export default function BudgetsScreen() {
  const { c } = useTheme();
  const budgets = useBudgets();
  const summary = useMoneySummary(currentMonth());
  const limitOf = (category: BudgetCategory) =>
    budgets.data?.find((b) => b.category === category)?.monthlyLimit ?? null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Bütçe limitleri" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Txt variant="caption" color="mut">
            Aylık limitler her ay baştan sayılır. Harcama limitin yüzde 80'ine gelince uyarı rengi,
            aşınca kırmızı görünür. Alanı boşaltıp kaydetmek limiti kaldırır.
          </Txt>
          {budgets.isPending ? <Loading /> : null}
          {budgets.isError ? (
            <ErrorCard error={budgets.error} onRetry={() => void budgets.refetch()} />
          ) : null}
          {budgets.data ? (
            <>
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                <BudgetRow
                  key={`total:${limitOf(null) ?? ''}`}
                  category={null}
                  label="Toplam harcama"
                  limit={limitOf(null)}
                  spent={spentOf(summary.data, null)}
                  first
                />
              </Card>
              <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
                Kategoriler
              </Txt>
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {EXPENSE_CATEGORIES.map((cat, i) => (
                  <BudgetRow
                    key={`${cat}:${limitOf(cat) ?? ''}`}
                    category={cat}
                    label={MONEY_CATEGORY_LABELS[cat]}
                    limit={limitOf(cat)}
                    spent={spentOf(summary.data, cat)}
                    first={i === 0}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  row: { gap: 8, paddingVertical: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
