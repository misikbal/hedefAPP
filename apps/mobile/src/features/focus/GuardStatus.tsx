import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ForwardIcon } from '@/components/icons';
import { Txt } from '@/components/Txt';
import { useFocusStore } from '@/store/focusStore';
import { useGuardStore } from '@/store/guardStore';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { ensureGuardDefaults } from './guard';
import { useGuardInfo } from './useGuardInfo';

/** Odak ekranındaki tek satırlık engel durumu; dokununca Odak engeli ayarları açılır. */
export function GuardStatus() {
  const { c } = useTheme();
  const { supported, serviceOn, status } = useGuardInfo();
  const enabled = useGuardStore((s) => s.enabled);
  const mode = useGuardStore((s) => s.mode);
  const blockedCount = useGuardStore((s) => s.blocked.length);
  const session = useFocusStore((s) => s.session);

  useEffect(() => {
    void ensureGuardDefaults().catch(() => undefined);
  }, []);

  if (!supported) return null;

  const warn = enabled && !serviceOn;
  let text: string;
  if (!enabled) text = 'Uygulama engeli kapalı · Ayarla';
  else if (!serviceOn) text = 'Engel açık ama erişilebilirlik izni kapalı · Düzelt';
  else if (mode === 'all') text = 'Tüm telefon kilitli';
  else text = `Engel açık · ${blockedCount} uygulama`;

  const attempts = session && status.active && status.attempts > 0 ? status.attempts : 0;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Odak engeli: ${text}`}
      onPress={() => router.push('/focus/blocking')}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: warn ? c.penBg : c.s1,
          borderColor: warn ? c.pen : c.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: warn ? c.pen : enabled ? c.ok : c.line2 }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          style={{ fontSize: 13 }}
          color={warn ? 'penTx' : enabled ? 'tx' : 'mut'}
          numberOfLines={2}
        >
          {text}
        </Txt>
        {attempts ? (
          <Txt style={{ fontSize: 12 }} color="mut">
            Bu seansta {attempts} kez engellendi
          </Txt>
        ) : null}
      </View>
      <ForwardIcon color={c.mut} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: HIT,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
