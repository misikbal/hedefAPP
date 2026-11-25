import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  focusFinishResponseSchema,
  focusSessionSchema,
  focusWeekSchema,
  statsOverviewSchema,
} from '@takip/shared';
import { FocusSession, ProgressLog } from '../src/db/models/index.js';
import { createGoal } from '../src/services/goals.js';
import {
  abandonFocus,
  abandonStaleSessions,
  activeFocus,
  finishFocus,
  interruptFocus,
  pauseFocus,
  resumeFocus,
  startFocus,
} from '../src/services/focus.js';
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

const MIN = 60_000;
const at = (iso: string, plusMin = 0) => new Date(Date.parse(iso) + plusMin * MIN).toISOString();
const T0 = '2026-11-25T07:00:00Z'; // Çar 10:00 yerel

describe('odak servisi', () => {
  let user: UserContext;

  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    setNow(T0);
  });
  afterEach(resetClock);

  const odak = () =>
    createGoal(user, {
      name: 'Odak',
      target: 15,
      unit: 'saat',
      period: 'weekly',
      category: 'project',
      startDate: '2026-11-01',
    });

  it('aynı anda tek açık seans: ikincisi 409', async () => {
    await startFocus(user, { label: 'KODMIS', plannedMinutes: 50 });
    await expect(startFocus(user, { label: 'Başka', plannedMinutes: 25 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'FOCUS_ALREADY_OPEN',
    });
  });

  it('geçersiz süre reddedilir', async () => {
    await expect(startFocus(user, { label: 'x', plannedMinutes: 30 as never })).rejects.toThrow();
  });

  it('duraklat / devam: süre duvar saatinden, duraklama düşülür', async () => {
    const s = await startFocus(user, { label: 'KODMIS', plannedMinutes: 50 });
    setNow(at(T0, 10));
    await pauseFocus(user, s.id);
    setNow(at(T0, 15));
    const r = await resumeFocus(user, s.id);
    expect(r.pausedMs).toBe(5 * MIN);
    setNow(at(T0, 30));
    const { session } = await finishFocus(user, s.id);
    expect(session.elapsedMs).toBe(25 * MIN);
    expect(session.status).toBe('completed');
    expect(session.reachedPeak).toBe(false);
  });

  it('geçersiz geçişler 409', async () => {
    const s = await startFocus(user, { label: 'KODMIS', plannedMinutes: 25 });
    await expect(resumeFocus(user, s.id)).rejects.toMatchObject({ statusCode: 409 });
    await finishFocus(user, s.id);
    await expect(pauseFocus(user, s.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Bu seans zaten tamamlandı',
    });
    await expect(abandonFocus(user, s.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(interruptFocus(user, s.id, { backgroundMs: 20_000 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('finish hedefe tek ProgressLog yazar (saat, 1 ondalık) ve idempotenttir', async () => {
    const goal = await odak();
    const s = await startFocus(user, { label: 'KODMIS', plannedMinutes: 50 });
    expect(String(s.goalId)).toBe(goal.id);
    setNow(at(T0, 70));
    const first = await finishFocus(user, s.id, { note: 'Panel bitti', interruptions: 1 });
    const second = await finishFocus(user, s.id, { note: 'Panel bitti, kırılımlar kaldı' });
    const logs = await ProgressLog.find({ goalId: goal._id });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.amount).toBe(0.8);
    expect(logs[0]!.source).toBe('focus');
    expect(logs[0]!.date).toBe('2026-11-25');
    expect(first.session.reachedPeak).toBe(true);
    expect(first.week).toEqual({ before: 0, after: 0.8, target: 15 });
    expect(second.session.note).toBe('Panel bitti, kırılımlar kaldı');
    expect(second.session.interruptions).toBe(1);
    expect(second.week).toEqual(first.week);
  });

  it('dakika birimli hedefe dakika yazılır; başka birimli hedef reddedilir', async () => {
    const dk = await createGoal(user, {
      name: 'Meditasyon',
      target: 60,
      unit: 'dakika',
      period: 'weekly',
      startDate: '2026-11-01',
    });
    const km = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      startDate: '2026-11-01',
    });
    await expect(
      startFocus(user, { label: 'x', plannedMinutes: 25, goalId: km.id as string }),
    ).rejects.toMatchObject({ code: 'GOAL_UNIT_INVALID' });
    const s = await startFocus(user, { label: 'x', plannedMinutes: 25, goalId: dk.id as string });
    setNow(at(T0, 25));
    await finishFocus(user, s.id);
    expect((await ProgressLog.findOne({ goalId: dk._id }))!.amount).toBe(25);
  });

  it('hedef yoksa kayıt yazılmaz, haftalık toplam seanslardan gelir', async () => {
    const s = await startFocus(user, { label: 'x', plannedMinutes: 90 });
    setNow(at(T0, 90));
    const r = await finishFocus(user, s.id);
    expect(await ProgressLog.countDocuments()).toBe(0);
    expect(r.week).toEqual({ before: 0, after: 1.5, target: null });
  });

  it('arka plan > 10 sn bölünme sayar, seans sürer; kısa arka plan sayılmaz', async () => {
    const s = await startFocus(user, { label: 'x', plannedMinutes: 50 });
    const a = await interruptFocus(user, s.id, { backgroundMs: 5_000 });
    expect(a.interruptions).toBe(0);
    const b = await interruptFocus(user, s.id, { backgroundMs: 12_000 });
    expect(b.interruptions).toBe(1);
    expect(b.backgroundMs).toBe(12_000);
    expect(b.status).toBe('running');
    for (let i = 0; i < 4; i++) await interruptFocus(user, s.id, { backgroundMs: 15_000 });
    expect((await FocusSession.findById(s._id))!.interruptions).toBe(3);
  });

  it('çıkışta interrupt { end } seansı bitirir ve süreyi hedefe yazar', async () => {
    const goal = await odak();
    const s = await startFocus(user, { label: 'x', plannedMinutes: 50 });
    setNow(at(T0, 30));
    const r = await interruptFocus(user, s.id, { end: true });
    expect(r.status).toBe('interrupted');
    expect(r.endedAt?.toISOString()).toBe(at(T0, 30));
    expect((await ProgressLog.findOne({ goalId: goal._id }))!.amount).toBe(0.5);
    // tekrar çağrılırsa değişmez
    await interruptFocus(user, s.id, { end: true });
    expect(await ProgressLog.countDocuments()).toBe(1);
  });

  it('sıfırla (abandon) hedefe yazmaz', async () => {
    await odak();
    const s = await startFocus(user, { label: 'x', plannedMinutes: 25 });
    setNow(at(T0, 20));
    const r = await abandonFocus(user, s.id);
    expect(r.status).toBe('abandoned');
    expect(await ProgressLog.countDocuments()).toBe(0);
    // yeni seans başlatılabilir
    await startFocus(user, { label: 'y', plannedMinutes: 25 });
  });

  it('unutulan seanslar plannedMinutes + 6 saat sonra abandoned', async () => {
    const s = await startFocus(user, { label: 'x', plannedMinutes: 50 });
    setNow(at(T0, 50 + 6 * 60 - 1));
    expect(await abandonStaleSessions()).toBe(0);
    expect(await activeFocus(user)).not.toBeNull();
    setNow(at(T0, 50 + 6 * 60 + 1));
    expect(await abandonStaleSessions()).toBe(1);
    expect((await FocusSession.findById(s._id))!.status).toBe('abandoned');
    expect(await activeFocus(user)).toBeNull();
  });

  it('gece yarısını aşan seans başladığı güne yazılır', async () => {
    await odak();
    setNow('2026-11-24T20:50:00Z'); // Salı 23:50 yerel
    const s = await startFocus(user, { label: 'x', plannedMinutes: 50 });
    setNow('2026-11-24T21:40:00Z'); // Çar 00:40
    await finishFocus(user, s.id);
    expect((await ProgressLog.findOne())!.date).toBe('2026-11-24');
  });
});

describe('odak REST', () => {
  let app: FastifyInstance;
  let token: string;
  const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
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
    const user = await createUser();
    token = await loginToken(app);
    await createGoal(user, {
      name: 'Odak',
      target: 15,
      unit: 'saat',
      period: 'weekly',
      category: 'project',
      startDate: '2026-11-01',
    });
  });
  afterEach(resetClock);

  it('start → active → pause → resume → finish akışı', async () => {
    setNow(T0);
    expect((await call('GET', '/focus/active')).json()).toBeNull();
    const started = await call('POST', '/focus/start', { label: 'KODMIS', plannedMinutes: 50 });
    expect(started.statusCode).toBe(201);
    const s = focusSessionSchema.parse(started.json());
    expect(
      (await call('POST', '/focus/start', { label: 'b', plannedMinutes: 25 })).statusCode,
    ).toBe(409);
    expect(focusSessionSchema.parse((await call('GET', '/focus/active')).json()).id).toBe(s.id);
    setNow(at(T0, 5));
    expect((await call('POST', `/focus/${s.id}/pause`)).json()).toMatchObject({ status: 'paused' });
    setNow(at(T0, 8));
    expect((await call('POST', `/focus/${s.id}/resume`)).json()).toMatchObject({
      status: 'running',
      pausedMs: 3 * MIN,
    });
    const bg = await call('POST', `/focus/${s.id}/interrupt`, { backgroundMs: 15_000 });
    expect(bg.json()).toMatchObject({ interruptions: 1, status: 'running' });
    expect((await call('POST', `/focus/${s.id}/interrupt`, {})).statusCode).toBe(400);
    setNow(at(T0, 53));
    const fin = focusFinishResponseSchema.parse(
      (await call('POST', `/focus/${s.id}/finish`, { note: 'iyi', interruptions: 1 })).json(),
    );
    expect(fin.session.reachedPeak).toBe(true);
    expect(fin.week.after).toBe(0.8);
    expect((await call('GET', '/focus/labels')).json()).toEqual(['KODMIS']);
  });

  it('/focus/week: hafta pazartesi 00:00 yerel (pazar 21:00 UTC) başlar', async () => {
    // Pazar 23:30 yerel → önceki hafta
    setNow('2026-11-22T20:30:00Z');
    const a = focusSessionSchema.parse(
      (await call('POST', '/focus/start', { label: 'pazar', plannedMinutes: 25 })).json(),
    );
    setNow('2026-11-22T20:55:00Z');
    await call('POST', `/focus/${a.id}/finish`);
    // Pazartesi 00:00 yerel → bu hafta
    setNow('2026-11-22T21:00:00Z');
    const b = focusSessionSchema.parse(
      (await call('POST', '/focus/start', { label: 'pazartesi', plannedMinutes: 50 })).json(),
    );
    setNow('2026-11-22T21:50:00Z');
    await call('POST', `/focus/${b.id}/finish`);
    setNow('2026-11-23T08:00:00Z');
    const week = focusWeekSchema.parse((await call('GET', '/focus/week')).json());
    expect(week.weekStart).toBe('2026-11-23');
    expect(week.sessions.map((s) => s.label)).toEqual(['pazartesi']);
    expect(week.totalHours).toBe(0.8);
    expect(week.targetHours).toBe(15);
    expect(week.today).toEqual({ peaks: 1, minutes: 50 });
  });

  it('stats.timeSplit odak süresini hedefin kategorisine ekler', async () => {
    setNow(T0);
    const s = focusSessionSchema.parse(
      (await call('POST', '/focus/start', { label: 'x', plannedMinutes: 90 })).json(),
    );
    setNow(at(T0, 90));
    await call('POST', `/focus/${s.id}/finish`);
    const stats = statsOverviewSchema.parse(
      (await call('GET', '/stats/overview?range=week')).json(),
    );
    expect(stats.split).toEqual([{ category: 'project', minutes: 90, pct: 100 }]);
  });
});
