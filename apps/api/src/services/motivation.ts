import { UNIT_LABELS, formatNumber, isoDayOfWeek, localDateOf, type GoalUnit } from '@takip/shared';
import { clock } from './clock.js';
import { listGoals } from './goals.js';
import { goalStreak, goalSummaries } from './stats.js';
import type { UserContext } from './users.js';

export interface MotivationMessage {
  title: string;
  body: string;
  deepLink: string;
}

const amount = (n: number, unit: string) =>
  `${formatNumber(Math.round(n * 10) / 10)} ${UNIT_LABELS[unit as GoalUnit] ?? unit}`;

/** Kalan miktarı kalan günlere böler; saat için yarım saate, diğerleri için tam sayıya yuvarlar. */
function perDay(remaining: number, days: number, unit: string): number {
  const raw = remaining / Math.max(1, days);
  return unit === 'saat' ? Math.ceil(raw * 2) / 2 : Math.ceil(raw);
}

interface Candidate extends MotivationMessage {
  priority: number;
}

/**
 * Kullanıcının o anki durumundan şablonla motivasyon mesajı üretir
 * ("8 sayfa kaldı. 12 günlük serini bozma."). `variant` aynı gün içinde farklı
 * mesajlar seçmek için kullanılır. Claude API ile üretim (ANTHROPIC_API_KEY) isteğe bağlıdır
 * ve henüz bağlanmadı; şablon varsayılandır.
 */
export async function motivationMessage(
  user: UserContext,
  variant = 0,
): Promise<MotivationMessage> {
  const goals = await listGoals(user);
  const summaries = await goalSummaries(user, goals);
  const today = localDateOf(clock.now(), user.timezone);
  const dow = isoDayOfWeek(today);
  const open = summaries.filter((s) => s.status !== 'done' && s.periodStart <= today);
  const candidates: Candidate[] = [];

  for (const s of open) {
    const goal = goals.find((g) => (g.id as string) === s.id)!;
    const remaining = s.target - s.current;
    const link = `/progress/new?goalId=${s.id}`;
    if (s.period === 'daily') {
      const streak = goal.trackStreak ? (await goalStreak(user, goal)).current : 0;
      candidates.push(
        streak >= 2
          ? {
              priority: 0,
              title: 'Küçük bir adım',
              body: `${amount(remaining, s.unit)} kaldı. ${streak} günlük serini bozma.`,
              deepLink: link,
            }
          : {
              priority: 2,
              title: s.name,
              body: `Bugün ${amount(s.current, s.unit)} / ${amount(s.target, s.unit)}. ${amount(remaining, s.unit)} kaldı.`,
              deepLink: link,
            },
      );
      continue;
    }
    const daysLeft = s.daysLeft + 1;
    const step = perDay(remaining, daysLeft, s.unit);
    const title =
      daysLeft <= 1
        ? 'Son gün'
        : s.period === 'weekly' && (dow === 3 || dow === 4)
          ? 'Haftanın yarısı'
          : s.status === 'behind'
            ? 'Biraz geride'
            : 'Yoldasın';
    candidates.push({
      priority: s.status === 'behind' ? 1 : 3,
      title,
      body: `${s.name} ${formatNumber(s.current)}/${formatNumber(s.target)}. ${
        daysLeft <= 1
          ? `Bugün ${amount(remaining, s.unit)} kaldı.`
          : `Bugün ${amount(step, s.unit)} seni yolda tutar.`
      }`,
      deepLink: link,
    });
  }

  if (candidates.length === 0) {
    return summaries.length
      ? { title: 'Harika gidiyor', body: 'Bütün hedefler tamam. Böyle devam.', deepLink: '/goals' }
      : {
          title: 'İlk adım',
          body: 'Bir hedef koy; ilerlemeni buradan takip edelim.',
          deepLink: '/goals/new',
        };
  }
  candidates.sort((a, b) => a.priority - b.priority);
  // En öncelikli ilk üç mesaj arasında dönülür (aynı mesaj gün içinde tekrar etmesin).
  const pool = candidates.slice(0, Math.min(candidates.length, 3));
  const { priority: _p, ...msg } = pool[variant % pool.length]!;
  return msg;
}
