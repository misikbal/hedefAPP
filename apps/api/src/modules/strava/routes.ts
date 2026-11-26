import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  stravaPatchSchema,
  type StravaConnectResponse,
  type StravaReturnReason,
} from '@takip/shared';
import { AppError } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import {
  authorizeUrl,
  disconnect,
  handleCallback,
  handleWebhookEvent,
  isConfigured,
  requireConfigured,
  runInBackground,
  stravaStatus,
  stravaWebhookEventSchema,
  syncActivities,
  updateConnection,
  verifyWebhookChallenge,
  type StravaConfig,
} from '../../services/strava.js';

export const APP_RETURN_URL = 'takip://strava';

const callbackQuerySchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(2048).optional(),
  scope: z.string().max(512).optional(),
  error: z.string().max(200).optional(),
});

const MESSAGES: Record<StravaReturnReason | 'ok', string> = {
  ok: 'Strava bağlandı. Uygulamaya dönebilirsin.',
  denied: 'Strava izni verilmedi.',
  state: 'Bağlantı isteğinin süresi dolmuş ya da geçersiz. Uygulamadan yeniden dene.',
  scope: 'Etkinlikleri okuma izni verilmedi. Yeniden bağlanırken izni açık bırak.',
  exchange: "Strava'dan yanıt alınamadı. Biraz sonra yeniden dene.",
  taken: 'Bu Strava hesabı başka bir kullanıcıya bağlı.',
};

/**
 * Uygulamaya 302 ile döner (`openAuthSessionAsync` bu adresi yakalar). Tarayıcı özel şemayı
 * açamazsa diye gövdede bir bağlantı da bulunur (inline script yok; helmet CSP ile uyumlu).
 */
function backToApp(reply: FastifyReply, reason: StravaReturnReason | 'ok'): FastifyReply {
  const params = new URLSearchParams(
    reason === 'ok' ? { status: 'ok' } : { status: 'error', reason },
  );
  const location = `${APP_RETURN_URL}?${params.toString()}`;
  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Strava</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#222}a{display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;border-radius:.5rem;background:#fc4c02;color:#fff;text-decoration:none}</style>
</head><body><p>${MESSAGES[reason]}</p><a href="${location}">Uygulamaya dön</a></body></html>`;
  return reply
    .code(302)
    .header('location', location)
    .header('cache-control', 'no-store')
    .type('text/html; charset=utf-8')
    .send(html);
}

/** Oturumsuz uçlar: OAuth dönüşü ve Strava webhook'u. Rate limit webhook'u engellemez. */
export function stravaPublicRoutes(cfg: StravaConfig) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/integrations/strava/callback', async (req, reply) => {
      const ready = requireConfigured(cfg);
      const query = callbackQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return backToApp(reply, 'state');
      const result = await handleCallback(ready, query.data);
      if (!result.ok) req.log.warn({ reason: result.reason }, 'strava bağlantısı başarısız');
      return backToApp(reply, result.ok ? 'ok' : result.reason);
    });

    app.get(
      '/integrations/strava/webhook',
      { config: { rateLimit: false } },
      async (req, reply) => {
        const challenge = verifyWebhookChallenge(cfg, (req.query ?? {}) as Record<string, unknown>);
        if (!challenge) throw new AppError(403, 'FORBIDDEN', 'Doğrulama başarısız');
        return reply.send({ 'hub.challenge': challenge });
      },
    );

    app.post(
      '/integrations/strava/webhook',
      { config: { rateLimit: false } },
      async (req, reply) => {
        const event = parse(stravaWebhookEventSchema, req.body ?? {});
        if (isConfigured(cfg)) {
          const ready = cfg;
          const log = req.log;
          runInBackground(
            async () => {
              const r = await handleWebhookEvent(ready, event);
              log.info(
                { object: event.object_type, aspect: event.aspect_type, result: r },
                'strava olayı',
              );
            },
            (err) => log.error({ err }, 'strava olayı işlenemedi'),
          );
        }
        return reply.send({ ok: true });
      },
    );
  };
}

/** Oturumlu uçlar: durum, bağlan, ayar, eşitle, bağlantıyı kes. */
export function stravaRoutes(cfg: StravaConfig) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/integrations/strava', async (req) => stravaStatus(cfg, req.user));

    app.post('/integrations/strava/connect', async (req): Promise<StravaConnectResponse> => {
      const ready = requireConfigured(cfg);
      return { url: await authorizeUrl(ready, String(req.user.id)) };
    });

    app.patch('/integrations/strava', async (req) => {
      const patch = parse(stravaPatchSchema, req.body ?? {});
      await updateConnection(req.user, patch);
      return stravaStatus(cfg, req.user);
    });

    app.post(
      '/integrations/strava/sync',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (req) => syncActivities(requireConfigured(cfg), req.user),
    );

    app.delete('/integrations/strava', async (req, reply) => {
      await disconnect(cfg, req.user);
      return reply.status(204).send();
    });
  };
}
