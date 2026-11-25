import type { FastifyInstance } from 'fastify';
import { settingsPatchSchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { toSettingsDto } from '../../lib/serialize.js';
import { getSettings, updateSettings } from '../../services/users.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (req) => toSettingsDto(await getSettings(req.user.id)));
  app.patch('/settings', async (req) => {
    const patch = parse(settingsPatchSchema, req.body ?? {});
    return toSettingsDto(await updateSettings(req.user.id, patch));
  });
}
