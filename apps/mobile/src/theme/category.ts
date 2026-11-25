import type { Category } from '@takip/shared';
import type { ThemeColors } from './tokens';

/** Kategori renkleri sabittir: Proje amber, Spor yeşil, Dil mavi, Okuma bej. */
export function categoryColor(c: ThemeColors, category: Category): string {
  switch (category) {
    case 'project':
      return c.acc;
    case 'sport':
      return c.ok;
    case 'language':
      return c.dil;
    case 'reading':
      return c.oku;
    default:
      return c.mut;
  }
}
