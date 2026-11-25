import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { APP_TIMEZONE, localDateOf, weekStartOf, type PenaltyRule } from '@takip/shared';
import {
  useDeletePenaltyRule,
  usePenalties,
  usePenaltyAction,
  usePenaltyRules,
  useUpdatePenaltyRule,
} from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CheckIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import { PendingPenaltyCard } from '@/features/penalties/PendingPenaltyCard';
import { isoDow, todayLocal } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const DAY_UPPER = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PAZ'] as const;
const localDay = (iso: string) => localDateOf(new Date(iso), APP_TIMEZONE);

function RuleRow({ rule }: { rule: PenaltyRule }) {
  const { c } = useTheme();
  const update = useUpdatePenaltyRule();
  const remove = useDeletePenaltyRule();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.rule, { backgroundColor: c.s1, borderColor: c.line }]}>
      <View style={styles.ruleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Kuralı silme seçeneğini gösterir"
          onPress={() => setOpen((o) => !o)}
          style={{ flex: 1, minWidth: 0, gap: 4 }}
        >
          <Txt style={{ fontSize: 12, color: c.mut }}>{rule.when}</Txt>
          <Txt
            style={{
              fontSize: 15,
              fontFamily: fonts.bodyMedium,
              color: rule.enabled ? c.tx : c.mut,
            }}
          >
            {rule.then}
          </Txt>
        </Pressable>
        <Switch
          label="Kuralı aç veya kapat"
          color={c.pen}
          value={rule.enabled}
          onChange={(enabled) => update.mutate({ id: rule.id, body: { enabled } })}
        />
      </View>
      {open ? (
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 13, color: c.tx2, lineHeight: 19 }}>{rule.sentence}</Txt>
          <Button
            label="Kuralı sil"
            variant="danger"
            height={44}
            loading={remove.isPending}
            onPress={() => remove.mutate(rule.id)}
          />
          {remove.isError ? (
            <Txt variant="caption" color="penTx">
              {errorMessage(remove.error)}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function PenaltiesScreen() {
  const { c } = useTheme();
  const open = usePenalties('open');
  const done = usePenalties('done', 20);
  const rules = usePenaltyRules();
  const action = usePenaltyAction();
  const [cleared, setCleared] = useState(false);

  const openList = open.data ?? [];
  const weekStart = weekStartOf(todayLocal());
  const doneThisWeek = (done.data ?? []).filter(
    (p) => p.resolvedAt && localDay(p.resolvedAt) >= weekStart,
  ).length;
  const loading = open.isPending || rules.isPending;
  const error = open.error ?? rules.error ?? done.error;

  return (
    <Screen
      eyebrow={`BU HAFTA · ${openList.length} BEKLİYOR · ${doneThisWeek} YAPILDI`}
      title="Cezalar"
      refreshing={open.isRefetching || rules.isRefetching}
      onRefresh={() => {
        void open.refetch();
        void done.refetch();
        void rules.refetch();
      }}
    >
      {loading ? <Loading /> : null}
      {error ? (
        <ErrorCard
          error={error}
          onRetry={() => {
            void open.refetch();
            void done.refetch();
            void rules.refetch();
          }}
        />
      ) : null}

      {openList.map((p) => (
        <PendingPenaltyCard
          key={p.id}
          penalty={p}
          busy={action.isPending}
          onDone={() =>
            action.mutate(
              { id: p.id, action: 'done' },
              { onSuccess: () => setCleared(openList.length === 1) },
            )
          }
          onPostpone={() => action.mutate({ id: p.id, action: 'postpone' })}
        />
      ))}
      {action.isError ? (
        <Txt variant="caption" color="penTx">
          {errorMessage(action.error)}
        </Txt>
      ) : null}

      {cleared && open.data && openList.length === 0 ? (
        <View style={[styles.cleared, { backgroundColor: c.s1, borderColor: c.ok }]}>
          <CheckIcon color={c.okTx} size={20} strokeWidth={2.5} />
          <Txt style={{ fontSize: 15, flex: 1 }}>Ceza kapandı. Borcun yok — seri devam ediyor.</Txt>
        </View>
      ) : null}

      {rules.data ? (
        <View style={{ gap: 8 }}>
          <View style={styles.sectionHead}>
            <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
              Kurallar
            </Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/penalties/rules/new')}
              style={[styles.pill, { borderColor: c.line, backgroundColor: c.s1 }]}
            >
              <Txt style={{ fontSize: 13 }}>+ Kural</Txt>
            </Pressable>
          </View>
          {rules.data.length === 0 ? (
            <Card>
              <Txt variant="sectionTitle">Henüz kural yok</Txt>
              <Txt variant="caption" color="tx2">
                Bir blok kaçınca ya da hedef tutmayınca ne olacağını sen belirle. Örneğin spor bloğu
                kaçarsa 24 saat içinde 3 dk soğuk duş.
              </Txt>
            </Card>
          ) : (
            rules.data.map((r) => <RuleRow key={r.id} rule={r} />)
          )}
        </View>
      ) : null}

      {done.data?.length ? (
        <View style={{ gap: 0 }}>
          <Txt variant="sectionTitle" style={{ fontSize: 18, marginBottom: 8 }}>
            Geçmiş
          </Txt>
          {done.data.map((p) => (
            <View key={p.id} style={[styles.history, { borderBottomColor: c.line }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontSize: 14 }}>{p.text}</Txt>
                <Txt style={{ fontSize: 12, color: c.mut }}>{p.reason}</Txt>
              </View>
              <Txt style={{ fontFamily: fonts.mono, fontSize: 11, color: c.okTx }}>
                {p.resolvedAt ? `${DAY_UPPER[isoDow(localDay(p.resolvedAt)) - 1]} ✓` : '✓'}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    height: 36,
    minWidth: HIT,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  rule: { gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  ruleRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cleared: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  history: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
