import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import {
  APP_TIMEZONE,
  JOURNAL_TEXT_MAX,
  addDays,
  dayStatChips,
  journalDateOf,
  journalPreview,
  localDateSchema,
  type JournalDay,
} from '@takip/shared';
import { useJournalDay, useJournalRecent, useSaveJournal } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { CalendarIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { MoodDot, MoodPicker } from '@/features/journal/MoodPicker';
import { dayMonthLabel, nowTimeLocal, todayEyebrow, todayLocal } from '@/lib/date';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const text = z.string().max(JOURNAL_TEXT_MAX, `En çok ${JOURNAL_TEXT_MAX} karakter`);
const formSchema = z.object({
  mood: z.number({ message: 'Günün nasıl geçtiğini seç' }).int().min(0).max(4),
  wentWell: text,
  hard: text,
  tomorrowOne: text,
});
type FormValues = z.input<typeof formSchema>;

function JournalForm({ day }: { day: JournalDay }) {
  const save = useSaveJournal(day.date);
  const [saved, setSaved] = useState(false);
  const e = day.entry;
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mood: e?.mood as number,
      wentWell: e?.wentWell ?? '',
      hard: e?.hard ?? '',
      tomorrowOne: e?.tomorrowOne ?? '',
    },
  });

  const submit = handleSubmit((v) => {
    setSaved(false);
    save.mutate(v as z.output<typeof formSchema>, { onSuccess: () => setSaved(true) });
  });

  const area = (
    name: 'wentWell' | 'hard' | 'tomorrowOne',
    label: string,
    rows: number,
    placeholder?: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} error={fieldState.error?.message}>
          <Input
            value={field.value}
            onChangeText={(t) => {
              setSaved(false);
              field.onChange(t);
            }}
            onBlur={field.onBlur}
            multiline={rows > 1}
            textAlignVertical="top"
            placeholder={placeholder}
            maxLength={JOURNAL_TEXT_MAX}
            invalid={!!fieldState.error}
            style={rows > 1 ? { height: rows * 21 + 26, paddingTop: 12, lineHeight: 21 } : null}
          />
        </Field>
      )}
    />
  );

  return (
    <>
      <View style={{ gap: 8 }}>
        <Txt variant="caption" color="mut">
          Gün nasıl geçti?
        </Txt>
        <Controller
          control={control}
          name="mood"
          render={({ field, fieldState }) => (
            <>
              <MoodPicker
                value={typeof field.value === 'number' ? field.value : null}
                onChange={(m) => {
                  setSaved(false);
                  field.onChange(m);
                }}
              />
              {fieldState.error ? (
                <Txt variant="caption" color="penTx">
                  {fieldState.error.message}
                </Txt>
              ) : null}
            </>
          )}
        />
      </View>
      {area('wentWell', 'Ne iyi gitti?', 3)}
      {area('hard', 'Ne zorladı?', 2, 'Kısa yaz, yeter.')}
      {area('tomorrowOne', 'Yarın için tek bir şey', 1, 'Örn. kitaba erken başla')}
      <Button
        label={saved && !formState.isDirty ? 'Kaydedildi' : 'Kaydet'}
        onPress={() => void submit()}
        loading={save.isPending}
      />
      {save.error ? (
        <Txt variant="caption" color="penTx">
          {errorMessage(save.error)}
        </Txt>
      ) : null}
    </>
  );
}

export default function JournalScreen() {
  const { c } = useTheme();
  const now = useNow(30_000);
  const params = useLocalSearchParams<{ date?: string }>();
  const defaultDate = journalDateOf(new Date(now), APP_TIMEZONE);
  const calendarToday = todayLocal(new Date(now));
  const [date, setDate] = useState(defaultDate);

  // Takvimden "Düzenle" ile gelinen gün
  useEffect(() => {
    const p = localDateSchema.safeParse(params.date);
    if (p.success && p.data <= calendarToday) setDate(p.data);
  }, [params.date, calendarToday]);

  const day = useJournalDay(date);
  const recent = useJournalRecent(date, 5);
  const chips = day.data ? dayStatChips(day.data.stats) : [];
  // 00:00–04:00 arası günlük varsayılan olarak düne yazılır; bugüne geçilebilir.
  const switchable = defaultDate !== calendarToday || date !== defaultDate;

  return (
    <Screen
      eyebrow={`${dayMonthLabel(date)} · ${nowTimeLocal(new Date(now))}`}
      title="Günlük"
      refreshing={day.isRefetching}
      onRefresh={() => {
        void day.refetch();
        void recent.refetch();
      }}
      right={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/journal/calendar')}
          style={[styles.calendarBtn, { backgroundColor: c.s1, borderColor: c.line }]}
        >
          <CalendarIcon color={c.tx} />
          <Txt style={{ fontSize: 13 }}>Takvim</Txt>
        </Pressable>
      }
    >
      {switchable ? (
        <View style={styles.chips}>
          {[
            { d: addDays(calendarToday, -1), label: 'Dün' },
            { d: calendarToday, label: 'Bugün' },
          ].map(({ d, label }) => {
            const on = d === date;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setDate(d)}
                style={[
                  styles.dayChip,
                  { backgroundColor: on ? c.inv : c.s1, borderColor: on ? c.inv : c.line },
                ]}
              >
                <Txt style={{ fontSize: 13, color: on ? c.onInv : c.tx }}>{label}</Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((ch) => (
            <View
              key={ch.text}
              style={[styles.chip, { backgroundColor: c.s1, borderColor: c.line }]}
            >
              <Txt
                style={{ fontFamily: fonts.mono, fontSize: 11 }}
                color={ch.tone === 'penalty' ? 'penTx' : 'tx2'}
              >
                {ch.text}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {day.isPending ? (
        <Loading />
      ) : day.error ? (
        <ErrorCard error={day.error} onRetry={() => void day.refetch()} />
      ) : (
        <JournalForm key={`${date}:${day.data.entry?.updatedAt ?? 'new'}`} day={day.data} />
      )}

      <View style={[styles.past, { borderTopColor: c.line }]}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 18 }}>Önceki günler</Txt>
        {recent.data?.length === 0 ? (
          <Txt variant="caption" color="mut">
            Henüz önceki bir kayıt yok.
          </Txt>
        ) : null}
        {recent.data?.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => setDate(e.date)}
            style={[styles.pastRow, { backgroundColor: c.s1, borderColor: c.line }]}
          >
            <View style={{ marginTop: 4 }}>
              <MoodDot mood={e.mood} size={10} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
                {todayEyebrow(e.date)}
              </Txt>
              <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2" numberOfLines={1}>
                {journalPreview(e) || '—'}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: HIT,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  dayChip: {
    minHeight: HIT,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  past: { gap: 8, borderTopWidth: 1, paddingTop: 16 },
  pastRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
