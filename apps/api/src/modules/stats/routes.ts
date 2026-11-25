import type { FastifyInstance } from 'fastify';
import { statsQuerySchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { statsOverview } from '../../services/stats.js';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stats/overview', async (req) => {
    const { range } = parse(statsQuerySchema, req.query);
    return statsOverview(req.user, range);
  });
}
