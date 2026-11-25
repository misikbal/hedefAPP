import {
  BLOCK_REMINDER_KIND,
  addDays,
  planBlockReminders,
  weekStartOf,
  type Block,
  type WeekResponse,
} from '@takip/shared';
import { api } from '@/api/client';
import { todayLocal } from '@/lib/date';
import { cancelLocalKind, ensurePermission, scheduleLocal, SUPPORTED } from './local';

let running: Promise<number> | null = null;

/**
 * Blok hatırlatmalarını baştan planlar: eskiler iptal edilir, önümüzdeki 7 gün yeniden kurulur.
 * Uygulama açılınca, ön plana gelince ve program/ayar değişince çağrılır.
 * `enabled` false ise (Ayarlar → Blok hatırlatmaları kapalı) yalnızca iptal eder.
 */
export function rescheduleBlockReminders(enabled: boolean): Promise<number> {
  running ??= (async () => {
    if (!SUPPORTED) return 0;
    await cancelLocalKind(BLOCK_REMINDER_KIND);
    if (!enabled || !(await ensurePermission())) return 0;
    const thisWeek = weekStartOf(todayLocal());
    const [w1, w2, blocks] = await Promise.all([
      api<WeekResponse>(`/week?start=${thisWeek}`),
      api<WeekResponse>(`/week?start=${addDays(thisWeek, 7)}`),
      api<Block[]>('/blocks'),
    ]);
    const plans = planBlockReminders([w1, w2], blocks, Date.now());
    for (const p of plans) {
      await scheduleLocal(p.at, p.title, p.body, {
        channel: 'reminders',
        kind: BLOCK_REMINDER_KIND,
        identifier: p.identifier,
        url: p.url,
      });
    }
    return plans.length;
  })().finally(() => {
    running = null;
  });
  return running;
}

export const cancelBlockReminders = () => cancelLocalKind(BLOCK_REMINDER_KIND);
