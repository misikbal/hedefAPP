import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  FOCUS_MINUTES,
  focusElapsedMs,
  focusLevel,
  focusMinutesOf,
  focusProgress,
  focusRemainingMs,
  formatClock,
  formatDuration,
  formatNumber,
  type FocusSession,
} from '@takip/shared';
import { useFocusLabels, useFocusWeek } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { ResetIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { MountainClimb } from '@/features/focus/MountainClimb';
import { WeekPeaks } from '@/features/focus/WeekPeaks';
import {
  abandonFocus,
  endBreak,
  finishFocus,
  finishIfDone,
  pauseFocus,
  resumeFocus,
  startFocus,
} from '@/features/focus/actions';
import { todayLocal } from '@/lib/date';
import { useNow } from '@/lib/useNow';
import { focusNow, setFocus, useFocusStore } from '@/store/focusStore';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');
const capital = (s: string) => s.charAt(0) + s.slice(1).toLocaleLowerCase('tr-TR');

function backgroundText(ms: number): string {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec} sn` : formatDuration(sec / 60);
}

function stateLabel(session: FocusSession | null, summit: boolean): string {
  if (session?.status === 'running') return 'tırmanıyorsun';
  if (session?.status === 'paused') return 'mola · tırmanış duraklatıldı';
  if (summit) return 'zirvedesin — bayrak dikildi';
  return 'yola çıkmaya hazır';
}

export default function FocusScreen() {
  const { c } = useTheme();
  useNow(1000);
  const now = focusNow();
  const session = useFocusStore((s) => s.session);
  const lastFinish = useFocusStore((s) => s.lastFinish);
  const plannedPick = useFocusStore((s) => s.plannedMinutes);
  const labelPick = useFocusStore((s) => s.label);
  const breakEndsAt = useFocusStore((s) => s.breakEndsAt);
  const week = useFocusWeek();
  const labels = useFocusLabels();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [customLabel, setCustomLabel] = useState(false);

  // Süre dolunca seans otomatik biter (ekran açıkken).
  useEffect(() => {
    if (session?.status === 'running' && focusRemainingMs(session, now) <= 0) finishIfDone();
  });

  const recent = labels.data ?? [];
  useEffect(() => {
    if (!labelPick && recent[0]) setFocus({ label: recent[0] });
  }, [labelPick, recent]);

  const finished = !session ? lastFinish?.session : undefined;
  const summit = !!finished && finished.status === 'completed' && finished.reachedPeak;
  const planned = session?.plannedMinutes ?? finished?.plannedMinutes ?? plannedPick;
  const progress = session ? focusProgress(session, now) : summit ? 1 : 0;
  const remaining = session ? focusRemainingMs(session, now) : summit ? 0 : planned * 60_000;

  // Üst etiket: bugün biten seanslar + sürmekte olan seans
  const todayMinutes =
    (week.data?.today.minutes ?? 0) +
    (session && session.date === todayLocal(new Date(now))
      ? focusMinutesOf(focusElapsedMs(session, now))
      : 0);
  const eyebrow = `BUGÜN ${week.data?.today.peaks ?? 0} ZİRVE · ${upper(formatDuration(todayMinutes))}`;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    if (session?.status === 'running') return run(() => pauseFocus(session.id));
    if (session?.status === 'paused') return run(() => resumeFocus(session.id));
    const label = labelPick.trim();
    if (!label) {
      setCustomLabel(true);
      setError('Ne üzerinde çalıştığını yaz.');
      return;
    }
    return run(() => startFocus({ label, plannedMinutes: plannedPick }));
  };

  const reset = () => {
    if (session) setConfirmReset(true);
    else if (lastFinish) setFocus({ lastFinish: null });
  };

  const finishAndSave = () => {
    if (session) {
      void run(async () => {
        await finishFocus(session.id);
        router.push('/focus/done');
      });
    } else if (lastFinish) {
      router.push('/focus/done');
    }
  };

  const mainLabel =
    session?.status === 'running'
      ? 'Duraklat'
      : session?.status === 'paused'
        ? 'Devam et'
        : 'Başlat';
  const breakLeft = breakEndsAt ? breakEndsAt - Date.now() : 0;

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? c.s2 : c.s1, borderColor: on ? c.tx : c.line },
  ];

  return (
    <Screen
      eyebrow={eyebrow}
      title="Odak"
      refreshing={week.isRefetching}
      onRefresh={() => {
        void week.refetch();
        void labels.refetch();
      }}
    >
      {breakLeft > 0 ? (
        <View style={[styles.break, { backgroundColor: c.s1, borderColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="label" color="mut">
              MOLA
            </Txt>
            <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 22 }}>
              {formatClock(breakLeft)}
            </Txt>
          </View>
          <Button
            label="Molayı bitir"
            variant="outline"
            height={HIT}
            onPress={() => void endBreak()}
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Txt style={{ fontSize: 12 }} color="mut">
          Ne üzerinde çalışıyorsun?
        </Txt>
        {session ? (
          <View style={[styles.fixedLabel, { backgroundColor: c.s1, borderColor: c.line }]}>
            <Txt numberOfLines={1}>{session.label}</Txt>
          </View>
        ) : (
          <>
            {recent.length ? (
              <View style={styles.chips}>
                {recent.map((l) => {
                  const on = !customLabel && l === labelPick;
                  return (
                    <Pressable
                      key={l}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setCustomLabel(false);
                        setFocus({ label: l });
                      }}
                      style={chip(on)}
                    >
                      <Txt style={{ fontSize: 13 }} numberOfLines={1}>
                        {l}
                      </Txt>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: customLabel }}
                  onPress={() => {
                    setCustomLabel(true);
                    setFocus({ label: '' });
                  }}
                  style={chip(customLabel)}
                >
                  <Txt style={{ fontSize: 13 }} color="mut">
                    + Yeni
                  </Txt>
                </Pressable>
              </View>
            ) : null}
            {customLabel || !recent.length ? (
              <Input
                value={labelPick}
                onChangeText={(t) => setFocus({ label: t })}
                placeholder="Örn. KODMIS — tema editörü"
                maxLength={60}
                autoFocus={customLabel}
                accessibilityLabel="Ne üzerinde çalışıyorsun?"
              />
            ) : null}
          </>
        )}
      </View>

      <MountainClimb plannedMinutes={planned} progress={progress} flag={summit} />

      <View style={styles.clockBox}>
        <Txt style={[styles.clock, { color: c.tx }]} accessibilityRole="timer">
          {formatClock(remaining)}
        </Txt>
        <Txt style={{ fontSize: 13 }} color="mut">
          {stateLabel(session, summit)}
        </Txt>
        {session && session.interruptions > 0 ? (
          <Txt style={{ fontSize: 13 }} color="penTx">
            bölündü{session.interruptions > 1 ? ` ×${session.interruptions}` : ''} · arka planda{' '}
            {backgroundText(session.backgroundMs)}
          </Txt>
        ) : null}
      </View>

      <View style={styles.lengths}>
        {FOCUS_MINUTES.map((m) => {
          const on = m === planned;
          const level = focusLevel(m);
          const locked = !!session;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: locked }}
              disabled={locked}
              onPress={() => setFocus({ plannedMinutes: m, lastFinish: null })}
              style={[
                styles.length,
                {
                  backgroundColor: on ? c.inv : c.s1,
                  borderColor: on ? c.inv : c.line,
                  opacity: locked && !on ? 0.5 : 1,
                },
              ]}
            >
              <Txt style={{ fontFamily: fonts.mono, fontSize: 14, color: on ? c.onInv : c.tx }}>
                {m} dk
              </Txt>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 11, color: on ? c.onInv : c.mut }}>
                {capital(level.name)} · {formatNumber(level.altitude)} m
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {confirmReset && session ? (
        <View style={[styles.confirm, { backgroundColor: c.penBg, borderColor: c.pen }]}>
          <Txt color="tx">Seans sıfırlansın mı? Bu tırmanış kaydedilmez ve hedefe eklenmez.</Txt>
          <View style={styles.row}>
            <Button
              label="Vazgeç"
              variant="outline"
              height={HIT}
              style={{ flex: 1 }}
              onPress={() => setConfirmReset(false)}
            />
            <Button
              label="Sıfırla"
              variant="dangerSolid"
              height={HIT}
              style={{ flex: 1 }}
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await abandonFocus(session.id);
                  setConfirmReset(false);
                })
              }
            />
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void toggle()}
            style={({ pressed }) => [
              styles.main,
              { backgroundColor: c.acc, opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: c.onAcc }}>
              {mainLabel}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sıfırla"
            onPress={reset}
            style={[styles.reset, { backgroundColor: c.s1, borderColor: c.line }]}
          >
            <ResetIcon color={c.tx} />
          </Pressable>
        </View>
      )}

      {error ? (
        <Txt variant="caption" color="penTx" style={{ textAlign: 'center' }}>
          {error}
        </Txt>
      ) : null}

      {session || lastFinish ? (
        <Pressable accessibilityRole="link" onPress={finishAndSave} style={styles.link}>
          <Txt style={{ fontSize: 14 }} color="accTx">
            Seansı bitir ve kaydet
          </Txt>
        </Pressable>
      ) : null}

      <View style={[styles.weekBox, { borderTopColor: c.line }]}>
        <View style={styles.weekHead}>
          <Txt style={{ fontFamily: fonts.display, fontSize: 18 }}>Bu haftanın zirveleri</Txt>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="mut">
            {formatNumber(week.data?.totalHours ?? 0)}
            {week.data?.targetHours != null ? ` / ${formatNumber(week.data.targetHours)}` : ''} sa
          </Txt>
        </View>
        <WeekPeaks sessions={week.data?.sessions ?? []} active={session} now={now} />
        <Txt style={{ fontSize: 12, lineHeight: 17 }} color="mut">
          Her seans bir dağ. Seans ne kadar uzunsa dağ o kadar yüksek olur. Yarıda bırakırsan
          tırmanış zirveye ulaşmadan biter ve sıradaki dağ soluk görünür.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: HIT,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  fixedLabel: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  clockBox: { alignItems: 'center', gap: 4 },
  clock: { fontFamily: fonts.monoMedium, fontSize: 56, lineHeight: 60, letterSpacing: -1 },
  lengths: { flexDirection: 'row', gap: 8 },
  length: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  row: { flexDirection: 'row', gap: 10 },
  main: { flex: 1, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  reset: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  link: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14, minHeight: HIT },
  weekBox: { gap: 10, borderTopWidth: 1, paddingTop: 16 },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  break: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
});
