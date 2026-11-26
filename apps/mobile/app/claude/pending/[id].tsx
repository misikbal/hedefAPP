import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PendingChangeDto } from '@takip/shared';
import { useDecidePendingChange, usePendingChange } from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { whenLabel } from '@/features/claude/format';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

type Effective = 'pending' | 'approved' | 'rejected' | 'expired';

const RESULT_TITLE: Record<Exclude<Effective, 'pending'>, string> = {
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  expired: 'Süresi doldu',
};

const RESULT_FALLBACK: Record<Exclude<Effective, 'pending'>, string> = {
  approved: 'Değişiklik uygulandı. Değişiklik geçmişinden geri alabilirsin.',
  rejected: 'Program aynı kaldı.',
  expired: 'Bu değişiklik onaylanmadığı için uygulanmadı.',
};

function ChangeView({ id, change }: { id: string; change: PendingChangeDto }) {
  const { c } = useTheme();
  const decide = useDecidePendingChange(id);
  const now = useNow(30_000);
  const status: Effective =
    change.status === 'pending' && new Date(change.expiresAt).getTime() <= now
      ? 'expired'
      : change.status;
  const { preview } = change;
  const reply = decide.data?.resultMessage ?? change.resultMessage;

  return (
    <>
      <Card style={{ gap: 12, borderRadius: 14 }}>
        <View style={styles.between}>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="mut">
            {change.tool}
          </Txt>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="mut">
            {whenLabel(change.createdAt)}
          </Txt>
        </View>
        <Txt variant="subScreenTitle">{preview.title}</Txt>
        {change.userMessage ? (
          <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2">
            {`Claude'a yazdığın: "${change.userMessage}"`}
          </Txt>
        ) : null}
      </Card>

      <View style={{ gap: 8 }}>
        <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
          Ne değişecek?
        </Txt>
        {preview.lines.map((line, i) => (
          <View
            key={`l${i}`}
            style={[
              styles.row,
              preview.destructive
                ? { backgroundColor: c.penBg, borderColor: c.pen }
                : { backgroundColor: c.s1, borderColor: c.line },
            ]}
          >
            <Txt
              style={{
                fontFamily: fonts.mono,
                fontSize: 14,
                color: preview.destructive ? c.penTx : c.mut,
              }}
            >
              {preview.destructive ? '−' : '•'}
            </Txt>
            <Txt style={{ flex: 1, fontSize: 15 }}>{line}</Txt>
          </View>
        ))}
        {preview.effects.map((effect, i) => (
          <View key={`e${i}`} style={[styles.row, { backgroundColor: c.s1, borderColor: c.line }]}>
            <Txt style={{ fontFamily: fonts.mono, fontSize: 14 }} color="mut">
              i
            </Txt>
            <Txt style={{ flex: 1, fontSize: 13, lineHeight: 19 }} color="tx2">
              {effect}
            </Txt>
          </View>
        ))}
      </View>

      {status === 'pending' ? (
        <View style={{ gap: 8 }}>
          <View style={styles.actions}>
            <Button
              label="Onayla"
              style={{ flex: 1 }}
              loading={decide.isPending && decide.variables === 'approve'}
              disabled={decide.isPending}
              onPress={() => decide.mutate('approve')}
            />
            <Button
              label="Reddet"
              variant="outline"
              height={52}
              style={{ flex: 1 }}
              loading={decide.isPending && decide.variables === 'reject'}
              disabled={decide.isPending}
              onPress={() => decide.mutate('reject')}
            />
          </View>
          {decide.isError ? (
            <Txt style={{ fontSize: 13 }} color="penTx">
              {errorMessage(decide.error)}
            </Txt>
          ) : null}
        </View>
      ) : (
        <Card style={{ gap: 10, borderRadius: 14 }}>
          <Txt style={{ fontSize: 15, fontFamily: fonts.bodySemi }}>{RESULT_TITLE[status]}</Txt>
          <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
            {reply ? `Claude'a gönderilen yanıt: "${reply}"` : RESULT_FALLBACK[status]}
          </Txt>
          {change.decidedAt ? (
            <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
              {`Karar: ${whenLabel(change.decidedAt)}`}
            </Txt>
          ) : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/claude'))}
          >
            <Txt style={{ fontSize: 14 }} color="accTx">
              Bağlantı ekranına dön
            </Txt>
          </Pressable>
        </Card>
      )}

      <Txt style={{ fontSize: 12, lineHeight: 17 }} color="mut">
        Onay istemeyi Claude bağlantısı ekranındaki İzinler bölümünden değiştirebilirsin.
      </Txt>
    </>
  );
}

export default function PendingChangeScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const change = usePendingChange(id);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Onay bekleyen değişiklik" />
      <ScrollView contentContainerStyle={styles.content}>
        {change.isPending ? <Loading /> : null}
        {change.isError ? (
          <ErrorCard error={change.error} onRetry={() => void change.refetch()} />
        ) : null}
        {change.data ? <ChangeView id={id} change={change.data} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actions: { flexDirection: 'row', gap: 8 },
});
