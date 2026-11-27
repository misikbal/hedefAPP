import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/*
 * Uygulama dikey kilitlidir; yalnızca Odak sekmesi açıkken ekranın dönmesine izin verilir
 * (yatay masa saati). app.config.ts'te `orientation: 'default'` olduğundan kilidi kodda koyarız.
 */

export function lockPortrait(): void {
  if (Platform.OS === 'web') return;
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}

export function unlockOrientation(): void {
  if (Platform.OS === 'web') return;
  void ScreenOrientation.unlockAsync().catch(() => undefined);
}
