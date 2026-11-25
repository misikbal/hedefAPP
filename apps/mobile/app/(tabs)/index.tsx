import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { remainingText } from '@takip/shared';
import { useInstanceAction, useToday, useUnreadCount } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { BellIcon, GearIcon, PenaltyIcon, PlusIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { GoalMetric } from '@/features/goals/GoalMetric';
import { TaskRow } from '@/features/schedule/TaskRow';
import { greeting, todayEyebrow } from '@/lib/date';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

export default function TodayScreen() {
  const { c } = useTheme();
  const today = useToday();
  const action = useInstanceAction();
  const instances = today.data?.instances ?? [];
  const counted = instances.filter((i) => i.status !== 'skipped');
  const doneCount = counted.filter((i) => i.status === 'done').length;
  const pending = today.data?.pendingPenalty;
  const now = useNow(60_000);
  const unread = useUnreadCount().data?.unread ?? 0;

  return (
    <Screen
      eyebrow={todayEyebrow(today.data?.date)}
      title={greeting()}
      refreshing={today.isRefetching}
      onRefresh={() => void today.refetch()}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View>
            <IconButton
              label={unread ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'}
              onPress={() => router.push('/notifications')}
            >
              <BellIcon color={c.tx} />
            </IconButton>
            {unread ? (
              <View
                pointerEvents="none"
                style={[styles.unreadDot, { backgroundColor: c.acc, borderColor: c.bg }]}
              />
            ) : null}
          </View>
          <IconButton label="Ayarlar" onPress={() => router.push('/settings')}>
            <GearIcon color={c.tx} />
          </IconButton>
        </View>
      }
    >
      {today.isPending ? <Loading /> : null}
      {today.isError ? (
        <ErrorCard error={today.error} onRetry={() => void today.refetch()} />
      ) : null}

      {pending ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Cezalar ekranını açar"
          onPress={() => router.push('/penalties')}
          style={({ pressed }) => [
            styles.penalty,
            { backgroundColor: c.penBg, borderColor: c.pen, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <PenaltyIcon color={c.penTx} size={20} strokeWidth={2} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt style={{ fontSize: 15, fontFamily: fonts.bodySemi }}>
              {`Bekleyen ceza: ${pending.text}`}
            </Txt>
            <Txt style={{ fontSize: 12, color: c.tx2 }}>
              {`${pending.reason} · ${remainingText(new Date(pending.dueAt).getTime() - now)}`}
            </Txt>
          </View>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12, color: c.penTx }}>Aç</Txt>
        </Pressable>
      ) : null}

      {today.data?.note ? (
        <Card>
          <Txt variant="label" color="mut">
            GÜNÜN NOTU
          </Txt>
          <Txt style={{ fontSize: 16, lineHeight: 23 }}>{today.data.note}</Txt>
        </Card>
      ) : null}

      {today.data?.goals.length ? (
        <View style={styles.metrics}>
          {today.data.goals.slice(0, 3).map((g) => (
            <GoalMetric key={g.id} goal={g} onPress={() => router.push('/goals')} />
          ))}
        </View>
      ) : null}

      {today.data && instances.length === 0 ? (
        <Card>
          <Txt variant="sectionTitle">Bugün için program yok</Txt>
          <Txt variant="caption" color="tx2">
            Haftalık programına bir blok ekle; seçtiğin günlere otomatik düşer.
          </Txt>
          <Button
            label="Blok ekle"
            height={44}
            icon={<PlusIcon color={c.onAcc} />}
            onPress={() => router.push('/blocks/new')}
          />
        </Card>
      ) : null}

      {instances.length > 0 ? (
        <View style={{ gap: 4 }}>
          <View style={styles.sectionHead}>
            <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
              {`Bugünün akışı · ${doneCount}/${counted.length}`}
            </Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(today.data?.goals.length ? '/progress/new' : '/goals/new')}
              style={[styles.pill, { borderColor: c.line }]}
            >
              <Txt style={{ fontSize: 13, color: c.accTx, fontFamily: fonts.body }}>
                + İlerleme gir
              </Txt>
            </Pressable>
          </View>
          {instances.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              onOpen={() => router.push({ pathname: '/blocks/[id]', params: { id: item.blockId } })}
              onToggle={() =>
                action.mutate({
                  id: item.id,
                  blockId: item.blockId,
                  action: item.status === 'done' ? 'undo' : 'done',
                })
              }
            />
          ))}
        </View>
      ) : null}
      {action.isError ? <ErrorCard error={action.error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  metrics: { flexDirection: 'row', gap: 10 },
  penalty: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
