import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  timeOfDaySchema,
  timeToMinutes,
  type Category,
} from '@takip/shared';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { TimeField } from '@/components/TimeField';
import { Txt } from '@/components/Txt';
import { useGoals } from '@/api/hooks';
import { PenaltyRulePicker } from '@/features/penalties/PenaltyRulePicker';
import { DAY_MIN, DAY_NAMES, reminderLabel } from '@/lib/date';
import { parseAmount } from '@/lib/format';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'Ne yapacağını yaz').max(80, 'En çok 80 karakter'),
    category: z.enum(CATEGORIES),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1, 'En az bir gün seç'),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    repeatWeekly: z.boolean(),
    reminderMinutes: z.number().int().nullable(),
    goalId: z.string().nullable(),
    goalAmount: z.string(),
    penaltyRuleId: z.string().nullable(),
  })
  .refine((v) => timeToMinutes(v.endTime) > timeToMinutes(v.startTime), {
    message: 'Bitiş saati başlangıçtan sonra olmalı',
    path: ['endTime'],
  })
  .refine((v) => !v.goalId || (parseAmount(v.goalAmount) ?? 0) > 0, {
    message: 'Hedefe sayılacak miktarı gir',
    path: ['goalAmount'],
  });

export type BlockFormValues = z.infer<typeof formSchema>;

/** Form değerlerini API gövdesine çevirir. */
export function toBlockBody(v: BlockFormValues) {
  const { goalAmount, ...rest } = v;
  return { ...rest, goalAmount: v.goalId ? parseAmount(goalAmount) : null };
}

const REMINDERS = [10, 30, 60, null] as const;

interface Props {
  title: string;
  initial: BlockFormValues;
  submitLabel: (dayCount: number) => string;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (values: BlockFormValues) => void;
}

export function BlockForm({
  title,
  initial,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
}: Props) {
  const { c } = useTheme();
  const { control, handleSubmit, watch } = useForm<BlockFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });
  const days = watch('daysOfWeek');
  const repeat = watch('repeatWeekly');
  const goalId = watch('goalId');
  const goals = useGoals();
  const goalList = goals.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title={title} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Field label="Ne yapacaksın?" error={fieldState.error?.message}>
                <Input
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Bisiklet · 30 km"
                  invalid={!!fieldState.error}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Field label="Kategori">
                <View style={styles.wrap}>
                  {CATEGORIES.map((cat: Category) => {
                    const on = field.value === cat;
                    return (
                      <Pressable
                        key={cat}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => field.onChange(cat)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: on ? c.s2 : 'transparent',
                            borderColor: on ? c.tx : c.line,
                          },
                        ]}
                      >
                        <View style={[styles.dot, { backgroundColor: categoryColor(c, cat) }]} />
                        <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>
                          {CATEGORY_LABELS[cat]}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="daysOfWeek"
            render={({ field, fieldState }) => (
              <Field label="Hangi günler?" error={fieldState.error?.message}>
                <View style={styles.days}>
                  {DAY_MIN.map((short, i) => {
                    const d = i + 1;
                    const on = field.value.includes(d);
                    return (
                      <Pressable
                        key={short}
                        accessibilityRole="checkbox"
                        accessibilityLabel={DAY_NAMES[i]}
                        accessibilityState={{ checked: on }}
                        onPress={() =>
                          field.onChange(
                            on
                              ? field.value.filter((x) => x !== d)
                              : [...field.value, d].sort((a, b) => a - b),
                          )
                        }
                        style={[
                          styles.day,
                          { backgroundColor: on ? c.acc : c.s1, borderColor: on ? c.acc : c.line },
                        ]}
                      >
                        <Txt
                          style={{
                            fontSize: 13,
                            fontFamily: fonts.bodySemi,
                            color: on ? c.onAcc : c.tx,
                          }}
                        >
                          {short}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
            )}
          />

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="startTime"
                render={({ field }) => (
                  <Field label="Başlangıç">
                    <TimeField label="Başlangıç" value={field.value} onChange={field.onChange} />
                  </Field>
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="endTime"
                render={({ field, fieldState }) => (
                  <Field label="Bitiş" error={fieldState.error?.message}>
                    <TimeField
                      label="Bitiş"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!fieldState.error}
                    />
                  </Field>
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="repeatWeekly"
            render={({ field }) => (
              <View style={[styles.switchRow, { backgroundColor: c.s1, borderColor: c.line }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontSize: 15 }}>Her hafta tekrarla</Txt>
                  <Txt style={{ fontSize: 12, color: c.mut }}>
                    {repeat
                      ? `Her hafta ${days.length} gün, programa otomatik eklenir`
                      : 'Yalnızca bu hafta'}
                  </Txt>
                </View>
                <Switch label="Her hafta tekrarla" value={field.value} onChange={field.onChange} />
              </View>
            )}
          />

          {goalList.length ? (
            <Controller
              control={control}
              name="goalId"
              render={({ field }) => (
                <Field label="Hedefe say">
                  <View style={styles.wrap}>
                    {[
                      ...goalList.map((g) => ({
                        id: g.id as string | null,
                        label: `${g.name} (${g.unit})`,
                      })),
                      { id: null, label: 'Sayma' },
                    ].map((o) => {
                      const on = field.value === o.id;
                      return (
                        <Pressable
                          key={o.id ?? 'none'}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => field.onChange(o.id)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: on ? c.s2 : 'transparent',
                              borderColor: on ? c.tx : c.line,
                            },
                          ]}
                        >
                          <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>{o.label}</Txt>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              )}
            />
          ) : null}

          {goalId ? (
            <Controller
              control={control}
              name="goalAmount"
              render={({ field, fieldState }) => (
                <Field
                  label={`Miktar (${goalList.find((g) => g.id === goalId)?.unit ?? ''})`}
                  error={fieldState.error?.message}
                >
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
          ) : null}

          <Controller
            control={control}
            name="penaltyRuleId"
            render={({ field }) => (
              <PenaltyRulePicker
                label="Kaçırırsam ceza"
                trigger="block_missed"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="reminderMinutes"
            render={({ field }) => (
              <Field label="Hatırlatma">
                <View style={styles.wrap}>
                  {REMINDERS.map((m) => {
                    const on = field.value === m;
                    return (
                      <Pressable
                        key={String(m)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => field.onChange(m)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: on ? c.s2 : 'transparent',
                            borderColor: on ? c.tx : c.line,
                          },
                        ]}
                      >
                        <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>
                          {reminderLabel(m)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
            )}
          />

          {serverError ? (
            <Txt variant="caption" color="penTx">
              {serverError}
            </Txt>
          ) : null}
        </ScrollView>
        <BottomBar>
          <Button
            label={submitLabel(days.length)}
            loading={submitting}
            onPress={() => void handleSubmit(onSubmit)()}
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
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: HIT,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
