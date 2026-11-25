import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { healthResponseSchema } from '@takip/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { TEST_CONFIG } from './helpers.js';

describe('GET /health', () => {
  let mongo: MongoMemoryServer;
  let app: FastifyInstance;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    app = await buildApp(TEST_CONFIG);
  });

  afterAll(async () => {
    await app.close();
    await disconnectDb();
    await mongo.stop();
  });

  it('db bağlı değilken 503 ve db:down döner', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(healthResponseSchema.parse(res.json())).toMatchObject({ ok: false, db: 'down' });
  });

  it('db bağlıyken 200 ve db:up döner (kök ve /api/v1)', async () => {
    await connectDb(mongo.getUri());
    for (const url of ['/health', '/api/v1/health']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      const body = healthResponseSchema.parse(res.json());
      expect(body).toMatchObject({ ok: true, db: 'up' });
      expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    }
  });

  it('bilinmeyen yol ortak hata biçimini döner', async () => {
    const res = await app.inject({ method: 'GET', url: '/yok' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı' } });
  });
});
