import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

type Variant = 'primary' | 'outline' | 'danger' | 'dangerSolid';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** primary: 52, diğerleri: 48/44 */
  height?: number;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  height,
  disabled,
  loading,
  icon,
  style,
}: Props) {
  const { c } = useTheme();
  const h = height ?? (variant === 'primary' ? 52 : 48);
  const palette = {
    primary: { bg: c.acc, border: c.acc, fg: c.onAcc },
    outline: { bg: 'transparent', border: c.line, fg: c.tx },
    danger: { bg: 'transparent', border: c.pen, fg: c.penTx },
    dangerSolid: { bg: c.pen, border: c.pen, fg: '#FFFFFF' },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        {
          height: h,
          borderRadius: h / 2,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon}
      <Txt
        style={{
          color: palette.fg,
          fontFamily: variant === 'outline' || variant === 'danger' ? fonts.body : fonts.bodySemi,
          fontSize: variant === 'primary' ? 16 : 15,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
});
