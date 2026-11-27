import { TZDate } from '@date-fns/tz';
import { addDays, isoDayOfWeek, localDateOf, monthEndOf } from './time.js';
import { formatNumber } from './tr.js';
import { formatDuration } from './focus.js';

/** 0 = Zor … 4 = Harika */
export const MOOD_LABELS = ['Zor', 'Durgun', 'Normal', 'İyi', 'Harika'] as const;
/** Ruh hâli renkleri (tema token adları), MOOD_LABELS ile aynı sırada */
export const MOOD_TONES = ['line2', 'mut', 'tx2', 'oku', 'acc'] as const;

/** Bu saatten önce (yerel) yazılan günlük bir önceki güne sayılır */
export const JOURNAL_DAY_CUTOFF_HOUR = 4;
export const JOURNAL_TEXT_MAX = 1000;

/** Günlük ekranının varsayılan günü: yerel 04:00'e kadar dün. */
export function journalDateOf(instant: Date, timeZone: string): string {
  const today = localDateOf(instant, timeZone);
  const hour = new TZDate(instant.getTime(), timeZone).getHours();
  return hour < JOURNAL_DAY_CUTOFF_HOUR ? addDays(today, -1) : today;
}

/** Ay ızgarası: pazartesiden başlar; `leading` ilk günden önceki boş hücre sayısı. */
export function monthGrid(month: string): { leading: number; days: string[] } {
  const first = `${month}-01`;
  const last = monthEndOf(first);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return { leading: isoDayOfWeek(first) - 1, days };
}

/** "2026-11" → "2026-12" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Önceki günler listesindeki metin: ilk dolu alan */
export function journalPreview(e: {
  wentWell?: string | null;
  hard?: string | null;
  tomorrowOne?: string | null;
}): string {
  return (e.wentWell || e.hard || e.tomorrowOne || '').trim();
}

export interface DayStatsLike {
  goals: { name: string; unit: string; amount: number }[];
  focusMinutes: number;
  blocks: { done: number; total: number };
  penalties: { created: number; open: number };
}

/** Günlük ekranındaki çipler: "25 km bisiklet", "1 sa 40 dk odak", "4/6 görev", "1 ceza bekliyor" */
export function dayStatChips(s: DayStatsLike): { text: string; tone: 'normal' | 'penalty' }[] {
  const chips: { text: string; tone: 'normal' | 'penalty' }[] = s.goals.map((g) => ({
    text: `${formatNumber(g.amount)} ${g.unit} ${g.name.toLocaleLowerCase('tr-TR')}`,
    tone: 'normal',
  }));
  if (s.focusMinutes > 0)
    chips.push({ text: `${formatDuration(s.focusMinutes)} odak`, tone: 'normal' });
  if (s.blocks.total > 0)
    chips.push({ text: `${s.blocks.done}/${s.blocks.total} görev`, tone: 'normal' });
  if (s.penalties.open > 0)
    chips.push({ text: `${s.penalties.open} ceza bekliyor`, tone: 'penalty' });
  return chips;
}

/** Takvimdeki satır: "4/5 blok · 1 sa 40 dk odak · ceza yok" */
export function dayStatsLine(s: DayStatsLike): string {
  const parts: string[] = [];
  if (s.blocks.total > 0) parts.push(`${s.blocks.done}/${s.blocks.total} blok`);
  if (s.focusMinutes > 0) parts.push(`${formatDuration(s.focusMinutes)} odak`);
  if (s.penalties.open > 0) parts.push(`${s.penalties.open} ceza bekliyor`);
  else if (s.penalties.created > 0) parts.push(`${s.penalties.created} ceza`);
  else parts.push('ceza yok');
  return parts.join(' · ');
}

/* ---------- günlük analizi (etiket, enerji, örüntüler) ---------- */

/** 0 = Çok düşük … 4 = Çok yüksek */
export const ENERGY_LABELS = ['Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok yüksek'] as const;

/** Önerilen etiketler; Claude bu listeden seçer, dışındakiler `other:` önekiyle saklanır. */
export const JOURNAL_TAGS = [
  'yorgunluk',
  'stres',
  'odak',
  'uyku',
  'motivasyon',
  'sosyal',
  'sağlık',
  'iş',
  'kod',
  'spor',
  'dil',
  'okuma',
  'para',
] as const;
export const JOURNAL_TAG_MAX = 5;
export const JOURNAL_TAG_LENGTH_MAX = 30;
export const JOURNAL_SUMMARY_MAX = 200;
export const JOURNAL_OTHER_TAG_PREFIX = 'other:';

/**
 * Etiketi sadeleştirir: kırpılır, küçük harfe çevrilir (tr), listede değilse `other:` öneki alır.
 * Boş etiket için null.
 */
export function normalizeJournalTag(raw: string): string | null {
  let t = raw.trim().replace(/^#/, '').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
  if (t.startsWith(JOURNAL_OTHER_TAG_PREFIX)) t = t.slice(JOURNAL_OTHER_TAG_PREFIX.length).trim();
  if (!t) return null;
  t = t.slice(0, JOURNAL_TAG_LENGTH_MAX - JOURNAL_OTHER_TAG_PREFIX.length);
  return (JOURNAL_TAGS as readonly string[]).includes(t) ? t : `${JOURNAL_OTHER_TAG_PREFIX}${t}`;
}

/** Tekrarsız, sıralı korunmuş, en çok 5 etiket */
export function normalizeJournalTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeJournalTag(r);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === JOURNAL_TAG_MAX) break;
  }
  return out;
}

/** Ekranda gösterilen etiket: `other:` öneki atılır */
export function journalTagLabel(tag: string): string {
  return tag.startsWith(JOURNAL_OTHER_TAG_PREFIX)
    ? tag.slice(JOURNAL_OTHER_TAG_PREFIX.length)
    : tag;
}

/** Karşılaştırmalı alanlar (spor var/yok, enerji düşük/yüksek) için her grupta gereken en az kayıt */
export const INSIGHT_MIN_SAMPLES = 3;
/** Kaçan saat dilimi genişliği (saat) */
export const INSIGHT_SLOT_HOURS = 2;

export interface InsightEntryInput {
  date: string;
  mood: number;
  energy: number | null;
  tags: string[];
  /** summary, yoksa ilk dolu metin alanı */
  summary: string | null;
  snapshot: {
    blocksDone: number;
    blocksMissed: number;
    /** O gün spor bloğu yoksa null */
    sportDone: boolean | null;
  } | null;
}

export interface InsightInput {
  from: string;
  to: string;
  /** Aralığın değerlendirildiği son gün (bugünden ileri değil); seriler buradan geriye sayılır */
  asOf: string;
  entries: InsightEntryInput[];
  /** Aralıktaki her gün için blok sayıları (canlı veriden) */
  completion: Map<string, { done: number; missed: number }>;
  /** Aralıkta kaçan bloklar */
  missed: { category: string; startTime: string }[];
  /** asOf'a kadar spor bloklarının sonuçları, eskiden yeniye (seri için) */
  sportResults: boolean[];
  /** asOf'tan geriye günlük yazılan günler (seri için; aralık dışına taşabilir) */
  journalDates: Set<string>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function completionOf(s: { blocksDone: number; blocksMissed: number }): number | null {
  const n = s.blocksDone + s.blocksMissed;
  return n === 0 ? null : s.blocksDone / n;
}

function mostCommon<T extends string>(xs: T[], min = 1): T | null {
  const counts = new Map<T, number>();
  xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  let best: T | null = null;
  let n = 0;
  counts.forEach((c, k) => {
    if (c > n || (c === n && best !== null && k < best)) {
      best = k;
      n = c;
    }
  });
  return n >= min ? best : null;
}

function slotOf(time: string): string {
  const h = Number(time.slice(0, 2));
  const start = Math.floor(h / INSIGHT_SLOT_HOURS) * INSIGHT_SLOT_HOURS;
  const end = Math.min(start + INSIGHT_SLOT_HOURS, 24);
  const p = (x: number) => `${String(x).padStart(2, '0')}:00`;
  return `${p(start)}-${p(end)}`;
}

/**
 * Günlük örüntüleri: sunucu verileri toplar, hesap burada (deterministik, DB'siz test edilir).
 * Az veride karşılaştırmalı alanlar null döner.
 */
export function computeJournalInsights(input: InsightInput) {
  const entries = [...input.entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const moods = entries.map((e) => e.mood);

  let moodTrend: 'up' | 'down' | 'flat' | null = null;
  if (entries.length >= 4) {
    const half = Math.floor(entries.length / 2);
    const first = avg(moods.slice(0, half))!;
    const second = avg(moods.slice(entries.length - half))!;
    moodTrend = second - first >= 0.5 ? 'up' : first - second >= 0.5 ? 'down' : 'flat';
  }

  const energies = entries.map((e) => e.energy).filter((x): x is number => x !== null);

  let done = 0;
  let missed = 0;
  const days: {
    date: string;
    mood: number | null;
    energy: number | null;
    completion: number | null;
  }[] = [];
  const byDate = new Map(entries.map((e) => [e.date, e]));
  for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
    const c = input.completion.get(d);
    if (c) {
      done += c.done;
      missed += c.missed;
    }
    const e = byDate.get(d);
    days.push({
      date: d,
      mood: e?.mood ?? null,
      energy: e?.energy ?? null,
      completion: c && c.done + c.missed > 0 ? r2(c.done / (c.done + c.missed)) : null,
    });
  }

  const groupMood = (pred: (e: InsightEntryInput) => boolean) => {
    const xs = entries.filter(pred).map((e) => e.mood);
    return xs.length >= INSIGHT_MIN_SAMPLES ? r1(avg(xs)!) : null;
  };
  const groupCompletion = (pred: (e: InsightEntryInput) => boolean) => {
    const xs = entries
      .filter((e) => e.snapshot && pred(e))
      .map((e) => completionOf(e.snapshot!))
      .filter((x): x is number => x !== null);
    return xs.length >= INSIGHT_MIN_SAMPLES ? r2(avg(xs)!) : null;
  };

  const tagCounts = new Map<string, number>();
  entries.forEach((e) => e.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 5) as [string, number][];

  let journalStreak = 0;
  for (let d = input.asOf; input.journalDates.has(d); d = addDays(d, -1)) journalStreak++;
  let sportStreak = 0;
  for (let i = input.sportResults.length - 1; i >= 0 && input.sportResults[i]; i--) sportStreak++;

  // Son kayıtlardan geriye, ruh hâli 0–1 olan ardışık kayıtlar
  let lowMoodStreak = 0;
  for (let i = entries.length - 1; i >= 0 && entries[i]!.mood <= 1; i--) lowMoodStreak++;

  let lowest: InsightEntryInput | null = null;
  for (const e of entries) if (!lowest || e.mood <= lowest.mood) lowest = e;

  return {
    range: `${input.from}..${input.to}`,
    from: input.from,
    to: input.to,
    entries: entries.length,
    moodAvg: moods.length ? r1(avg(moods)!) : null,
    moodTrend,
    energyAvg: energies.length ? r1(avg(energies)!) : null,
    completionRate: done + missed > 0 ? r2(done / (done + missed)) : null,
    moodWhenSportDone: groupMood((e) => e.snapshot?.sportDone === true),
    moodWhenSportMissed: groupMood((e) => e.snapshot?.sportDone === false),
    completionByEnergy: {
      low: groupCompletion((e) => e.energy !== null && e.energy <= 1),
      high: groupCompletion((e) => e.energy !== null && e.energy >= 3),
    },
    topTags,
    mostMissedCategory: mostCommon(input.missed.map((m) => m.category)),
    mostMissedTimeSlot: mostCommon(
      input.missed.map((m) => slotOf(m.startTime)),
      2,
    ),
    streaks: { journal: journalStreak, sport: sportStreak },
    lowMoodStreak,
    lowestDay: lowest ? { date: lowest.date, mood: lowest.mood, summary: lowest.summary } : null,
    days,
  };
}
export type JournalInsightsCore = ReturnType<typeof computeJournalInsights>;

const CATEGORY_TR: Record<string, string> = {
  project: 'Proje',
  sport: 'Spor',
  language: 'Dil',
  reading: 'Okuma',
  other: 'Diğer',
};
const pct = (x: number) => `%${Math.round(x * 100)}`;
const fmt1 = (x: number) => formatNumber(x);

/** "Bu hafta" kartı: kural tabanlı en çok 3 kısa bulgu (Claude gerekmez). */
export function journalFindings(i: JournalInsightsCore, max = 3): string[] {
  const out: string[] = [];
  const { moodWhenSportDone: sd, moodWhenSportMissed: sm } = i;
  if (sd !== null && sm !== null && Math.abs(sd - sm) >= 0.5) {
    out.push(
      `Spor yaptığın günlerde ruh hâli ortalaman ${fmt1(sd)}, yapmadığın günlerde ${fmt1(sm)}.`,
    );
  }
  const { low, high } = i.completionByEnergy;
  if (low !== null && high !== null && Math.abs(high - low) >= 0.15) {
    out.push(`Enerjin yüksek günlerde tamamlama ${pct(high)}, düşük günlerde ${pct(low)}.`);
  }
  if (i.mostMissedCategory) {
    const cat = CATEGORY_TR[i.mostMissedCategory] ?? i.mostMissedCategory;
    out.push(
      i.mostMissedTimeSlot
        ? `En çok ${cat} blokları kaçtı; çoğu ${i.mostMissedTimeSlot.replace('-', '–')} arası.`
        : `En çok ${cat} blokları kaçtı.`,
    );
  }
  if (i.moodTrend === 'down') out.push('Dönemin ikinci yarısında ruh hâlin düştü.');
  if (i.moodTrend === 'up') out.push('Dönemin ikinci yarısında ruh hâlin yükseldi.');
  const top = i.topTags[0];
  if (top && top[1] >= 3) out.push(`En sık etiket: ${journalTagLabel(top[0])} (${top[1]} gün).`);
  if (i.streaks.journal >= 5) out.push(`${i.streaks.journal} gündür üst üste günlük yazıyorsun.`);
  return out.slice(0, max);
}
