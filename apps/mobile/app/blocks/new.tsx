import { router, useLocalSearchParams } from 'expo-router';
import { useCreateBlock } from '@/api/hooks';
import { errorMessage } from '@/components/StateViews';
import { BlockForm, toBlockBody, type BlockFormValues } from '@/features/blocks/BlockForm';
import { isoDow, todayLocal } from '@/lib/date';

export default function NewBlockScreen() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const create = useCreateBlock();
  const preselected = Number(day);
  const initial: BlockFormValues = {
    title: '',
    category: 'project',
    daysOfWeek: [preselected >= 1 && preselected <= 7 ? preselected : isoDow(todayLocal())],
    startTime: '09:00',
    endTime: '10:00',
    repeatWeekly: true,
    reminderMinutes: 10,
    goalId: null,
    goalAmount: '',
    penaltyRuleId: null,
  };

  return (
    <BlockForm
      title="Program bloğu ekle"
      initial={initial}
      submitLabel={(n) => `Programa ekle · ${n} gün`}
      submitting={create.isPending}
      serverError={create.isError ? errorMessage(create.error) : null}
      onSubmit={(values) => create.mutate(toBlockBody(values), { onSuccess: () => router.back() })}
    />
  );
}
