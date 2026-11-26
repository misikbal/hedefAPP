import { Agenda } from 'agenda';
import { MongoBackend } from '@agendajs/mongo-backend';
import mongoose from 'mongoose';
import type { FastifyBaseLogger } from 'fastify';
import { addDays, localDateOf, weekStartOf } from '@takip/shared';
import { User } from '../db/models/index.js';
import { abandonStaleSessions } from '../services/focus.js';
import { expirePendingChanges } from '../services/pendingChanges.js';
import { runPenaltyEngine } from '../services/penaltyEngine.js';
import { ensureWeek } from '../services/schedule.js';
import { runNotificationTick, runWeeklyReports } from '../services/scheduledNotifications.js';

export const JOB_PENALTY_ENGINE = 'penalty-engine';
export const JOB_ENSURE_NEXT_WEEK = 'ensure-next-week';
export const JOB_FOCUS_ABANDON = 'focus-abandon';
export const JOB_NOTIFICATION_TICK = 'notification-tick';
export const JOB_WEEKLY_REPORT = 'weekly-report';

/**
 * Zamanlanmış işler. Yalnızca server.ts başlatır (testler motoru doğrudan çağırır).
 * Tek API kopyası çalıştırılır; Agenda yine de iş kilidi tutar.
 */
export async function startJobs(log: FastifyBaseLogger, timezone: string): Promise<Agenda> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Agenda için MongoDB bağlantısı gerekli');
  const agenda = new Agenda({ backend: new MongoBackend({ mongo: db }) });

  agenda.define(
    JOB_PENALTY_ENGINE,
    async () => {
      const r = await runPenaltyEngine();
      if (r.missed || r.created || r.escalated) log.info(r, 'ceza motoru çalıştı');
    },
    { concurrency: 1, lockLifetime: 10 * 60_000 },
  );

  agenda.define(JOB_ENSURE_NEXT_WEEK, async () => {
    const users = await User.find().select('timezone').lean();
    for (const u of users) {
      const tz = u.timezone ?? timezone;
      const next = addDays(weekStartOf(localDateOf(new Date(), tz)), 7);
      await ensureWeek(u._id, next, tz);
    }
  });

  // Unutulan odak seansları: startedAt + plannedMinutes + 6 saat geçince abandoned.
  agenda.define(
    JOB_FOCUS_ABANDON,
    async () => {
      const n = await abandonStaleSessions();
      if (n) log.info({ abandoned: n }, 'terk edilen odak seansları kapatıldı');
    },
    { concurrency: 1 },
  );

  // Günlük hatırlatması, motivasyon mesajları, sessiz saat kuyruğu.
  agenda.define(
    JOB_NOTIFICATION_TICK,
    async () => {
      const r = await runNotificationTick();
      if (r.journal || r.motivation || r.flushed) log.info(r, 'bildirim işi çalıştı');
      // Onay bekleyen Claude değişiklikleri 24 saatte düşer (okumada da tembel olarak yapılır).
      const expired = await expirePendingChanges();
      if (expired) log.info({ expired }, 'süresi dolan onay istekleri kapatıldı');
    },
    { concurrency: 1, lockLifetime: 5 * 60_000 },
  );

  agenda.define(JOB_WEEKLY_REPORT, async () => {
    const n = await runWeeklyReports();
    log.info({ users: n }, 'haftalık raporlar hazırlandı');
  });

  agenda.on('fail', (err: unknown, job: { attrs: { name: string } }) => {
    log.error({ err, job: job.attrs.name }, 'zamanlanmış iş başarısız');
  });

  await agenda.start();
  await agenda.every('15 minutes', JOB_PENALTY_ENGINE);
  await agenda.every('30 minutes', JOB_FOCUS_ABANDON);
  await agenda.every('5 minutes', JOB_NOTIFICATION_TICK);
  await agenda.every('0 21 * * 0', JOB_WEEKLY_REPORT, undefined, { timezone });
  // Pazar 20:00: bir sonraki haftanın blokları hazır olsun (bildirim planlaması için).
  await agenda.every('0 20 * * 0', JOB_ENSURE_NEXT_WEEK, undefined, { timezone });
  return agenda;
}
