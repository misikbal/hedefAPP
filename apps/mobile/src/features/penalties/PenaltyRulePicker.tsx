import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PenaltyTrigger } from '@takip/shared';
import { usePenaltyRules } from '@/api/hooks';
import { Field } from '@/components/Field';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

interface Props {
  label: string;
  trigger: Extract<PenaltyTrigger, 'block_missed' | 'goal_failed'>;
  value: string | null;
  onChange: (ruleId: string | null) => void;
}

/**
 * Blok/hedef formundaki "Kaçırırsam ceza" / "Tutmazsa ceza" alanı. Seçenekler, tetikleyicisi
 * uyan kurallardır (tasarımdaki select yerine çip satırı; çerçeve ceza renginde).
 */
export function PenaltyRulePicker({ label, trigger, value, onChange }: Props) {
  const { c } = useTheme();
  const rules = usePenaltyRules();
  const options = (rules.data ?? []).filter((r) => r.trigger === trigger);
  // Aynı ceza metni birden fazla kuralda varsa koşulla ayırt edilir.
  const dup = (text: string) => options.filter((r) => r.penalty === text).length > 1;

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? c.pen : 'transparent', borderColor: c.pen },
  ];

  return (
    <Field label={label}>
      <View style={styles.wrap}>
        {options.map((r) => {
          const on = value === r.id;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(r.id)}
              style={chip(on)}
            >
              <Txt
                style={{
                  fontSize: 14,
                  fontFamily: fonts.body,
                  color: on ? '#FFFFFF' : r.enabled ? c.tx : c.mut,
                }}
              >
                {dup(r.penalty) ? `${r.penalty} (${r.when})` : r.penalty}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value === null }}
          onPress={() => onChange(null)}
          style={[
            styles.chip,
            {
              backgroundColor: value === null ? c.s2 : 'transparent',
              borderColor: value === null ? c.tx : c.line,
            },
          ]}
        >
          <Txt style={{ fontSize: 14, fontFamily: fonts.body }}>Ceza yok</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/penalties/rules/new', params: { trigger } })}
          style={[styles.chip, { borderColor: c.line }]}
        >
          <Txt style={{ fontSize: 14, fontFamily: fonts.body, color: c.penTx }}>+ Kural</Txt>
        </Pressable>
      </View>
      <Txt style={{ fontSize: 12, color: c.mut }}>
        {trigger === 'block_missed'
          ? 'Kategori ve "tüm bloklar" kuralları ayrıca kendiliğinden uygulanır.'
          : 'Kategori ve "tüm hedefler" kuralları ayrıca kendiliğinden uygulanır.'}
      </Txt>
    </Field>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: HIT,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
