import { CATEGORY_LABELS, type Category, type GoalPeriod, type GoalUnit } from './constants.js';
import type {
  PenaltyDeadline,
  PenaltyOnFail,
  PenaltyTargetType,
  PenaltyTrigger,
} from './schemas/penalty.js';
import { formatNumber } from './tr.js';

/** Kural ekranındaki ön tanımlı cezalar: [çip etiketi, ayrıntı metni] */
export const PRESET_PENALTIES = [
  { label: 'Soğuk duş', text: '3 dk soğuk duş' },
  { label: 'Şınav', text: '50 şınav' },
  { label: 'Ekstra iş', text: 'Ertesi gün +10 sayfa' },
  { label: 'Ekran yasağı', text: '1 gün sosyal medya yok' },
  { label: 'Telefonsuz', text: '2 saat telefonsuz' },
  { label: 'Erken kalk', text: 'Ertesi gün 06:00 kalk' },
] as const;

export const TRIGGER_LABELS: Record<PenaltyTrigger, string> = {
  block_missed: 'Blok kaçınca',
  goal_failed: 'Hedef tutmayınca',
  penalty_postponed: 'Ertelenince',
};

export const ON_FAIL_LABELS: Record<PenaltyOnFail, string> = {
  double: 'İki katı',
  plus_one: '+1 ceza',
  reset_streak: 'Seri sıfırlanır',
};

export const DEADLINE_OPTIONS: readonly { label: string; value: PenaltyDeadline }[] = [
  { label: '24 saat', value: { type: 'hours', hours: 24 } },
  { label: '48 saat', value: { type: 'hours', hours: 48 } },
  { label: 'Hafta sonuna kadar', value: { type: 'end_of_week' } },
];

export const DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;
export const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

const PERIOD_WORD: Record<GoalPeriod, string> = {
  daily: 'günlük',
  weekly: 'haftalık',
  monthly: 'aylık',
};

/** "Bisiklet · 25 km" → "Bisiklet" */
export function blockShortTitle(title: string): string {
  return title.split(' · ')[0]!.trim() || title;
}

/** "Kitap günlük 20 sayfa" */
export function goalPhrase(g: {
  name: string;
  period: GoalPeriod;
  target: number;
  unit: GoalUnit;
}): string {
  return `${g.name} ${PERIOD_WORD[g.period]} ${formatNumber(g.target)} ${g.unit}`;
}

export interface RuleConditionInput {
  trigger: PenaltyTrigger;
  targetType: PenaltyTargetType;
  category?: Category | null;
  /** Blok için `blockShortTitle`, hedef için `goalPhrase` çıktısı */
  targetLabel?: string | null;
}

/** "Spor bloğu kaçarsa", "Kitap günlük 20 sayfa tutmazsa", "Bir ceza ertelenirse" */
export function ruleCondition(r: RuleConditionInput): string {
  const cat = r.category ? CATEGORY_LABELS[r.category] : 'Seçilen';
  if (r.trigger === 'penalty_postponed') return 'Bir ceza ertelenirse';
  if (r.trigger === 'block_missed') {
    if (r.targetType === 'any') return 'Herhangi bir blok kaçarsa';
    if (r.targetType === 'category') return `${cat} bloğu kaçarsa`;
    return `${r.targetLabel ?? 'Seçilen blok'} bloğu kaçarsa`;
  }
  if (r.targetType === 'any') return 'Herhangi bir hedef tutmazsa';
  if (r.targetType === 'category') return `${cat} hedefi tutmazsa`;
  return `${r.targetLabel ?? 'Seçilen hedef'} tutmazsa`;
}

/** "24 saat içinde" / "hafta sonuna kadar" */
export function deadlineText(d: PenaltyDeadline): string {
  return d.type === 'hours' ? `${d.hours} saat içinde` : 'hafta sonuna kadar';
}

const ON_FAIL_SHORT: Record<PenaltyOnFail, string> = {
  double: 'Yapmazsan iki katı.',
  plus_one: 'Yapmazsan +1 ceza.',
  reset_streak: 'Yapmazsan seri sıfırlanır.',
};

const ON_FAIL_LONG: Record<PenaltyOnFail, string> = {
  double: 'iki katına çıkar.',
  plus_one: 'bir ceza daha eklenir.',
  reset_streak: 'seri sıfırlanır.',
};

/** Kural satırının alt metni: "3 dk soğuk duş · 24 saat içinde" */
export function ruleThen(penalty: string, deadline: PenaltyDeadline): string {
  return `${penalty} · ${deadlineText(deadline)}`;
}

/** "Spor bloğu kaçarsa → 24 saat içinde 3 dk soğuk duş. Yapmazsan iki katı." */
export function ruleSentence(
  r: RuleConditionInput & { penalty: string; deadline: PenaltyDeadline; onFail: PenaltyOnFail },
): string {
  return `${ruleCondition(r)} → ${deadlineText(r.deadline)} ${r.penalty}. ${ON_FAIL_SHORT[r.onFail]}`;
}

/** Bekleyen ceza kartı: "24 saat içinde yapılmazsa iki katına çıkar." */
export function penaltyConsequence(deadline: PenaltyDeadline, onFail: PenaltyOnFail): string {
  const d = deadlineText(deadline);
  return `${d.charAt(0).toLocaleUpperCase('tr-TR')}${d.slice(1)} yapılmazsa ${ON_FAIL_LONG[onFail]}`;
}

/**
 * Çarpanı ceza metnine uygular: ilk miktar çarpılır ("3 dk soğuk duş" ×2 → "6 dk soğuk duş",
 * "Ertesi gün +10 sayfa" ×2 → "Ertesi gün +20 sayfa"). Saat ("06:00") miktar sayılmaz;
 * miktar yoksa sona "×2" eklenir.
 */
export function scalePenaltyText(text: string, multiplier: number): string {
  if (multiplier === 1) return text;
  const re = /(^|[\s+])(\d+(?:,\d+)?)(?![\d:.,])/;
  const m = re.exec(text);
  if (!m) {
    return `${text} ×${formatNumber(multiplier)}`;
  }
  const value = Number(m[2]!.replace(',', '.')) * multiplier;
  const start = m.index + m[1]!.length;
  return `${text.slice(0, start)}${formatNumber(value)}${text.slice(start + m[2]!.length)}`;
}

/** Kalan süre: "14 sa kaldı", "35 dk kaldı", "2 gün kaldı", "süre doldu" */
export function remainingText(ms: number): string {
  if (ms <= 0) return 'süre doldu';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} dk kaldı`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} sa kaldı`;
  return `${Math.floor(hours / 24)} gün kaldı`;
}

/** Geri sayım: "14:02:37" (saat 99'u geçebilir) */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/* ---------- kural eşleştirme (API ve mobil ortak) ---------- */

export interface MatchableRule {
  id: string;
  trigger: PenaltyTrigger;
  targetType: PenaltyTargetType;
  targetId: string | null;
  category: Category | null;
  enabled: boolean;
}

/**
 * Kuralın bloğa/hedefe uyma önceliği (küçük olan önce): doğrudan bağlı kural 0, hedef türü
 * 'block'/'goal' 1, kategori 2, 'any' 3. Uymuyorsa null.
 */
function matchRank(
  rule: MatchableRule,
  trigger: PenaltyTrigger,
  kind: 'block' | 'goal',
  target: { id: string; category: Category; penaltyRuleId: string | null },
): number | null {
  if (!rule.enabled || rule.trigger !== trigger) return null;
  if (target.penaltyRuleId === rule.id) return 0;
  if (rule.targetType === kind && rule.targetId === target.id) return 1;
  if (rule.targetType === 'category' && rule.category === target.category) return 2;
  if (rule.targetType === 'any') return 3;
  return null;
}

function rulesFor<R extends MatchableRule>(
  rules: readonly R[],
  trigger: PenaltyTrigger,
  kind: 'block' | 'goal',
  target: { id: string; category: Category; penaltyRuleId: string | null },
): R[] {
  return rules
    .map((r) => ({ r, rank: matchRank(r, trigger, kind, target) }))
    .filter((x): x is { r: R; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.r);
}

/** Blok kaçarsa uygulanacak açık block_missed kuralları, öncelik sırasıyla */
export function rulesForBlock<R extends MatchableRule>(
  block: { id: string; category: Category; penaltyRuleId: string | null },
  rules: readonly R[],
): R[] {
  return rulesFor(rules, 'block_missed', 'block', block);
}

/** Hedef tutmazsa uygulanacak açık goal_failed kuralları, öncelik sırasıyla */
export function rulesForGoal<R extends MatchableRule>(
  goal: { id: string; category: Category; penaltyRuleId: string | null },
  rules: readonly R[],
): R[] {
  return rulesFor(rules, 'goal_failed', 'goal', goal);
}
