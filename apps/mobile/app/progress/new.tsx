import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENT_PERIOD_LABELS, UNIT_INPUT, formatNumber } from '@takip/shared';
import { useGoals, useLogProgress } from '@/api/hooks';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { ProgressBar } from '@/components/ProgressBar';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const round = (n: number) => Math.round(n * 10) / 10;

export default function ProgressEntryScreen() {
  const { goalId } = useLocalSearchParams<{ goalId?: string }>();
  const { c } = useTheme();
  const goals = useGoals();
  const log = useLogProgress();
  const list = goals.data ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>(goalId);
  const goal = list.find((g) => g.id === selectedId) ?? list[0];
  const input = goal ? UNIT_INPUT[goal.unit] : UNIT_INPUT.adet;
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');

  // Hedef değişince miktar o birimin orta hızlı değerine döner (tasarımdaki gibi).
  const goalKey = goal ? `${goal.id}:${goal.unit}` : '';
  useEffect(() => {
    const unit = goalKey.split(':')[1] as keyof typeof UNIT_INPUT | undefined;
    if (unit) setAmount(UNIT_INPUT[unit].quick[1] ?? 1);
  }, [goalKey]);

  if (!goal) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <SubHeader title="İlerleme gir" />
        <View style={{ padding: 20, gap: 14 }}>
          {goals.isPending ? <Loading /> : null}
          {goals.isError ? <ErrorCard error={goals.error} /> : null}
          {goals.data && list.length === 0 ? (
            <>
              <Txt color="tx2">İlerleme girebilmek için önce bir hedef ekle.</Txt>
              <Button label="Hedef ekle" onPress={() => router.replace('/goals/new')} />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const after = round(goal.current + amount);
  const left = round(goal.target - after);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="İlerleme gir" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.goalGrid}>
            {list.map((g) => {
              const on = g.id === goal.id;
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setSelectedId(g.id)}
                  style={[
                    styles.goalBtn,
                    { backgroundColor: on ? c.s2 : c.s1, borderColor: on ? c.tx : c.line },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: categoryColor(c, g.category) }]} />
                  <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.body }}>
                    {g.name}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.amountCard, { backgroundColor: c.s1, borderColor: c.line }]}>
            <Txt style={{ fontSize: 13, color: c.mut }}>
              {goal.period === 'daily' ? 'Bugün ne kadar?' : 'Ne kadar ekleyelim?'}
            </Txt>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Azalt"
                onPress={() => setAmount((a) => Math.max(0, round(a - input.step)))}
                style={[styles.stepBtn, { borderColor: c.line, backgroundColor: c.s2 }]}
              >
                <Txt style={{ fontSize: 24 }}>−</Txt>
              </Pressable>
              <View style={styles.amount}>
                <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 56, lineHeight: 60 }}>
                  {formatNumber(amount)}
                </Txt>
                <Txt style={{ fontSize: 14, color: c.mut }}>{goal.unit}</Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Artır"
                onPress={() => setAmount((a) => round(a + input.step))}
                style={[styles.stepBtn, { borderColor: c.line, backgroundColor: c.s2 }]}
              >
                <Txt style={{ fontSize: 24 }}>+</Txt>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {input.quick.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatNumber(q)} ${goal.unit} ekle`}
                  onPress={() => setAmount((a) => round(a + q))}
                  style={[styles.quick, { borderColor: c.line }]}
                >
                  <Txt
                    style={{ fontFamily: fonts.mono, fontSize: 13 }}
                  >{`+${formatNumber(q)}`}</Txt>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.preview, { backgroundColor: c.s1, borderColor: c.line }]}>
            <View style={styles.previewHead}>
              <Txt style={{ fontSize: 13, color: c.mut }}>{CURRENT_PERIOD_LABELS[goal.period]}</Txt>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }}>
                {`${formatNumber(goal.current)} → ${formatNumber(after)} / ${formatNumber(goal.target)} ${goal.unit}`}
              </Txt>
            </View>
            <ProgressBar
              height={6}
              value={goal.current / goal.target}
              extra={amount / goal.target}
            />
            <Txt style={{ fontSize: 13, color: c.okTx }}>
              {left > 0
                ? `Hedefe ${formatNumber(left)} ${goal.unit} kaldı.`
                : 'Hedef tamam! Seri devam ediyor.'}
            </Txt>
          </View>

          <Field label="Not (isteğe bağlı)">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Örn. rüzgar vardı, tempo düşük"
              maxLength={200}
            />
          </Field>
          {log.isError ? (
            <Txt variant="caption" color="penTx">
              {errorMessage(log.error)}
            </Txt>
          ) : null}
        </ScrollView>
        <BottomBar>
          <Button
            label="Kaydet"
            disabled={amount <= 0}
            loading={log.isPending}
            onPress={() =>
              log.mutate(
                { goalId: goal.id, amount, ...(note.trim() ? { note: note.trim() } : {}) },
                { onSuccess: () => router.back() },
              )
            }
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  goalBtn: {
    width: '48.5%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 2 },
  amountCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 14,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: { minWidth: 120, alignItems: 'center' },
  quick: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  preview: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  previewHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
