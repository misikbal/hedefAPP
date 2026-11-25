import type { FastifyInstance, FastifyRequest } from 'fastify';
import { User } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth.js';
import type { UserContext } from '../services/users.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserContext;
  }
}

/** Bu kapsamdaki bütün yollar Bearer access token ister. */
export function requireAuth(app: FastifyInstance, accessSecret: string): void {
  app.decorateRequest('user', null as unknown as UserContext);
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Giriş yapman gerekiyor');
    }
    const userId = await verifyAccessToken(header.slice(7), accessSecret);
    const user = await User.findById(userId).select('timezone').lean();
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Kullanıcı bulunamadı');
    req.user = { id: user._id, timezone: user.timezone ?? 'Europe/Istanbul' };
  });
}
