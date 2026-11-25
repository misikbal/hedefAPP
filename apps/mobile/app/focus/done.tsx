import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  focusMinutesOf,
  formatNumber,
  interruptionChoiceOf,
  interruptionsFromChoice,
  type InterruptionChoice,
} from '@takip/shared';
import { BottomBar } from '@/components/BottomBar';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { CheckIcon } from '@/components/icons';
import { Segmented } from '@/components/Segmented';
import { errorMessage } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { finishFocus, startBreak } from '@/features/focus/actions';
import { setFocus, useFocusStore } from '@/store/focusStore';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const CHOICES = [
  { value: 'none', label: 'Hiç' },
  { value: 'some', label: '1–2' },
  { value: 'many', label: '3+' },
] as const satisfies readonly { value: InterruptionChoice; label: string }[];

export default function FocusDoneScreen() {
  const { c } = useTheme();
  const result = useFocusStore((s) => s.lastFinish);
  const session = result?.session;
  const [note, setNote] = useState(session?.note ?? '');
  const [choice, setChoice] = useState<InterruptionChoice>(
    interruptionChoiceOf(session?.interruptions ?? 0),
  );
  const [busy, setBusy] = useState<'break' | 'close' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session || !result) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={[styles.content, { flex: 1, justifyContent: 'center' }]}>
          <Txt color="tx2" style={{ textAlign: 'center' }}>
            Kaydedilecek bir seans yok.
          </Txt>
          <Button label="Odak'a dön" variant="outline" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const minutes = focusMinutesOf(session.elapsedMs);
  const title = session.reachedPeak ? `${minutes} dakika tamam` : `${minutes} dakika`;
  const { before, after, target } = result.week;

  const save = async (withBreak: boolean) => {
    setBusy(withBreak ? 'break' : 'close');
    setError(null);
    try {
      await finishFocus(session.id, {
        note: note.trim(),
        interruptions: interruptionsFromChoice(choice, session.interruptions),
      });
      setFocus({ lastFinish: null });
      if (withBreak) {
        await startBreak();
        router.back();
      } else {
        router.replace('/');
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const pct = (v: number) => `${Math.min(100, target ? (v / target) * 100 : 0)}%` as const;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.badge, { backgroundColor: c.acc }]}>
              <CheckIcon size={40} color={c.onAcc} strokeWidth={2.5} />
            </View>
            <Txt style={{ fontFamily: fonts.display, fontSize: 28 }}>{title}</Txt>
            <Txt style={{ fontSize: 15 }} color="tx2">
              {session.label}
            </Txt>
          </View>

          <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}>
            <View style={styles.cardRow}>
              <Txt variant="caption" color="mut">
                Haftalık odak
              </Txt>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }}>
                {formatNumber(before)} → {formatNumber(after)}
                {target != null ? ` / ${formatNumber(target)}` : ''} sa
              </Txt>
            </View>
            {target ? (
              <View style={[styles.bar, { backgroundColor: c.line }]}>
                <View style={{ height: 6, width: pct(before), backgroundColor: c.acc }} />
                <View
                  style={{
                    height: 6,
                    width: pct(Math.max(0, Math.min(after, target) - before)),
                    backgroundColor: c.ok,
                  }}
                />
              </View>
            ) : null}
          </View>

          <Field label="Ne yaptın?">
            <Input
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              style={styles.textarea}
            />
          </Field>

          <View style={{ gap: 6 }}>
            <Txt variant="caption" color="mut">
              Kaç kez bölündün?
            </Txt>
            <Segmented options={CHOICES} value={choice} onChange={setChoice} />
            {session.interruptions > 0 ? (
              <Txt style={{ fontSize: 12 }} color="mut">
                Uygulama {session.interruptions} kez arka plana alındı.
              </Txt>
            ) : null}
          </View>

          {error ? (
            <Txt variant="caption" color="penTx">
              {error}
            </Txt>
          ) : null}
        </ScrollView>
        <BottomBar>
          <View style={{ gap: 8 }}>
            <Button
              label="Kaydet ve 10 dk mola"
              onPress={() => void save(true)}
              loading={busy === 'break'}
              disabled={!!busy}
            />
            <Button
              label="Kaydet ve kapat"
              variant="outline"
              height={44}
              style={{ borderColor: 'transparent' }}
              onPress={() => void save(false)}
              loading={busy === 'close'}
              disabled={!!busy}
            />
          </View>
        </BottomBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  hero: { alignItems: 'center', gap: 12 },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
  textarea: { height: 96, paddingTop: 12, lineHeight: 21 },
});
