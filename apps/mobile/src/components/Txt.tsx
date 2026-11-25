import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { type as typeScale } from '@/theme/typography';
import type { ThemeColors } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

interface Props extends TextProps {
  variant?: Variant;
  color?: keyof ThemeColors;
}

export function Txt({ variant = 'body', color = 'tx', style, ...rest }: Props) {
  const { c } = useTheme();
  return <Text {...rest} style={[typeScale[variant] as TextStyle, { color: c[color] }, style]} />;
}
