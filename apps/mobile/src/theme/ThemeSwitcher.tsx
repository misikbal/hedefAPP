import type { ThemePreference } from '@takip/shared';
import { Segmented } from '@/components/Segmented';
import { useThemeStore } from '@/store/themeStore';

const OPTIONS = [
  { value: 'dark', label: 'Koyu' },
  { value: 'light', label: 'Açık' },
  { value: 'system', label: 'Sistem' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export function ThemeSwitcher() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  return <Segmented options={OPTIONS} value={preference} onChange={setPreference} />;
}
