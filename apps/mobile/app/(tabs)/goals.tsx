import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { rulesForGoal, withPossessive } from '@takip/shared';
import { useGoalHistory, useGoals, usePenaltyRules, useWeeklyReport } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { PenaltyIcon, PlusIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { GoalCard } from '@/features/goals/GoalCard';
import { GoalHistoryChart } from '@/features/goals/GoalHistoryChart';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

export default function GoalsScreen() {
  const { c } = useTheme();
  const goals = useGoals();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = goals.data ?? [];
  const selected = list.find((g) => g.id === selectedId) ?? list[0];
  const history = useGoalHistory(selected?.id);
  const rules = usePenaltyRules();
  const [rule] = selected ? rulesForGoal(selected, rules.data ?? []) : [];
  const onTrack = list.filter((g) => g.status !== 'behind').length;

  return (
    <Screen
      eyebrow={
        list.length
          ? `${list.length} HEDEF · ${withPossessive(onTrack).toLocaleUpperCase('tr-TR')} YOLUNDA`
          : 'HEDEFLER'
      }
      title="Hedefler"
      refreshing={goals.isRefetching}
      onRefresh={() => {
        void goals.refetch();
        void history.refetch();
      }}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/progress')}
            style={[styles.pill, { borderColor: c.line, backgroundColor: c.s1 }]}
          >
            <Svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={c.tx}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
            </Svg>
            <Txt style={{ fontSize: 13 }}>İlerleme</Txt>
          </Pressable>
          <IconButton label="Yeni hedef" onPress={() => router.push('/goals/new')}>
            <PlusIcon color={c.tx} size={18} strokeWidth={2} />
          </IconButton>
        </View>
      }
    >
      {goals.isPending ? <Loading /> : null}
      {goals.isError ? (
        <ErrorCard error={goals.error} onRetry={() => void goals.refetch()} />
      ) : null}

      {goals.data && list.length === 0 ? (
        <Card>
          <Txt variant="sectionTitle">İlk hedefini koy</Txt>
          <Txt variant="caption" color="tx2">
            Örneğin haftada 150 km bisiklet ya da günde 20 sayfa kitap.
          </Txt>
          <Button
            label="Hedef ekle"
            height={44}
            icon={<PlusIcon color={c.onAcc} />}
            onPress={() => router.push('/goals/new')}
          />
        </Card>
      ) : null}

      {list.length > 0 ? (
        <View style={styles.grid}>
          {list.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              selected={g.id === selected?.id}
              onPress={() => setSelectedId(g.id)}
            />
          ))}
        </View>
      ) : null}

      {selected && history.data ? (
        <GoalHistoryChart history={history.data} title={`${selected.name} geçmişi`} />
      ) : null}
      {selected && history.isPending ? <Loading /> : null}

      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Cezalar ekranını açar"
          onPress={() => router.push(rule ? '/penalties' : '/penalties/rules/new')}
          style={({ pressed }) => [
            styles.rule,
            { borderColor: c.line, backgroundColor: pressed ? c.s1 : 'transparent' },
          ]}
        >
          <PenaltyIcon color={c.penTx} size={18} strokeWidth={2} />
          <Txt style={{ flex: 1, fontSize: 14, lineHeight: 20, color: c.tx2 }}>
            {rule ? rule.sentence : 'Bu hedef için ceza kuralı yok. Eklemek için dokun.'}
          </Txt>
        </Pressable>
      ) : null}

      <ReportCard />

      {selected ? (
        <View style={styles.actions}>
          <Button
            label="İlerleme gir"
            variant="outline"
            height={44}
            style={{ flex: 1 }}
            onPress={() =>
              router.push({ pathname: '/progress/new', params: { goalId: selected.id } })
            }
          />
          <Button
            label="Düzenle"
            variant="outline"
            height={44}
            style={{ flex: 1 }}
            onPress={() =>
              router.push({ pathname: '/goals/[id]/edit', params: { id: selected.id } })
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** Hedefler · rapor kartı → Haftalık rapor (son hazır hafta). */
function ReportCard() {
  const { c } = useTheme();
  const report = useWeeklyReport('latest');
  const r = report.data;
  if (!r) return null;
  const met = r.goals.filter((g) => g.met).length;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Haftalık raporu açar"
      onPress={() => router.push({ pathname: '/reports/[week]', params: { week: r.isoWeek } })}
      style={({ pressed }) => [
        styles.rule,
        { borderColor: c.line, backgroundColor: pressed ? c.s2 : c.s1 },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontSize: 15 }}>{`Hafta ${r.weekNumber} raporu`}</Txt>
        <Txt style={{ fontSize: 12 }} color="mut">
          {`${r.blocks.done}/${r.blocks.total} blok${r.goals.length ? ` · ${met}/${r.goals.length} hedef tuttu` : ''}`}
        </Txt>
      </View>
      <Txt style={{ fontFamily: fonts.display, fontSize: 22 }}>
        {r.blocks.percent === null ? '—' : `%${r.blocks.percent}`}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: HIT,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  rule: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
});
