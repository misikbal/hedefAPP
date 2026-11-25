import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** Ek ekranlarda altta sabit kaydet alanı. */
export function BottomBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: c.line, backgroundColor: c.nav, paddingBottom: 24 + insets.bottom },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1 },
});
