import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  /** 0–1 */
  value: number;
  height?: number;
  color?: string;
  /** İkinci dilim (ör. önizlemede eklenecek miktar) */
  extra?: number;
  extraColor?: string;
}

export function ProgressBar({ value, height = 4, color, extra = 0, extraColor }: Props) {
  const { c } = useTheme();
  const a = Math.max(0, Math.min(1, value));
  const b = Math.max(0, Math.min(1 - a, extra));
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: c.line,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      <View style={{ width: `${a * 100}%`, backgroundColor: color ?? c.acc }} />
      {b > 0 ? (
        <View style={{ width: `${b * 100}%`, backgroundColor: extraColor ?? c.ok }} />
      ) : null}
    </View>
  );
}
