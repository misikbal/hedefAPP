import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { BackIcon } from './icons';
import { Txt } from './Txt';

/** Ek ekranların başlığı: geri düğmesi + 22 px başlık + isteğe bağlı sağ eylem. */
export function SubHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Geri"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.back}
      >
        <BackIcon color={c.tx} />
      </Pressable>
      <Txt variant="subScreenTitle" style={styles.title} numberOfLines={1}>
        {title}
      </Txt>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  right: { marginRight: 8 },
});
