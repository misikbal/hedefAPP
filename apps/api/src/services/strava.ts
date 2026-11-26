import { SignJWT, jwtVerify } from 'jose';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { STRAVA_GOAL_UNIT, type StravaStatus, type StravaSyncResult } from '@takip/shared';
import type { Env } from '../config/env.js';
import {
  Goal,
  ProgressLog,
  StravaConnection,
  type StravaConnectionDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import type { UserContext } from './users.js';

export const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth';
export const STRAVA_API_URL = 'https://www.strava.com/api/v3';
export const STRAVA_SCOPE = 'activity:read_all';
export const STRAVA_CALLBACK_PATH = '/api/v1/integrations/strava/callback';
export const STRAVA_WEBHOOK_PATH = '/api/v1/integrations/strava/webhook';

/** Erişim token'ı bu kadar süre içinde bitecekse istekten önce yenilenir. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const STATE_TTL_S = 10 * 60;
const STATE_ISSUER = 'takip-api';
const STATE_TYP = 'strava_state';
const FIRST_SYNC_DAYS = 30;
/** Sonradan yüklenen / düzenlenen etkinlikler için lastSyncAt'ın biraz gerisinden başlanır. */
const SYNC_OVERLAP_MS = 2 * 24 * 60 * 60_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export type StravaConfig = Partial<
  Pick<
    Env,
    'STRAVA_CLIENT_ID' | 'STRAVA_CLIENT_SECRET' | 'STRAVA_WEBHOOK_VERIFY_TOKEN' | 'PUBLIC_API_URL'
  >
> & { stateSecret: string };

export interface ReadyStravaConfig extends StravaConfig {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  PUBLIC_API_URL: string;
}

export function isConfigured(cfg: StravaConfig): cfg is ReadyStravaConfig {
  return !!(cfg.STRAVA_CLIENT_ID && cfg.STRAVA_CLIENT_SECRET && cfg.PUBLIC_API_URL);
}

export function requireConfigured(cfg: StravaConfig): ReadyStravaConfig {
  if (!isConfigured(cfg))
    throw new AppError(503, 'STRAVA_NOT_CONFIGURED', 'Strava entegrasyonu sunucuda ayarlanmamış');
  return cfg;
}

/**
 * Strava'ya giden bütün HTTP istekleri buradan geçer. Testler `strava.http.fetch`'i değiştirir
 * (ağa çıkılmaz).
 */
export const strava = {
  http: {
    fetch: ((input, init) => globalThis.fetch(input, init)) as typeof globalThis.fetch,
  },
};

// --- Dış veri şemaları (Strava yanıtları zod ile doğrulanır) ---

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number(),
  athlete: z
    .object({
      id: z.number(),
      firstname: z.string().nullish(),
      lastname: z.string().nullish(),
    })
    .optional(),
});

export const stravaActivitySchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  distance: z.number().nullish(),
  type: z.string().nullish(),
  sport_type: z.string().nullish(),
  /** Yerel saat, sonunda "Z" olsa da yerel duvar saatidir (ör. 2026-11-20T08:00:00Z) */
  start_date_local: z.string(),
});
export type StravaActivity = z.infer<typeof stravaActivitySchema>;

export const stravaWebhookEventSchema = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.number(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number(),
  subscription_id: z.number().optional(),
  event_time: z.number().optional(),
  updates: z.record(z.string(), z.unknown()).optional(),
});
export type StravaWebhookEvent = z.infer<typeof stravaWebhookEventSchema>;

// --- Hatalar ---

/** Strava token'ı geçersiz (kullanıcı erişimi kaldırdı ya da refresh token bozuk). */
export class StravaAuthError extends Error {}
class StravaHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- OAuth state ---

const key = (s: string) => new TextEncoder().encode(s);

export async function createState(userId: string, secret: string): Promise<string> {
  const nowS = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({ typ: STATE_TYP })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(STATE_ISSUER)
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + STATE_TTL_S)
    .sign(key(secret));
}

/** Geçerliyse userId, değilse null. */
export async function verifyState(state: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, key(secret), {
      issuer: STATE_ISSUER,
      currentDate: clock.now(),
    });
    if (payload.typ !== STATE_TYP || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function callbackUrl(cfg: ReadyStravaConfig): string {
  return `${cfg.PUBLIC_API_URL}${STRAVA_CALLBACK_PATH}`;
}

export async function authorizeUrl(cfg: ReadyStravaConfig, userId: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: cfg.STRAVA_CLIENT_ID,
    redirect_uri: callbackUrl(cfg),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state: await createState(userId, cfg.stateSecret),
  });
  return `${STRAVA_OAUTH_URL}/authorize?${params.toString()}`;
}

// --- Token ---

async function postToken(cfg: ReadyStravaConfig, body: Record<string, string>) {
  const res = await strava.http.fetch(`${STRAVA_OAUTH_URL}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: cfg.STRAVA_CLIENT_ID,
      client_secret: cfg.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  if (res.status === 400 || res.status === 401) throw new StravaAuthError(`token ${res.status}`);
  if (!res.ok)
    throw new StravaHttpError(res.status, `Strava token isteği başarısız (${res.status})`);
  return tokenResponseSchema.parse(await res.json());
}

function athleteNameOf(a: { firstname?: string | null; lastname?: string | null }): string | null {
  const name = [a.firstname, a.lastname].filter(Boolean).join(' ').trim();
  return name || null;
}

export type CallbackResult =
  | { ok: true; connection: StravaConnectionDoc }
  | { ok: false; reason: 'state' | 'denied' | 'scope' | 'exchange' | 'taken' };

/** OAuth dönüşü: state doğrulanır, kod token'a çevrilir, bağlantı kaydedilir. */
export async function handleCallback(
  cfg: ReadyStravaConfig,
  query: { code?: string; state?: string; scope?: string; error?: string },
): Promise<CallbackResult> {
  const userId = query.state ? await verifyState(query.state, cfg.stateSecret) : null;
  if (!userId) return { ok: false, reason: 'state' };
  if (query.error || !query.code) return { ok: false, reason: 'denied' };
  const granted = (query.scope ?? '').split(',');
  if (!granted.includes('activity:read_all') && !granted.includes('activity:read'))
    return { ok: false, reason: 'scope' };

  let token: z.infer<typeof tokenResponseSchema>;
  try {
    token = await postToken(cfg, { code: query.code, grant_type: 'authorization_code' });
  } catch {
    return { ok: false, reason: 'exchange' };
  }
  if (!token.athlete) return { ok: false, reason: 'exchange' };

  const other = await StravaConnection.findOne({ athleteId: token.athlete.id }).select('userId');
  if (other && String(other.userId) !== userId) return { ok: false, reason: 'taken' };

  const connection = await StravaConnection.findOneAndUpdate(
    { userId },
    {
      $set: {
        athleteId: token.athlete.id,
        athleteName: athleteNameOf(token.athlete),
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(token.expires_at * 1000),
        scope: query.scope ?? '',
        lastError: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).orFail();
  return { ok: true, connection };
}

async function refreshConnection(cfg: ReadyStravaConfig, conn: StravaConnectionDoc): Promise<void> {
  const token = await postToken(cfg, {
    grant_type: 'refresh_token',
    refresh_token: conn.refreshToken,
  });
  conn.accessToken = token.access_token;
  conn.refreshToken = token.refresh_token;
  conn.expiresAt = new Date(token.expires_at * 1000);
  await conn.save();
}

async function validAccessToken(cfg: ReadyStravaConfig, conn: StravaConnectionDoc) {
  if (conn.expiresAt.getTime() < clock.now().getTime() + REFRESH_MARGIN_MS) {
    await refreshConnection(cfg, conn);
  }
  return conn.accessToken;
}

/**
 * Yetkili Strava API isteği: süresi dolmak üzereyse önce yenilenir; 401 gelirse bir kez
 * yenilenip tekrar denenir. 404'te null döner.
 */
async function apiGet(
  cfg: ReadyStravaConfig,
  conn: StravaConnectionDoc,
  path: string,
): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = attempt === 0 ? await validAccessToken(cfg, conn) : conn.accessToken;
    const res = await strava.http.fetch(`${STRAVA_API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && attempt === 0) {
      await refreshConnection(cfg, conn);
      continue;
    }
    if (res.status === 401) throw new StravaAuthError('api 401');
    if (res.status === 404) return null;
    if (!res.ok) throw new StravaHttpError(res.status, `Strava isteği başarısız (${res.status})`);
    return res.json();
  }
  throw new StravaAuthError('api 401');
}

async function fetchActivity(
  cfg: ReadyStravaConfig,
  conn: StravaConnectionDoc,
  id: number,
): Promise<StravaActivity | null> {
  const raw = await apiGet(cfg, conn, `/activities/${id}`);
  return raw === null ? null : stravaActivitySchema.parse(raw);
}

// --- Etkinlik → ProgressLog ---

export const kmOf = (meters: number): number => Math.round(meters / 100) / 10;

type ApplyResult = 'imported' | 'updated' | 'removed' | 'skipped';

async function targetGoal(conn: StravaConnectionDoc) {
  if (!conn.goalId) return null;
  return Goal.findOne({
    _id: conn.goalId,
    userId: conn.userId,
    archived: false,
    unit: STRAVA_GOAL_UNIT,
  })
    .select('_id')
    .lean();
}

/**
 * Etkinliği bağlı hedefe yazar ya da günceller. Tür artık uygun değilse (veya mesafe yoksa)
 * daha önce yazılmış kaydı siler. Kayıt olduğu hedefte kalır (hedef seçimi sonradan değişse de).
 */
export async function applyActivity(
  conn: StravaConnectionDoc,
  activity: StravaActivity,
): Promise<ApplyResult> {
  const externalId = String(activity.id);
  const existing = await ProgressLog.findOne({ userId: conn.userId, externalId });
  const kind = activity.sport_type ?? activity.type ?? '';
  const typeOk =
    conn.activityTypes.includes(kind) ||
    (!!activity.type && conn.activityTypes.includes(activity.type));
  const amount = kmOf(activity.distance ?? 0);
  const date = activity.start_date_local.slice(0, 10);
  const note = activity.name?.trim().slice(0, 200) || null;

  if (!typeOk || amount <= 0) {
    if (existing) {
      await existing.deleteOne();
      return 'removed';
    }
    return 'skipped';
  }

  if (existing) {
    if (existing.amount === amount && existing.date === date && existing.note === note)
      return 'skipped';
    existing.amount = amount;
    existing.date = date;
    existing.note = note;
    await existing.save();
    return 'updated';
  }

  const goal = await targetGoal(conn);
  if (!goal) return 'skipped';
  try {
    await ProgressLog.create({
      userId: conn.userId,
      goalId: goal._id,
      amount,
      date,
      source: 'strava',
      note,
      externalId,
    });
    return 'imported';
  } catch (err) {
    // Webhook ile elle eşitleme aynı anda aynı etkinliği yazmaya çalıştı.
    if ((err as { code?: number }).code === 11000) return 'skipped';
    throw err;
  }
}

async function removeActivity(userId: Types.ObjectId, id: number): Promise<boolean> {
  const res = await ProgressLog.deleteOne({ userId, externalId: String(id), source: 'strava' });
  return res.deletedCount > 0;
}

async function recordError(conn: StravaConnectionDoc, err: unknown): Promise<void> {
  const message =
    err instanceof StravaAuthError
      ? 'Strava erişimi geçersiz; bağlantıyı kesip yeniden bağlan'
      : err instanceof Error
        ? err.message.slice(0, 200)
        : 'Bilinmeyen hata';
  await StravaConnection.updateOne({ _id: conn._id }, { lastError: message });
}

// --- Webhook ---

export function verifyWebhookChallenge(
  cfg: StravaConfig,
  query: Record<string, unknown>,
): string | null {
  if (!cfg.STRAVA_WEBHOOK_VERIFY_TOKEN) return null;
  if (query['hub.mode'] !== 'subscribe') return null;
  if (query['hub.verify_token'] !== cfg.STRAVA_WEBHOOK_VERIFY_TOKEN) return null;
  const challenge = query['hub.challenge'];
  return typeof challenge === 'string' && challenge ? challenge : null;
}

/**
 * Webhook olayını işler. Strava webhook'ları imzalı değildir; bu yüzden olayın içeriğine
 * güvenilmez, etkinlik her zaman Strava'dan yeniden çekilir (silme de 404 ile doğrulanır,
 * erişim kaldırma da token'ın gerçekten geçersiz olmasıyla).
 */
export async function handleWebhookEvent(
  cfg: ReadyStravaConfig,
  event: StravaWebhookEvent,
): Promise<string> {
  const conn = await StravaConnection.findOne({ athleteId: event.owner_id });
  if (!conn) return 'unknown_athlete';

  if (event.object_type === 'athlete') {
    const authorized = event.updates?.authorized;
    if (authorized !== false && authorized !== 'false') return 'ignored';
    try {
      await apiGet(cfg, conn, '/athlete');
      return 'still_authorized';
    } catch (err) {
      if (!(err instanceof StravaAuthError)) throw err;
      await conn.deleteOne();
      return 'deauthorized';
    }
  }

  try {
    const activity = await fetchActivity(cfg, conn, event.object_id);
    if (!activity) {
      await removeActivity(conn.userId, event.object_id);
      return 'removed';
    }
    // Silme olayı gelse de etkinlik hâlâ duruyorsa (sahte/gecikmiş olay) güncelleme gibi davranılır.
    const result = await applyActivity(conn, activity);
    if (conn.lastError) await StravaConnection.updateOne({ _id: conn._id }, { lastError: null });
    return result;
  } catch (err) {
    await recordError(conn, err);
    throw err;
  }
}

/** POST webhook'u hemen 200 döner; iş burada arka planda yürür. Testler `waitForStravaJobs` ile bekler. */
const pending = new Set<Promise<unknown>>();
export function runInBackground(
  task: () => Promise<unknown>,
  onError: (err: unknown) => void,
): void {
  const p = new Promise<void>((resolve) => setImmediate(resolve))
    .then(task)
    .catch(onError)
    .finally(() => pending.delete(p));
  pending.add(p);
}
export async function waitForStravaJobs(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}

// --- Elle eşitleme ---

export async function syncActivities(
  cfg: ReadyStravaConfig,
  user: UserContext,
): Promise<StravaSyncResult> {
  const conn = await getConnection(user);
  const now = clock.now();
  const since = conn.lastSyncAt
    ? new Date(conn.lastSyncAt.getTime() - SYNC_OVERLAP_MS)
    : new Date(now.getTime() - FIRST_SYNC_DAYS * 24 * 60 * 60_000);
  const result: StravaSyncResult = { imported: 0, updated: 0, skipped: 0 };
  try {
    const after = Math.floor(since.getTime() / 1000);
    for (let page = 1; page <= MAX_PAGES; page++) {
      const raw = await apiGet(
        cfg,
        conn,
        `/athlete/activities?after=${after}&page=${page}&per_page=${PAGE_SIZE}`,
      );
      const list = z.array(stravaActivitySchema).parse(raw ?? []);
      for (const activity of list) {
        const r = await applyActivity(conn, activity);
        if (r === 'imported') result.imported++;
        else if (r === 'updated' || r === 'removed') result.updated++;
        else result.skipped++;
      }
      if (list.length < PAGE_SIZE) break;
    }
  } catch (err) {
    await recordError(conn, err);
    if (err instanceof StravaAuthError)
      throw new AppError(
        409,
        'STRAVA_UNAUTHORIZED',
        'Strava erişimi geçersiz; bağlantıyı kesip yeniden bağlan',
      );
    throw new AppError(502, 'STRAVA_UNAVAILABLE', "Strava'ya ulaşılamadı, sonra tekrar dene");
  }
  await StravaConnection.updateOne({ _id: conn._id }, { lastSyncAt: now, lastError: null });
  return result;
}

// --- Bağlantı yönetimi ---

export async function getConnection(user: UserContext): Promise<StravaConnectionDoc> {
  const conn = await StravaConnection.findOne({ userId: user.id });
  if (!conn) throw new AppError(404, 'STRAVA_NOT_CONNECTED', 'Strava bağlı değil');
  return conn;
}

export async function stravaStatus(cfg: StravaConfig, user: UserContext): Promise<StravaStatus> {
  const conn = await StravaConnection.findOne({ userId: user.id }).lean();
  return {
    configured: isConfigured(cfg),
    connected: !!conn,
    athleteName: conn?.athleteName ?? null,
    goalId: conn?.goalId ? String(conn.goalId) : null,
    activityTypes: conn ? [...conn.activityTypes] : [],
    lastSyncAt: conn?.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
    lastError: conn?.lastError ?? null,
  };
}

export async function updateConnection(
  user: UserContext,
  patch: { goalId?: string | null | undefined; activityTypes?: string[] | undefined },
): Promise<void> {
  const conn = await getConnection(user);
  if (patch.goalId !== undefined) {
    if (patch.goalId !== null) {
      const goal = await Goal.findOne({ _id: patch.goalId, userId: user.id, archived: false })
        .select('unit')
        .lean();
      if (!goal) throw new AppError(400, 'GOAL_NOT_FOUND', 'Seçilen hedef bulunamadı');
      if (goal.unit !== STRAVA_GOAL_UNIT)
        throw new AppError(
          400,
          'GOAL_UNIT_MISMATCH',
          'Strava yalnızca km birimli hedefe yazabilir',
        );
    }
    conn.set('goalId', patch.goalId);
  }
  if (patch.activityTypes) conn.activityTypes = [...new Set(patch.activityTypes)];
  await conn.save();
}

/** Strava'daki izni kaldırır (hata yutulur) ve kaydı siler. Yazılmış ilerlemeler kalır. */
export async function disconnect(cfg: StravaConfig, user: UserContext): Promise<void> {
  const conn = await getConnection(user);
  if (isConfigured(cfg)) {
    try {
      const token = await validAccessToken(cfg, conn);
      await strava.http.fetch(`${STRAVA_OAUTH_URL}/deauthorize`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      // Strava'ya ulaşılamasa da bağlantı bizde silinir.
    }
  }
  await StravaConnection.deleteOne({ _id: conn._id });
}
