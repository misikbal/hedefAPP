import { Pressable, StyleSheet, View } from 'react-native';
import { JOURNAL_TAGS, JOURNAL_TAG_MAX, journalTagLabel } from '@takip/shared';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';

/** Öneri etiketleri + kayıttaki liste dışı (other:) etiketler; en çok 5 seçilir. */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const { c } = useTheme();
  const extra = value.filter((t) => !(JOURNAL_TAGS as readonly string[]).includes(t));
  const all = [...JOURNAL_TAGS, ...extra];
  const full = value.length >= JOURNAL_TAG_MAX;
  return (
    <View style={styles.wrap}>
      {all.map((t) => {
        const on = value.includes(t);
        const disabled = !on && full;
        return (
          <Pressable
            key={t}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
            style={[
              styles.chip,
              {
                backgroundColor: on ? c.inv : c.s1,
                borderColor: on ? c.inv : c.line,
                opacity: disabled ? 0.45 : 1,
              },
            ]}
          >
            <Txt style={{ fontSize: 13, color: on ? c.onInv : c.tx2 }}>{journalTagLabel(t)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
