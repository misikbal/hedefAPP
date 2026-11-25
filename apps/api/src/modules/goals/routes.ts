import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toGoalDto } from '../../lib/serialize.js';
import { archiveGoal, createGoal, getGoal, listGoals, updateGoal } from '../../services/goals.js';
import { goalHistory, goalSummaries } from '../../services/stats.js';

const idParams = z.object({ id: objectIdSchema });
const historyQuery = z.object({ periods: z.coerce.number().int().min(1).max(52).default(8) });

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  /** Aktif hedefler, içinde bulunulan periyodun durumuyla birlikte */
  app.get('/goals', async (req) => goalSummaries(req.user, await listGoals(req.user)));

  app.post('/goals', async (req, reply) => {
    const goal = await createGoal(req.user, req.body as never);
    return reply.status(201).send(toGoalDto(goal));
  });

  app.get('/goals/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toGoalDto(await getGoal(req.user, id));
  });

  app.patch('/goals/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toGoalDto(await updateGoal(req.user, id, req.body as never));
  });

  app.delete('/goals/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toGoalDto(await archiveGoal(req.user, id));
  });

  app.get('/goals/:id/history', async (req) => {
    const { id } = parse(idParams, req.params);
    const { periods } = parse(historyQuery, req.query);
    return goalHistory(req.user, await getGoal(req.user, id), periods);
  });
}
