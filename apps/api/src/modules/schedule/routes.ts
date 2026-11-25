import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema, weekQuerySchema } from '@takip/shared';
import { Block } from '../../db/models/index.js';
import { AppError } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { toInstanceDto } from '../../lib/serialize.js';
import { markDone, skip, undo } from '../../services/instances.js';
import { blockPenaltyTexts } from '../../services/penalties.js';
import { getToday, getWeek } from '../../services/views.js';
import type { BlockInstanceDoc } from '../../db/models/index.js';

const idParams = z.object({ id: objectIdSchema });

async function respond(inst: BlockInstanceDoc) {
  const block = await Block.findById(inst.blockId);
  if (!block) throw new AppError(404, 'BLOCK_NOT_FOUND', 'Blok bulunamadı');
  const penalties = await blockPenaltyTexts(block.userId, [
    { id: block.id as string, category: block.category, penaltyRuleId: block.penaltyRuleId },
  ]);
  return toInstanceDto(inst, block, penalties.get(block.id as string) ?? null);
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/today', async (req) => getToday(req.user));

  app.get('/week', async (req) => {
    const { start } = parse(weekQuerySchema, req.query);
    return getWeek(req.user, start);
  });

  app.post('/instances/:id/done', async (req) => {
    const { id } = parse(idParams, req.params);
    return respond(await markDone(req.user, id));
  });
  app.post('/instances/:id/undo', async (req) => {
    const { id } = parse(idParams, req.params);
    return respond(await undo(req.user, id));
  });
  app.post('/instances/:id/skip', async (req) => {
    const { id } = parse(idParams, req.params);
    return respond(await skip(req.user, id));
  });
}
