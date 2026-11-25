import { router } from 'expo-router';
import { useCreateGoal } from '@/api/hooks';
import { errorMessage } from '@/components/StateViews';
import { GoalForm } from '@/features/goals/GoalForm';
import { todayLocal } from '@/lib/date';

export default function NewGoalScreen() {
  const create = useCreateGoal();
  return (
    <GoalForm
      title="Yeni hedef"
      initial={{
        name: '',
        target: '',
        unit: 'sayfa',
        period: 'daily',
        category: 'reading',
        startDate: todayLocal(),
        trackStreak: true,
        penaltyRuleId: null,
      }}
      submitLabel="Hedefi kaydet"
      submitting={create.isPending}
      serverError={create.isError ? errorMessage(create.error) : null}
      onSubmit={({ targetValue, target: _t, ...v }) =>
        create.mutate({ ...v, target: targetValue }, { onSuccess: () => router.back() })
      }
    />
  );
}
