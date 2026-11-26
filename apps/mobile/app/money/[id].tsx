import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeleteTransaction, useTransactions, useUpdateTransaction } from '@/api/hooks';
import { Button } from '@/components/Button';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Txt } from '@/components/Txt';
import { moneyToInput } from '@/features/money/format';
import { TransactionForm } from '@/features/money/TransactionForm';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Kayıt düzenleme. Tekil GET uç noktası olmadığından kayıt, ayın listesinden bulunur
 * (`month` parametresi liste satırından gelir).
 */
export default function EditTransactionScreen() {
  const { id, month } = useLocalSearchParams<{ id: string; month?: string }>();
  const { c } = useTheme();
  const list = useTransactions({ ...(month ? { month } : {}), limit: 200 });
  const update = useUpdateTransaction(id);
  const remove = useDeleteTransaction(id);
  const [confirm, setConfirm] = useState(false);
  const t = list.data?.items.find((x) => x.id === id);

  if (!t) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
        <SubHeader title="Kaydı düzenle" />
        <View style={{ padding: 20, gap: 14 }}>
          {list.isPending ? <Loading /> : null}
          {list.isError ? (
            <ErrorCard error={list.error} onRetry={() => void list.refetch()} />
          ) : null}
          {list.data ? <Txt color="tx2">Kayıt bulunamadı; silinmiş olabilir.</Txt> : null}
        </View>
      </SafeAreaView>
    );
  }

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
      <Txt style={{ fontSize: 14 }}>Bu kayıt silinsin mi? Geri alınamaz.</Txt>
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
  ) : (
    <Button label="Kaydı sil" variant="danger" onPress={() => setConfirm(true)} />
  );

  return (
    <TransactionForm
      key={t.id}
      title={t.type === 'income' ? 'Geliri düzenle' : 'Harcamayı düzenle'}
      typeLocked
      autoFocusAmount={false}
      initial={{
        type: t.type,
        amount: moneyToInput(t.amount),
        category: t.category,
        date: t.date.slice(0, 10),
        note: t.note ?? '',
      }}
      submitting={update.isPending}
      error={update.isError ? errorMessage(update.error) : undefined}
      onSubmit={(v) =>
        update.mutate(
          { amount: v.amount, category: v.category, date: v.date, note: v.note || null },
          { onSuccess: () => router.back() },
        )
      }
      footer={footer}
    />
  );
}
