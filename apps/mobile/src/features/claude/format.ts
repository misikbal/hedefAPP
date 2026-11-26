import { APP_TIMEZONE, localDateOf, localTimeOf } from '@takip/shared';
import { dayMonthLabel, todayLocal } from '@/lib/date';

/** "22:41" (bugün) ya da "24 kasım 22:41" */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = localTimeOf(d, APP_TIMEZONE);
  const date = localDateOf(d, APP_TIMEZONE);
  if (date === todayLocal()) return time;
  return `${dayMonthLabel(date).toLocaleLowerCase('tr-TR')} ${time}`;
}

/** "bugün 22:41" / "24 kasım 22:41" (cümle içinde) */
export function lastAccessLabel(iso: string): string {
  const label = whenLabel(iso);
  return label.length === 5 ? `bugün ${label}` : label;
}
