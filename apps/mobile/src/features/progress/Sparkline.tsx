import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/** Tamamlama oranı eğilimi (0–100). Boş değerler atlanır. */
export function Sparkline({ values, height = 64 }: { values: (number | null)[]; height?: number }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const n = Math.max(values.length - 1, 1);
  const pts = values
    .map((v, i) =>
      v === null ? null : { x: (i / n) * width, y: height - 4 - (v / 100) * (height - 8) },
    )
    .filter((p): p is { x: number; y: number } => p !== null);

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Tamamlama oranı eğilimi"
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {pts.length > 1 ? (
            <Polyline
              points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={c.acc}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {pts.length === 1 ? (
            <Circle cx={pts[0]!.x || width / 2} cy={pts[0]!.y} r={3} fill={c.acc} />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
