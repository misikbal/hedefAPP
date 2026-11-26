import { addMonths, type BudgetStatus } from '@takip/shared';
import { todayLocal } from '@/lib/date';
import type { ThemeColors } from '@/theme/tokens';

/** "2026-11" */
export const currentMonth = () => todayLocal().slice(0, 7);
export const currentYear = () => Number(todayLocal().slice(0, 4));

/** "2026-11" + 1 → "2026-12" */
export const shiftMonth = (month: string, delta: number) =>
  addMonths(`${month}-01`, delta).slice(0, 7);

/**
 * Tutar alanı: "120", "12,5", "1.234,50" ve "12.5" kabul edilir.
 * Virgül varsa ondalık ayraç odur ve noktalar binlik sayılır.
 */
export function parseMoneyInput(text: string): number | null {
  let t = text.replace(/\s|₺/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 1234.5 → "1234,5" (düzenleme alanı için, binlik ayraçsız) */
export const moneyToInput = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Bütçe durumunun dolgu rengi */
export const statusColor = (c: ThemeColors, s: BudgetStatus | null) =>
  s === 'over' ? c.pen : s === 'warn' ? c.acc : c.ok;

/** Bütçe durumunun yazı rengi */
export const statusTextColor = (c: ThemeColors, s: BudgetStatus | null) =>
  s === 'over' ? c.penTx : s === 'warn' ? c.accTx : c.okTx;

/** Ay kısaltmaları (yıllık grafik) */
export const MONTH_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;
