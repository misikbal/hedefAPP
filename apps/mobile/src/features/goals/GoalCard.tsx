import { Pressable, StyleSheet, View } from 'react-native';
import { formatNumber, type GoalSummary } from '@takip/shared';
import { ProgressBar } from '@/components/ProgressBar';
import { Txt } from '@/components/Txt';
import { goalPeriodHint } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const STATUS = { done: 'tamam', on_track: 'yolunda', behind: 'geride' } as const;

export function GoalCard({
  goal,
  selected,
  onPress,
}: {
  goal: GoalSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const ok = goal.status !== 'behind';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.s1, borderColor: selected ? c.acc : c.line }]}
    >
      <View style={styles.top}>
        <Txt numberOfLines={1} style={{ fontSize: 13, color: c.mut, flexShrink: 1 }}>
          {goal.name}
        </Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 11, color: ok ? c.okTx : c.penTx }}>
          {STATUS[goal.status]}
        </Txt>
      </View>
      <Txt style={{ fontFamily: fonts.monoMedium, fontSize: 24 }}>
        {formatNumber(goal.current)}
        <Txt
          style={{ fontFamily: fonts.mono, fontSize: 12, color: c.mut }}
        >{` / ${formatNumber(goal.target)} ${goal.unit}`}</Txt>
      </Txt>
      <ProgressBar value={goal.current / goal.target} />
      <Txt style={{ fontSize: 11, color: c.mut }}>{goalPeriodHint(goal.period, goal.daysLeft)}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.5%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
});
