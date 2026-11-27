import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  DAY_NAMES,
  formatNumber,
  goalPhrase,
  journalDateOf,
  localDateOf,
  objectIdSchema,
  penaltyRuleCreateSchema,
  scalePenaltyText,
  type McpPermissions,
} from '@takip/shared';
import {
  Block,
  BlockInstance,
  Goal,
  JournalEntry,
  PenaltyRule,
  type AuditEntity,
  type AuditLogDoc,
  type BlockDoc,
} from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { mcpPermissionsOf } from '../lib/serialize.js';
import { recordAudit, snapshotOf } from '../services/audit.js';
import { archiveBlock, createBlock, getBlock, updateBlock } from '../services/blocks.js';
import { clock } from '../services/clock.js';
import { createGoal, getGoal, updateGoal } from '../services/goals.js';
import { notify } from '../services/notify.js';
import { blockPenaltyTexts, markPenaltyDone, postponePenalty } from '../services/penalties.js';
import { createRule, getRule, toRuleDtos, updateRule } from '../services/penaltyRules.js';
import { logProgress } from '../services/progress.js';
import { putJournal } from '../services/journal.js';
import { getSettings, type UserContext } from '../services/users.js';

/**
 * Claude'un yazma işlemleri. Her işlem iki yoldan çalışır:
 * - doğrudan (izin 'auto' ya da izinsiz araç): `performWrite`
 * - onaylı (izin 'approve'): önce `previewWrite` ile PendingChange, onaylanınca `performWrite`.
 * Argümanlar burada ada göre çözülmüş (kimlikli) hâlde tutulur; iş mantığı servislerdedir.
 */

type Snapshot = Record<string, unknown>;

export interface ApplyResult {
  entity: AuditEntity;
  entityId: Types.ObjectId;
  before: Snapshot | null;
  after: Snapshot | null;
  summary: string;
  /** Claude'a dönen kısa metin */
  message: string;
  data: Record<string, unknown>;
}

export interface Preview {
  title: string;
  lines: string[];
  effects: string[];
  destructive: boolean;
  /** AuditLog/bildirimde kullanılan tek satır */
  summary: string;
}

/* ---------- argüman şemaları (PendingChange.args) ---------- */

const looseObject = z.record(z.string(), z.unknown());

export const writeArgSchemas = {
  add_block: z.object({ input: looseObject }),
  update_block: z.object({ blockId: objectIdSchema, changes: looseObject }),
  delete_block: z.object({ blockId: objectIdSchema }),
  log_progress: z.object({ input: looseObject }),
  set_goal: z.object({ goalId: objectIdSchema.nullable(), input: looseObject }),
  add_penalty_rule: z.object({ input: looseObject }),
  update_penalty_rule: z.object({ ruleId: objectIdSchema, changes: looseObject }),
  resolve_penalty: z.object({ penaltyId: objectIdSchema, action: z.enum(['done', 'postpone']) }),
  write_journal: z.object({ date: z.string(), input: looseObject }),
} as const;

export type WriteTool = keyof typeof writeArgSchemas;
export type WriteArgs<T extends WriteTool> = z.infer<(typeof writeArgSchemas)[T]>;

/** Hangi izin anahtarına bağlı (null: her zaman doğrudan uygulanır) */
export const WRITE_PERMISSION: Record<
  WriteTool,
  keyof Pick<McpPermissions, 'blockWrite' | 'blockDelete' | 'penaltyRuleWrite'> | null
> = {
  add_block: 'blockWrite',
  update_block: 'blockWrite',
  delete_block: 'blockDelete',
  log_progress: null,
  set_goal: null,
  add_penalty_rule: 'penaltyRuleWrite',
  update_penalty_rule: 'penaltyRuleWrite',
  resolve_penalty: null,
  write_journal: null,
};

export const isWriteTool = (t: string): t is WriteTool => t in writeArgSchemas;

/* ---------- metin yardımcıları ---------- */

const SHORT_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export function daysText(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Her gün';
  if (sorted.length === 1) return DAY_NAMES[sorted[0]! - 1]!;
  return sorted.map((d) => SHORT_DAYS[d - 1]).join(', ');
}

function whenText(b: {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  repeatWeekly?: boolean | null;
  validFrom?: string | null;
}): string {
  const days =
    b.repeatWeekly === false && b.validFrom ? `${b.validFrom} (tek sefer)` : daysText(b.daysOfWeek);
  return `${days} ${b.startTime}–${b.endTime}`;
}

const lean = (s: Snapshot | null) => s as Record<string, unknown> | null;

async function goalLabel(goalId: unknown): Promise<string | null> {
  if (!goalId) return null;
  const g = await Goal.findById(goalId).select('name unit').lean();
  return g ? g.name : null;
}

async function goalUnit(goalId: unknown): Promise<string> {
  if (!goalId) return '';
  const g = await Goal.findById(goalId).select('unit').lean();
  return g?.unit ?? '';
}

type BlockLike = Pick<BlockDoc, 'daysOfWeek' | 'goalAmount' | 'repeatWeekly'> & {
  goalId?: unknown;
};

/**
 * Haftalık hedefe bağlı aktif blokların haftalık toplam planı. `replace` verilirse o blok
 * yerine verilen hâl (null: blok yok) hesaplanır.
 */
async function plannedWeekly(
  user: UserContext,
  goalId: string,
  replace?: { blockId: string | null; block: BlockLike | null },
): Promise<number> {
  const blocks = await Block.find({ userId: user.id, archived: false, goalId });
  let total = 0;
  for (const b of blocks) {
    if (replace?.blockId && String(b._id) === replace.blockId) continue;
    if (b.repeatWeekly) total += (b.goalAmount ?? 0) * b.daysOfWeek.length;
  }
  const r = replace?.block;
  if (r && r.goalId && String(r.goalId) === goalId && r.repeatWeekly !== false) {
    total += (r.goalAmount ?? 0) * r.daysOfWeek.length;
  }
  return total;
}

/** Bloğun eklenmesi/değişmesi/silinmesinin haftalık hedef planına etkisi */
async function goalPlanEffects(
  user: UserContext,
  blockId: string | null,
  before: BlockLike | null,
  after: BlockLike | null,
): Promise<string[]> {
  const ids = new Set([before?.goalId, after?.goalId].filter(Boolean).map((g) => String(g)));
  const out: string[] = [];
  for (const id of ids) {
    const goal = await Goal.findById(id).lean();
    if (!goal || goal.archived || goal.period !== 'weekly') continue;
    const now = await plannedWeekly(user, id);
    const next = await plannedWeekly(user, id, { blockId, block: after });
    if (now !== next) {
      out.push(
        `Haftalık ${goal.name} planı ${formatNumber(now)} → ${formatNumber(next)} ${goal.unit} (hedef ${formatNumber(goal.target)})`,
      );
    }
  }
  return out;
}

async function futurePlannedCount(blockId: Types.ObjectId): Promise<number> {
  return BlockInstance.countDocuments({
    blockId,
    status: 'planned',
    startAt: { $gt: clock.now() },
  });
}

function blockBrief(b: BlockDoc) {
  return {
    id: b.id as string,
    title: b.title,
    category: b.category,
    when: whenText(b),
    goalId: b.goalId ? String(b.goalId) : null,
    goalAmount: b.goalAmount ?? null,
    reminderMinutes: b.reminderMinutes ?? null,
  };
}

async function blockDiff(before: Snapshot, after: Snapshot): Promise<string[]> {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const lines: string[] = [];
  if (b.title !== a.title) lines.push(`Ad: ${String(b.title)} → ${String(a.title)}`);
  if (b.category !== a.category)
    lines.push(`Kategori: ${String(b.category)} → ${String(a.category)}`);
  const bw = whenText(b as never);
  const aw = whenText(a as never);
  if (bw !== aw) lines.push(`Zaman: ${bw} → ${aw}`);
  if (String(b.goalId ?? '') !== String(a.goalId ?? '')) {
    lines.push(
      `Hedef: ${(await goalLabel(b.goalId)) ?? 'yok'} → ${(await goalLabel(a.goalId)) ?? 'yok'}`,
    );
  }
  if ((b.goalAmount ?? null) !== (a.goalAmount ?? null)) {
    const unit = await goalUnit(a.goalId ?? b.goalId);
    lines.push(
      `Hedef miktarı: ${b.goalAmount == null ? '—' : formatNumber(b.goalAmount as number)} → ${a.goalAmount == null ? '—' : formatNumber(a.goalAmount as number)} ${unit}`.trim(),
    );
  }
  if ((b.reminderMinutes ?? null) !== (a.reminderMinutes ?? null)) {
    const r = (v: unknown) => (v == null ? 'kapalı' : `${String(v)} dk önce`);
    lines.push(`Hatırlatma: ${r(b.reminderMinutes)} → ${r(a.reminderMinutes)}`);
  }
  if ((b.description ?? null) !== (a.description ?? null)) lines.push('Açıklama değişti');
  if (String(b.penaltyRuleId ?? '') !== String(a.penaltyRuleId ?? ''))
    lines.push('Bağlı ceza kuralı değişti');
  return lines;
}

/** Değişikliğin bloğa uygulanmış hâli (kaydetmeden, önizleme için) */
async function simulateBlockUpdate(
  user: UserContext,
  blockId: string,
  changes: Record<string, unknown>,
): Promise<{ block: BlockDoc; before: Snapshot; after: Snapshot }> {
  const block = await getBlock(user, blockId);
  const before = block.toObject() as Snapshot;
  const copy = Block.hydrate(block.toObject());
  copy.set(changes);
  if (!copy.goalId) copy.goalAmount = null;
  return { block, before, after: copy.toObject() as Snapshot };
}

/* ---------- uygula ---------- */

async function applyWrite(
  user: UserContext,
  tool: WriteTool,
  rawArgs: unknown,
): Promise<ApplyResult> {
  switch (tool) {
    case 'add_block': {
      const { input } = writeArgSchemas.add_block.parse(rawArgs);
      const block = await createBlock(user, input as never);
      const after = await snapshotOf('block', block._id);
      const summary = `${block.title} bloğunu ekledi (${whenText(block)})`;
      return {
        entity: 'block',
        entityId: block._id,
        before: null,
        after,
        summary,
        message: `Blok eklendi: ${block.title}, ${whenText(block)}.`,
        data: { block: blockBrief(block) },
      };
    }
    case 'update_block': {
      const { blockId, changes } = writeArgSchemas.update_block.parse(rawArgs);
      const before = await snapshotOf('block', blockId);
      const block = await updateBlock(user, blockId, changes as never);
      const after = await snapshotOf('block', block._id);
      const diff = before && after ? await blockDiff(before, after) : [];
      const summary = `${block.title} bloğunu değiştirdi${diff.length ? `: ${diff.join('; ')}` : ''}`;
      return {
        entity: 'block',
        entityId: block._id,
        before,
        after,
        summary,
        message: `Blok güncellendi: ${block.title}${diff.length ? ` (${diff.join('; ')})` : ' (değişiklik yok)'}. Geçmiş kayıtlar korunur, değişiklik gelecek planlara uygulanır.`,
        data: { block: blockBrief(block) },
      };
    }
    case 'delete_block': {
      const { blockId } = writeArgSchemas.delete_block.parse(rawArgs);
      const before = await snapshotOf('block', blockId);
      const block = await archiveBlock(user, blockId);
      const after = await snapshotOf('block', block._id);
      return {
        entity: 'block',
        entityId: block._id,
        before,
        after,
        summary: `${block.title} bloğunu sildi`,
        message: `Blok silindi: ${block.title}. Geçmiş kayıtlar ve istatistikler kalır; gelecekteki planlar kaldırıldı.`,
        data: { blockId: block.id as string },
      };
    }
    case 'log_progress': {
      const { input } = writeArgSchemas.log_progress.parse(rawArgs);
      const log = await logProgress(user, input as never, 'mcp');
      const goal = await getGoal(user, log.goalId);
      const amount = `${formatNumber(log.amount)} ${goal.unit}`;
      return {
        entity: 'progress',
        entityId: log._id,
        before: null,
        after: await snapshotOf('progress', log._id),
        summary: `${goal.name} hedefine ${amount} ekledi (${log.date})`,
        message: `${goal.name} hedefine ${amount} işlendi (${log.date}).`,
        data: {
          progressId: log.id as string,
          goalId: goal.id as string,
          amount: log.amount,
          date: log.date,
        },
      };
    }
    case 'set_goal': {
      const { goalId, input } = writeArgSchemas.set_goal.parse(rawArgs);
      if (goalId) {
        const before = await snapshotOf('goal', goalId);
        const old = await getGoal(user, goalId);
        const oldPhrase = goalPhrase(old);
        const goal = await updateGoal(user, goalId, input as never);
        const phrase = goalPhrase(goal);
        const change = oldPhrase === phrase ? 'ayarlarını değiştirdi' : `${oldPhrase} → ${phrase}`;
        return {
          entity: 'goal',
          entityId: goal._id,
          before,
          after: await snapshotOf('goal', goal._id),
          summary: `${old.name} hedefini değiştirdi: ${change}`,
          message: `Hedef güncellendi: ${phrase}.`,
          data: { goalId: goal.id as string },
        };
      }
      const goal = await createGoal(user, input as never);
      return {
        entity: 'goal',
        entityId: goal._id,
        before: null,
        after: await snapshotOf('goal', goal._id),
        summary: `Yeni hedef ekledi: ${goalPhrase(goal)}`,
        message: `Hedef eklendi: ${goalPhrase(goal)} (id: ${goal.id as string}).`,
        data: { goalId: goal.id as string },
      };
    }
    case 'add_penalty_rule': {
      const { input } = writeArgSchemas.add_penalty_rule.parse(rawArgs);
      const rule = await createRule(user, input as never);
      const [dto] = await toRuleDtos([rule]);
      return {
        entity: 'penaltyRule',
        entityId: rule._id,
        before: null,
        after: await snapshotOf('penaltyRule', rule._id),
        summary: `Ceza kuralı ekledi: ${dto!.sentence}`,
        message: `Ceza kuralı eklendi: ${dto!.sentence}`,
        data: { ruleId: rule.id as string },
      };
    }
    case 'update_penalty_rule': {
      const { ruleId, changes } = writeArgSchemas.update_penalty_rule.parse(rawArgs);
      const before = await snapshotOf('penaltyRule', ruleId);
      const [oldDto] = await toRuleDtos([await getRule(user, ruleId)]);
      const rule = await updateRule(user, ruleId, changes as never);
      const [dto] = await toRuleDtos([rule]);
      return {
        entity: 'penaltyRule',
        entityId: rule._id,
        before,
        after: await snapshotOf('penaltyRule', rule._id),
        summary: `Ceza kuralını değiştirdi: ${oldDto!.sentence} → ${dto!.sentence}`,
        message: `Ceza kuralı güncellendi: ${dto!.sentence}`,
        data: { ruleId: rule.id as string },
      };
    }
    case 'resolve_penalty': {
      const { penaltyId, action } = writeArgSchemas.resolve_penalty.parse(rawArgs);
      const before = await snapshotOf('penalty', penaltyId);
      if (!before) throw new AppError(404, 'PENALTY_NOT_FOUND', 'Ceza bulunamadı');
      const oldText = scalePenaltyText(String(before.penalty), Number(before.multiplier));
      const p =
        action === 'done'
          ? await markPenaltyDone(user, penaltyId)
          : await postponePenalty(user, penaltyId);
      const text = scalePenaltyText(p.penalty, p.multiplier);
      return {
        entity: 'penalty',
        entityId: p._id,
        before,
        after: await snapshotOf('penalty', p._id),
        summary:
          action === 'done'
            ? `Cezayı yapıldı işaretledi: ${text}`
            : `Cezayı erteledi: ${oldText} → ${text}`,
        message:
          action === 'done'
            ? `Ceza yapıldı olarak işaretlendi: ${text}.`
            : `Ceza ertelendi (×2): ${text}, yeni süre ${p.dueAt.toISOString()}.`,
        data: { penaltyId: p.id as string, status: p.status, dueAt: p.dueAt.toISOString() },
      };
    }
    case 'write_journal': {
      const { date, input } = writeArgSchemas.write_journal.parse(rawArgs);
      const existing = await JournalEntry.findOne({ userId: user.id, date }).lean();
      const before = existing ? await snapshotOf('journal', existing._id) : null;
      const perms = mcpPermissionsOf(await getSettings(user.id));
      const journalInput = { ...input };
      if (!perms.journalRawNote) delete journalInput.rawNote;
      const entry = await putJournal(user, date, journalInput as never, { source: 'claude' });
      return {
        entity: 'journal',
        entityId: entry._id,
        before,
        after: await snapshotOf('journal', entry._id),
        summary: `${date} günlüğünü ${existing ? 'güncelledi' : 'yazdı'}`,
        message: `${date} günlüğü ${existing ? 'güncellendi' : 'kaydedildi'}.`,
        data: {
          date,
          mood: entry.mood,
          energy: entry.energy ?? null,
          tags: entry.tags ?? [],
          summary: entry.summary ?? null,
          daySnapshot: entry.daySnapshot
            ? {
                blocksPlanned: entry.daySnapshot.blocksPlanned,
                blocksDone: entry.daySnapshot.blocksDone,
                sportDone: entry.daySnapshot.sportDone ?? null,
              }
            : null,
        },
      };
    }
  }
}

/* ---------- önizleme (onay bekleyen değişiklik) ---------- */

export async function previewWrite(
  user: UserContext,
  tool: WriteTool,
  rawArgs: unknown,
): Promise<Preview> {
  switch (tool) {
    case 'add_block': {
      const { input } = writeArgSchemas.add_block.parse(rawArgs);
      const i = input as unknown as BlockLike & {
        title: string;
        startTime: string;
        endTime: string;
        validFrom?: string;
        reminderMinutes?: number | null;
      };
      const lines = [`Yeni blok: ${i.title}`, `Zaman: ${whenText(i)}`];
      const goal = await goalLabel(i.goalId);
      if (goal)
        lines.push(
          `Hedef: ${goal}, blok başına ${formatNumber(i.goalAmount ?? 0)} ${await goalUnit(i.goalId)}`,
        );
      if (i.reminderMinutes != null) lines.push(`Hatırlatma: ${i.reminderMinutes} dk önce`);
      return {
        title: `${i.title} bloğunu ekle`,
        lines,
        effects: await goalPlanEffects(user, null, null, i),
        destructive: false,
        summary: `${i.title} bloğunu ekledi (${whenText(i)})`,
      };
    }
    case 'update_block': {
      const { blockId, changes } = writeArgSchemas.update_block.parse(rawArgs);
      const { block, before, after } = await simulateBlockUpdate(user, blockId, changes);
      const diff = await blockDiff(before, after);
      return {
        title: `${block.title} bloğunu değiştir`,
        lines: diff.length ? diff : ['Değişiklik yok'],
        effects: [
          ...(await goalPlanEffects(user, blockId, before as never, after as never)),
          'Geçmiş kayıtlar korunur; değişiklik gelecek planlara uygulanır',
        ],
        destructive: false,
        summary: `${block.title} bloğunu değiştirdi${diff.length ? `: ${diff.join('; ')}` : ''}`,
      };
    }
    case 'delete_block': {
      const { blockId } = writeArgSchemas.delete_block.parse(rawArgs);
      const block = await getBlock(user, blockId);
      const effects = await goalPlanEffects(user, blockId, block, null);
      const penalty = (
        await blockPenaltyTexts(user.id, [
          { id: block.id as string, category: block.category, penaltyRuleId: block.penaltyRuleId },
        ])
      ).get(block.id as string);
      if (penalty) effects.push(`Bu blok için ceza işlemez (${penalty})`);
      const planned = await futurePlannedCount(block._id);
      if (planned) effects.push(`${planned} planlı kayıt kaldırılır`);
      return {
        title: `${block.title} bloğunu sil`,
        lines: [`Silinecek blok: ${block.title} · ${whenText(block)}`],
        effects,
        destructive: true,
        summary: `${block.title} bloğunu sildi`,
      };
    }
    case 'add_penalty_rule': {
      const { input } = writeArgSchemas.add_penalty_rule.parse(rawArgs);
      const sentence = await sentenceFor(user, input);
      return {
        title: 'Ceza kuralı ekle',
        lines: [sentence],
        effects: ['Kural geriye dönük uygulanmaz'],
        destructive: false,
        summary: `Ceza kuralı ekledi: ${sentence}`,
      };
    }
    case 'update_penalty_rule': {
      const { ruleId, changes } = writeArgSchemas.update_penalty_rule.parse(rawArgs);
      const rule = await getRule(user, ruleId);
      const [oldDto] = await toRuleDtos([rule]);
      const copy = PenaltyRule.hydrate(rule.toObject());
      copy.set(changes);
      const [newDto] = await toRuleDtos([copy]);
      return {
        title: 'Ceza kuralını değiştir',
        lines: [`Önce: ${oldDto!.sentence}`, `Sonra: ${newDto!.sentence}`],
        effects: changes.enabled === false ? ['Kural kapanır; yeni ceza üretmez'] : [],
        destructive: false,
        summary: `Ceza kuralını değiştirdi: ${oldDto!.sentence} → ${newDto!.sentence}`,
      };
    }
    default:
      throw new AppError(400, 'NOT_APPROVABLE', 'Bu işlem onaya bağlı değil');
  }
}

async function sentenceFor(user: UserContext, input: Record<string, unknown>): Promise<string> {
  const parsed = penaltyRuleCreateSchema.parse(input);
  const tmp = PenaltyRule.hydrate({
    ...parsed,
    _id: undefined,
    userId: user.id,
    targetId: parsed.targetId ?? null,
    category: parsed.category ?? null,
    deadline:
      parsed.deadline.type === 'hours' ? parsed.deadline : { type: 'end_of_week', hours: null },
  });
  const [dto] = await toRuleDtos([tmp]);
  return dto!.sentence;
}

/* ---------- ortak giriş ---------- */

function claudeChangeKey(user: UserContext): string {
  // Aynı saatte yapılan değişiklikler için tek bildirim.
  return `claude_change:${String(user.id)}:${clock.now().toISOString().slice(0, 13)}`;
}

/**
 * Değişikliği uygular ve AuditLog'a yazar (actor 'mcp'). Onaylanan bir PendingChange'ten
 * geliyorsa bildirim gönderilmez (kullanıcı zaten telefonda).
 */
export async function performWrite(
  user: UserContext,
  tool: WriteTool,
  args: unknown,
  opts: { pendingChangeId?: Types.ObjectId } = {},
): Promise<{ result: ApplyResult; audit: AuditLogDoc }> {
  const result = await applyWrite(user, tool, args);
  const audit = await recordAudit(user, {
    actor: 'mcp',
    tool,
    entity: result.entity,
    entityId: result.entityId,
    before: lean(result.before),
    after: lean(result.after),
    summary: result.summary,
    pendingChangeId: opts.pendingChangeId ?? null,
  });
  if (!opts.pendingChangeId) {
    await notify.send(user.id, {
      type: 'claude_change',
      dedupeKey: claudeChangeKey(user),
      title: 'Claude programını değiştirdi',
      body: result.summary,
    });
  }
  return { result, audit };
}

export function journalDefaultDate(user: UserContext): string {
  return journalDateOf(clock.now(), user.timezone);
}

export function today(user: UserContext): string {
  return localDateOf(clock.now(), user.timezone);
}
