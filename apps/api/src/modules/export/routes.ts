import type { FastifyInstance } from 'fastify';
import { localDateOf } from '@takip/shared';
import { clock } from '../../services/clock.js';
import { exportAll } from '../../services/export.js';

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  // Ağır sorgu: IP başına dakikada 5.
  app.get(
    '/export',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const data = await exportAll(req.user);
      const date = localDateOf(clock.now(), req.user.timezone);
      return reply
        .header('content-disposition', `attachment; filename="takip-yedek-${date}.json"`)
        .header('cache-control', 'no-store')
        .send(data);
    },
  );
}
