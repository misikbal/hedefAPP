import {
  MOTIVATION_SLOTS,
  inSlotWindow,
  journalDateOf,
  localDateOf,
  localTimeOf,
  type MotivationFreq,
} from '@takip/shared';
import { BlockInstance, JournalEntry, User } from '../db/models/index.js';
import { clock } from './clock.js';
import { motivationMessage } from './motivation.js';
import { flushQueuedPush, wasDelivered } from './notifications.js';
import { notify } from './notify.js';
import { prepareWeeklyReport } from './reports.js';
import { getSettings, type UserContext } from './users.js';

/** İş her 5 dakikada çalışır; sunucu kısa süre kapalı kalsa da saat penceresi içinde gönderilir. */
export const SLOT_WINDOW_MINUTES = 60;

export interface TickResult {
  journal: number;
  motivation: number;
  flushed: number;
}

async function journalReminder(user: UserContext, now: Date, at: string): Promise<boolean> {
  if (!inSlotWindow(localTimeOf(now, user.timezone), at, SLOT_WINDOW_MINUTES)) return false;
  const date = journalDateOf(now, user.timezone);
  if (await wasDelivered(user.id, `journal:${date}`)) return false;
  // Günlük zaten yazıldıysa hatırlatma gereksiz.
  if (await JournalEntry.exists({ userId: user.id, date })) return false;
  await notify.send(user.id, { type: 'journal_reminder', date });
  return true;
}

async function motivation(user: UserContext, now: Date, freq: MotivationFreq): Promise<number> {
  const today = localDateOf(now, user.timezone);
  const time = localTimeOf(now, user.timezone);
  let sent = 0;
  const slots = MOTIVATION_SLOTS[freq];
  for (const [i, slot] of slots.entries()) {
    if (!inSlotWindow(time, slot, SLOT_WINDOW_MINUTES)) continue;
    const dedupeKey = `motivation:${today}:${slot}`;
    if (await wasDelivered(user.id, dedupeKey)) continue;
    const msg = await motivationMessage(user, i + Number(today.slice(8)));
    await notify.send(user.id, { type: 'motivation', dedupeKey, ...msg });
    sent++;
  }
  // "Çok": her tamamlanan bloktan sonra (son 1 saatte işaretlenenler).
  if (freq === 'high') {
    const since = new Date(now.getTime() - SLOT_WINDOW_MINUTES * 60_000);
    const done = await BlockInstance.find({
      userId: user.id,
      status: 'done',
      doneAt: { $gte: since, $lte: now },
    }).select('_id');
    for (const [i, inst] of done.entries()) {
      const dedupeKey = `motivation:block:${String(inst._id)}`;
      if (await wasDelivered(user.id, dedupeKey)) continue;
      const msg = await motivationMessage(user, i + 1);
      await notify.send(user.id, { type: 'motivation', dedupeKey, ...msg });
      sent++;
    }
  }
  return sent;
}

/** Günlük hatırlatması, motivasyon mesajları ve sessiz saat kuyruğu. */
export async function runNotificationTick(now: Date = clock.now()): Promise<TickResult> {
  const result: TickResult = { journal: 0, motivation: 0, flushed: 0 };
  const users = await User.find().select('timezone').lean();
  for (const u of users) {
    const user: UserContext = { id: u._id, timezone: u.timezone ?? 'Europe/Istanbul' };
    const s = await getSettings(u._id);
    if (
      s.notif?.journal !== false &&
      (await journalReminder(user, now, s.journalReminder ?? '23:00'))
    )
      result.journal++;
    if (s.notif?.motivation !== false)
      result.motivation += await motivation(
        user,
        now,
        (s.motivationFreq ?? 'mid') as MotivationFreq,
      );
  }
  result.flushed = await flushQueuedPush();
  return result;
}

/** Pazar 21:00: her kullanıcı için haftalık rapor + push. */
export async function runWeeklyReports(): Promise<number> {
  const users = await User.find().select('timezone').lean();
  for (const u of users) {
    const user: UserContext = { id: u._id, timezone: u.timezone ?? 'Europe/Istanbul' };
    const { report, title, body } = await prepareWeeklyReport(user);
    await notify.send(u._id, { type: 'weekly_report', isoWeek: report.isoWeek, title, body });
  }
  return users.length;
}
