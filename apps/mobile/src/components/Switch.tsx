import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Açıkken dolgu rengi (ceza kurallarında ceza rengi) */
  color?: string;
  disabled?: boolean;
}

/** 52 × 32 anahtar; açıkken amber. */
export function Switch({ value, onChange, label, color, disabled }: Props) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onChange(!value)}
      style={[
        styles.track,
        {
          justifyContent: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? (color ?? c.acc) : c.line2,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    padding: 3,
    flexDirection: 'row',
    flexShrink: 0,
  },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF' },
});
