import type { FastifyInstance } from 'fastify';
import {
  MCP_TOOLS,
  auditIdParamsSchema,
  auditListQuerySchema,
  pendingChangeIdParamsSchema,
  pendingChangeListQuerySchema,
  type AuditList,
  type McpStatus,
  type PendingChangeList,
} from '@takip/shared';
import { parse } from '../../lib/validate.js';
import { mcpPermissionsOf } from '../../lib/serialize.js';
import { listAudit, redoAudit, toAuditDto, undoAudit } from '../../services/audit.js';
import {
  approvePendingChange,
  countPending,
  getPendingChange,
  listPendingChanges,
  rejectPendingChange,
  toPendingDto,
} from '../../services/pendingChanges.js';
import { getSettings } from '../../services/users.js';

/** Claude bağlantısı ekranı: durum, değişiklik geçmişi (geri al / yinele), onay bekleyenler. */
export function claudeRoutes(opts: { mcpSecret?: string | undefined }) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/mcp-status', async (req): Promise<McpStatus> => {
      const settings = await getSettings(req.user.id);
      return {
        enabled: !!opts.mcpSecret,
        endpointPath: opts.mcpSecret ? `/mcp/${opts.mcpSecret}` : '',
        lastAccessAt: settings.mcpLastAccessAt ? settings.mcpLastAccessAt.toISOString() : null,
        lastTool: settings.mcpLastTool ?? null,
        pendingCount: await countPending(req.user),
        tools: [...MCP_TOOLS],
        permissions: mcpPermissionsOf(settings),
      };
    });

    app.get('/audit', async (req): Promise<AuditList> => {
      const q = parse(auditListQuerySchema, req.query);
      return { items: await listAudit(req.user, q) };
    });
    app.post('/audit/:id/undo', async (req) => {
      const { id } = parse(auditIdParamsSchema, req.params);
      return toAuditDto(await undoAudit(req.user, id));
    });
    app.post('/audit/:id/redo', async (req) => {
      const { id } = parse(auditIdParamsSchema, req.params);
      return toAuditDto(await redoAudit(req.user, id));
    });

    app.get('/pending-changes', async (req): Promise<PendingChangeList> => {
      const { status } = parse(pendingChangeListQuerySchema, req.query);
      return { items: (await listPendingChanges(req.user, status)).map(toPendingDto) };
    });
    app.get('/pending-changes/:id', async (req) => {
      const { id } = parse(pendingChangeIdParamsSchema, req.params);
      return toPendingDto(await getPendingChange(req.user, id));
    });
    app.post('/pending-changes/:id/approve', async (req) => {
      const { id } = parse(pendingChangeIdParamsSchema, req.params);
      return toPendingDto(await approvePendingChange(req.user, id));
    });
    app.post('/pending-changes/:id/reject', async (req) => {
      const { id } = parse(pendingChangeIdParamsSchema, req.params);
      return toPendingDto(await rejectPendingChange(req.user, id));
    });
  };
}
