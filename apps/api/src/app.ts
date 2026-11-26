import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { AppError, registerErrorHandling } from './lib/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { exportRoutes } from './modules/export/routes.js';
import { blockRoutes } from './modules/blocks/routes.js';
import { focusRoutes } from './modules/focus/routes.js';
import { goalRoutes } from './modules/goals/routes.js';
import { journalRoutes } from './modules/journal/routes.js';
import { penaltyRoutes } from './modules/penalties/routes.js';
import { progressRoutes } from './modules/progress/routes.js';
import { statsRoutes } from './modules/stats/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { scheduleRoutes } from './modules/schedule/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { moneyRoutes } from './modules/money/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { requireAuth } from './plugins/auth.js';
import { mcpRoutes } from './mcp/routes.js';
import { claudeRoutes } from './modules/claude/routes.js';
import { stravaPublicRoutes, stravaRoutes } from './modules/strava/routes.js';

export type AppConfig = Pick<
  Env,
  'LOG_LEVEL' | 'NODE_ENV' | 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'
> &
  Partial<
    Pick<
      Env,
      | 'CORS_ORIGINS'
      | 'TRUST_PROXY'
      | 'RATE_LIMIT_MAX'
      | 'MCP_SECRET'
      | 'ADMIN_EMAIL'
      | 'STRAVA_CLIENT_ID'
      | 'STRAVA_CLIENT_SECRET'
      | 'STRAVA_WEBHOOK_VERIFY_TOKEN'
      | 'PUBLIC_API_URL'
    >
  > & {
    /** Testlerde varsayılan kapalı (çok sayıda giriş isteği atılır); üretimde her zaman açık. */
    rateLimit?: boolean;
  };

/** MCP gizli anahtarı yolda bulunur; loglarda maskelenir (kökte ve /api/v1 altında). */
export function maskUrl(url: string): string {
  return url.replace(/^((?:\/api\/v1)?\/mcp\/)[^/?#]+/, '$1***');
}

export async function buildApp(env: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY ?? false,
    // Yedek içe aktarma yok; büyük gövdeye gerek yok.
    bodyLimit: 256 * 1024,
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            // Gizli değerler hiçbir log satırına yazılmaz.
            redact: {
              paths: [
                'req.headers.authorization',
                '*.password',
                '*.passwordHash',
                '*.refreshToken',
                '*.accessToken',
                '*.expoPushToken',
                '*.client_secret',
                '*.access_token',
                '*.refresh_token',
              ],
              censor: '***',
            },
            // MCP gizli anahtarı yolda bulunur; URL'ler loglanırken maskelenir.
            serializers: {
              req: (req: { method: string; url: string }) => ({
                method: req.method,
                url: maskUrl(req.url),
              }),
            },
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }
              : {}),
          },
  });

  registerErrorHandling(app);
  // Yalnızca JSON API: helmet'in varsayılan başlıkları yeterli (CSP, HSTS, nosniff, frameguard…).
  await app.register(helmet, { global: true });

  // Mobil uygulama CORS'a ihtiyaç duymaz. Geliştirmede Expo web için her köken açık;
  // üretimde yalnızca CORS_ORIGINS'te yazanlar (boşsa CORS kapalı).
  const origins = env.CORS_ORIGINS ?? [];
  if (env.NODE_ENV === 'development' || origins.length) {
    await app.register(cors, {
      origin: env.NODE_ENV === 'development' ? true : origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'authorization'],
    });
  }

  // Tek API kopyası çalıştığı için bellek içi sayaç yeterli. /health sınırsız (Coolify yoklar).
  if (env.rateLimit ?? env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX ?? 300,
      timeWindow: '1 minute',
      allowList: (req) => req.url === '/health' || req.url === '/api/v1/health',
      // Fırlatılır → registerErrorHandling ortak hata biçimine çevirir.
      errorResponseBuilder: (_req, ctx) =>
        new AppError(
          ctx.statusCode,
          'RATE_LIMITED',
          `Çok fazla istek. ${Math.ceil(ctx.ttl / 1000)} saniye sonra tekrar dene.`,
        ),
    });
  }
  const secrets = { accessSecret: env.JWT_ACCESS_SECRET, refreshSecret: env.JWT_REFRESH_SECRET };
  // OAuth state, access secret ile ama ayrı bir `typ` claim'iyle imzalanır.
  const stravaConfig = {
    STRAVA_CLIENT_ID: env.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: env.STRAVA_CLIENT_SECRET,
    STRAVA_WEBHOOK_VERIFY_TOKEN: env.STRAVA_WEBHOOK_VERIFY_TOKEN,
    PUBLIC_API_URL: env.PUBLIC_API_URL,
    stateSecret: env.JWT_ACCESS_SECRET,
  };

  // Coolify health check için kökte; mobil istemci için /api/v1 altında da.
  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes(secrets));
      // Strava: OAuth dönüşü ve webhook oturumsuz (state / verify token ile korunur).
      await v1.register(stravaPublicRoutes(stravaConfig));
      // Claude (MCP): oturum yerine yoldaki gizli anahtar (Aşama 1).
      if (env.MCP_SECRET) {
        await v1.register(mcpRoutes({ secret: env.MCP_SECRET, adminEmail: env.ADMIN_EMAIL }));
      }
      await v1.register(async (secured) => {
        requireAuth(secured, secrets.accessSecret);
        await secured.register(scheduleRoutes);
        await secured.register(blockRoutes);
        await secured.register(goalRoutes);
        await secured.register(progressRoutes);
        await secured.register(statsRoutes);
        await secured.register(penaltyRoutes);
        await secured.register(focusRoutes);
        await secured.register(journalRoutes);
        await secured.register(notificationRoutes);
        await secured.register(reportRoutes);
        await secured.register(moneyRoutes);
        await secured.register(settingsRoutes);
        await secured.register(exportRoutes);
        await secured.register(claudeRoutes({ mcpSecret: env.MCP_SECRET }));
        await secured.register(stravaRoutes(stravaConfig));
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
