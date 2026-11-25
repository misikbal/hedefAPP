import { StyleSheet, View } from 'react-native';
import { formatNumber, type GoalHistory } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const H = 150;

/** Son 8 periyot: çubuklar, kesikli hedef çizgisi, ortalama / en iyi / kaçırılan. */
export function GoalHistoryChart({ history, title }: { history: GoalHistory; title: string }) {
  const { c } = useTheme();
  const max = Math.max(...history.buckets.map((b) => b.value), history.target) * 1.1 || 1;
  const targetY = Math.round((history.target / max) * H);
  const unit = history.unit;
  const fmt = (n: number | null) => (n === null ? '—' : `${formatNumber(n)} ${unit}`);

  return (
    <View style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}>
      <View style={styles.head}>
        <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
          {title}
        </Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 11, color: c.mut }}>
          {history.bucket === 'week' ? 'SON 8 HAFTA' : 'SON 8 AY'}
        </Txt>
      </View>

      <View style={[styles.plot, { borderBottomColor: c.line }]}>
        <View style={[styles.target, { bottom: targetY, borderTopColor: c.mut }]}>
          <Txt style={[styles.targetLabel, { color: c.mut }]}>
            {`hedef ${formatNumber(history.target)} ${unit}${history.aggregate === 'daily_avg' ? '/gün' : ''}`}
          </Txt>
        </View>
        {history.buckets.map((b) => (
          <View
            key={b.start}
            accessibilityLabel={`${b.label}: ${formatNumber(b.value)} ${unit}`}
            style={[
              styles.bar,
              {
                height: Math.max(2, Math.round((b.value / max) * H)),
                backgroundColor: b.current ? c.acc : b.met ? c.ok : c.line2,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {history.buckets.map((b) => (
          <Txt key={b.start} style={[styles.label, { color: c.mut }]}>
            {b.label}
          </Txt>
        ))}
      </View>

      <View style={[styles.summary, { borderTopColor: c.line }]}>
        <Stat label="Ortalama" value={fmt(history.avg)} />
        <Stat label="En iyi" value={fmt(history.best)} />
        <Stat
          label="Kaçırılan"
          value={
            history.completed
              ? `${history.missed} / ${history.completed} ${history.bucket === 'week' ? 'hafta' : 'ay'}`
              : '—'
          }
          pen
        />
      </View>
    </View>
  );
}

function Stat({ label, value, pen }: { label: string; value: string; pen?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt style={{ fontSize: 11, color: c.mut }}>{label}</Txt>
      <Txt style={{ fontFamily: fonts.mono, fontSize: 15, color: pen ? c.penTx : c.tx }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 14 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  plot: { height: H, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderBottomWidth: 1 },
  target: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  targetLabel: { position: 'absolute', right: 0, top: -16, fontFamily: fonts.mono, fontSize: 10 },
  bar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  labels: { flexDirection: 'row', gap: 8, marginTop: -6 },
  label: { flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 10 },
  summary: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 12 },
});
