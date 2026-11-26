import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { stravaStatusSchema } from '@takip/shared';
import { buildApp } from '../src/app.js';
import { ProgressLog, StravaConnection } from '../src/db/models/index.js';
import { createGoal } from '../src/services/goals.js';
import { createState, strava, waitForStravaJobs } from '../src/services/strava.js';
import type { UserContext } from '../src/services/users.js';
import {
  TEST_CONFIG,
  createUser,
  loginToken,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

const NOW = '2026-11-23T09:00:00Z'; // Pzt 12:00 yerel
const NOW_S = Date.parse(NOW) / 1000;
const VERIFY = 'dogrulama-tokeni-1234567890';
const CONFIG = {
  ...TEST_CONFIG,
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'strava-gizli',
  STRAVA_WEBHOOK_VERIFY_TOKEN: VERIFY,
  PUBLIC_API_URL: 'https://hedef.example.com',
};

interface Activity {
  id: number;
  name: string;
  distance: number;
  type: string;
  sport_type: string;
  start_date_local: string;
}

/** Sahte Strava: istekleri kaydeder, etkinlikleri bellekte tutar. */
class FakeStrava {
  calls: { url: string; method: string; body?: string; auth?: string }[] = [];
  activities = new Map<number, Activity>();
  validAccess = new Set(['acc-1']);
  validRefresh = new Set(['ref-1']);
  revoked = false;
  private n = 1;

  fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call = {
      url: url.pathname + url.search,
      method,
      body: init?.body as string | undefined,
      auth: headers.authorization,
    };
    this.calls.push(call);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (url.pathname === '/oauth/token') {
      const b = JSON.parse(call.body ?? '{}') as Record<string, string>;
      if (b.client_secret !== 'strava-gizli') return json(401, { message: 'bad client' });
      if (b.grant_type === 'authorization_code') {
        if (b.code !== 'iyi-kod') return json(400, { message: 'Bad Request' });
        return json(200, {
          access_token: 'acc-1',
          refresh_token: 'ref-1',
          expires_at: NOW_S + 6 * 3600,
          athlete: { id: 777, firstname: 'Ali', lastname: 'Veli' },
        });
      }
      if (b.grant_type === 'refresh_token') {
        if (this.revoked || !this.validRefresh.has(b.refresh_token!))
          return json(400, { message: 'Bad Request' });
        this.n++;
        const access = `acc-${this.n}`;
        const refresh = `ref-${this.n}`;
        this.validAccess = new Set([access]);
        this.validRefresh = new Set([refresh]);
        return json(200, {
          access_token: access,
          refresh_token: refresh,
          expires_at: NOW_S + 6 * 3600,
        });
      }
    }
    if (url.pathname === '/oauth/deauthorize') return json(200, {});

    const token = call.auth?.replace('Bearer ', '');
    if (this.revoked || !token || !this.validAccess.has(token))
      return json(401, { message: 'Authorization Error' });
    if (url.pathname === '/api/v3/athlete') return json(200, { id: 777 });
    const m = /^\/api\/v3\/activities\/(\d+)$/.exec(url.pathname);
    if (m) {
      const a = this.activities.get(Number(m[1]));
      return a ? json(200, a) : json(404, { message: 'Record Not Found' });
    }
    if (url.pathname === '/api/v3/athlete/activities') {
      const page = Number(url.searchParams.get('page'));
      const perPage = Number(url.searchParams.get('per_page'));
      const all = [...this.activities.values()];
      return json(200, all.slice((page - 1) * perPage, page * perPage));
    }
    return json(404, {});
  };
}

const ride = (over: Partial<Activity> = {}): Activity => ({
  id: 1001,
  name: 'Sabah turu',
  distance: 23456, // 23.5 km
  type: 'Ride',
  sport_type: 'Ride',
  start_date_local: '2026-11-22T23:30:00Z', // yerel 22 Kasım (UTC'de 22 Kasım 20:30)
  ...over,
});

describe('Strava entegrasyonu', () => {
  let app: FastifyInstance;
  let token: string;
  let user: UserContext;
  let fake: FakeStrava;
  let goalId: string;
  const originalFetch = strava.http.fetch;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  const connect = async () => {
    const state = await createState(String(user.id), TEST_CONFIG.JWT_ACCESS_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/v1/integrations/strava/callback?code=iyi-kod&scope=read,activity:read_all&state=${state}`,
    });
  };

  const webhook = async (event: object) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/strava/webhook',
      payload: { owner_id: 777, subscription_id: 1, event_time: NOW_S, updates: {}, ...event },
    });
    expect(res.statusCode).toBe(200);
    await waitForStravaJobs();
  };

  beforeAll(async () => {
    await startDb();
    app = await buildApp(CONFIG);
  });
  afterAll(async () => {
    strava.http.fetch = originalFetch;
    resetClock();
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    await resetDb();
    setNow(NOW);
    user = await createUser();
    token = await loginToken(app);
    fake = new FakeStrava();
    strava.http.fetch = fake.fetch;
    const goal = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
    });
    goalId = goal.id as string;
  });

  const connectWithGoal = async () => {
    expect((await connect()).statusCode).toBe(302);
    expect((await call('PATCH', '/integrations/strava', { goalId })).statusCode).toBe(200);
  };

  it('yapılandırılmamışsa kapalı görünür, bağlanma 503', async () => {
    const plain = await buildApp(TEST_CONFIG);
    const t = await loginToken(plain);
    const h = { authorization: `Bearer ${t}` };
    const status = await plain.inject({
      method: 'GET',
      url: '/api/v1/integrations/strava',
      headers: h,
    });
    expect(stravaStatusSchema.parse(status.json())).toMatchObject({
      configured: false,
      connected: false,
    });
    const res = await plain.inject({
      method: 'POST',
      url: '/api/v1/integrations/strava/connect',
      headers: h,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('STRAVA_NOT_CONFIGURED');
    await plain.close();
  });

  it('connect: authorize adresi state ve scope içerir', async () => {
    const res = await call('POST', '/integrations/strava/connect');
    expect(res.statusCode).toBe(200);
    const url = new URL(res.json().url as string);
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('12345');
    expect(url.searchParams.get('scope')).toBe('activity:read_all');
    expect(url.searchParams.get('approval_prompt')).toBe('auto');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://hedef.example.com/api/v1/integrations/strava/callback',
    );
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('callback: geçersiz ya da süresi dolmuş state reddedilir', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/strava/callback?code=iyi-kod&scope=activity:read_all&state=sahte',
    });
    expect(bad.statusCode).toBe(302);
    expect(bad.headers.location).toBe('takip://strava?status=error&reason=state');

    // Erişim token'ı state yerine kullanılamaz (typ farklı).
    const asState = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/strava/callback?code=iyi-kod&scope=activity:read_all&state=${token}`,
    });
    expect(asState.headers.location).toContain('reason=state');

    const state = await createState(String(user.id), TEST_CONFIG.JWT_ACCESS_SECRET);
    setNow('2026-11-23T09:11:00Z'); // 10 dk'dan sonra
    const expired = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/strava/callback?code=iyi-kod&scope=activity:read_all&state=${state}`,
    });
    expect(expired.headers.location).toContain('reason=state');
    expect(fake.calls).toHaveLength(0);
    expect(await StravaConnection.countDocuments()).toBe(0);
  });

  it('callback: izin verilmedi / eksik scope / kod geçersiz', async () => {
    const state = await createState(String(user.id), TEST_CONFIG.JWT_ACCESS_SECRET);
    const go = (q: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/integrations/strava/callback?state=${state}&${q}`,
      });
    expect((await go('error=access_denied')).headers.location).toContain('reason=denied');
    expect((await go('code=iyi-kod&scope=read')).headers.location).toContain('reason=scope');
    expect((await go('code=kotu&scope=activity:read_all')).headers.location).toContain(
      'reason=exchange',
    );
    expect(await StravaConnection.countDocuments()).toBe(0);
  });

  it('callback: token değişimi ve bağlantı kaydı', async () => {
    const res = await connect();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('takip://strava?status=ok');
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Uygulamaya dön');

    const conn = await StravaConnection.findOne({ userId: user.id }).orFail();
    expect(conn.athleteId).toBe(777);
    expect(conn.athleteName).toBe('Ali Veli');
    expect(conn.accessToken).toBe('acc-1');
    expect(conn.refreshToken).toBe('ref-1');
    expect(conn.activityTypes).toContain('GravelRide');

    const status = stravaStatusSchema.parse((await call('GET', '/integrations/strava')).json());
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      athleteName: 'Ali Veli',
      goalId: null,
    });
    expect(JSON.stringify(status)).not.toContain('acc-1');
  });

  it('PATCH: yalnızca kullanıcının km birimli hedefi', async () => {
    await connect();
    const pages = await createGoal(user, {
      name: 'Kitap',
      target: 100,
      unit: 'sayfa',
      period: 'weekly',
    });
    const mismatch = await call('PATCH', '/integrations/strava', { goalId: pages.id });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.code).toBe('GOAL_UNIT_MISMATCH');
    const missing = await call('PATCH', '/integrations/strava', { goalId: 'a'.repeat(24) });
    expect(missing.json().error.code).toBe('GOAL_NOT_FOUND');
    const bad = await call('PATCH', '/integrations/strava', { activityTypes: ['Yuzme'] });
    expect(bad.statusCode).toBe(400);

    const ok = await call('PATCH', '/integrations/strava', { goalId, activityTypes: ['Ride'] });
    expect(ok.json()).toMatchObject({ goalId, activityTypes: ['Ride'] });
  });

  it('webhook doğrulama: doğru token challenge döner, yanlış token 403', async () => {
    const good = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=abc123`,
    });
    expect(good.statusCode).toBe(200);
    expect(good.json()).toEqual({ 'hub.challenge': 'abc123' });

    const wrong = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=abc123',
    });
    expect(wrong.statusCode).toBe(403);
  });

  it('create → ProgressLog: km yuvarlama, yerel gün, not; tür filtresi', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    fake.activities.set(1002, ride({ id: 1002, type: 'Run', sport_type: 'Run', distance: 5000 }));
    fake.activities.set(
      1003,
      ride({ id: 1003, type: 'Ride', sport_type: 'GravelRide', distance: 10049 }),
    );
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    await webhook({ object_type: 'activity', object_id: 1002, aspect_type: 'create' });
    await webhook({ object_type: 'activity', object_id: 1003, aspect_type: 'create' });

    const logs = await ProgressLog.find({ userId: user.id }).sort({ externalId: 1 }).lean();
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      externalId: '1001',
      amount: 23.5,
      date: '2026-11-22',
      source: 'strava',
      note: 'Sabah turu',
    });
    expect(String(logs[0]!.goalId)).toBe(goalId);
    expect(logs[1]).toMatchObject({ externalId: '1003', amount: 10 });

    // Hedef ilerlemesine mevcut akışla yansır (22 Kasım pazar = geçen hafta; bugün pazartesi).
    fake.activities.set(
      1004,
      ride({ id: 1004, distance: 12000, start_date_local: '2026-11-23T10:00:00Z' }),
    );
    await webhook({ object_type: 'activity', object_id: 1004, aspect_type: 'create' });
    const goals = (await call('GET', '/goals')).json() as { id: string; current: number }[];
    expect(goals.find((g) => g.id === goalId)?.current).toBe(12);
  });

  it('hedef seçilmemişse etkinlik yazılmaz', async () => {
    await connect();
    fake.activities.set(1001, ride());
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    expect(await ProgressLog.countDocuments()).toBe(0);
  });

  it('update: miktar/gün güncellenir; tür uygun değilse silinir', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });

    fake.activities.set(
      1001,
      ride({ distance: 30040, start_date_local: '2026-11-21T07:00:00Z', name: 'Uzun tur' }),
    );
    await webhook({
      object_type: 'activity',
      object_id: 1001,
      aspect_type: 'update',
      updates: { title: 'Uzun tur' },
    });
    const log = await ProgressLog.findOne({ externalId: '1001' }).orFail();
    expect(log).toMatchObject({ amount: 30, date: '2026-11-21', note: 'Uzun tur' });

    fake.activities.set(1001, ride({ type: 'Walk', sport_type: 'Walk' }));
    await webhook({
      object_type: 'activity',
      object_id: 1001,
      aspect_type: 'update',
      updates: { type: 'Walk' },
    });
    expect(await ProgressLog.countDocuments()).toBe(0);
  });

  it('delete: kayıt silinir; etkinlik hâlâ duruyorsa silinmez', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    expect(await ProgressLog.countDocuments()).toBe(1);

    // Sahte silme olayı: etkinlik Strava'da duruyor.
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'delete' });
    expect(await ProgressLog.countDocuments()).toBe(1);

    fake.activities.delete(1001);
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'delete' });
    expect(await ProgressLog.countDocuments()).toBe(0);
  });

  it('aynı etkinlik iki kez → tek kayıt (webhook + sync)', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    const sync = await call('POST', '/integrations/strava/sync');
    expect(sync.json()).toEqual({ imported: 0, updated: 0, skipped: 1 });
    expect(await ProgressLog.countDocuments({ externalId: '1001' })).toBe(1);
    // Veritabanı düzeyinde de engellenir.
    await expect(
      ProgressLog.create({
        userId: user.id,
        goalId,
        amount: 1,
        date: '2026-11-22',
        source: 'strava',
        externalId: '1001',
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('bilinmeyen sporcu olayı yok sayılır', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    await webhook({
      owner_id: 999,
      object_type: 'activity',
      object_id: 1001,
      aspect_type: 'create',
    });
    expect(await ProgressLog.countDocuments()).toBe(0);
    expect(fake.calls.filter((c) => c.url.startsWith('/api/v3'))).toHaveLength(0);
  });

  it('athlete authorized:false → bağlantı silinir (token gerçekten geçersizse)', async () => {
    await connectWithGoal();
    // Token hâlâ geçerli: sahte olay, bağlantı kalır.
    await webhook({
      object_type: 'athlete',
      object_id: 777,
      aspect_type: 'update',
      updates: { authorized: 'false' },
    });
    expect(await StravaConnection.countDocuments()).toBe(1);

    fake.revoked = true;
    await webhook({
      object_type: 'athlete',
      object_id: 777,
      aspect_type: 'update',
      updates: { authorized: 'false' },
    });
    expect(await StravaConnection.countDocuments()).toBe(0);
  });

  it('token yenileme: süresi dolmak üzereyse önce, 401 gelirse bir kez', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());

    // Süre 5 dk içinde bitiyor → istekten önce yenilenir.
    await StravaConnection.updateOne({}, { expiresAt: new Date(Date.parse(NOW) + 2 * 60_000) });
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'create' });
    let conn = await StravaConnection.findOne().orFail();
    expect(conn.accessToken).toBe('acc-2');
    expect(conn.refreshToken).toBe('ref-2');
    expect(conn.expiresAt.getTime()).toBe((NOW_S + 6 * 3600) * 1000);
    expect(await ProgressLog.countDocuments()).toBe(1);

    // Sunucu token'ı reddetti (süre geçerli görünse de) → yenile ve tekrar dene.
    fake.validAccess = new Set();
    fake.activities.set(1001, ride({ distance: 40000 }));
    await webhook({ object_type: 'activity', object_id: 1001, aspect_type: 'update' });
    conn = await StravaConnection.findOne().orFail();
    expect(conn.accessToken).toBe('acc-3');
    expect((await ProgressLog.findOne().orFail()).amount).toBe(40);
    const tokenCalls = fake.calls.filter((c) => c.url === '/oauth/token');
    expect(tokenCalls).toHaveLength(3); // değişim + 2 yenileme
  });

  it('sync: sayfalı çeker, sonuçları sayar, lastSyncAt yazar; erişim kaldırıldıysa hata', async () => {
    await connectWithGoal();
    for (let i = 0; i < 105; i++)
      fake.activities.set(2000 + i, ride({ id: 2000 + i, distance: 1000 }));
    fake.activities.set(3000, ride({ id: 3000, type: 'Swim', sport_type: 'Swim' }));

    const first = await call('POST', '/integrations/strava/sync');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ imported: 105, updated: 0, skipped: 1 });
    const pages = fake.calls.filter((c) => c.url.startsWith('/api/v3/athlete/activities'));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.url).toContain(`after=${NOW_S - 30 * 86400}`);

    fake.activities.set(2000, ride({ id: 2000, distance: 2000 }));
    const second = await call('POST', '/integrations/strava/sync');
    expect(second.json()).toEqual({ imported: 0, updated: 1, skipped: 105 });
    // İkinci eşitleme lastSyncAt'ın 2 gün gerisinden başlar.
    expect(fake.calls.at(-2)!.url).toContain(`after=${NOW_S - 2 * 86400}`);

    const status = stravaStatusSchema.parse((await call('GET', '/integrations/strava')).json());
    expect(status.lastSyncAt).toBe(new Date(NOW).toISOString());
    expect(status.lastError).toBeNull();

    fake.revoked = true;
    const failed = await call('POST', '/integrations/strava/sync');
    expect(failed.statusCode).toBe(409);
    expect(failed.json().error.code).toBe('STRAVA_UNAUTHORIZED');
    const after = stravaStatusSchema.parse((await call('GET', '/integrations/strava')).json());
    expect(after.lastError).toContain('yeniden bağlan');
  });

  it('DELETE: Strava deauthorize çağrılır, kayıt silinir, ilerlemeler kalır', async () => {
    await connectWithGoal();
    fake.activities.set(1001, ride());
    await call('POST', '/integrations/strava/sync');
    const res = await call('DELETE', '/integrations/strava');
    expect(res.statusCode).toBe(204);
    const deauth = fake.calls.find((c) => c.url === '/oauth/deauthorize');
    expect(deauth).toMatchObject({ method: 'POST', auth: 'Bearer acc-1' });
    expect(await StravaConnection.countDocuments()).toBe(0);
    expect(await ProgressLog.countDocuments()).toBe(1);

    // Strava'ya ulaşılamasa da bağlantı silinir.
    await connect();
    strava.http.fetch = async () => {
      throw new Error('ağ yok');
    };
    expect((await call('DELETE', '/integrations/strava')).statusCode).toBe(204);
    expect(await StravaConnection.countDocuments()).toBe(0);
  });

  it("export'ta Strava token'ları yok", async () => {
    await connectWithGoal();
    const res = await call('GET', '/export');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stravaConnection: Record<string, unknown> };
    expect(body.stravaConnection).toMatchObject({ athleteId: 777, athleteName: 'Ali Veli' });
    expect(body.stravaConnection).not.toHaveProperty('accessToken');
    expect(body.stravaConnection).not.toHaveProperty('refreshToken');
    expect(res.body).not.toContain('acc-1');
    expect(res.body).not.toContain('ref-1');
  });
});
