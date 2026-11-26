import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { Settings, User } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from '../services/clock.js';
import { getSettings, type UserContext } from '../services/users.js';
import { createMcpServer } from './server.js';

export interface McpRouteOptions {
  secret: string;
  adminEmail?: string | undefined;
}

/** Sabit zamanlı karşılaştırma; uzunluk farkı da sızdırılmaz (önce eşit uzunluğa getirilir). */
export function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const same = timingSafeEqual(
    Buffer.concat([a, Buffer.alloc(Math.max(0, b.length - a.length))]).subarray(0, b.length),
    b,
  );
  return same && a.length === b.length;
}

/**
 * Uygulama tek kullanıcılı: MCP isteği ADMIN_EMAIL kullanıcısı adına çalışır, yoksa en eski
 * kullanıcı. (Aşama 2'de OAuth ile kullanıcı belirlenecek.)
 */
export async function resolveMcpUser(adminEmail?: string): Promise<UserContext> {
  const byEmail = adminEmail
    ? await User.findOne({ email: adminEmail.toLowerCase() }).select('timezone').lean()
    : null;
  const user =
    byEmail ?? (await User.findOne().sort({ createdAt: 1, _id: 1 }).select('timezone').lean());
  if (!user) {
    throw new AppError(
      503,
      'MCP_NO_USER',
      'Henüz kullanıcı yok; önce uygulamada hesap oluşturulmalı (ADMIN_EMAIL / ADMIN_PASSWORD).',
    );
  }
  return { id: user._id, timezone: user.timezone ?? 'Europe/Istanbul' };
}

const methodNotAllowed = {
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
};

/**
 * Claude (MCP) uç noktası: /api/v1/mcp/:secret, Streamable HTTP, stateless.
 * Her POST için yeni McpServer + transport kurulur (SDK'nın stateless örneği). Oturum
 * olmadığından GET (SSE akışı) ve DELETE (oturum kapatma) 405 döner.
 */
export function mcpRoutes(opts: McpRouteOptions) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', async (req) => {
      const { secret } = req.params as { secret?: string };
      if (!secret || !secretMatches(secret, opts.secret)) {
        throw new AppError(404, 'NOT_FOUND', 'Kaynak bulunamadı');
      }
    });

    app.post('/mcp/:secret', async (req, reply) => {
      const user = await resolveMcpUser(opts.adminEmail);
      await getSettings(user.id);
      await Settings.updateOne({ userId: user.id }, { $set: { mcpLastAccessAt: clock.now() } });

      const server = createMcpServer(user);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      reply.hijack();
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } catch (err) {
        req.log.error({ err }, 'MCP isteği işlenemedi');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'content-type': 'application/json' });
          reply.raw.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }),
          );
        }
      }
    });

    const notAllowed = async (_req: unknown, reply: FastifyReply) =>
      reply.status(405).header('allow', 'POST').send(methodNotAllowed);
    app.get('/mcp/:secret', notAllowed);
    app.delete('/mcp/:secret', notAllowed);
  };
}
