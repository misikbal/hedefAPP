import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UNIT_LABELS, formatNumber, type GoalUnit, type WeeklyReport } from '@takip/shared';
import { useWeeklyReport } from '@/api/hooks';
import { ErrorCard, Loading } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { DAY_MIN, DAY_NAMES, isoDow, weekRangeLabel } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const BAR_HEIGHT = 96;

function penaltyLine(p: WeeklyReport['penalties']): string {
  if (p.created === 0) return 'Bu hafta ceza gelmedi.';
  const parts = [`${p.created} ceza geldi`];
  if (p.doneOnTime === p.created)
    parts.push(p.created === 1 ? 'zamanında yapıldı' : 'hepsi zamanında yapıldı');
  else if (p.doneOnTime) parts.push(`${p.doneOnTime} tanesi zamanında yapıldı`);
  const tail = p.postponed ? `${p.postponed} ceza ertelendi.` : 'Ertelenen yok.';
  return `${parts.join(', ')}. ${tail}${p.open ? ` ${p.open} ceza hâlâ açık.` : ''}`;
}

function goalValue(g: WeeklyReport['goals'][number]): string {
  const unit = UNIT_LABELS[g.unit as GoalUnit] ?? g.unit;
  return `${formatNumber(g.value)} / ${formatNumber(g.target)} ${unit}`;
}

function Report({ r }: { r: WeeklyReport }) {
  const { c } = useTheme();
  return (
    <>
      <View style={{ gap: 6 }}>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1 }} color="mut">
          {`HAFTA ${r.weekNumber} · ${weekRangeLabel(r.weekStart, r.weekEnd)}${r.complete ? '' : ' · SÜRÜYOR'}`}
        </Txt>
        <View style={styles.hero}>
          <Txt style={[styles.percent, { color: c.tx }]}>
            {r.blocks.percent === null ? '—' : `%${r.blocks.percent}`}
          </Txt>
          <Txt style={{ fontSize: 15, lineHeight: 21 }} color="tx2">
            {`blokların tamamlandı\n${r.blocks.done} / ${r.blocks.total} blok`}
          </Txt>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}>
        <View style={styles.cardHead}>
          <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
            Günler
          </Txt>
          {r.bestDay ? (
            <Txt style={{ fontSize: 12 }} color="mut">
              {`en iyi gün: ${DAY_NAMES[isoDow(r.bestDay) - 1]}`}
            </Txt>
          ) : null}
        </View>
        <View
          style={[styles.bars, { height: BAR_HEIGHT }]}
          accessibilityLabel={r.days
            .map((d, i) => `${DAY_NAMES[i]}: ${d.total ? `${d.done}/${d.total}` : 'blok yok'}`)
            .join(', ')}
        >
          {r.days.map((d) => (
            <View
              key={d.date}
              style={{
                flex: 1,
                height: Math.max(4, Math.round((d.ratio ?? 0) * BAR_HEIGHT)),
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: d.date === r.bestDay ? c.acc : c.line2,
                opacity: d.ratio === null ? 0.4 : 1,
              }}
            />
          ))}
        </View>
        <View style={styles.dayLabels}>
          {DAY_MIN.map((l) => (
            <Txt key={l} style={{ flex: 1, fontSize: 11, textAlign: 'center' }} color="mut">
              {l}
            </Txt>
          ))}
        </View>
      </View>

      {r.goals.length ? (
        <View style={[styles.card, styles.list, { backgroundColor: c.s1, borderColor: c.line }]}>
          {r.goals.map((g, i) => (
            <View
              key={g.goalId}
              style={[styles.goalRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}
            >
              <View style={[styles.badge, { backgroundColor: g.met ? c.ok : c.penBg }]}>
                <Txt
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.bodySemi,
                    color: g.met ? c.onAcc : c.penTx,
                  }}
                >
                  {g.met ? '✓' : '✕'}
                </Txt>
              </View>
              <Txt style={{ flex: 1, fontSize: 15 }}>
                {g.period === 'daily' ? `${g.name} (günlük ort.)` : g.name}
              </Txt>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }} color="tx2">
                {goalValue(g)}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/penalties')}
        style={[styles.penalty, { backgroundColor: c.penBg, borderColor: c.pen }]}
      >
        <Txt style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{penaltyLine(r.penalties)}</Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 13, color: c.penTx }}>
          {`${r.penalties.doneOnTime}/${r.penalties.created}`}
        </Txt>
      </Pressable>

      <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line, gap: 8 }]}>
        <Txt variant="label" color="mut">
          HAFTANIN NOTU
        </Txt>
        <Txt style={{ fontSize: 15, lineHeight: 22 }}>{r.note}</Txt>
        <Txt style={{ fontSize: 12 }} color="mut">
          Claude'da "gelecek haftayı planla" yazarak programı güncelleyebilirsin.
        </Txt>
      </View>
    </>
  );
}

export default function WeeklyReportScreen() {
  const { c } = useTheme();
  const { week } = useLocalSearchParams<{ week: string }>();
  const report = useWeeklyReport(week ?? 'latest');
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Haftalık rapor" />
      <ScrollView contentContainerStyle={styles.content}>
        {report.isPending ? <Loading /> : null}
        {report.isError ? (
          <ErrorCard error={report.error} onRetry={() => void report.refetch()} />
        ) : null}
        {report.data ? <Report r={report.data} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  percent: { fontFamily: fonts.display, fontSize: 64, lineHeight: 66, letterSpacing: -2 },
  card: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  list: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dayLabels: { flexDirection: 'row', gap: 8 },
  goalRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  badge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  penalty: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
});
