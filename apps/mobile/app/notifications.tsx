import { useMemo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  APP_TIMEZONE,
  addDays,
  localDateOf,
  localTimeOf,
  type NotificationDto,
} from '@takip/shared';
import { useMarkNotificationRead, useNotifications, useReadAllNotifications } from '@/api/hooks';
import { ErrorCard, Loading } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { dayMonthLabel, todayLocal } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const dotColor = (c: ThemeColors, type: NotificationDto['type']) =>
  ({ reminder: c.ok, motivation: c.acc, penalty: c.pen, claude: c.dil })[type];

function groupLabel(date: string, today: string): string {
  if (date === today) return 'BUGÜN';
  if (date === addDays(today, -1)) return 'DÜN';
  return dayMonthLabel(date).toLocaleUpperCase('tr-TR');
}

function Row({ n, onPress }: { n: NotificationDto; onPress: () => void }) {
  const { c } = useTheme();
  const unread = !n.readAt;
  return (
    <Pressable
      accessibilityRole={n.deepLink ? 'link' : 'text'}
      accessibilityLabel={`${n.title}. ${n.body}${unread ? '. Okunmadı' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: unread ? c.s2 : c.s1,
          borderColor: c.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor(c, n.type) }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.head}>
          <Txt style={{ flex: 1, fontSize: 14, fontFamily: fonts.bodySemi }} numberOfLines={2}>
            {n.title}
          </Txt>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
            {localTimeOf(new Date(n.sentAt), APP_TIMEZONE)}
          </Txt>
        </View>
        <Txt style={{ fontSize: 13, lineHeight: 18 }} color="tx2">
          {n.body}
        </Txt>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { c } = useTheme();
  const list = useNotifications();
  const readAll = useReadAllNotifications();
  const markRead = useMarkNotificationRead();
  const today = todayLocal();

  const groups = useMemo(() => {
    const out: { label: string; items: NotificationDto[] }[] = [];
    for (const n of list.data?.items ?? []) {
      const label = groupLabel(localDateOf(new Date(n.sentAt), APP_TIMEZONE), today);
      const last = out.at(-1);
      if (last?.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [list.data, today]);

  const open = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.deepLink) router.push(n.deepLink as Href);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader
        title="Bildirimler"
        right={
          <Pressable
            accessibilityRole="button"
            disabled={!list.data?.unread}
            onPress={() => readAll.mutate()}
            style={[styles.readAll, { borderColor: c.line, opacity: list.data?.unread ? 1 : 0.5 }]}
          >
            <Txt style={{ fontSize: 13 }}>Tümü okundu</Txt>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {list.isPending ? <Loading /> : null}
        {list.isError ? <ErrorCard error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.data && list.data.items.length === 0 ? (
          <Txt style={{ fontSize: 15 }} color="mut">
            Henüz bildirim yok. Cezalar, motivasyon mesajları ve haftalık rapor burada görünür.
          </Txt>
        ) : null}
        {groups.map((g) => (
          <View key={g.label} style={{ gap: 8 }}>
            <Txt variant="label" color="mut">
              {g.label}
            </Txt>
            {g.items.map((n) => (
              <Row key={n.id} n={n} onPress={() => open(n)} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  readAll: {
    height: 40,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, marginTop: 5, borderRadius: 5, flexShrink: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
