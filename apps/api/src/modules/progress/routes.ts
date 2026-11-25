import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toProgressDto } from '../../lib/serialize.js';
import { deleteProgress, logProgress } from '../../services/progress.js';

export async function progressRoutes(app: FastifyInstance): Promise<void> {
  app.post('/progress', async (req, reply) => {
    const log = await logProgress(req.user, req.body as never, 'app');
    return reply.status(201).send(toProgressDto(log));
  });

  app.delete('/progress/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: objectIdSchema }), req.params);
    await deleteProgress(req.user, id);
    return reply.status(204).send();
  });
}
