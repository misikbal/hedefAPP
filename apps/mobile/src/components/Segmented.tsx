import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Seçili sekme ters renkli (koyu temada açık zemin). */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.root, { backgroundColor: c.s1, borderColor: c.line }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && { backgroundColor: c.inv }]}
          >
            <Txt
              style={{
                fontFamily: selected ? fonts.bodySemi : fonts.body,
                fontSize: 14,
                color: selected ? c.onInv : c.tx,
              }}
            >
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  item: {
    flex: 1,
    minHeight: HIT - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
});
