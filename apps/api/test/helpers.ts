import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/db/connection.js';
import { User } from '../src/db/models/index.js';
import { clock } from '../src/services/clock.js';
import { ensureAdminUser, type UserContext } from '../src/services/users.js';

export const TZ = 'Europe/Istanbul';
export const TEST_CONFIG = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
} as const;
export const ADMIN = { email: 'ben@example.com', password: 'gizli-sifre-123' };

let mongo: MongoMemoryServer | null = null;

export async function startDb(): Promise<void> {
  // Paralel test dosyaları aynı anda mongod açar; yavaş makinede 10 sn varsayılanı yetmiyor.
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await connectDb(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function stopDb(): Promise<void> {
  await disconnectDb();
  await mongo?.stop();
}

export async function resetDb(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

/** Zamanı sabitler. ISO string UTC olarak yorumlanır. */
export function setNow(iso: string): void {
  clock.now = () => new Date(iso);
}
export function resetClock(): void {
  clock.now = () => new Date();
}

export async function createUser(): Promise<UserContext> {
  await ensureAdminUser(ADMIN.email, ADMIN.password, TZ);
  const user = await User.findOne({ email: ADMIN.email }).orFail();
  return { id: user._id, timezone: TZ };
}

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp(TEST_CONFIG);
}

export async function loginToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: ADMIN });
  return (res.json() as { accessToken: string }).accessToken;
}
