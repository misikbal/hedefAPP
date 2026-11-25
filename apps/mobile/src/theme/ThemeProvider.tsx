import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { useThemeStore } from '@/store/themeStore';
import { themes, type ThemeColors, type ThemeName } from './tokens';

interface ThemeContextValue {
  name: ThemeName;
  c: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((s) => s.preference);
  const system = useColorScheme();
  const name: ThemeName =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo(() => ({ name, c: themes[name] }), [name]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(value.c.bg);
  }, [value.c.bg]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme ThemeProvider içinde kullanılmalı');
  return ctx;
}
