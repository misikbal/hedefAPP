import type { Types } from 'mongoose';
import {
  PENDING_CHANGE_TTL_HOURS,
  type PendingChangeDto,
  type PendingChangeStatus,
} from '@takip/shared';
import { PendingChange, type PendingChangeDoc } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { performWrite, previewWrite, type WriteTool, isWriteTool } from '../mcp/actions.js';
import { clock } from './clock.js';
import { notify } from './notify.js';
import type { UserContext } from './users.js';

const EXPIRED_MESSAGE = 'Süresi doldu; değişiklik uygulanmadı.';

export function toPendingDto(p: PendingChangeDoc): PendingChangeDto {
  return {
    id: p.id as string,
    tool: p.tool,
    status: p.status as PendingChangeStatus,
    preview: {
      title: p.preview?.title ?? '',
      lines: [...(p.preview?.lines ?? [])],
      effects: [...(p.preview?.effects ?? [])],
      destructive: p.preview?.destructive === true,
    },
    userMessage: p.userMessage ?? null,
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null,
    resultMessage: p.resultMessage ?? null,
  };
}

/**
 * Süresi geçmiş bekleyenleri `expired` yapar. Tembel: her okuma/karardan önce ve
 * notification-tick işinde çağrılır. userId verilmezse herkes için.
 */
export async function expirePendingChanges(userId?: Types.ObjectId): Promise<number> {
  const now = clock.now();
  const filter: Record<string, unknown> = { status: 'pending', expiresAt: { $lte: now } };
  if (userId) filter.userId = userId;
  const res = await PendingChange.updateMany(filter, {
    status: 'expired',
    decidedAt: now,
    resultMessage: EXPIRED_MESSAGE,
  });
  return res.modifiedCount;
}

export async function createPendingChange(
  user: UserContext,
  tool: WriteTool,
  args: Record<string, unknown>,
  userMessage: string | null,
): Promise<PendingChangeDoc> {
  const preview = await previewWrite(user, tool, args);
  const now = clock.now();
  const doc = await PendingChange.create({
    userId: user.id,
    tool,
    args,
    summary: preview.summary,
    userMessage,
    preview: {
      title: preview.title,
      lines: preview.lines,
      effects: preview.effects,
      destructive: preview.destructive,
    },
    expiresAt: new Date(now.getTime() + PENDING_CHANGE_TTL_HOURS * 3_600_000),
  });
  await notify.send(user.id, {
    type: 'claude_pending',
    pendingId: doc.id as string,
    title: 'Claude onay istiyor',
    body: preview.title,
  });
  return doc;
}

export async function listPendingChanges(
  user: UserContext,
  status?: PendingChangeStatus,
): Promise<PendingChangeDoc[]> {
  await expirePendingChanges(user.id);
  const filter: Record<string, unknown> = { userId: user.id };
  if (status) filter.status = status;
  return PendingChange.find(filter).sort({ _id: -1 }).limit(50);
}

export async function countPending(user: UserContext): Promise<number> {
  await expirePendingChanges(user.id);
  return PendingChange.countDocuments({ userId: user.id, status: 'pending' });
}

export async function getPendingChange(user: UserContext, id: string): Promise<PendingChangeDoc> {
  await expirePendingChanges(user.id);
  const doc = await PendingChange.findOne({ _id: id, userId: user.id });
  if (!doc)
    throw new AppError(404, 'PENDING_CHANGE_NOT_FOUND', 'Onay bekleyen değişiklik bulunamadı');
  return doc;
}

function assertOpen(doc: PendingChangeDoc): void {
  if (doc.status === 'expired') {
    throw new AppError(
      409,
      'PENDING_CHANGE_EXPIRED',
      `Bu değişikliğin süresi doldu (${PENDING_CHANGE_TTL_HOURS} saat). Claude'dan yeniden iste.`,
    );
  }
  if (doc.status !== 'pending') {
    throw new AppError(409, 'PENDING_CHANGE_DECIDED', 'Bu değişiklik için zaten karar verildi');
  }
}

/** Onayla: değişiklik servis katmanında uygulanır, AuditLog'a yazılır. Hata olursa kayıt bekler. */
export async function approvePendingChange(
  user: UserContext,
  id: string,
): Promise<PendingChangeDoc> {
  const doc = await getPendingChange(user, id);
  assertOpen(doc);
  if (!isWriteTool(doc.tool)) {
    throw new AppError(400, 'NOT_APPROVABLE', 'Bu işlem onaylanamaz');
  }
  // Aynı kaydın iki kez onaylanmasını önlemek için önce kilitle.
  const locked = await PendingChange.findOneAndUpdate(
    { _id: doc._id, status: 'pending' },
    { status: 'approved', decidedAt: clock.now() },
    { returnDocument: 'after' },
  );
  if (!locked)
    throw new AppError(409, 'PENDING_CHANGE_DECIDED', 'Bu değişiklik için zaten karar verildi');
  try {
    const { result, audit } = await performWrite(user, doc.tool, doc.args, {
      pendingChangeId: doc._id,
    });
    locked.resultMessage = `Kullanıcı onayladı. ${result.message}`;
    locked.auditId = audit._id;
    await locked.save();
    return locked;
  } catch (err) {
    await PendingChange.updateOne(
      { _id: doc._id },
      { status: 'pending', decidedAt: null, resultMessage: null },
    );
    throw err;
  }
}

export async function rejectPendingChange(
  user: UserContext,
  id: string,
): Promise<PendingChangeDoc> {
  const doc = await getPendingChange(user, id);
  assertOpen(doc);
  const updated = await PendingChange.findOneAndUpdate(
    { _id: doc._id, status: 'pending' },
    {
      status: 'rejected',
      decidedAt: clock.now(),
      resultMessage: 'Kullanıcı değişikliği reddetti; uygulanmadı.',
    },
    { returnDocument: 'after' },
  );
  if (!updated)
    throw new AppError(409, 'PENDING_CHANGE_DECIDED', 'Bu değişiklik için zaten karar verildi');
  return updated;
}
