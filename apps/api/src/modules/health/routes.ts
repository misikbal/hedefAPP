import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@takip/shared';
import { isDbUp } from '../../db/connection.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Coolify her birkaç saniyede yoklar; başarılı istekler loglanmaz.
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    const dbUp = isDbUp();
    const res: HealthResponse = {
      ok: dbUp,
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
    return reply.status(dbUp ? 200 : 503).send(res);
  });
}
