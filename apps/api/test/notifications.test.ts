import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { notificationListSchema, settingsSchema, weeklyReportSchema } from '@takip/shared';
import {
  BlockInstance,
  DeviceToken,
  JournalEntry,
  Notification,
  Penalty,
  Settings,
  WeeklyReport,
} from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { createGoal } from '../src/services/goals.js';
import { flushQueuedPush } from '../src/services/notifications.js';
import { notify } from '../src/services/notify.js';
import { warnDueSoon, runPenaltyEngine } from '../src/services/penaltyEngine.js';
import { createRule } from '../src/services/penaltyRules.js';
import { logProgress } from '../src/services/progress.js';
import { push, type PushMessage, type PushResult } from '../src/services/push.js';
import { latestReportWeek } from '../src/services/reports.js';
import { runNotificationTick, runWeeklyReports } from '../src/services/scheduledNotifications.js';
import type { UserContext } from '../src/services/users.js';
import {
  TZ,
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

// 2026-11-23 Pazartesi. İstanbul = UTC+3.
const TOKEN = 'ExponentPushToken[test-cihaz-1]';

describe('bildirimler', () => {
  let app: FastifyInstance;
  let token: string;
  let user: UserContext;
  let sent: PushMessage[];
  let reply: (m: PushMessage) => PushResult;
  const originalSender = push.sender;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  const tick = (iso: string) => {
    setNow(iso);
    return runNotificationTick(new Date(iso));
  };

  beforeAll(async () => {
    await startDb();
    app = await makeApp();
  });
  afterAll(async () => {
    push.sender = originalSender;
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    await resetDb();
    setNow('2026-11-23T09:00:00Z'); // Pzt 12:00 yerel
    user = await createUser();
    token = await loginToken(app);
    sent = [];
    reply = (m) => ({ to: m.to, ok: true });
    push.sender = async (messages) => {
      sent.push(...messages);
      return messages.map((m) => reply(m));
    };
    await DeviceToken.create({ userId: user.id, expoPushToken: TOKEN });
  });
  afterEach(resetClock);

  const penaltyEvent = (id = 'p1') =>
    ({ type: 'penalty_created', penaltyId: id, title: 'Yeni ceza', body: 'Blok kaçtı' }) as const;

  describe('gönderim', () => {
    it('kayıt oluşur, push kanal ve derin bağlantıyla gider', async () => {
      await notify.send(user.id, penaltyEvent());
      const [n] = await Notification.find();
      expect(n).toMatchObject({ type: 'penalty', deepLink: '/penalties' });
      expect(n!.push?.status).toBe('sent');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: TOKEN,
        type: 'penalty',
        data: { url: '/penalties', notificationId: n!.id },
      });
    });

    it('aynı olay iki kez bildirilmez (dedupeKey)', async () => {
      await notify.send(user.id, penaltyEvent());
      await notify.send(user.id, penaltyEvent());
      expect(await Notification.countDocuments()).toBe(1);
      expect(sent).toHaveLength(1);
    });

    it('sessiz saatte sıraya alınır, bitince gönderilir', async () => {
      setNow('2026-11-23T22:00:00Z'); // Sal 01:00 yerel; varsayılan sessiz saat 00:00–06:30
      await notify.send(user.id, penaltyEvent());
      const n = await Notification.findOne().orFail();
      expect(n.push?.status).toBe('queued');
      expect(n.push?.sendAfter?.toISOString()).toBe('2026-11-24T03:30:00.000Z');
      expect(sent).toHaveLength(0);

      setNow('2026-11-24T03:00:00Z');
      expect(await flushQueuedPush()).toBe(0);
      setNow('2026-11-24T03:31:00Z');
      expect(await flushQueuedPush()).toBe(1);
      expect(sent).toHaveLength(1);
      expect((await Notification.findById(n._id))!.push?.status).toBe('sent');
    });

    it('ayar kapalıysa kayıt oluşur ama push gitmez', async () => {
      await Settings.updateOne({ userId: user.id }, { 'notif.penalties': false });
      await notify.send(user.id, penaltyEvent());
      expect((await Notification.findOne())!.push?.status).toBe('skipped');
      expect(sent).toHaveLength(0);
    });

    it('geçersizleşen token silinir', async () => {
      reply = (m) => ({ to: m.to, ok: false, error: 'DeviceNotRegistered', deviceGone: true });
      await notify.send(user.id, penaltyEvent());
      expect(await DeviceToken.countDocuments()).toBe(0);
      expect((await Notification.findOne())!.push?.status).toBe('failed');
    });
  });

  describe('REST', () => {
    it('cihaz kaydı: geçersiz token 400, aynı token tek kayıt, silme', async () => {
      expect((await call('POST', '/devices', { expoPushToken: 'abc' })).statusCode).toBe(400);
      const t2 = 'ExponentPushToken[ikinci]';
      expect((await call('POST', '/devices', { expoPushToken: t2 })).statusCode).toBe(204);
      expect((await call('POST', '/devices', { expoPushToken: t2 })).statusCode).toBe(204);
      expect(await DeviceToken.countDocuments({ expoPushToken: t2 })).toBe(1);
      expect((await call('DELETE', '/devices', { expoPushToken: t2 })).statusCode).toBe(204);
      expect(await DeviceToken.countDocuments({ expoPushToken: t2 })).toBe(0);
    });

    it('liste, okunmamış sayısı, tek tek ve hepsini okundu yapma', async () => {
      await notify.send(user.id, penaltyEvent('a'));
      setNow('2026-11-23T09:05:00Z');
      await notify.send(user.id, penaltyEvent('b'));
      const list = notificationListSchema.parse((await call('GET', '/notifications')).json());
      expect(list.unread).toBe(2);
      expect(list.items[0]!.sentAt > list.items[1]!.sentAt).toBe(true);

      const read = await call('POST', `/notifications/${list.items[0]!.id}/read`);
      expect(read.json()).toMatchObject({ readAt: expect.any(String) });
      expect((await call('GET', '/notifications/unread-count')).json()).toEqual({ unread: 1 });
      expect((await call('POST', '/notifications/read-all')).json()).toEqual({ updated: 1 });
      expect((await call('GET', '/notifications/unread-count')).json()).toEqual({ unread: 0 });
      const missing = await call('POST', `/notifications/${new Types.ObjectId().toString()}/read`);
      expect(missing.statusCode).toBe(404);
    });

    it('test bildirimi gerçek akıştan push gönderir', async () => {
      const r = await call('POST', '/notifications/test');
      expect(r.json()).toMatchObject({ push: 'sent' });
      expect(sent[0]).toMatchObject({ type: 'motivation', title: 'İlk adım' });
    });

    it('ayarlar: okuma, kısmi güncelleme, doğrulama', async () => {
      const s = settingsSchema.parse((await call('GET', '/settings')).json());
      expect(s).toMatchObject({
        motivationFreq: 'mid',
        quietHours: { start: '00:00', end: '06:30' },
      });
      const r = await call('PATCH', '/settings', {
        notif: { motivation: false },
        quietHours: { start: '23:00', end: '07:00' },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({
        notif: { motivation: false, penalties: true, blocks: true, journal: true },
        quietHours: { start: '23:00', end: '07:00' },
      });
      expect((await call('PATCH', '/settings', { journalReminder: '25:00' })).statusCode).toBe(400);
      expect((await call('PATCH', '/settings', { bilinmeyen: 1 })).statusCode).toBe(400);
    });
  });

  describe('ceza bildirimleri', () => {
    it('kaçan blok cezası bildirim listesine düşer', async () => {
      setNow('2026-11-23T03:00:00Z');
      await createRule(user, {
        trigger: 'block_missed',
        targetType: 'any',
        penalty: '3 dk soğuk duş',
      });
      await createBlock(user, {
        title: 'Bisiklet',
        category: 'sport',
        daysOfWeek: [1],
        startTime: '07:00',
        endTime: '08:00',
      });
      setNow('2026-11-23T05:31:00Z');
      await runPenaltyEngine(new Date('2026-11-23T05:31:00Z'));
      const n = await Notification.findOne({ kind: 'penalty_created' }).orFail();
      expect(n.title).toBe('Yeni ceza: 3 dk soğuk duş');
      expect(sent).toHaveLength(1);
    });

    it('süre bitmeden 2 saat önce bir kez uyarır', async () => {
      const p = await Penalty.create({
        userId: user.id,
        ruleId: new Types.ObjectId(),
        reason: 'Blok kaçtı',
        sourceRef: { type: 'instance', id: 'x' },
        penalty: '20 şınav',
        dueAt: new Date('2026-11-24T09:00:00Z'),
        onFail: 'double',
        deadline: { type: 'hours', hours: 24 },
      });
      setNow('2026-11-24T06:30:00Z'); // 2,5 saat kala
      expect(await warnDueSoon(new Date('2026-11-24T06:30:00Z'))).toBe(0);
      setNow('2026-11-24T07:15:00Z');
      expect(await warnDueSoon(new Date('2026-11-24T07:15:00Z'))).toBe(1);
      await warnDueSoon(new Date('2026-11-24T07:30:00Z'));
      const list = await Notification.find({ kind: 'penalty_due_soon' });
      expect(list).toHaveLength(1);
      expect(list[0]!.body).toBe('20 şınav · 1 sa 45 dk kaldı');
      expect(p.id).toBeTruthy();
    });
  });

  describe('zamanlanmış bildirimler', () => {
    it("günlük hatırlatması 23:00'te bir kez; günlük yazıldıysa hiç", async () => {
      expect((await tick('2026-11-23T19:55:00Z')).journal).toBe(0); // 22:55
      expect((await tick('2026-11-23T20:00:00Z')).journal).toBe(1); // 23:00
      expect((await tick('2026-11-23T20:05:00Z')).journal).toBe(0);
      const n = await Notification.findOne({ kind: 'journal_reminder' }).orFail();
      expect(n).toMatchObject({
        type: 'reminder',
        deepLink: '/journal',
        dedupeKey: 'journal:2026-11-23',
      });

      await JournalEntry.create({ userId: user.id, date: '2026-11-24', mood: 3 });
      expect((await tick('2026-11-24T20:00:00Z')).journal).toBe(0);
    });

    it('motivasyon: orta sıklıkta 09/13/19, her saatte bir kez; kapalıysa hiç', async () => {
      await createGoal(user, {
        name: 'Almanca',
        target: 75,
        unit: 'kelime',
        period: 'weekly',
        category: 'language',
        startDate: '2026-11-01',
      });
      expect((await tick('2026-11-23T06:00:00Z')).motivation).toBe(1); // 09:00
      expect((await tick('2026-11-23T06:30:00Z')).motivation).toBe(0);
      expect((await tick('2026-11-23T08:00:00Z')).motivation).toBe(0); // 11:00
      expect((await tick('2026-11-23T10:10:00Z')).motivation).toBe(1); // 13:10
      const [m] = await Notification.find({ kind: 'motivation' }).sort({ sentAt: 1 });
      expect(m!.body).toMatch(/^Almanca 0\/75\. Bugün 11 kelime seni yolda tutar\.$/);
      expect(m!.deepLink).toMatch(/^\/progress\/new\?goalId=/);

      await Settings.updateOne({ userId: user.id }, { 'notif.motivation': false });
      expect((await tick('2026-11-23T16:00:00Z')).motivation).toBe(0); // 19:00
    });

    it('motivasyon "çok": tamamlanan her bloktan sonra', async () => {
      await Settings.updateOne({ userId: user.id }, { motivationFreq: 'high' });
      const base = { userId: user.id, blockId: new Types.ObjectId(), date: '2026-11-23' };
      await BlockInstance.create({
        ...base,
        startAt: new Date('2026-11-23T07:00:00Z'),
        endAt: new Date('2026-11-23T08:00:00Z'),
        status: 'done',
        doneAt: new Date('2026-11-23T08:00:00Z'),
      });
      expect((await tick('2026-11-23T08:10:00Z')).motivation).toBe(1); // 11:10, slot dışı
      expect((await tick('2026-11-23T08:15:00Z')).motivation).toBe(0);
    });
  });

  describe('haftalık rapor', () => {
    it('blok oranı, en iyi gün, hedefler, cezalar; pazar 21:00 push ve önbellek', async () => {
      const goal = await createGoal(user, {
        name: 'Bisiklet',
        target: 150,
        unit: 'km',
        period: 'weekly',
        category: 'sport',
        startDate: '2026-11-01',
      });
      await createGoal(user, {
        name: 'Kitap',
        target: 20,
        unit: 'sayfa',
        period: 'daily',
        category: 'reading',
        startDate: '2026-11-01',
      });
      const blockId = new Types.ObjectId();
      const inst = (date: string, status: 'done' | 'missed' | 'skipped') =>
        BlockInstance.create({
          userId: user.id,
          blockId,
          date,
          startAt: new Date(`${date}T04:00:00Z`),
          endAt: new Date(`${date}T05:00:00Z`),
          status,
        });
      await inst('2026-11-23', 'done');
      await inst('2026-11-24', 'missed');
      await inst('2026-11-26', 'done');
      await inst('2026-11-27', 'skipped');
      setNow('2026-11-24T10:00:00Z');
      await logProgress(user, { goalId: goal.id as string, amount: 160, date: '2026-11-24' });

      setNow('2026-11-29T18:00:00Z'); // Pazar 21:00
      expect(latestReportWeek(new Date('2026-11-29T18:00:00Z'), TZ)).toBe('2026-11-23');
      expect(latestReportWeek(new Date('2026-11-29T17:59:00Z'), TZ)).toBe('2026-11-16');
      await runWeeklyReports();
      token = await loginToken(app); // sabit saat ilerledi; access token yenilenir

      const n = await Notification.findOne({ kind: 'weekly_report' }).orFail();
      expect(n).toMatchObject({
        title: 'Hafta 48 raporu hazır',
        body: '%67 · 2/3 blok. En iyi gün Pazartesi.',
        deepLink: '/reports/2026-W48',
      });
      expect(await WeeklyReport.countDocuments()).toBe(1);

      const r = weeklyReportSchema.parse((await call('GET', '/reports/weekly/latest')).json());
      expect(r).toMatchObject({
        isoWeek: '2026-W48',
        complete: false,
        blocks: { done: 2, total: 3, percent: 67 },
        bestDay: '2026-11-23',
      });
      expect(r.days.find((d) => d.date === '2026-11-27')).toMatchObject({ total: 0, ratio: null });
      expect(r.goals).toEqual([
        expect.objectContaining({ name: 'Bisiklet', value: 160, met: true }),
        expect.objectContaining({ name: 'Kitap', value: 0, met: false }),
      ]);
      expect(r.note).toContain('Bisiklet tuttu.');

      expect((await call('GET', '/reports/weekly/2026-W99')).statusCode).toBe(400);
      expect((await call('GET', '/reports/weekly/abc')).statusCode).toBe(400);

      // Hafta bitince yeniden hesaplanır ve "complete" olarak önbelleğe yazılır.
      setNow('2026-12-01T09:00:00Z');
      token = await loginToken(app);
      const done = (await call('GET', '/reports/weekly/2026-W48')).json() as { complete: boolean };
      expect(done.complete).toBe(true);
      const cached = await WeeklyReport.findOne().lean();
      expect((cached!.data as { complete: boolean }).complete).toBe(true);
    });
  });
});
