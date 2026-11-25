export const APP_TIMEZONE = 'Europe/Istanbul';
/** ISO hafta: 1 = Pazartesi */
export const WEEK_START = 1;

export const CATEGORIES = ['project', 'sport', 'language', 'reading', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  project: 'Proje',
  sport: 'Spor',
  language: 'Dil',
  reading: 'Okuma',
  other: 'Diğer',
};

export const GOAL_UNITS = ['km', 'sayfa', 'kelime', 'saat', 'dakika', 'adet'] as const;
export type GoalUnit = (typeof GOAL_UNITS)[number];

export const GOAL_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const FOCUS_LEVELS = [
  { minutes: 25, name: 'Tepe', altitude: 1200 },
  { minutes: 50, name: 'Dağ', altitude: 2500 },
  { minutes: 90, name: 'Zirve', altitude: 4100 },
] as const;

export const UNIT_LABELS: Record<GoalUnit, string> = {
  km: 'km',
  sayfa: 'sayfa',
  kelime: 'kelime',
  saat: 'saat',
  dakika: 'dakika',
  adet: 'adet',
};

/** İlerleme girişinde −/+ adımı ve hızlı ekleme düğmeleri */
export const UNIT_INPUT: Record<GoalUnit, { step: number; quick: readonly number[] }> = {
  km: { step: 1, quick: [5, 10, 25] },
  sayfa: { step: 1, quick: [5, 10, 20] },
  kelime: { step: 1, quick: [5, 10, 15] },
  saat: { step: 0.5, quick: [0.5, 1, 2] },
  dakika: { step: 5, quick: [25, 50, 90] },
  adet: { step: 1, quick: [1, 5, 10] },
};

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
};

/** "Bugün" / "Bu hafta" / "Bu ay" */
export const CURRENT_PERIOD_LABELS: Record<GoalPeriod, string> = {
  daily: 'Bugün',
  weekly: 'Bu hafta',
  monthly: 'Bu ay',
};

/** Hedef kartındaki kısa etiket: "KM · HAFTA" */
export const PERIOD_SHORT: Record<GoalPeriod, string> = {
  daily: 'GÜN',
  weekly: 'HAFTA',
  monthly: 'AY',
};

export const STREAK_UNITS: Record<GoalPeriod, string> = {
  daily: 'gün',
  weekly: 'hafta',
  monthly: 'ay',
};
