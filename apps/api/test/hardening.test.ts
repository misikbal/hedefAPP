import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { DeviceToken, JournalEntry, RefreshToken } from '../src/db/models/index.js';
import { createGoal } from '../src/services/goals.js';
import {
  ADMIN,
  TEST_CONFIG,
  createUser,
  loginToken,
  makeApp,
  resetDb,
  startDb,
  stopDb,
} from './helpers.js';

describe('sağlamlaştırma', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    await createUser();
  });

  it('ortam: CORS_ORIGINS listesi, TRUST_PROXY, RATE_LIMIT_MAX', () => {
    const env = loadEnv({
      MONGODB_URI: 'mongodb://x/takip',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      MCP_SECRET: 'c'.repeat(32),
      CORS_ORIGINS: 'https://a.example, https://b.example',
      TRUST_PROXY: 'true',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.RATE_LIMIT_MAX).toBe(300);
  });

  describe('üretim ayarlarıyla', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildApp({
        ...TEST_CONFIG,
        NODE_ENV: 'production',
        rateLimit: true,
        RATE_LIMIT_MAX: 20,
        CORS_ORIGINS: ['https://izinli.example'],
      });
    });
    afterAll(() => app.close());

    it('helmet başlıkları', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS yalnızca izinli kökene', async () => {
      const ok = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://izinli.example' },
      });
      expect(ok.headers['access-control-allow-origin']).toBe('https://izinli.example');
      const bad = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://kotu.example' },
      });
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('girişte dakikada 10 deneme; sonra 429 ve Türkçe hata', async () => {
      const wrong = { email: ADMIN.email, password: 'yanlis-sifre' };
      for (let i = 0; i < 10; i++) {
        const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: wrong });
        expect(r.statusCode).toBe(401);
      }
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: wrong });
      expect(r.statusCode).toBe(429);
      expect(r.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(r.headers['retry-after']).toBeDefined();
    });

    it('/health sınırsız', async () => {
      for (let i = 0; i < 25; i++) {
        const r = await app.inject({ method: 'GET', url: '/health' });
        expect(r.statusCode).toBe(200);
      }
    });
  });

  it('dışa aktarma: bütün veri, gizli alanlar yok', async () => {
    const app = await makeApp();
    const token = await loginToken(app);
    const user = await createUser();
    await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      category: 'sport',
      startDate: '2026-11-01',
    });
    await JournalEntry.create({ userId: user.id, date: '2026-11-24', mood: 3 });
    await DeviceToken.create({ userId: user.id, expoPushToken: 'ExponentPushToken[gizli]' });
    expect(await RefreshToken.countDocuments()).toBeGreaterThan(0);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="takip-yedek-\d{4}-\d{2}-\d{2}\.json"/,
    );
    const body = res.json();
    expect(body).toMatchObject({ app: 'takip', version: 1, user: { email: ADMIN.email } });
    expect(body.goals).toHaveLength(1);
    expect(body.journal).toHaveLength(1);
    expect(body.goals[0].userId).toBeUndefined();
    const raw = res.body;
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('ExponentPushToken');
    expect(raw).not.toContain('tokenHash');
    expect((await app.inject({ method: 'GET', url: '/api/v1/export' })).statusCode).toBe(401);
    await app.close();
  });
});
