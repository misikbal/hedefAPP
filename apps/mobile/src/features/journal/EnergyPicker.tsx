import { Pressable, StyleSheet, View } from 'react-native';
import { ENERGY_LABELS } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';

/** Enerji 0–4: yükselen 5 çubuk. Seçiliye yeniden dokununca temizlenir. */
export function EnergyPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row} accessibilityRole="radiogroup">
        {ENERGY_LABELS.map((label, i) => {
          const filled = value !== null && i <= value;
          return (
            <Pressable
              key={label}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === i }}
              accessibilityLabel={`Enerji: ${label}`}
              onPress={() => onChange(value === i ? null : i)}
              style={styles.cell}
              hitSlop={4}
            >
              <View
                style={{
                  height: 10 + i * 6,
                  borderRadius: 4,
                  backgroundColor: filled ? c.dil : c.s2,
                  borderWidth: 1,
                  borderColor: filled ? c.dil : c.line,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <Txt style={{ fontSize: 12 }} color="mut">
        {value === null ? 'Seçilmedi' : ENERGY_LABELS[value]}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', minHeight: HIT },
  cell: { flex: 1, justifyContent: 'flex-end', minHeight: HIT },
});
