import type { Block } from './schemas/block.js';
import type { WeekResponse } from './schemas/schedule.js';
import { blockShortTitle } from './penalty.js';

export const BLOCK_REMINDER_KIND = 'block_reminder';
/** Android'in planlı alarm sınırına (uygulama başına ~500, bazı üreticilerde daha az) yaklaşmamak için */
export const MAX_BLOCK_REMINDERS = 40;
const HORIZON_DAYS = 7;

export interface ReminderPlan {
  identifier: string;
  at: Date;
  title: string;
  body: string;
  url: string;
}

/** Önümüzdeki 7 günün `planned` blokları için hatırlatma planı (saf; test edilebilir). */
export function planBlockReminders(
  weeks: WeekResponse[],
  blocks: Block[],
  now: number,
): ReminderPlan[] {
  const minutes = new Map(blocks.map((b) => [b.id, b.reminderMinutes]));
  const horizon = now + HORIZON_DAYS * 86_400_000;
  const plans: ReminderPlan[] = [];
  for (const w of weeks) {
    for (const d of w.days) {
      for (const i of d.instances) {
        const before = minutes.get(i.blockId);
        if (i.status !== 'planned' || before == null) continue;
        const at = new Date(i.startAt).getTime() - before * 60_000;
        if (at <= now || at > horizon) continue;
        plans.push({
          identifier: `block:${i.id}`,
          at: new Date(at),
          title: `${blockShortTitle(i.title)} zamanı`,
          body: `${i.startTime} · ${i.title}`,
          url: `/blocks/${i.blockId}`,
        });
      }
    }
  }
  return plans.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_BLOCK_REMINDERS);
}
