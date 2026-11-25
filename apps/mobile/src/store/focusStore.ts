import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FOCUS_MINUTES,
  type FocusFinishResponse,
  type FocusMinutes,
  type FocusSession,
} from '@takip/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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

export const setFocus = (patch: Partial<FocusState>) => useFocusStore.setState(patch);

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
