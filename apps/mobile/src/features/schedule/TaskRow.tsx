import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CATEGORY_LABELS, type Instance } from '@takip/shared';
import { CheckIcon } from '@/components/icons';
import { Txt } from '@/components/Txt';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

interface Props {
  item: Instance;
  onToggle: () => void;
  onOpen: () => void;
}

/** Bugünün akışındaki satır: saat + kart + işaretleme düğmesi. İşaretlenen blok soluk ve üstü çizili. */
export function TaskRow({ item, onToggle, onOpen }: Props) {
  const { c } = useTheme();
  const done = item.status === 'done';
  const skipped = item.status === 'skipped';
  const faded = done || skipped;
  const meta = skipped
    ? 'Bu hafta atlandı'
    : [CATEGORY_LABELS[item.category], item.description].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <Txt style={[styles.time, { color: c.mut }]}>{item.startTime}</Txt>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} ayrıntıları`}
        style={[
          styles.card,
          { backgroundColor: faded ? 'transparent' : c.s1, borderColor: c.line },
        ]}
      >
        <View style={styles.text}>
          <Txt
            numberOfLines={1}
            style={{
              fontFamily: fonts.bodyMedium,
              fontSize: 15,
              color: faded ? c.mut : c.tx,
              textDecorationLine: faded ? 'line-through' : 'none',
            }}
          >
            {item.title}
          </Txt>
          <Txt numberOfLines={1} style={{ fontSize: 12, color: c.mut, fontFamily: fonts.body }}>
            {meta}
          </Txt>
        </View>
        {skipped ? null : (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={done ? 'Tamamlandı, geri al' : 'Görevi tamamla'}
            accessibilityState={{ checked: done }}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle();
            }}
            style={[
              styles.check,
              {
                backgroundColor: done ? c.acc : 'transparent',
                borderColor: done ? c.acc : c.line2,
              },
            ]}
          >
            {done ? <CheckIcon color={c.onAcc} /> : null}
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  time: { width: 44, paddingTop: 16, fontFamily: fonts.mono, fontSize: 12 },
  card: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingRight: 10,
    paddingLeft: 14,
    marginVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 64,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  check: {
    width: HIT,
    height: HIT,
    borderRadius: HIT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
