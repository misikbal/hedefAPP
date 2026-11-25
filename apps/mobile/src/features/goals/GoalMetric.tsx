import { Pressable, StyleSheet } from 'react-native';
import { PERIOD_SHORT, formatNumber, type GoalSummary } from '@takip/shared';
import { ProgressBar } from '@/components/ProgressBar';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/** Bugün ekranındaki küçük hedef kartı: "92 /150 · KM · HAFTA" */
export function GoalMetric({ goal, onPress }: { goal: GoalSummary; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}: ${formatNumber(goal.current)} / ${formatNumber(goal.target)} ${goal.unit}`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.s1, borderColor: c.line }]}
    >
      <Txt numberOfLines={1} style={{ fontSize: 12, color: c.mut }}>
        {goal.name}
      </Txt>
      <Txt numberOfLines={1} style={{ fontFamily: fonts.monoMedium, fontSize: 18 }}>
        {formatNumber(goal.current)}
        <Txt
          style={{ fontFamily: fonts.mono, fontSize: 11, color: c.mut }}
        >{` /${formatNumber(goal.target)}`}</Txt>
      </Txt>
      <ProgressBar value={goal.current / goal.target} />
      <Txt numberOfLines={1} style={{ fontFamily: fonts.mono, fontSize: 10, color: c.mut }}>
        {`${goal.unit.toLocaleUpperCase('tr-TR')} · ${PERIOD_SHORT[goal.period]}`}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
});
