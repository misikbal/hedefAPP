import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  blockSchema,
  goalHistorySchema,
  goalSchema,
  goalSummarySchema,
  statsOverviewSchema,
  todayResponseSchema,
  weekResponseSchema,
} from '@takip/shared';
import {
  ADMIN,
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

describe('REST API', () => {
  let app: FastifyInstance;
  let token: string;
  const auth = () => ({ authorization: `Bearer ${token}` });

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
    await createUser();
    token = await loginToken(app);
  });
  afterEach(resetClock);

  describe('auth', () => {
    it('yanlış şifre 401 ve Türkçe mesaj döner', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: ADMIN.email, password: 'yanlis' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'E-posta veya şifre hatalı' },
      });
    });

    it('token olmadan korumalı yol 401 döner', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/today' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('refresh token döndürülür; eski token tekrar kullanılırsa tüm oturumlar kapanır', async () => {
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: ADMIN });
      const first = login.json() as { refreshToken: string };
      const r1 = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: first });
      expect(r1.statusCode).toBe(200);
      const second = r1.json() as { accessToken: string; refreshToken: string };
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const reuse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: first,
      });
      expect(reuse.statusCode).toBe(401);
      const afterReuse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: second,
      });
      expect(afterReuse.statusCode).toBe(401);
    });

    it('çıkıştan sonra refresh token geçersizdir', async () => {
      const login = (
        await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: ADMIN })
      ).json();
      const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: login });
      expect(out.statusCode).toBe(204);
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: login });
      expect(r.statusCode).toBe(401);
    });
  });

  describe('blocks + week', () => {
    it('blok eklenir, haftada doğru günlere düşer, işaretlenir', async () => {
      setNow('2026-11-24T03:00:00Z'); // Salı 06:00
      token = await loginToken(app);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/blocks',
        headers: auth(),
        payload: {
          title: 'Kitap · 20 sayfa',
          category: 'reading',
          daysOfWeek: [2, 4, 4],
          startTime: '22:00',
          endTime: '22:40',
        },
      });
      expect(created.statusCode).toBe(201);
      const block = blockSchema.parse(created.json());
      expect(block.daysOfWeek).toEqual([2, 4]);
      expect(block.validFrom).toBe('2026-11-24');

      const week = weekResponseSchema.parse(
        (
          await app.inject({ method: 'GET', url: '/api/v1/week?start=2026-11-23', headers: auth() })
        ).json(),
      );
      expect(week.days.map((d) => d.instances.length)).toEqual([0, 1, 0, 1, 0, 0, 0]);

      const today = todayResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/v1/today', headers: auth() })).json(),
      );
      expect(today.date).toBe('2026-11-24');
      expect(today.note).toBe("1 bloğun 0'ı bitti. Sıradaki blok seni bekliyor.");
      const inst = today.instances[0]!;
      expect(inst).toMatchObject({
        startTime: '22:00',
        endTime: '22:40',
        status: 'planned',
        category: 'reading',
      });

      const done = await app.inject({
        method: 'POST',
        url: `/api/v1/instances/${inst.id}/done`,
        headers: auth(),
      });
      expect(done.json().status).toBe('done');

      const hist = await app.inject({
        method: 'GET',
        url: `/api/v1/blocks/${block.id}/history?weeks=6`,
        headers: auth(),
      });
      expect(hist.json()).toMatchObject({ doneWeeks: 1, countedWeeks: 1 });
      expect(hist.json().weeks.at(-1)).toMatchObject({ label: 'H48', status: 'done' });
    });

    it('geçersiz gövde 400 ve alan ayrıntısı döner', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/blocks',
        headers: auth(),
        payload: {
          title: '',
          category: 'sport',
          daysOfWeek: [],
          startTime: '09:00',
          endTime: '08:00',
        },
      });
      expect(res.statusCode).toBe(400);
      const err = res.json().error;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details.map((d: { path: string[] }) => d.path[0])).toEqual(
        expect.arrayContaining(['title', 'daysOfWeek']),
      );
    });

    it('başka bir id ile blok bulunamaz (404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/blocks/000000000000000000000000',
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('BLOCK_NOT_FOUND');
    });

    it('PATCH tek alanla bitiş<başlangıç yapılamaz', async () => {
      setNow('2026-11-23T03:00:00Z');
      token = await loginToken(app);
      const b = (
        await app.inject({
          method: 'POST',
          url: '/api/v1/blocks',
          headers: auth(),
          payload: {
            title: 'Ders',
            category: 'project',
            daysOfWeek: [1],
            startTime: '18:30',
            endTime: '20:00',
          },
        })
      ).json();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/blocks/${b.id}`,
        headers: auth(),
        payload: { startTime: '21:00' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('goals + progress + stats', () => {
    it('hedef eklenir, ilerleme girilir, Bugün ve geçmiş güncellenir', async () => {
      setNow('2026-11-24T18:00:00Z');
      token = await loginToken(app);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/goals',
        headers: auth(),
        payload: {
          name: 'Almanca',
          target: 75,
          unit: 'kelime',
          period: 'weekly',
          category: 'language',
        },
      });
      expect(created.statusCode).toBe(201);
      const goal = goalSchema.parse(created.json());
      expect(goal).toMatchObject({ startDate: '2026-11-24', trackStreak: true });

      const log = await app.inject({
        method: 'POST',
        url: '/api/v1/progress',
        headers: auth(),
        payload: { goalId: goal.id, amount: 48, note: 'kartlar' },
      });
      expect(log.statusCode).toBe(201);
      expect(log.json()).toMatchObject({
        amount: 48,
        date: '2026-11-24',
        source: 'app',
        note: 'kartlar',
      });

      const list = (
        await app.inject({ method: 'GET', url: '/api/v1/goals', headers: auth() })
      ).json();
      expect(goalSummarySchema.array().parse(list)[0]).toMatchObject({
        current: 48,
        status: 'on_track',
      });

      const today = todayResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/v1/today', headers: auth() })).json(),
      );
      expect(today.goals.map((g) => g.current)).toEqual([48]);

      const hist = await app.inject({
        method: 'GET',
        url: `/api/v1/goals/${goal.id}/history?periods=8`,
        headers: auth(),
      });
      expect(goalHistorySchema.parse(hist.json()).buckets.at(-1)).toMatchObject({
        label: 'H48',
        value: 48,
      });

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/progress/${log.json().id}`,
        headers: auth(),
      });
      expect(del.statusCode).toBe(204);
    });

    it('geçersiz ilerleme ve aralık 400 döner', async () => {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/v1/progress',
        headers: auth(),
        payload: { goalId: 'abc', amount: -3 },
      });
      expect(bad.statusCode).toBe(400);
      const range = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/overview?range=ay',
        headers: auth(),
      });
      expect(range.statusCode).toBe(400);
    });

    it('stats/overview şemaya uyar (boş veri)', async () => {
      for (const range of ['week', '12w', 'year']) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/stats/overview?range=${range}`,
          headers: auth(),
        });
        expect(res.statusCode).toBe(200);
        const s = statsOverviewSchema.parse(res.json());
        expect(s.score).toBeNull();
        expect(s.heatmap).toHaveLength(84);
      }
    });
  });
});
