import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { objectIdSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toFocusDto } from '../../lib/serialize.js';
import { clock } from '../../services/clock.js';
import {
  abandonFocus,
  activeFocus,
  finishFocus,
  focusWeek,
  interruptFocus,
  pauseFocus,
  recentLabels,
  resumeFocus,
  startFocus,
} from '../../services/focus.js';
import type { FocusSessionDoc } from '../../db/models/index.js';

const idParams = z.object({ id: objectIdSchema });
const dto = (s: FocusSessionDoc) => toFocusDto(s, clock.now());

export async function focusRoutes(app: FastifyInstance): Promise<void> {
  app.get('/focus/active', async (req) => {
    const s = await activeFocus(req.user);
    return s ? dto(s) : null;
  });
  app.get('/focus/week', async (req) => focusWeek(req.user));
  app.get('/focus/labels', async (req) => recentLabels(req.user));

  app.post('/focus/start', async (req, reply) => {
    // Gövde servis katmanında focusStartSchema ile doğrulanır.
    const s = await startFocus(req.user, (req.body ?? {}) as never);
    return reply.status(201).send(dto(s));
  });
  app.post('/focus/:id/pause', async (req) => {
    const { id } = parse(idParams, req.params);
    return dto(await pauseFocus(req.user, id));
  });
  app.post('/focus/:id/resume', async (req) => {
    const { id } = parse(idParams, req.params);
    return dto(await resumeFocus(req.user, id));
  });
  app.post('/focus/:id/finish', async (req) => {
    const { id } = parse(idParams, req.params);
    return finishFocus(req.user, id, (req.body ?? {}) as never);
  });
  app.post('/focus/:id/interrupt', async (req) => {
    const { id } = parse(idParams, req.params);
    return dto(await interruptFocus(req.user, id, (req.body ?? {}) as never));
  });
  app.post('/focus/:id/abandon', async (req) => {
    const { id } = parse(idParams, req.params);
    return dto(await abandonFocus(req.user, id));
  });
}
