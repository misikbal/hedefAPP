import { Pressable, StyleSheet, View } from 'react-native';
import { BackIcon, ForwardIcon } from '@/components/icons';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}

/** Ay / yıl değiştirici: ‹ Kasım 2026 › */
export function PeriodSwitcher({
  label,
  onPrev,
  onNext,
  nextDisabled,
  prevLabel = 'Önceki',
  nextLabel = 'Sonraki',
}: Props) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: c.s1, borderColor: c.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
        onPress={onPrev}
        style={styles.btn}
      >
        <BackIcon color={c.tx} size={20} />
      </Pressable>
      <Txt style={{ fontFamily: fonts.display, fontSize: 17 }}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: !!nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        style={[styles.btn, { opacity: nextDisabled ? 0.3 : 1 }]}
      >
        <ForwardIcon color={c.tx} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 2,
  },
  btn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
});
