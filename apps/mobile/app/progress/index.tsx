import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORY_LABELS, STREAK_UNITS, formatNumber, type StatsRange } from '@takip/shared';
import { useStats } from '@/api/hooks';
import { ProgressBar } from '@/components/ProgressBar';
import { Segmented } from '@/components/Segmented';
import { ErrorCard, Loading } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { Heatmap } from '@/features/progress/Heatmap';
import { Sparkline } from '@/features/progress/Sparkline';
import { weekRangeLabel } from '@/lib/date';
import { categoryColor } from '@/theme/category';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const RANGES = [
  { value: 'week', label: 'Hafta' },
  { value: '12w', label: '12 hafta' },
  { value: 'year', label: 'Yıl' },
] as const;

function rangeLabel(range: StatsRange, from: string, to: string): string {
  if (range === 'week') return `BU HAFTA · ${weekRangeLabel(from, to)}`;
  if (range === '12w') return 'SON 12 HAFTA';
  return `${from.slice(0, 4)} · OCAK – ARALIK`;
}

export default function ProgressScreen() {
  const { c } = useTheme();
  const [range, setRange] = useState<StatsRange>('12w');
  const stats = useStats(range);
  const s = stats.data;
  const section = (title: string, right?: string) => (
    <View style={styles.sectionHead}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        {title}
      </Txt>
      {right ? <Txt style={{ fontSize: 12, color: c.mut }}>{right}</Txt> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="İlerleme" />
      <ScrollView contentContainerStyle={styles.content}>
        {s ? (
          <Txt variant="label" color="mut" style={{ fontSize: 12 }}>
            {rangeLabel(range, s.from, s.to)}
          </Txt>
        ) : null}
        <Segmented options={RANGES} value={range} onChange={setRange} />
        {stats.isPending ? <Loading /> : null}
        {stats.isError ? (
          <ErrorCard error={stats.error} onRetry={() => void stats.refetch()} />
        ) : null}

        {s ? (
          <>
            <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}>
              <View style={styles.scoreRow}>
                <View style={{ gap: 4 }}>
                  <Txt style={{ fontSize: 13, color: c.mut }}>Genel tamamlama</Txt>
                  <Txt
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 44,
                      lineHeight: 48,
                      letterSpacing: -0.8,
                    }}
                  >
                    {s.score === null ? '—' : `%${s.score}`}
                  </Txt>
                </View>
                {s.delta !== null ? (
                  <Txt
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 13,
                      color: s.delta >= 0 ? c.okTx : c.penTx,
                    }}
                  >
                    {`${s.delta >= 0 ? '+' : '−'}${Math.abs(s.delta)} puan`}
                  </Txt>
                ) : null}
              </View>
              {s.score === null ? (
                <Txt variant="caption" color="mut">
                  Bu dönemde sonuçlanmış blok yok.
                </Txt>
              ) : (
                <>
                  <Sparkline values={s.trend.map((t) => t.value)} />
                  <View style={styles.sparkLabels}>
                    <Txt style={styles.mono10(c.mut)}>{s.trend[0]?.label ?? ''}</Txt>
                    <Txt style={styles.mono10(c.mut)}>{s.trend.at(-1)?.label ?? ''}</Txt>
                  </View>
                </>
              )}
            </View>

            <View style={{ gap: 10 }}>
              {section('Her gün', 'son 12 hafta')}
              <Heatmap days={s.heatmap} />
            </View>

            {s.totals.length ? (
              <View style={styles.grid}>
                {s.totals.map((t) => (
                  <View
                    key={t.goalId}
                    style={[styles.total, { backgroundColor: c.s1, borderColor: c.line }]}
                  >
                    <Txt style={{ fontSize: 12, color: c.mut }}>{t.name}</Txt>
                    <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 22 }}>
                      {formatNumber(t.value)}
                      <Txt
                        style={{ fontFamily: fonts.mono, fontSize: 12, color: c.mut }}
                      >{` ${t.unit}`}</Txt>
                    </Txt>
                    <Txt
                      style={{
                        fontSize: 11,
                        color: t.change === null ? c.mut : t.change >= 0 ? c.okTx : c.penTx,
                      }}
                    >
                      {t.change === null
                        ? 'önceki dönemde veri yok'
                        : `${t.change >= 0 ? '▲' : '▼'} %${Math.round(Math.abs(t.change) * 100)} önceki döneme göre`}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : null}

            {s.streaks.length ? (
              <View style={{ gap: 8 }}>
                {section('Seriler')}
                {s.streaks.map((x) => (
                  <View
                    key={x.goalId}
                    style={[styles.streak, { backgroundColor: c.s1, borderColor: c.line }]}
                  >
                    <View style={styles.streakHead}>
                      <Txt
                        style={{ fontSize: 15 }}
                      >{`${x.name} · ${x.period === 'daily' ? 'günlük' : x.period === 'weekly' ? 'haftalık' : 'aylık'}`}</Txt>
                      <Txt style={{ fontFamily: fonts.mono, fontSize: 13 }}>
                        {`${x.current} ${STREAK_UNITS[x.period]} `}
                        <Txt
                          style={{ fontFamily: fonts.mono, fontSize: 13, color: c.mut }}
                        >{`· en iyi ${x.best}`}</Txt>
                      </Txt>
                    </View>
                    <ProgressBar value={x.best ? x.current / x.best : 0} />
                  </View>
                ))}
              </View>
            ) : null}

            {s.split.length ? (
              <View style={{ gap: 10 }}>
                {section('Zaman nereye gitti?')}
                <View style={styles.splitBar}>
                  {s.split.map((x) => (
                    <View
                      key={x.category}
                      style={{
                        flex: Math.max(x.pct, 1),
                        backgroundColor: categoryColor(c, x.category),
                      }}
                    />
                  ))}
                </View>
                <View style={styles.splitLegend}>
                  {s.split.map((x) => (
                    <View key={x.category} style={styles.splitItem}>
                      <View
                        style={[styles.dot, { backgroundColor: categoryColor(c, x.category) }]}
                      />
                      <Txt style={{ fontSize: 13, color: c.tx2, flex: 1 }}>
                        {CATEGORY_LABELS[x.category]}
                      </Txt>
                      <Txt
                        style={{ fontFamily: fonts.mono, fontSize: 13, color: c.tx2 }}
                      >{`%${x.pct}`}</Txt>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  ...StyleSheet.create({
    content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    sparkLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    total: { width: '48.5%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    streak: {
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 8,
    },
    streakHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    splitBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 },
    splitLegend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 6,
    },
    splitItem: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 2 },
  }),
  mono10: (color: string) => ({ fontFamily: fonts.mono, fontSize: 10, color }),
};
