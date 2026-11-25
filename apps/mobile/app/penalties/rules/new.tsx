import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DEADLINE_OPTIONS,
  ON_FAIL_LABELS,
  PENALTY_ON_FAIL,
  PENALTY_TRIGGERS,
  PRESET_PENALTIES,
  TRIGGER_LABELS,
  blockShortTitle,
  goalPhrase,
  penaltyRuleCreateSchema,
  ruleSentence,
  type Category,
  type PenaltyDeadline,
  type PenaltyOnFail,
  type PenaltyTargetType,
  type PenaltyTrigger,
} from '@takip/shared';
import { useBlocks, useCreatePenaltyRule, useGoals } from '@/api/hooks';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

interface Target {
  key: string;
  label: string;
  targetType: PenaltyTargetType;
  targetId?: string;
  category?: Category;
  /** Önizleme cümlesi için blok kısa adı ya da hedef ifadesi */
  phrase?: string;
}

const TRIGGER_OPTIONS = PENALTY_TRIGGERS.map((t) => ({ value: t, label: TRIGGER_LABELS[t] }));
const WHICH_LABEL: Record<PenaltyTrigger, string> = {
  block_missed: 'Hangi blok?',
  goal_failed: 'Hangi hedef?',
  penalty_postponed: 'Hangi ceza?',
};
const isTrigger = (v: unknown): v is PenaltyTrigger =>
  (PENALTY_TRIGGERS as readonly unknown[]).includes(v);

export default function NewPenaltyRuleScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const blocks = useBlocks();
  const goals = useGoals();
  const create = useCreatePenaltyRule();

  const [trigger, setTrigger] = useState<PenaltyTrigger>(
    isTrigger(params.trigger) ? params.trigger : 'block_missed',
  );
  const [targetKey, setTargetKey] = useState('any');
  const [preset, setPreset] = useState<number | null>(0);
  const [penalty, setPenalty] = useState<string>(PRESET_PENALTIES[0].text);
  const [deadlineIdx, setDeadlineIdx] = useState(0);
  const [onFail, setOnFail] = useState<PenaltyOnFail>('double');
  const [formError, setFormError] = useState<string | null>(null);

  const targets = useMemo<Target[]>(() => {
    if (trigger === 'penalty_postponed') {
      return [{ key: 'any', label: 'Tüm cezalar', targetType: 'any' }];
    }
    if (trigger === 'goal_failed') {
      return [
        { key: 'any', label: 'Tüm hedefler', targetType: 'any' },
        ...(goals.data ?? []).map((g) => ({
          key: `goal:${g.id}`,
          label: `${g.name} · ${goalPhrase(g).slice(g.name.length + 1)}`,
          targetType: 'goal' as const,
          targetId: g.id,
          phrase: goalPhrase(g),
        })),
      ];
    }
    return [
      { key: 'any', label: 'Tüm bloklar', targetType: 'any' },
      ...CATEGORIES.map((cat) => ({
        key: `cat:${cat}`,
        label: `Tüm ${CATEGORY_LABELS[cat].toLocaleLowerCase('tr-TR')} blokları`,
        targetType: 'category' as const,
        category: cat,
      })),
      ...(blocks.data ?? []).map((b) => ({
        key: `block:${b.id}`,
        label: b.title,
        targetType: 'block' as const,
        targetId: b.id,
        phrase: blockShortTitle(b.title),
      })),
    ];
  }, [trigger, goals.data, blocks.data]);

  const target = targets.find((t) => t.key === targetKey) ?? targets[0]!;
  const deadline: PenaltyDeadline = DEADLINE_OPTIONS[deadlineIdx]!.value;
  const preview = ruleSentence({
    trigger,
    targetType: target.targetType,
    category: target.category ?? null,
    targetLabel: target.phrase ?? null,
    penalty: penalty.trim() || '…',
    deadline,
    onFail,
  });

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? c.s2 : 'transparent', borderColor: on ? c.tx : c.line },
  ];

  function save() {
    const body = {
      trigger,
      targetType: target.targetType,
      targetId: target.targetId ?? null,
      category: target.category ?? null,
      penalty,
      deadline,
      onFail,
    };
    const parsed = penaltyRuleCreateSchema.safeParse(body);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Kural eksik');
      return;
    }
    setFormError(null);
    create.mutate(body, { onSuccess: () => router.back() });
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Yeni ceza kuralı" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Ne olunca?">
            <Segmented
              options={TRIGGER_OPTIONS}
              value={trigger}
              onChange={(t) => {
                setTrigger(t);
                setTargetKey('any');
              }}
            />
          </Field>

          <Field label={WHICH_LABEL[trigger]}>
            <View style={styles.wrap}>
              {targets.map((t) => (
                <Pressable
                  key={t.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: t.key === target.key }}
                  onPress={() => setTargetKey(t.key)}
                  style={chip(t.key === target.key)}
                >
                  <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>{t.label}</Txt>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Ceza">
            <View style={styles.wrap}>
              {PRESET_PENALTIES.map((p, i) => {
                const on = preset === i;
                return (
                  <Pressable
                    key={p.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    hitSlop={4}
                    onPress={() => {
                      setPreset(i);
                      setPenalty(p.text);
                    }}
                    style={[
                      styles.penChip,
                      {
                        backgroundColor: on ? c.pen : 'transparent',
                        borderColor: on ? c.pen : c.line,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontSize: 14,
                        fontFamily: fonts.body,
                        color: on ? '#FFFFFF' : c.tx,
                      }}
                    >
                      {p.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Ayrıntı">
            <Input
              value={penalty}
              onChangeText={(t) => {
                setPenalty(t);
                setPreset(PRESET_PENALTIES.findIndex((p) => p.text === t.trim()));
              }}
              maxLength={80}
              placeholder="3 dk soğuk duş"
            />
          </Field>

          <Field label="Yapma süresi">
            <View style={styles.wrap}>
              {DEADLINE_OPTIONS.map((d, i) => (
                <Pressable
                  key={d.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: deadlineIdx === i }}
                  onPress={() => setDeadlineIdx(i)}
                  style={chip(deadlineIdx === i)}
                >
                  <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>{d.label}</Txt>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Yapmazsam">
            <View style={styles.wrap}>
              {PENALTY_ON_FAIL.map((f) => (
                <Pressable
                  key={f}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: onFail === f }}
                  onPress={() => setOnFail(f)}
                  style={chip(onFail === f)}
                >
                  <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>{ON_FAIL_LABELS[f]}</Txt>
                </Pressable>
              ))}
            </View>
            {onFail === 'reset_streak' ? (
              <Txt style={{ fontSize: 12, color: c.mut }}>
                Bloğun bağlı olduğu ya da tutmayan hedefin serisi sıfırlanır.
              </Txt>
            ) : null}
          </Field>

          <View style={[styles.preview, { backgroundColor: c.penBg, borderColor: c.pen }]}>
            <Txt style={{ fontFamily: fonts.mono, fontSize: 11, color: c.penTx }}>KURAL</Txt>
            <Txt style={{ fontSize: 15, lineHeight: 22 }}>{preview}</Txt>
          </View>

          {formError || create.isError ? (
            <Txt variant="caption" color="penTx">
              {formError ?? errorMessage(create.error)}
            </Txt>
          ) : null}
        </ScrollView>
        <BottomBar>
          <Button label="Kuralı kaydet" loading={create.isPending} onPress={save} />
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: HIT,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  penChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  preview: { gap: 4, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
});
