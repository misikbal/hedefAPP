import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Card } from './Card';
import { Txt } from './Txt';

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.acc} />
    </View>
  );
}

export function ErrorCard({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Beklenmeyen bir hata oldu.';
  return (
    <Card>
      <Txt variant="label" color="penTx">
        HATA
      </Txt>
      <Txt color="tx2">{message}</Txt>
      {onRetry ? (
        <Button label="Tekrar dene" variant="outline" height={44} onPress={onRetry} />
      ) : null}
    </Card>
  );
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Beklenmeyen bir hata oldu.';

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
});
