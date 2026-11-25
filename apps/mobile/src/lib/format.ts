import { formatNumber, type GoalPeriod } from '@takip/shared';

export { formatNumber };

/** "92" ya da "4,5" — giriş alanından gelen virgüllü sayıyı da çözer. */
export function parseAmount(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

export function goalPeriodHint(period: GoalPeriod, daysLeft: number): string {
  if (period === 'daily') return 'Günlük · bugün';
  const unit = period === 'weekly' ? 'Haftalık' : 'Aylık';
  if (daysLeft === 0) return `${unit} · son gün`;
  return `${unit} · ${daysLeft} gün kaldı`;
}
