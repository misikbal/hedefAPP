import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FOCUS_MINUTES,
  type FocusFinishResponse,
  type FocusMinutes,
  type FocusSession,
} from '@takip/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { nextSceneSeed } from '@/features/focus/mountainScene';

/**
 * Odak sayacının cihazdaki durumu (AsyncStorage'da kalıcı). Asıl kaynak sunucudur;
 * uygulama açılınca GET /focus/active ile yenilenir. Süre her zaman duvar saatinden hesaplanır.
 */
interface FocusState {
  /** Açık (running | paused) seansın son bilinen hâli */
  session: FocusSession | null;
  /** sunucu saati − cihaz saati */
  clockOffsetMs: number;
  /** Uygulamanın arka plana geçtiği an (öldürülse de kalır) */
  backgroundAt: number | null;
  endNotificationId: string | null;
  /** Son bitirilen seans ve haftalık özet (Odak bitti ekranı ve zirve görünümü) */
  lastFinish: FocusFinishResponse | null;
  breakEndsAt: number | null;
  breakNotificationId: string | null;
  /** Seçici: süre ve etiket */
  plannedMinutes: FocusMinutes;
  label: string;
  /** Dağ sahnesi çeşidi; seans boyunca sabit, bir tırmanış kapanınca yenisi seçilir */
  sceneSeed: number;
}

const initial: FocusState = {
  session: null,
  clockOffsetMs: 0,
  backgroundAt: null,
  endNotificationId: null,
  lastFinish: null,
  breakEndsAt: null,
  breakNotificationId: null,
  plannedMinutes: 50,
  label: '',
  sceneSeed: nextSceneSeed(),
};

export const useFocusStore = create<FocusState>()(
  persist(() => initial, {
    name: 'takip.focus',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<FocusState>;
      const plannedMinutes = (FOCUS_MINUTES as readonly number[]).includes(p.plannedMinutes ?? 0)
        ? (p.plannedMinutes as FocusMinutes)
        : current.plannedMinutes;
      return { ...current, ...p, plannedMinutes };
    },
  }),
);

/** Sunucu saatine göre düzeltilmiş "şimdi" */
export const focusNow = () => Date.now() + useFocusStore.getState().clockOffsetMs;

/** `lastFinish` temizlenince (zirve görünümü kapanınca) yeni dağ sahnesi seçilir. */
export const setFocus = (patch: Partial<FocusState>) => {
  const prev = useFocusStore.getState();
  const next =
    patch.lastFinish === null && prev.lastFinish && patch.sceneSeed === undefined
      ? { ...patch, sceneSeed: nextSceneSeed(prev.sceneSeed) }
      : patch;
  useFocusStore.setState(next);
};

/** Sıfırlanan (terk edilen) tırmanıştan sonra yeni dağ sahnesi */
export const rerollScene = () =>
  useFocusStore.setState((s) => ({ sceneSeed: nextSceneSeed(s.sceneSeed) }));

/** Çıkışta cihazdaki odak durumu temizlenir (seçici tercihleri kalır). */
export const resetFocusDevice = () =>
  useFocusStore.setState({
    session: null,
    backgroundAt: null,
    endNotificationId: null,
    lastFinish: null,
    breakEndsAt: null,
    breakNotificationId: null,
  });
