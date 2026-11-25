import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useDeleteGoal, useGoal, useUpdateGoal } from '@/api/hooks';
import { Button } from '@/components/Button';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { GoalForm } from '@/features/goals/GoalForm';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const goal = useGoal(id);
  const update = useUpdateGoal(id);
  const remove = useDeleteGoal(id);
  const [confirm, setConfirm] = useState(false);

  if (!goal.data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 }}>
        {goal.isError ? (
          <ErrorCard error={goal.error} onRetry={() => void goal.refetch()} />
        ) : (
          <Loading />
        )}
      </View>
    );
  }
  const g = goal.data;

  const footer = confirm ? (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        backgroundColor: c.penBg,
        borderColor: c.pen,
      }}
    >
      <Txt style={{ fontSize: 14 }}>
        Hedef silinsin mi? Girilen ilerlemeler istatistiklerde kalır, bağlı bloklar hedefe saymayı
        bırakır.
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
    </View>
  ) : (
    <Button label="Hedefi sil" variant="danger" onPress={() => setConfirm(true)} />
  );

  return (
    <GoalForm
      title="Hedefi düzenle"
      initial={{
        name: g.name,
        target: String(g.target).replace('.', ','),
        unit: g.unit,
        period: g.period,
        category: g.category,
        startDate: g.startDate,
        trackStreak: g.trackStreak,
        penaltyRuleId: g.penaltyRuleId,
      }}
      submitLabel="Kaydet"
      submitting={update.isPending}
      serverError={
        update.isError
          ? errorMessage(update.error)
          : remove.isError
            ? errorMessage(remove.error)
            : null
      }
      onSubmit={({ targetValue, target: _t, ...v }) =>
        update.mutate({ ...v, target: targetValue }, { onSuccess: () => router.back() })
      }
      footer={footer}
    />
  );
}
