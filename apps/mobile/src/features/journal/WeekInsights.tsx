import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect } from 'react-native-svg';
import { journalTagLabel, type JournalInsights } from '@takip/shared';
import { useJournalInsights } from '@/api/hooks';
import { Card } from '@/components/Card';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const CHART_H = 112;
const PAD = 6;

type Day = JournalInsights['days'][number];

/** Ruh hâli ve enerji çizgileri (0–4) ile tamamlama çubukları (0–1), aynı eksen. */
function WeekChart({ days }: { days: Day[] }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const n = days.length || 1;
  const col = w / n;
  const plot = CHART_H - PAD * 2;
  const y = (ratio: number) => PAD + plot - ratio * plot;
  const line = (pick: (d: Day) => number | null) =>
    days
      .map((d, i) => {
        const v = pick(d);
        return v === null ? null : { x: col * (i + 0.5), y: y(v / 4) };
      })
      .filter((p): p is { x: number; y: number } => p !== null);
  const series = [
    { pts: line((d) => d.mood), color: c.acc },
    { pts: line((d) => d.energy), color: c.dil },
  ];

  return (
    <View style={{ gap: 6 }}>
      <View
        style={{ height: CHART_H }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityLabel="Haftalık ruh hâli, enerji ve tamamlama grafiği"
      >
        {w > 0 ? (
          <Svg width={w} height={CHART_H}>
            {[0, 0.5, 1].map((r) => (
              <Line key={r} x1={0} x2={w} y1={y(r)} y2={y(r)} stroke={c.line} strokeWidth={1} />
            ))}
            {days.map((d, i) =>
              d.completion === null ? null : (
                <Rect
                  key={d.date}
                  x={col * i + col * 0.25}
                  width={col * 0.5}
                  y={y(d.completion)}
                  height={Math.max(d.completion * plot, 1)}
                  rx={3}
                  fill={c.line2}
                  opacity={0.7}
                />
              ),
            )}
            {series.map(({ pts, color }) => (
              <G key={color}>
                {pts.length > 1 ? (
                  <Polyline
                    points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {pts.map((p) => (
                  <Circle key={`${p.x}`} cx={p.x} cy={p.y} r={3} fill={color} />
                ))}
              </G>
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.row}>
        {days.map((d, i) => (
          <Txt
            key={d.date}
            style={{ flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 10 }}
            color="mut"
          >
            {days.length === 7 ? DAY_SHORT[i] : Number(d.date.slice(8))}
          </Txt>
        ))}
      </View>
      <View style={[styles.row, { gap: 14 }]}>
        <Legend color={c.acc} label="Ruh hâli" />
        <Legend color={c.dil} label="Enerji" />
        <Legend color={c.line2} label="Tamamlama" box />
      </View>
    </View>
  );
}

function Legend({ color, label, box }: { color: string; label: string; box?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: box ? 8 : 12,
          height: box ? 10 : 3,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <Txt style={{ fontSize: 11 }} color="mut">
        {label}
      </Txt>
    </View>
  );
}

/** Günlük ekranındaki "Bu hafta" kartı: grafik, kural tabanlı bulgular, sık etiketler. */
export function WeekInsights({ date }: { date: string }) {
  const { c } = useTheme();
  const q = useJournalInsights('week', date);
  if (!q.data) return null;
  const i = q.data;

  return (
    <Card>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 18 }}>Bu hafta</Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
          {i.entries} kayıt
          {i.completionRate !== null ? ` · %${Math.round(i.completionRate * 100)} tamamlama` : ''}
        </Txt>
      </View>
      {i.entries === 0 && i.completionRate === null ? (
        <Txt variant="caption" color="mut">
          Bu hafta henüz günlük yok.
        </Txt>
      ) : (
        <WeekChart days={i.days} />
      )}
      {i.findings.length ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          {i.findings.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.bullet, { backgroundColor: c.acc }]} />
              <Txt style={{ flex: 1, fontSize: 14, lineHeight: 20 }} color="tx2">
                {f}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
      {i.topTags.length ? (
        <View style={[styles.row, { flexWrap: 'wrap', gap: 6, marginTop: 4 }]}>
          {i.topTags.map(([tag, count], idx) => (
            <View key={tag} style={[styles.tag, { backgroundColor: c.s2, borderColor: c.line }]}>
              <Txt style={{ fontSize: idx === 0 ? 14 : 12 }}>{journalTagLabel(tag)}</Txt>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
                {count}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
});
