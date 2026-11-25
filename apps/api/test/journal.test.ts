import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { journalDaySchema, journalEntrySchema } from '@takip/shared';
import { BlockInstance, JournalEntry, Penalty, ProgressLog } from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { createGoal } from '../src/services/goals.js';
import { finishFocus, startFocus } from '../src/services/focus.js';
import { dayStats } from '../src/services/journal.js';
import { ensureWeek } from '../src/services/schedule.js';
import type { UserContext } from '../src/services/users.js';
import {
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

describe('günlük', () => {
  let app: FastifyInstance;
  let token: string;
  let user: UserContext;
  const call = (method: 'GET' | 'PUT', url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    await startDb();
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    token = await loginToken(app);
    setNow('2026-11-24T20:00:00Z'); // Salı 23:00 yerel
  });
  afterEach(resetClock);

  it('PUT upsert: aynı gün iki kez → tek kayıt; boş metin null', async () => {
    const a = await call('PUT', '/journal/2026-11-24', { mood: 3, wentWell: '  Tur keyifliydi ' });
    expect(a.statusCode).toBe(200);
    expect(journalEntrySchema.parse(a.json())).toMatchObject({
      mood: 3,
      wentWell: 'Tur keyifliydi',
    });
    const b = await call('PUT', '/journal/2026-11-24', { mood: 4, wentWell: '', hard: 'Yağmur' });
    expect(b.json()).toMatchObject({ mood: 4, wentWell: null, hard: 'Yağmur' });
    expect(await JournalEntry.countDocuments()).toBe(1);
  });

  it('gelecek gün 400, geçersiz ruh hâli ve uzun metin 400', async () => {
    expect((await call('PUT', '/journal/2026-11-25', { mood: 2 })).statusCode).toBe(400);
    expect((await call('PUT', '/journal/2026-11-24', { mood: 5 })).statusCode).toBe(400);
    expect(
      (await call('PUT', '/journal/2026-11-24', { mood: 1, hard: 'x'.repeat(1001) })).statusCode,
    ).toBe(400);
    // yerel 00:30'da takvim günü değişmiştir; o gün yazılabilir
    setNow('2026-11-24T21:30:00Z');
    expect((await call('PUT', '/journal/2026-11-25', { mood: 2 })).statusCode).toBe(200);
  });

  it('?month= ayın sınırları içindeki kayıtları döner', async () => {
    for (const date of ['2026-10-31', '2026-11-01', '2026-11-24'])
      await JournalEntry.create({ userId: user.id, date, mood: 2 });
    const res = await call('GET', '/journal?month=2026-11');
    const list = z.array(journalEntrySchema).parse(res.json());
    expect(list.map((e) => e.date)).toEqual(['2026-11-01', '2026-11-24']);
    expect((await call('GET', '/journal?month=2026-13')).statusCode).toBe(400);
  });

  it('recent: seçili günden önceki kayıtlar, en yeni önce', async () => {
    for (const date of ['2026-11-20', '2026-11-22', '2026-11-23', '2026-11-24'])
      await JournalEntry.create({ userId: user.id, date, mood: 2 });
    const list = z
      .array(journalEntrySchema)
      .parse((await call('GET', '/journal/recent?limit=2')).json());
    expect(list.map((e) => e.date)).toEqual(['2026-11-23', '2026-11-22']);
  });

  it('dayStats: ilerleme, odak, blok ve ceza', async () => {
    setNow('2026-11-23T03:00:00Z'); // Pzt 06:00
    const bike = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      startDate: '2026-11-01',
    });
    await createGoal(user, {
      name: 'Odak',
      target: 15,
      unit: 'saat',
      period: 'weekly',
      startDate: '2026-11-01',
    });
    for (const title of ['A', 'B', 'C'])
      await createBlock(user, {
        title,
        category: 'sport',
        daysOfWeek: [2],
        startTime: '07:00',
        endTime: '08:00',
      });
    await ensureWeek(user.id, '2026-11-23', user.timezone);
    const inst = await BlockInstance.find({ date: '2026-11-24' }).sort({ _id: 1 });
    await BlockInstance.updateOne({ _id: inst[0]!._id }, { status: 'done' });
    await BlockInstance.updateOne({ _id: inst[1]!._id }, { status: 'skipped' });
    await ProgressLog.create({ userId: user.id, goalId: bike._id, amount: 25, date: '2026-11-24' });

    setNow('2026-11-24T07:00:00Z');
    const s = await startFocus(user, { label: 'x', plannedMinutes: 50 });
    setNow('2026-11-24T08:40:00Z');
    await finishFocus(user, s.id);
    // gece 00:30'da oluşan ceza (UTC'de önceki gün) bu güne sayılır
    await Penalty.create({
      userId: user.id,
      ruleId: bike._id,
      reason: 'x',
      sourceRef: { type: 'instance', id: 'a' },
      penalty: '3 dk soğuk duş',
      dueAt: new Date('2026-11-25T00:00:00Z'),
      onFail: 'double',
      deadline: { type: 'hours', hours: 24 },
      createdAt: new Date('2026-11-23T21:30:00Z'),
    });

    const stats = await dayStats(user, '2026-11-24');
    expect(stats).toEqual({
      date: '2026-11-24',
      goals: [{ goalId: bike.id, name: 'Bisiklet', unit: 'km', amount: 25 }],
      focusMinutes: 50,
      blocks: { done: 1, total: 2 },
      penalties: { created: 1, open: 1 },
    });
    const day = journalDaySchema.parse((await call('GET', '/journal/2026-11-24')).json());
    expect(day.entry).toBeNull();
    expect(day.stats.focusMinutes).toBe(50);
  });
});
