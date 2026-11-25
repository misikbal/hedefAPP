import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '@/api/client';
import { ensurePermission, SUPPORTED } from './local';

const TOKEN_KEY = 'takip.expoPushToken';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no_project' | 'error'; message?: string };

/**
 * Expo push token alır ve API'ye kaydeder (`POST /devices`). Expo Go'da ve emülatörde
 * Google Play hizmetleri yoksa token alınamaz; development build gerekir.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!SUPPORTED) return { ok: false, reason: 'unsupported' };
  if (!(await ensurePermission())) return { ok: false, reason: 'denied' };
  const id = projectId();
  if (!id) return { ok: false, reason: 'no_project' };
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api('/devices', {
      method: 'POST',
      body: { expoPushToken: token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Çıkışta: bu cihaz artık bu kullanıcıya push almasın. */
export async function unregisterPush(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await api('/devices', { method: 'DELETE', body: { expoPushToken: token } }).catch(
    () => undefined,
  );
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}
