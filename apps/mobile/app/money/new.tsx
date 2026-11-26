import { router, useLocalSearchParams } from 'expo-router';
import { useCreateTransaction } from '@/api/hooks';
import { errorMessage } from '@/components/StateViews';
import { TransactionForm } from '@/features/money/TransactionForm';
import { todayLocal } from '@/lib/date';

export default function NewTransactionScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type = params.type === 'income' ? 'income' : 'expense';
  const create = useCreateTransaction();
  return (
    <TransactionForm
      title={type === 'income' ? 'Gelir ekle' : 'Harcama ekle'}
      initial={{ type, amount: '', date: todayLocal(), note: '' }}
      submitting={create.isPending}
      error={create.isError ? errorMessage(create.error) : undefined}
      onSubmit={(v) =>
        create.mutate(
          {
            type: v.type,
            amount: v.amount,
            category: v.category,
            date: v.date,
            ...(v.note ? { note: v.note } : {}),
          },
          { onSuccess: () => router.back() },
        )
      }
    />
  );
}
