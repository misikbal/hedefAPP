import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';

interface Props {
  children: ReactNode;
  label: string;
  onPress: () => void;
  /** Okunmamış noktası */
  dot?: boolean;
}

export function IconButton({ children, label, onPress, dot }: Props) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: c.line, backgroundColor: pressed ? c.s2 : c.s1 },
      ]}
    >
      {children}
      {dot ? <View style={[styles.dot, { backgroundColor: c.acc }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4 },
});
