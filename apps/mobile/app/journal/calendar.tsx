import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MOOD_LABELS,
  MOOD_TONES,
  dayStatsLine,
  journalPreview,
  monthGrid,
  shiftMonth,
} from '@takip/shared';
import { useJournalDay, useJournalMonth } from '@/api/hooks';
import { BackIcon, ForwardIcon } from '@/components/icons';
import { ErrorCard, Loading } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { DAY_MIN, dayMonthLabel, monthTitle, todayLocal } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

function SelectedDay({ date }: { date: string }) {
  const { c } = useTheme();
  const day = useJournalDay(date);
  const e = day.data?.entry;
  return (
    <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}>
      <View style={styles.cardHead}>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="mut">
          {dayMonthLabel(date)}
        </Txt>
        {e ? (
          <Txt style={{ fontSize: 12 }} color="tx2">
            {MOOD_LABELS[e.mood]}
          </Txt>
        ) : null}
      </View>
      {day.isPending ? (
        <Loading />
      ) : (
        <>
          <Txt style={{ fontSize: 15, lineHeight: 22 }}>
            {e ? journalPreview(e) || 'Not yazılmamış.' : 'Bu gün için kayıt yok.'}
          </Txt>
          {day.data ? (
            <Txt style={{ fontSize: 12 }} color="mut">
              {dayStatsLine(day.data.stats)}
            </Txt>
          ) : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => router.navigate({ pathname: '/journal', params: { date } })}
            style={styles.edit}
          >
            <Txt style={{ fontSize: 14 }} color="accTx">
              Düzenle
            </Txt>
          </Pressable>
        </>
      )}
    </View>
  );
}

export default function JournalCalendarScreen() {
  const { c } = useTheme();
  const today = todayLocal();
  const [month, setMonth] = useState(today.slice(0, 7));
  const entries = useJournalMonth(month);
  const [selected, setSelected] = useState<string | null>(null);

  const moods = useMemo(
    () => new Map((entries.data ?? []).map((e) => [e.date, e.mood])),
    [entries.data],
  );
  const grid = monthGrid(month);
  // Varsayılan seçim: ayın son kayıtlı günü
  const sel =
    selected && selected.startsWith(month) ? selected : ([...moods.keys()].sort().at(-1) ?? null);

  const canForward = shiftMonth(month, 1) <= today.slice(0, 7);

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/journal'))}
          style={styles.iconBtn}
        >
          <BackIcon color={c.tx} />
        </Pressable>
        <Txt variant="subScreenTitle" style={{ flex: 1 }}>
          {monthTitle(month)}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki ay"
          onPress={() => setMonth(shiftMonth(month, -1))}
          style={styles.iconBtn}
        >
          <BackIcon color={c.tx} size={20} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki ay"
          accessibilityState={{ disabled: !canForward }}
          disabled={!canForward}
          onPress={() => setMonth(shiftMonth(month, 1))}
          style={[styles.iconBtn, { opacity: canForward ? 1 : 0.35 }]}
        >
          <ForwardIcon color={c.tx} size={20} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {DAY_MIN.map((d) => (
            <View key={d} style={styles.cellBox}>
              <Txt style={{ fontSize: 11, textAlign: 'center' }} color="mut">
                {d}
              </Txt>
            </View>
          ))}
          {Array.from({ length: grid.leading }, (_, i) => (
            <View key={`lead-${i}`} style={styles.cellBox} />
          ))}
          {grid.days.map((date) => {
            const mood = moods.get(date);
            const has = mood !== undefined;
            const on = date === sel;
            const n = Number(date.slice(8));
            return (
              <View key={date} style={styles.cellBox}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${n} ${monthTitle(month).split(' ')[0]}${has ? `, ${MOOD_LABELS[mood]}` : ', kayıt yok'}`}
                  accessibilityState={{ selected: on, disabled: !has }}
                  disabled={!has}
                  onPress={() => setSelected(date)}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: has ? c[MOOD_TONES[mood] ?? 'line2'] : 'transparent',
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? c.tx : has ? 'transparent' : c.line,
                    },
                  ]}
                >
                  <Txt
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 13,
                      color: has && mood >= 3 ? c.onAcc : c.tx,
                    }}
                  >
                    {n}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.legend}>
          {MOOD_LABELS.map((label, i) => (
            <View key={label} style={styles.legendItem}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: c[MOOD_TONES[i]!],
                }}
              />
              <Txt style={{ fontSize: 12 }} color="mut">
                {label}
              </Txt>
            </View>
          ))}
        </View>

        {entries.error ? (
          <ErrorCard error={entries.error} onRetry={() => void entries.refetch()} />
        ) : entries.isPending ? (
          <Loading />
        ) : sel ? (
          <SelectedDay date={sel} />
        ) : (
          <Txt variant="caption" color="mut">
            Bu ay için günlük kaydı yok.
          </Txt>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, rowGap: 6 },
  cellBox: { width: `${100 / 7}%`, paddingHorizontal: 3, justifyContent: 'center' },
  cell: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  edit: { alignSelf: 'flex-start', minHeight: HIT, justifyContent: 'center' },
});
