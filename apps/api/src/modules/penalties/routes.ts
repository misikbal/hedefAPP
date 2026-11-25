import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema, penaltyListQuerySchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toPenaltyDto } from '../../lib/serialize.js';
import { listPenalties, markPenaltyDone, postponePenalty } from '../../services/penalties.js';
import {
  createRule,
  deleteRule,
  listRules,
  toRuleDtos,
  updateRule,
} from '../../services/penaltyRules.js';

const idParams = z.object({ id: objectIdSchema });

export async function penaltyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/penalties', async (req) => {
    const { status, limit } = parse(penaltyListQuerySchema, req.query);
    return (await listPenalties(req.user, status, limit)).map(toPenaltyDto);
  });

  app.post('/penalties/:id/done', async (req) => {
    const { id } = parse(idParams, req.params);
    return toPenaltyDto(await markPenaltyDone(req.user, id));
  });

  app.post('/penalties/:id/postpone', async (req) => {
    const { id } = parse(idParams, req.params);
    return toPenaltyDto(await postponePenalty(req.user, id));
  });

  app.get('/penalty-rules', async (req) => toRuleDtos(await listRules(req.user.id)));

  app.post('/penalty-rules', async (req, reply) => {
    // Gövde servis katmanında penaltyRuleCreateSchema ile doğrulanır.
    const rule = await createRule(req.user, req.body as never);
    const [dto] = await toRuleDtos([rule]);
    return reply.status(201).send(dto);
  });

  app.patch('/penalty-rules/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    const [dto] = await toRuleDtos([await updateRule(req.user, id, req.body as never)]);
    return dto;
  });

  app.delete('/penalty-rules/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    const [dto] = await toRuleDtos([await deleteRule(req.user, id)]);
    return dto;
  });
}
