import { Pressable, StyleSheet, View } from 'react-native';
import { MOOD_LABELS, MOOD_TONES } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';

export function MoodDot({ mood, size }: { mood: number; size: number }) {
  const { c } = useTheme();
  const tone = MOOD_TONES[mood] ?? 'line2';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c[tone] }} />
  );
}

/** "Gün nasıl geçti?" 5 ruh hâli kutusu (64 px) */
export function MoodPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (m: number) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {MOOD_LABELS.map((label, i) => {
        const on = i === value;
        return (
          <Pressable
            key={label}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => onChange(i)}
            style={[
              styles.box,
              { backgroundColor: on ? c.s2 : c.s1, borderColor: on ? c.acc : c.line },
            ]}
          >
            <MoodDot mood={i} size={16} />
            <Txt style={{ fontSize: 11 }}>{label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  box: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
