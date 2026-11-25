import type { FastifyInstance } from 'fastify';
import { loginBodySchema, refreshBodySchema } from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { login, logout, refresh, type AuthSecrets } from '../../services/auth.js';

/** Kaba kuvvete karşı: giriş ve yenileme IP başına dakikada 10 istek. */
const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export function authRoutes(secrets: AuthSecrets) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post('/auth/login', authLimit, async (req) => {
      const { email, password } = parse(loginBodySchema, req.body);
      return login(email, password, secrets);
    });
    app.post('/auth/refresh', authLimit, async (req) => {
      const { refreshToken } = parse(refreshBodySchema, req.body);
      return refresh(refreshToken, secrets);
    });
    app.post('/auth/logout', async (req, reply) => {
      const { refreshToken } = parse(refreshBodySchema, req.body);
      await logout(refreshToken, secrets);
      return reply.status(204).send();
    });
  };
}
