import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_PREFERENCES, type ThemePreference } from '@takip/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'dark',
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: 'takip.theme',
      storage: createJSONStorage(() => AsyncStorage),
      // Bozuk ya da eski bir değer okunursa varsayılana dön.
      merge: (persisted, current) => {
        const p = (persisted as Partial<ThemeState> | undefined)?.preference;
        return THEME_PREFERENCES.includes(p as ThemePreference)
          ? { ...current, preference: p as ThemePreference }
          : current;
      },
    },
  ),
);
