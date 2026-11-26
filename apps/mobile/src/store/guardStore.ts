import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** 'apps': yalnızca seçili uygulamalar · 'all': izin listesi dışındaki her şey (Tam odak). */
export type GuardMode = 'apps' | 'all';

/** Bilinen sosyal medya paketleri. WhatsApp bilerek yok (iletişim için gerekebilir). */
export const SOCIAL_PACKAGES: readonly string[] = [
  'com.instagram.android',
  'com.instagram.barcelona',
  'com.zhiliaoapp.musically',
  'com.ss.android.ugc.trill',
  'com.twitter.android',
  'com.facebook.katana',
  'com.facebook.lite',
  'com.facebook.orca',
  'com.snapchat.android',
  'com.google.android.youtube',
  'com.reddit.frontpage',
  'com.pinterest',
  'tv.twitch.android.app',
  'com.discord',
  'com.linkedin.android',
  'org.telegram.messenger',
];

/**
 * Odak engeli ayarları (yalnızca cihazda, AsyncStorage'da kalıcı). Engelin kendisi native
 * tarafta SharedPreferences'tadır; bu ayarlar her seans değişiminde oraya yazılır (`syncGuard`).
 */
interface GuardState {
  enabled: boolean;
  mode: GuardMode;
  /** mode 'apps' için engellenen paketler */
  blocked: string[];
  /** mode 'all' için ek izinli paketler */
  allowed: string[];
  /** Ayarlar ve kaldırma ekranı da engellenir (hizmeti kapatıp kaçmayı önler) */
  blockSettings: boolean;
  blockDuringPause: boolean;
  /** Varsayılan liste cihazdaki uygulamalarla bir kez daraltıldı mı */
  initialized: boolean;
}

const initial: GuardState = {
  enabled: false,
  mode: 'apps',
  blocked: [...SOCIAL_PACKAGES],
  allowed: [],
  blockSettings: false,
  blockDuringPause: true,
  initialized: false,
};

export const useGuardStore = create<GuardState>()(
  persist(() => initial, {
    name: 'takip.focusGuard',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<GuardState>;
      const strings = (v: unknown, fallback: string[]) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback;
      return {
        ...current,
        enabled: typeof p.enabled === 'boolean' ? p.enabled : current.enabled,
        mode: p.mode === 'all' || p.mode === 'apps' ? p.mode : current.mode,
        blocked: strings(p.blocked, current.blocked),
        allowed: strings(p.allowed, current.allowed),
        blockSettings:
          typeof p.blockSettings === 'boolean' ? p.blockSettings : current.blockSettings,
        blockDuringPause:
          typeof p.blockDuringPause === 'boolean' ? p.blockDuringPause : current.blockDuringPause,
        initialized: p.initialized === true,
      };
    },
  }),
);

export const setGuard = (patch: Partial<GuardState>) => useGuardStore.setState(patch);
