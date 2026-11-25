import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, weekStartOf } from '@takip/shared';
import { useWeek } from '@/api/hooks';
import { BackIcon, PlusIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { DayStrip } from '@/features/schedule/DayStrip';
import { WeekBlockCard } from '@/features/schedule/WeekBlockCard';
import { DAY_NAMES, isoDow, todayLocal, weekRangeLabel } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const LEGEND = [
  { label: 'Proje', key: 'acc' },
  { label: 'Spor', key: 'ok' },
  { label: 'Dil', key: 'dil' },
  { label: 'Okuma', key: 'oku' },
] as const;

export default function WeekScreen() {
  const { c } = useTheme();
  const today = todayLocal();
  const thisWeek = weekStartOf(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [selected, setSelected] = useState(isoDow(today) - 1);
  const week = useWeek(weekStart);

  // Başka bir haftaya geçince bugünü (bu haftaysa) ya da pazartesiyi seç.
  useEffect(() => {
    setSelected(weekStart === thisWeek ? isoDow(today) - 1 : 0);
  }, [weekStart, thisWeek, today]);

  const day = week.data?.days[selected];
  const isToday = day?.date === today;

  return (
    <Screen
      eyebrow={weekRangeLabel(weekStart, addDays(weekStart, 6))}
      title="Haftalık program"
      refreshing={week.isRefetching}
      onRefresh={() => void week.refetch()}
      right={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/blocks/new')}
          style={[styles.addBtn, { backgroundColor: c.acc }]}
        >
          <PlusIcon color={c.onAcc} />
          <Txt style={{ color: c.onAcc, fontSize: 14, fontFamily: fonts.bodySemi }}>Blok</Txt>
        </Pressable>
      }
    >
      <View style={styles.weekNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki hafta"
          onPress={() => setWeekStart(addDays(weekStart, -7))}
          style={styles.navBtn}
        >
          <BackIcon color={c.mut} size={18} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setWeekStart(thisWeek)}
          disabled={weekStart === thisWeek}
          style={styles.navLabel}
        >
          <Txt variant="label" color={weekStart === thisWeek ? 'mut' : 'accTx'}>
            {weekStart === thisWeek ? 'BU HAFTA' : 'BU HAFTAYA DÖN'}
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sonraki hafta"
          onPress={() => setWeekStart(addDays(weekStart, 7))}
          style={[styles.navBtn, { transform: [{ scaleX: -1 }] }]}
        >
          <BackIcon color={c.mut} size={18} />
        </Pressable>
      </View>

      {week.isPending ? <Loading /> : null}
      {week.isError ? <ErrorCard error={week.error} onRetry={() => void week.refetch()} /> : null}

      {week.data ? (
        <>
          <DayStrip days={week.data.days} selected={selected} onSelect={setSelected} />
          <View style={styles.legend}>
            {LEGEND.map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c[l.key] }]} />
                <Txt style={{ fontSize: 12, color: c.mut, fontFamily: fonts.body }}>{l.label}</Txt>
              </View>
            ))}
          </View>
          <View style={[styles.dayHead, { borderTopColor: c.line }]}>
            <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
              {`${DAY_NAMES[selected]}${isToday ? ' · bugün' : ''}`}
            </Txt>
            <Txt style={{ fontFamily: fonts.mono, fontSize: 12, color: c.mut }}>
              {`${day?.instances.length ?? 0} blok`}
            </Txt>
          </View>
          <View style={{ gap: 8 }}>
            {day?.instances.map((item) => (
              <WeekBlockCard
                key={item.id}
                item={item}
                onPress={() =>
                  router.push({ pathname: '/blocks/[id]', params: { id: item.blockId } })
                }
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/blocks/new', params: { day: String(selected + 1) } })
            }
            style={[styles.addDay, { borderColor: c.line2 }]}
          >
            <Txt style={{ color: c.mut, fontSize: 14, fontFamily: fonts.body }}>
              + Bu güne blok ekle
            </Txt>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: HIT,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: -8,
  },
  navBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  navLabel: { height: HIT, justifyContent: 'center', paddingHorizontal: 12 },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  dayHead: {
    borderTopWidth: 1,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  addDay: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
