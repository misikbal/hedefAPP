import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useBlock, useUpdateBlock } from '@/api/hooks';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { BlockForm, toBlockBody } from '@/features/blocks/BlockForm';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditBlockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const block = useBlock(id);
  const update = useUpdateBlock(id);

  if (!block.data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: 60 }}>
        {block.isError ? (
          <ErrorCard error={block.error} onRetry={() => void block.refetch()} />
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  const b = block.data;
  return (
    <BlockForm
      title="Bloğu düzenle"
      initial={{
        title: b.title,
        category: b.category,
        daysOfWeek: b.daysOfWeek,
        startTime: b.startTime,
        endTime: b.endTime,
        repeatWeekly: b.repeatWeekly,
        reminderMinutes: b.reminderMinutes,
        goalId: b.goalId,
        goalAmount: b.goalAmount === null ? '' : String(b.goalAmount).replace('.', ','),
        penaltyRuleId: b.penaltyRuleId,
      }}
      submitLabel={() => 'Kaydet'}
      submitting={update.isPending}
      serverError={update.isError ? errorMessage(update.error) : null}
      onSubmit={(values) => update.mutate(toBlockBody(values), { onSuccess: () => router.back() })}
    />
  );
}
