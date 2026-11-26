import { useEffect, useMemo } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { focusRemainingMs, formatClock } from '@takip/shared';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { getAppLabel } from '@/features/focus/guard';
import { useGuardInfo } from '@/features/focus/useGuardInfo';
import { useNow } from '@/lib/useNow';
import { focusNow, useFocusStore } from '@/store/focusStore';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const PKG_RE = /^[A-Za-z0-9_.]{1,200}$/;

const backToFocus = () => {
  if (router.canDismiss()) router.dismissTo('/focus');
  else router.replace('/focus');
};

/** Engellenen bir uygulama açılmaya çalışılınca erişilebilirlik hizmeti buraya getirir. */
export default function FocusBlockedScreen() {
  const { c } = useTheme();
  useNow(1000);
  const params = useLocalSearchParams<{ pkg?: string | string[] }>();
  const raw = Array.isArray(params.pkg) ? params.pkg[0] : params.pkg;
  const pkg = raw && PKG_RE.test(raw) ? raw : null;
  const appName = useMemo(() => (pkg ? (getAppLabel(pkg) ?? pkg) : null), [pkg]);
  const { status, refresh } = useGuardInfo(2000);
  const session = useFocusStore((s) => s.session);

  // Aynı ekran yeni bir deep link'le güncellenince sayaç hemen yenilensin.
  useEffect(() => {
    refresh();
  }, [pkg, refresh]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backToFocus();
      return true;
    });
    return () => sub.remove();
  }, []);

  const remaining = session ? focusRemainingMs(session, focusNow()) : 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.content}>
        <Txt variant="label" color="mut">
          ODAK ENGELİ
        </Txt>
        <Txt variant="screenTitle" style={{ textAlign: 'center' }}>
          Odaktasın
        </Txt>
        <Txt style={{ fontSize: 15, lineHeight: 22, textAlign: 'center' }} color="tx2">
          {appName ? `${appName} şu an kapalı.` : 'Bu uygulama şu an kapalı.'} Tırmanış bitince
          açılır.
        </Txt>

        {session ? (
          <View style={styles.clockBox}>
            <Txt style={[styles.clock, { color: c.tx }]} accessibilityRole="timer">
              {formatClock(remaining)}
            </Txt>
            <Txt style={{ fontSize: 13 }} color="mut">
              {session.status === 'paused' ? 'seans duraklatıldı' : 'kalan süre'}
            </Txt>
          </View>
        ) : null}

        {status.attempts > 0 ? (
          <Txt style={{ fontSize: 13 }} color="penTx">
            Bu seansta {status.attempts} kez engellendi
          </Txt>
        ) : null}

        <Button label="Odağa dön" onPress={backToFocus} style={{ alignSelf: 'stretch' }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  clockBox: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  clock: { fontFamily: fonts.monoMedium, fontSize: 56, lineHeight: 60, letterSpacing: -1 },
});
