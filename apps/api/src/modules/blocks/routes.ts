import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toBlockDto } from '../../lib/serialize.js';
import {
  archiveBlock,
  createBlock,
  getBlock,
  listBlocks,
  updateBlock,
} from '../../services/blocks.js';
import { getBlockHistory } from '../../services/views.js';

const idParams = z.object({ id: objectIdSchema });
const historyQuery = z.object({ weeks: z.coerce.number().int().min(1).max(52).default(6) });
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() });

export async function blockRoutes(app: FastifyInstance): Promise<void> {
  app.get('/blocks', async (req) => {
    const { archived } = parse(listQuery, req.query);
    return (await listBlocks(req.user, archived === 'true')).map(toBlockDto);
  });

  app.post('/blocks', async (req, reply) => {
    // Gövde servis katmanında blockCreateSchema ile doğrulanır.
    const block = await createBlock(req.user, req.body as never);
    return reply.status(201).send(toBlockDto(block));
  });

  app.get('/blocks/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toBlockDto(await getBlock(req.user, id));
  });

  app.patch('/blocks/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toBlockDto(await updateBlock(req.user, id, req.body as never));
  });

  app.delete('/blocks/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    return toBlockDto(await archiveBlock(req.user, id));
  });

  app.get('/blocks/:id/history', async (req) => {
    const { id } = parse(idParams, req.params);
    const { weeks } = parse(historyQuery, req.query);
    return getBlockHistory(req.user, id, weeks);
  });
}
