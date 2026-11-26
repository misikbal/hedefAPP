import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Faz 6 — Claude (MCP) bağlantısı: API ile mobilin ortak sözleşmesi.
 * REST uçları /api/v1 altında, oturum gerektirir.
 */

/** Claude'un kullanabildiği araçlar (tasarımdaki 12 araç + yardımcılar). */
export const MCP_TOOLS = [
  'get_today',
  'get_week',
  'add_block',
  'update_block',
  'delete_block',
  'log_progress',
  'get_stats',
  'list_goals',
  'set_goal',
  'list_penalties',
  'add_penalty_rule',
  'update_penalty_rule',
  'resolve_penalty',
  'write_journal',
  'get_journal',
  'undo_last_change',
  'add_transaction',
  'list_transactions',
  'get_money_summary',
  'set_budget',
] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

/* ---------- izinler (Settings.mcpPermissions) ---------- */

export const MCP_PERMISSION_MODES = ['auto', 'approve'] as const;
export type McpPermissionMode = (typeof MCP_PERMISSION_MODES)[number];

export const mcpPermissionsSchema = z.object({
  /** blok ekleme ve değiştirme */
  blockWrite: z.enum(MCP_PERMISSION_MODES),
  blockDelete: z.enum(MCP_PERMISSION_MODES),
  /** ceza kuralı ekleme / değiştirme */
  penaltyRuleWrite: z.enum(MCP_PERMISSION_MODES),
  /** get_journal yalnızca açıkken çalışır */
  journalRead: z.boolean(),
});
export type McpPermissions = z.infer<typeof mcpPermissionsSchema>;

/* ---------- bağlantı durumu: GET /mcp-status ---------- */

export const mcpStatusSchema = z.object({
  /** MCP_SECRET tanımlı ve sunucu açık */
  enabled: z.boolean(),
  /**
   * API tabanına göre uç nokta yolu, gizli anahtar dahil: "/mcp/<MCP_SECRET>".
   * Mobil tam adresi EXPO_PUBLIC_API_URL + endpointPath olarak kurar.
   */
  endpointPath: z.string(),
  /** son başarılı MCP isteği */
  lastAccessAt: z.string().nullable(),
  lastTool: z.string().nullable(),
  pendingCount: z.number(),
  tools: z.array(z.string()),
  permissions: mcpPermissionsSchema,
});
export type McpStatus = z.infer<typeof mcpStatusSchema>;

/* ---------- değişiklik geçmişi: GET /audit ---------- */

export const AUDIT_ACTORS = ['app', 'mcp', 'system'] as const;

export const auditEntrySchema = z.object({
  id: z.string(),
  actor: z.enum(AUDIT_ACTORS),
  tool: z.string().nullable(),
  /** 'block' | 'goal' | 'progress' | 'penaltyRule' | 'penalty' | 'journal' */
  entity: z.string(),
  entityId: z.string().nullable(),
  /** Türkçe tek satır: "Cumartesi bisikleti 40 → 60 km yaptı" */
  summary: z.string(),
  createdAt: z.string(),
  undoneAt: z.string().nullable(),
  canUndo: z.boolean(),
  /** geri alınmış bir kayıt yeniden uygulanabilir (Yinele) */
  canRedo: z.boolean(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditListQuerySchema = z.object({
  actor: z.enum(AUDIT_ACTORS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const auditListSchema = z.object({ items: z.array(auditEntrySchema) });
export type AuditList = z.infer<typeof auditListSchema>;
export const auditIdParamsSchema = z.object({ id: objectIdSchema });

/* ---------- onay bekleyen değişiklikler: /pending-changes ---------- */

export const PENDING_CHANGE_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type PendingChangeStatus = (typeof PENDING_CHANGE_STATUSES)[number];

export const pendingChangeSchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: z.enum(PENDING_CHANGE_STATUSES),
  preview: z.object({
    /** "Almanca bloğunu sil" */
    title: z.string(),
    /** "Ne değişecek?" satırları */
    lines: z.array(z.string()),
    /** etkiler: "Haftalık Almanca hedefi 75 → 60" */
    effects: z.array(z.string()),
    /** silme gibi yıkıcı işlemde true (ceza rengiyle gösterilir) */
    destructive: z.boolean(),
  }),
  /** Claude'un aktardığı kullanıcı cümlesi (araç parametresi `userMessage`), yoksa null */
  userMessage: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  /** karar sonrası Claude'un göreceği yanıt / sonuç ("Blok silindi.") */
  resultMessage: z.string().nullable(),
});
export type PendingChangeDto = z.infer<typeof pendingChangeSchema>;

export const pendingChangeListQuerySchema = z.object({
  status: z.enum(PENDING_CHANGE_STATUSES).optional(),
});
export const pendingChangeListSchema = z.object({ items: z.array(pendingChangeSchema) });
export type PendingChangeList = z.infer<typeof pendingChangeListSchema>;
export const pendingChangeIdParamsSchema = z.object({ id: objectIdSchema });

/** Onay bekleyen değişikliğin ömrü */
export const PENDING_CHANGE_TTL_HOURS = 24;
