import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORY_LABELS,
  formatNumber,
  rulesForBlock,
  weekStartOf,
  type BlockHistory,
} from '@takip/shared';
import {
  useBlock,
  useBlockHistory,
  useDeleteBlock,
  useGoals,
  useInstanceAction,
  usePenaltyRules,
  useWeek,
} from '@/api/hooks';
import { Button } from '@/components/Button';
import { CheckIcon, CrossIcon } from '@/components/icons';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import { dayName, daysLabel, isoDow, reminderLabel, todayLocal } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

function InfoRow({
  label,
  value,
  first,
}: {
  label: string;
  value: React.ReactNode;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.infoRow, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <Txt style={{ fontSize: 14, color: c.mut }}>{label}</Txt>
      {typeof value === 'string' ? (
        <Txt style={{ fontSize: 14, textAlign: 'right', flexShrink: 1 }}>{value}</Txt>
      ) : (
        value
      )}
    </View>
  );
}

function HistoryCell({ week }: { week: BlockHistory['weeks'][number] }) {
  const { c } = useTheme();
  const look = {
    done: { bg: c.ok, border: c.ok, icon: <CheckIcon color={c.onAcc} /> },
    missed: { bg: c.penBg, border: c.pen, icon: <CrossIcon color={c.penTx} /> },
    skipped: { bg: 'transparent', border: c.line2, icon: <Txt style={{ color: c.mut }}>–</Txt> },
    planned: { bg: 'transparent', border: c.line2, icon: null },
    none: { bg: 'transparent', border: c.line, icon: null },
  }[week.status];
  return (
    <View style={styles.histCol}>
      <View style={[styles.histBox, { backgroundColor: look.bg, borderColor: look.border }]}>
        {look.icon}
      </View>
      <Txt style={{ fontFamily: fonts.mono, fontSize: 10, color: c.mut }}>{week.label}</Txt>
    </View>
  );
}

export default function BlockDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const today = todayLocal();
  const block = useBlock(id);
  const history = useBlockHistory(id);
  const week = useWeek(weekStartOf(today));
  const action = useInstanceAction();
  const remove = useDeleteBlock(id);
  const goals = useGoals();
  const rules = usePenaltyRules();
  const [confirm, setConfirm] = useState(false);

  if (!block.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <SubHeader title="Blok" />
        <View style={{ padding: 20 }}>
          {block.isError ? (
            <ErrorCard error={block.error} onRetry={() => void block.refetch()} />
          ) : (
            <Loading />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const b = block.data;
  const mine = (week.data?.days ?? []).flatMap((d) => d.instances).filter((i) => i.blockId === id);
  const skipped = mine.find((i) => i.status === 'skipped');
  const next = mine.find((i) => i.status === 'planned' && i.date >= today);
  const skip = week.data?.skip;
  const remaining = skip ? Math.max(0, skip.allowance - skip.used) : 0;
  const nextDay = next ? isoDow(next.date) : b.daysOfWeek[0];
  const canToggle = !b.archived && (skipped ? true : !!next && remaining > 0);

  let skipText = `Haftada ${skip?.allowance ?? 1} atlama hakkın var, ceza sayılmaz`;
  if (skipped)
    skipText = `Atlandı · ceza sayılmaz (haftalık ${skip?.allowance ?? 1} hak, ${remaining} kaldı)`;
  else if (!next) skipText = 'Bu hafta atlanacak tekrar kalmadı';
  else if (remaining === 0) skipText = 'Bu haftaki atlama hakkın doldu';

  const h = history.data;
  const pct = h && h.countedWeeks > 0 ? Math.round((h.doneWeeks / h.countedWeeks) * 100) : null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader
        title={b.title}
        right={
          b.archived ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/blocks/[id]/edit', params: { id } })}
              style={[styles.editBtn, { borderColor: c.line }]}
            >
              <Txt style={{ fontSize: 14 }}>Düzenle</Txt>
            </Pressable>
          )
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.infoCard, { backgroundColor: c.s1, borderColor: c.line }]}>
          <InfoRow
            first
            label="Zaman"
            value={`${nextDay ? dayName(nextDay) : ''} · ${b.startTime} – ${b.endTime}`}
          />
          <InfoRow
            label="Tekrar"
            value={`${b.repeatWeekly ? 'Her hafta' : 'Yalnızca bu hafta'} · ${daysLabel(b.daysOfWeek)}`}
          />
          <InfoRow label="Kategori" value={CATEGORY_LABELS[b.category]} />
          {(() => {
            const goal = goals.data?.find((g) => g.id === b.goalId);
            return goal && b.goalAmount ? (
              <InfoRow
                label="Hedefe sayılır"
                value={`${goal.name} · ${formatNumber(b.goalAmount)} ${goal.unit}`}
              />
            ) : null;
          })()}
          <InfoRow label="Hatırlatma" value={reminderLabel(b.reminderMinutes)} />
          {(() => {
            const [rule] = rulesForBlock(b, rules.data ?? []);
            return rule ? (
              <InfoRow
                label="Kaçarsa"
                value={
                  <View style={[styles.penPill, { backgroundColor: c.penBg }]}>
                    <Txt style={{ fontSize: 13, color: c.penTx }}>{rule.penalty}</Txt>
                  </View>
                }
              />
            ) : null;
          })()}
          {b.archived ? <InfoRow label="Durum" value="Silindi" /> : null}
        </View>

        <View style={{ gap: 10 }}>
          <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
            Son 6 hafta
          </Txt>
          {h ? (
            <>
              <View style={styles.histRow}>
                {h.weeks.map((w) => (
                  <HistoryCell key={w.weekStart} week={w} />
                ))}
              </View>
              <Txt style={{ fontSize: 13, color: c.tx2 }}>
                {pct === null
                  ? 'Henüz sonuçlanmış hafta yok'
                  : `${h.countedWeeks} haftada ${h.doneWeeks} kez yapıldı · %${pct}`}
              </Txt>
            </>
          ) : (
            <Loading />
          )}
        </View>

        {!b.archived ? (
          <View style={[styles.skipCard, { backgroundColor: c.s1, borderColor: c.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt style={{ fontSize: 15 }}>Bu hafta atla</Txt>
              <Txt style={{ fontSize: 12, color: c.mut }}>{skipText}</Txt>
            </View>
            <Switch
              label="Bu hafta atla"
              value={!!skipped}
              disabled={!canToggle || action.isPending}
              onChange={(on) => {
                if (on && next) action.mutate({ id: next.id, blockId: id, action: 'skip' });
                if (!on && skipped) action.mutate({ id: skipped.id, blockId: id, action: 'undo' });
              }}
            />
          </View>
        ) : null}
        {action.isError ? (
          <Txt variant="caption" color="penTx">
            {errorMessage(action.error)}
          </Txt>
        ) : null}

        {!b.archived && !confirm ? (
          <Button label="Bloğu sil" variant="danger" onPress={() => setConfirm(true)} />
        ) : null}
        {confirm ? (
          <View style={[styles.confirm, { backgroundColor: c.penBg, borderColor: c.pen }]}>
            <Txt style={{ fontSize: 14 }}>
              Tüm haftalardaki tekrarlar silinsin mi? Geçmiş istatistikler kalır.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label="Evet, sil"
                variant="dangerSolid"
                height={44}
                style={{ flex: 1 }}
                loading={remove.isPending}
                onPress={() => remove.mutate(undefined, { onSuccess: () => router.back() })}
              />
              <Button
                label="Vazgeç"
                variant="outline"
                height={44}
                style={{ flex: 1 }}
                onPress={() => setConfirm(false)}
              />
            </View>
            {remove.isError ? (
              <Txt variant="caption" color="penTx">
                {errorMessage(remove.error)}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  editBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  infoCard: { borderWidth: 1, borderRadius: 14 },
  penPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, flexShrink: 1 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  histRow: { flexDirection: 'row', justifyContent: 'space-between' },
  histCol: { alignItems: 'center', gap: 6 },
  histBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  confirm: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
});
