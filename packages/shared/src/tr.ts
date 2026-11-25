/**
 * Sayıya üçüncü tekil iyelik eki: 2 → "2'si", 3 → "3'ü", 6 → "6'sı", 10 → "10'u".
 * Ek, sayının okunuşundaki son kelimeye göre seçilir.
 */
const ONES = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'] as const;
const TENS = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'] as const;

export function withPossessive(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  let suffix: string;
  if (abs === 0) suffix = 'ı';
  else if (abs % 10 !== 0) suffix = ONES[abs % 10]!;
  else if (abs % 100 !== 0) suffix = TENS[(abs / 10) % 10]!;
  else if (abs % 1000 !== 0)
    suffix = 'ü'; // yüz
  else suffix = 'i'; // bin
  return `${n}'${suffix}`;
}

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

/** 1842 → "1.842", 5.3 → "5,3" */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}
