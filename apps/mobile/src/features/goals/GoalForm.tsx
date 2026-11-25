import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GOAL_PERIODS,
  GOAL_UNITS,
  PERIOD_LABELS,
  formatNumber,
  localDateSchema,
  type GoalPeriod,
} from '@takip/shared';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Field, Input } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import { PenaltyRulePicker } from '@/features/penalties/PenaltyRulePicker';
import { parseAmount } from '@/lib/format';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Hedef adı gerekli').max(60, 'En çok 60 karakter'),
  target: z.string().refine((s) => (parseAmount(s) ?? 0) > 0, 'Sıfırdan büyük bir miktar gir'),
  unit: z.enum(GOAL_UNITS),
  period: z.enum(GOAL_PERIODS),
  category: z.enum(CATEGORIES),
  startDate: localDateSchema,
  trackStreak: z.boolean(),
  penaltyRuleId: z.string().nullable(),
});
export type GoalFormValues = z.infer<typeof formSchema>;

const PERIOD_OPTIONS = GOAL_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }));

function summary(period: GoalPeriod, targetText: string, unit: string): string {
  const t = parseAmount(targetText) ?? 0;
  const n = formatNumber(t);
  if (period === 'daily')
    return `Her gün ${n} ${unit}. Haftada ${formatNumber(t * 7)} ${unit} eder.`;
  if (period === 'weekly') return `Haftada toplam ${n} ${unit}. Pazar gecesi kontrol edilir.`;
  return `Ayda toplam ${n} ${unit}. Ayın son günü kontrol edilir.`;
}

interface Props {
  title: string;
  initial: GoalFormValues;
  submitLabel: string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (values: GoalFormValues & { targetValue: number }) => void;
  /** Düzenleme ekranında silme alanı */
  footer?: ReactNode;
}

export function GoalForm({
  title,
  initial,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  footer,
}: Props) {
  const { c } = useTheme();
  const { control, handleSubmit, watch } = useForm<GoalFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });
  const [period, target, unit] = watch(['period', 'target', 'unit']);

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? c.s2 : 'transparent', borderColor: on ? c.tx : c.line },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title={title} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field label="Hedef" error={fieldState.error?.message}>
                <Input
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Kitap okumak"
                  invalid={!!fieldState.error}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="target"
            render={({ field, fieldState }) => (
              <Field label="Miktar" error={fieldState.error?.message}>
                <Input
                  mono
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="decimal-pad"
                  invalid={!!fieldState.error}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="unit"
            render={({ field }) => (
              <Field label="Birim">
                <View style={styles.wrap}>
                  {GOAL_UNITS.map((u) => (
                    <Pressable
                      key={u}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: field.value === u }}
                      onPress={() => field.onChange(u)}
                      style={chip(field.value === u)}
                    >
                      <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>{u}</Txt>
                    </Pressable>
                  ))}
                </View>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="period"
            render={({ field }) => (
              <Field label="Ne sıklıkla?">
                <Segmented options={PERIOD_OPTIONS} value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />

          <View style={[styles.box, { backgroundColor: c.s1, borderColor: c.line }]}>
            <Txt variant="label" color="mut">
              ÖZET
            </Txt>
            <Txt style={{ fontSize: 15, lineHeight: 22 }}>{summary(period, target, unit)}</Txt>
          </View>

          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Field label="Kategori">
                <View style={styles.wrap}>
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: field.value === cat }}
                      onPress={() => field.onChange(cat)}
                      style={chip(field.value === cat)}
                    >
                      <View style={[styles.dot, { backgroundColor: categoryColor(c, cat) }]} />
                      <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>
                        {CATEGORY_LABELS[cat]}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <Field label="Başlangıç">
                <DateField label="Başlangıç" value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="penaltyRuleId"
            render={({ field }) => (
              <PenaltyRulePicker
                label="Tutmazsa ceza"
                trigger="goal_failed"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="trackStreak"
            render={({ field }) => (
              <View style={[styles.switchRow, { backgroundColor: c.s1, borderColor: c.line }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontSize: 15 }}>Seri say</Txt>
                  <Txt style={{ fontSize: 12, color: c.mut }}>
                    Üst üste tutulan gün/haftaları göster
                  </Txt>
                </View>
                <Switch label="Seri say" value={field.value} onChange={field.onChange} />
              </View>
            )}
          />

          {serverError ? (
            <Txt variant="caption" color="penTx">
              {serverError}
            </Txt>
          ) : null}
          {footer}
        </ScrollView>
        <BottomBar>
          <Button
            label={submitLabel}
            loading={submitting}
            onPress={() =>
              void handleSubmit((v) =>
                onSubmit({ ...v, targetValue: parseAmount(v.target) ?? 0 }),
              )()
            }
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 16, gap: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: HIT,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 2 },
  box: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
