import type { Model, Types } from 'mongoose';
import { localDateOf, type AuditEntry } from '@takip/shared';
import {
  AuditLog,
  Block,
  BlockInstance,
  Goal,
  JournalEntry,
  Penalty,
  PenaltyRule,
  ProgressLog,
  type AuditEntity,
  type AuditLogDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { clock } from './clock.js';
import { regenerateFuture } from './schedule.js';
import type { UserContext } from './users.js';

/**
 * Değişiklik geçmişi (AuditLog) ve geri alma / yineleme.
 *
 * Her kayıt değişen belgenin önceki (`before`) ve sonraki (`after`) anlık görüntüsünü tutar.
 * Geri alma `before`'u, yineleme `after`'ı geri yazar.
 *
 * canUndo / canRedo kuralı:
 * - Aynı varlık için sonradan yazılmış ve geri alınmamış bir kayıt varsa ikisi de kapalı
 *   (önce yeni değişiklik geri alınmalı).
 * - Geri alma yalnızca belgenin bugünkü hâli `after` ile aynıysa açık; uygulamadan ya da ceza
 *   motorundan sonradan değişmişse kapalı (başkasının değişikliği ezilmesin).
 * - Yineleme yalnızca bugünkü hâl `before` ile aynıysa açık.
 * Karşılaştırmada `updatedAt` ve `__v` yok sayılır. Silinmiş (yok) ya da arşivlenmiş blok/hedef
 * "yok" (null) sayılır.
 */

type Snapshot = Record<string, unknown>;

// Farklı şemalı modeller tek tabloda; anlık görüntüler ham belge olarak okunup yazılır.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

const MODELS: Record<AuditEntity, AnyModel> = {
  block: Block as unknown as AnyModel,
  goal: Goal as unknown as AnyModel,
  progress: ProgressLog as unknown as AnyModel,
  penaltyRule: PenaltyRule as unknown as AnyModel,
  penalty: Penalty as unknown as AnyModel,
  journal: JournalEntry as unknown as AnyModel,
};

export async function snapshotOf(
  entity: AuditEntity,
  id: Types.ObjectId | string,
): Promise<Snapshot | null> {
  return (await MODELS[entity].findById(id).lean()) as Snapshot | null;
}

const IGNORED = new Set(['updatedAt', '__v']);

function canonical(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { $date: v.toISOString() };
  if (typeof v === 'object' && v !== null && '_bsontype' in v) return String(v);
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (IGNORED.has(k)) continue;
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Arşivlenmiş blok/hedef geri alma açısından "yok" sayılır. */
function presence(entity: AuditEntity, s: Snapshot | null): Snapshot | null {
  if (!s) return null;
  if ((entity === 'block' || entity === 'goal') && s.archived === true) return null;
  return s;
}

function sameState(entity: AuditEntity, a: Snapshot | null, b: Snapshot | null): boolean {
  const pa = presence(entity, a);
  const pb = presence(entity, b);
  if (!pa || !pb) return !pa && !pb;
  return JSON.stringify(canonical(pa)) === JSON.stringify(canonical(pb));
}

export interface AuditInput {
  actor: 'app' | 'mcp' | 'system';
  tool: string | null;
  entity: AuditEntity;
  entityId: Types.ObjectId | string;
  before: Snapshot | null;
  after: Snapshot | null;
  summary: string;
  pendingChangeId?: Types.ObjectId | null;
}

export async function recordAudit(user: UserContext, input: AuditInput): Promise<AuditLogDoc> {
  return AuditLog.create({
    userId: user.id,
    actor: input.actor,
    tool: input.tool,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    summary: input.summary,
    pendingChangeId: input.pendingChangeId ?? null,
  });
}

interface Flags {
  canUndo: boolean;
  canRedo: boolean;
}

export async function auditFlags(entry: AuditLogDoc): Promise<Flags> {
  const entity = entry.entity as AuditEntity;
  const newer = await AuditLog.exists({
    userId: entry.userId,
    entity,
    entityId: entry.entityId,
    undoneAt: null,
    _id: { $gt: entry._id },
  });
  if (newer) return { canUndo: false, canRedo: false };
  const current = await snapshotOf(entity, entry.entityId);
  const before = (entry.before ?? null) as Snapshot | null;
  const after = (entry.after ?? null) as Snapshot | null;
  if (entry.undoneAt) return { canUndo: false, canRedo: sameState(entity, current, before) };
  return { canUndo: sameState(entity, current, after), canRedo: false };
}

export async function toAuditDto(entry: AuditLogDoc): Promise<AuditEntry> {
  const flags = await auditFlags(entry);
  return {
    id: entry.id as string,
    actor: entry.actor as AuditEntry['actor'],
    tool: entry.tool ?? null,
    entity: entry.entity,
    entityId: entry.entityId ? String(entry.entityId) : null,
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
    undoneAt: entry.undoneAt ? entry.undoneAt.toISOString() : null,
    ...flags,
  };
}

export async function listAudit(
  user: UserContext,
  q: { actor?: 'app' | 'mcp' | 'system'; limit: number },
): Promise<AuditEntry[]> {
  const filter: Record<string, unknown> = { userId: user.id };
  if (q.actor) filter.actor = q.actor;
  const docs = await AuditLog.find(filter).sort({ _id: -1 }).limit(q.limit);
  return Promise.all(docs.map(toAuditDto));
}

/** Bugün ekranı: Claude'un geri alınmamış son değişikliği */
export async function lastClaudeChange(user: UserContext): Promise<AuditEntry | null> {
  const doc = await AuditLog.findOne({ userId: user.id, actor: 'mcp', undoneAt: null }).sort({
    _id: -1,
  });
  return doc ? toAuditDto(doc) : null;
}

async function getEntry(user: UserContext, id: string): Promise<AuditLogDoc> {
  const doc = await AuditLog.findOne({ _id: id, userId: user.id });
  if (!doc) throw new AppError(404, 'AUDIT_NOT_FOUND', 'Değişiklik kaydı bulunamadı');
  return doc;
}

/**
 * Anlık görüntüyü veritabanına geri yazar. `snap` null ise belge kaldırılır: blok ve hedef
 * geçmişte kullanıldıysa (kayıt/ilerleme varsa) arşivlenir, kullanılmadıysa silinir.
 * Blokta gelecekteki planlı kayıtlar her durumda yeniden üretilir.
 */
async function applySnapshot(
  user: UserContext,
  entity: AuditEntity,
  id: Types.ObjectId,
  snap: Snapshot | null,
): Promise<void> {
  const model = MODELS[entity];
  if (snap) {
    await model.collection.replaceOne({ _id: id }, snap, { upsert: true });
  } else if (entity === 'block') {
    await BlockInstance.deleteMany({
      blockId: id,
      status: 'planned',
      startAt: { $gt: clock.now() },
    });
    if (await BlockInstance.exists({ blockId: id })) {
      await Block.updateOne(
        { _id: id },
        { archived: true, validTo: localDateOf(clock.now(), user.timezone) },
      );
    } else {
      await Block.deleteOne({ _id: id });
    }
  } else if (entity === 'goal') {
    const used = (await ProgressLog.exists({ goalId: id })) || (await Block.exists({ goalId: id }));
    if (used) {
      await Goal.updateOne({ _id: id }, { archived: true });
      await Block.updateMany({ userId: user.id, goalId: id }, { goalId: null, goalAmount: null });
    } else {
      await Goal.deleteOne({ _id: id });
    }
  } else if (entity === 'penaltyRule') {
    await Promise.all([
      Block.updateMany({ userId: user.id, penaltyRuleId: id }, { penaltyRuleId: null }),
      Goal.updateMany({ userId: user.id, penaltyRuleId: id }, { penaltyRuleId: null }),
    ]);
    await PenaltyRule.deleteOne({ _id: id });
  } else {
    await model.deleteOne({ _id: id });
  }

  if (entity === 'block') {
    const block = await Block.findById(id);
    if (block) await regenerateFuture(block, user.timezone);
  }
}

export async function undoAudit(user: UserContext, id: string): Promise<AuditLogDoc> {
  const entry = await getEntry(user, id);
  if (entry.undoneAt)
    throw new AppError(409, 'AUDIT_ALREADY_UNDONE', 'Bu değişiklik zaten geri alındı');
  const { canUndo } = await auditFlags(entry);
  if (!canUndo) {
    throw new AppError(
      409,
      'AUDIT_CANNOT_UNDO',
      'Bu değişiklik geri alınamaz: kayıt sonradan değişti',
    );
  }
  await applySnapshot(
    user,
    entry.entity as AuditEntity,
    entry.entityId,
    (entry.before ?? null) as Snapshot | null,
  );
  entry.undoneAt = clock.now();
  await entry.save();
  return entry;
}

export async function redoAudit(user: UserContext, id: string): Promise<AuditLogDoc> {
  const entry = await getEntry(user, id);
  if (!entry.undoneAt) throw new AppError(409, 'AUDIT_NOT_UNDONE', 'Bu değişiklik geri alınmamış');
  const { canRedo } = await auditFlags(entry);
  if (!canRedo) {
    throw new AppError(
      409,
      'AUDIT_CANNOT_REDO',
      'Bu değişiklik yinelenemez: kayıt sonradan değişti',
    );
  }
  await applySnapshot(
    user,
    entry.entity as AuditEntity,
    entry.entityId,
    (entry.after ?? null) as Snapshot | null,
  );
  entry.undoneAt = null;
  await entry.save();
  return entry;
}

/** undo_last_change: verilen ya da Claude'un geri alınmamış son değişikliği geri alınır. */
export async function undoLastMcpChange(user: UserContext, auditId?: string): Promise<AuditLogDoc> {
  if (auditId) return undoAudit(user, auditId);
  const last = await AuditLog.findOne({ userId: user.id, actor: 'mcp', undoneAt: null }).sort({
    _id: -1,
  });
  if (!last) throw new AppError(404, 'AUDIT_NOT_FOUND', 'Geri alınacak bir Claude değişikliği yok');
  return undoAudit(user, last.id as string);
}
