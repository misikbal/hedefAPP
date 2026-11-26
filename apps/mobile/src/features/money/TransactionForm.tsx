import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MONEY_CATEGORY_LABELS,
  categoriesOf,
  defaultCategoryOf,
  moneyAmountSchema,
  type MoneyCategory,
  type MoneyType,
} from '@takip/shared';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field, Input } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';
import { parseMoneyInput } from './format';

export interface TransactionFormValues {
  type: MoneyType;
  amount: number;
  category: MoneyCategory;
  date: string;
  /** boş = not yok */
  note: string;
}

interface Props {
  title: string;
  initial: {
    type: MoneyType;
    amount: string;
    category?: MoneyCategory;
    date: string;
    note: string;
  };
  /** Düzenlemede tür değiştirilemez (sunucu sözleşmesi) */
  typeLocked?: boolean;
  /** Yeni kayıtta tutar alanı açılışta odaklanır */
  autoFocusAmount?: boolean;
  submitting: boolean;
  error?: string;
  onSubmit: (v: TransactionFormValues) => void;
  /** Kaydet düğmesinin altında (ör. sil onayı) */
  footer?: ReactNode;
}

const TYPES = [
  { value: 'expense', label: 'Harcama' },
  { value: 'income', label: 'Gelir' },
] as const;

/** Hızlı giriş: tutar alanı açılışta odaklı, sayısal klavye; virgüllü ondalık kabul edilir. */
export function TransactionForm({
  title,
  initial,
  typeLocked,
  autoFocusAmount = true,
  submitting,
  error,
  onSubmit,
  footer,
}: Props) {
  const { c } = useTheme();
  const [type, setType] = useState<MoneyType>(initial.type);
  const [amountText, setAmountText] = useState(initial.amount);
  const [category, setCategory] = useState<MoneyCategory>(
    initial.category ?? defaultCategoryOf(initial.type),
  );
  const [date, setDate] = useState(initial.date);
  const [note, setNote] = useState(initial.note);
  const [amountError, setAmountError] = useState<string>();

  const changeType = (t: MoneyType) => {
    setType(t);
    if (!categoriesOf(t).includes(category)) setCategory(defaultCategoryOf(t));
  };

  const submit = () => {
    const n = parseMoneyInput(amountText);
    if (n === null) {
      setAmountError('Geçerli bir tutar gir (ör. 120 ya da 12,50)');
      return;
    }
    const parsed = moneyAmountSchema.safeParse(n);
    if (!parsed.success) {
      setAmountError(parsed.error.issues[0]?.message ?? 'Tutar geçersiz');
      return;
    }
    setAmountError(undefined);
    onSubmit({ type, amount: parsed.data, category, date, note: note.trim() });
  };

  const income = type === 'income';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title={title} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {typeLocked ? null : <Segmented options={TYPES} value={type} onChange={changeType} />}

          <View style={[styles.amountCard, { backgroundColor: c.s1, borderColor: c.line }]}>
            <Txt style={{ fontSize: 13, color: c.mut }}>
              {income ? 'Ne kadar geldi?' : 'Ne kadar harcadın?'}
            </Txt>
            <View style={styles.amountRow}>
              <TextInput
                autoFocus={autoFocusAmount}
                value={amountText}
                onChangeText={(t) => {
                  setAmountError(undefined);
                  setAmountText(t.replace(/[^\d.,]/g, ''));
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={c.mut}
                returnKeyType="done"
                onSubmitEditing={submit}
                accessibilityLabel="Tutar"
                maxLength={14}
                style={[
                  styles.amountInput,
                  { color: income ? c.okTx : c.tx, fontFamily: fonts.monoMedium },
                ]}
              />
              <Txt style={{ fontFamily: fonts.mono, fontSize: 28, color: c.mut }}>₺</Txt>
            </View>
            {amountError ? (
              <Txt variant="caption" color="penTx">
                {amountError}
              </Txt>
            ) : null}
          </View>

          <Field label="Kategori">
            <View style={styles.chips}>
              {categoriesOf(type).map((cat) => {
                const on = cat === category;
                return (
                  <Pressable
                    key={cat}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? c.inv : c.s1,
                        borderColor: on ? c.inv : c.line,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontSize: 14,
                        fontFamily: on ? fonts.bodySemi : fonts.body,
                        color: on ? c.onInv : c.tx,
                      }}
                    >
                      {MONEY_CATEGORY_LABELS[cat]}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Tarih">
            <DateField label="Tarih" value={date} onChange={setDate} />
          </Field>

          <Field label="Not (isteğe bağlı)">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder={income ? 'Örn. kasım maaşı' : 'Örn. öğle yemeği'}
              maxLength={200}
            />
          </Field>

          {error ? (
            <Txt variant="caption" color="penTx">
              {error}
            </Txt>
          ) : null}
          {footer}
        </ScrollView>
        <BottomBar>
          <Button
            label="Kaydet"
            disabled={!amountText.trim()}
            loading={submitting}
            onPress={submit}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  amountCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: {
    minWidth: 120,
    maxWidth: 260,
    fontSize: 48,
    lineHeight: 56,
    paddingVertical: 4,
    textAlign: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: HIT,
    paddingHorizontal: 16,
    borderRadius: HIT / 2,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
