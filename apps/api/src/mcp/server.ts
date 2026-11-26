import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodError } from 'zod';
import {
  CATEGORIES,
  DAY_NAMES,
  GOAL_PERIODS,
  GOAL_UNITS,
  PENALTY_ON_FAIL,
  PENALTY_TARGET_TYPES,
  PENALTY_TRIGGERS,
  STATS_RANGES,
  OPEN_PENALTY_STATUSES,
  addDays,
  blockCreateSchema,
  blockUpdateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  isoDayOfWeek,
  journalPutSchema,
  localDateSchema,
  objectIdSchema,
  penaltyRuleUpdateSchema,
  progressCreateSchema,
  timeOfDaySchema,
  type Instance,
  type McpToolName,
} from '@takip/shared';
import { JournalEntry, PendingChange, Settings } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';
import { mcpPermissionsOf, toPenaltyDto } from '../lib/serialize.js';
import { undoLastMcpChange } from '../services/audit.js';
import { clock } from '../services/clock.js';
import { listGoals } from '../services/goals.js';
import { listPenalties } from '../services/penalties.js';
import { listRules, toRuleDtos } from '../services/penaltyRules.js';
import { createPendingChange } from '../services/pendingChanges.js';
import { goalSummaries, statsOverview } from '../services/stats.js';
import { getSettings, type UserContext } from '../services/users.js';
import { getToday, getWeek } from '../services/views.js';
import {
  WRITE_PERMISSION,
  journalDefaultDate,
  performWrite,
  today,
  type WriteTool,
} from './actions.js';
import { findGoalByName, resolveBlock, resolveGoal, resolveTargetId } from './resolve.js';

export const MCP_SERVER_NAME = 'takip';
export const MCP_SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = [
  'Kişisel takip uygulaması: haftalık program (bloklar), hedefler, ilerleme, cezalar ve günlük.',
  'Saat dilimi Europe/Istanbul, hafta pazartesi başlar; günler 1=Pazartesi … 7=Pazar.',
  'Tarihleri YYYY-AA-GG, saatleri SS:dd biçiminde ver. Bugünün tarihi için önce get_today çağır.',
  'Hedef ve blokları kimlik yerine adla da verebilirsin (goalName, blockName).',
  'Yazma araçlarına kullanıcının isteğini userMessage olarak ekle; bazı değişiklikler kullanıcının telefondan onayını bekler.',
].join(' ');

/* ---------- çıktı ---------- */

function ok(message: string, data?: unknown): CallToolResult {
  const text = data === undefined ? message : `${message}\n${JSON.stringify(data)}`;
  return { content: [{ type: 'text', text }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function errorText(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof ZodError) {
    return `Geçersiz girdi: ${err.issues
      .map((i) => `${i.path.join('.') || 'girdi'}: ${i.message}`)
      .join('; ')}`;
  }
  return 'Sunucu hatası; işlem yapılamadı.';
}

function instanceBrief(i: Instance) {
  return {
    instanceId: i.id,
    blockId: i.blockId,
    date: i.date,
    time: `${i.startTime}–${i.endTime}`,
    title: i.title,
    category: i.category,
    status: i.status,
    ...(i.penalty ? { penaltyIfMissed: i.penalty } : {}),
  };
}

const dayName = (date: string) => DAY_NAMES[isoDayOfWeek(date) - 1]!;

/* ---------- ortak girdi parçaları ---------- */

const userMessage = z
  .string()
  .max(500)
  .optional()
  .describe('Kullanıcının bu değişikliği isteyen cümlesi, olduğu gibi (onay ekranında gösterilir)');
const goalRef = {
  goalId: objectIdSchema.optional().describe('Hedef kimliği'),
  goalName: z.string().max(60).optional().describe('Kimlik yerine hedef adı, ör. "Bisiklet"'),
};
const blockRef = {
  blockId: objectIdSchema.optional().describe('Blok kimliği (get_week çıktısındaki blockId)'),
  blockName: z.string().max(80).optional().describe('Kimlik yerine blok adı, ör. "Almanca"'),
};
const days = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .describe('Haftanın günleri: 1=Pazartesi … 7=Pazar');
const deadlineInput = {
  deadlineHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 14)
    .optional()
    .describe('Cezayı yapma süresi (saat). Varsayılan 24'),
  deadlineEndOfWeek: z.boolean().optional().describe('true ise süre haftanın sonu (pazar 23:59)'),
};

function deadlineOf(i: {
  deadlineHours?: number | undefined;
  deadlineEndOfWeek?: boolean | undefined;
}) {
  if (i.deadlineEndOfWeek) return { type: 'end_of_week' as const };
  if (i.deadlineHours) return { type: 'hours' as const, hours: i.deadlineHours };
  return undefined;
}

const strip = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Kullanıcıya bağlı bir MCP sunucusu kurar (stateless: her HTTP isteğinde yenisi).
 * Araçlar REST ile aynı servisleri kullanır.
 */
export function createMcpServer(user: UserContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  const touch = (tool: string) =>
    Settings.updateOne(
      { userId: user.id },
      { $set: { mcpLastAccessAt: clock.now(), mcpLastTool: tool } },
    );

  const run =
    <A>(tool: McpToolName, fn: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        await touch(tool);
        return await fn(args);
      } catch (err) {
        return fail(errorText(err));
      }
    };

  /** İzin 'approve' ise değişiklik uygulanmaz, PendingChange oluşur. */
  async function write(
    tool: WriteTool,
    args: Record<string, unknown>,
    message: string | undefined,
  ): Promise<CallToolResult> {
    const perm = WRITE_PERMISSION[tool];
    if (perm && mcpPermissionsOf(await getSettings(user.id))[perm] === 'approve') {
      const p = await createPendingChange(user, tool, args, message ?? null);
      return ok(
        `Değişiklik kullanıcı onayı bekliyor (id: ${p.id as string}). Kullanıcı telefondan onayladığında uygulanacak.`,
        { pendingChangeId: p.id as string, status: 'pending', title: p.preview?.title },
      );
    }
    const { result, audit } = await performWrite(user, tool, args);
    return ok(result.message, { ...result.data, auditId: audit.id as string });
  }

  /* ---------- okuma ---------- */

  server.registerTool(
    'get_today',
    {
      title: 'Bugün',
      description:
        'Bugünün tarihini, bloklarını (saat, durum), hedeflerin bu periyottaki durumunu, en yakın açık cezayı ve onay bekleyen değişiklikleri döner. Tarih hesaplamadan önce bunu çağır.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run('get_today', async () => {
      const t = await getToday(user);
      const pending = await PendingChange.find({
        userId: user.id,
        status: 'pending',
        expiresAt: { $gt: clock.now() },
      })
        .sort({ _id: -1 })
        .limit(5)
        .lean();
      return ok(`Bugün ${t.date} ${dayName(t.date)}. ${t.instances.length} blok var.`, {
        date: t.date,
        day: dayName(t.date),
        blocks: t.instances.map(instanceBrief),
        goals: t.goals.map((g) => ({
          id: g.id,
          name: g.name,
          current: g.current,
          target: g.target,
          unit: g.unit,
          period: g.period,
          status: g.status,
        })),
        nextPenalty: t.pendingPenalty
          ? { id: t.pendingPenalty.id, text: t.pendingPenalty.text, dueAt: t.pendingPenalty.dueAt }
          : null,
        skipsLeft: Math.max(0, t.skip.allowance - t.skip.used),
        pendingChanges: pending.map((p) => ({ id: String(p._id), title: p.preview?.title })),
      });
    }),
  );

  server.registerTool(
    'get_week',
    {
      title: 'Haftalık program',
      description:
        'Bir haftanın 7 gününü ve her günün bloklarını (blockId, saat, başlık, durum) döner. weekStart verilmezse bu hafta; haftanın herhangi bir günü verilebilir.',
      inputSchema: {
        weekStart: localDateSchema.optional().describe('Haftadaki herhangi bir gün (YYYY-AA-GG)'),
      },
      annotations: { readOnlyHint: true },
    },
    run('get_week', async ({ weekStart }: { weekStart?: string | undefined }) => {
      const w = await getWeek(user, weekStart);
      return ok(`${w.weekStart} haftası.`, {
        weekStart: w.weekStart,
        days: w.days.map((d) => ({
          date: d.date,
          day: dayName(d.date),
          blocks: d.instances.map((i) => {
            const { date: _date, ...b } = instanceBrief(i);
            return b;
          }),
        })),
      });
    }),
  );

  server.registerTool(
    'get_stats',
    {
      title: 'İstatistikler',
      description:
        'Tamamlama puanı (yapılan / yapılan+kaçırılan), önceki döneme göre fark, hedef toplamları, seriler ve kategori dağılımı. range: week (bu hafta), 12w (son 12 hafta), year (son 1 yıl).',
      inputSchema: { range: z.enum(STATS_RANGES).optional().describe('Varsayılan week') },
      annotations: { readOnlyHint: true },
    },
    run('get_stats', async ({ range }: { range?: (typeof STATS_RANGES)[number] | undefined }) => {
      const s = await statsOverview(user, range ?? 'week');
      return ok(`${s.from} – ${s.to} puanı: ${s.score ?? 'veri yok'}.`, {
        range: s.range,
        from: s.from,
        to: s.to,
        score: s.score,
        delta: s.delta,
        trend: s.trend,
        totals: s.totals,
        streaks: s.streaks,
        split: s.split,
      });
    }),
  );

  server.registerTool(
    'list_goals',
    {
      title: 'Hedefler',
      description: 'Aktif hedefleri ve içinde bulunulan periyottaki ilerlemelerini döner.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run('list_goals', async () => {
      const goals = await goalSummaries(user, await listGoals(user));
      return ok(`${goals.length} aktif hedef.`, {
        goals: goals.map((g) => ({
          id: g.id,
          name: g.name,
          target: g.target,
          unit: g.unit,
          period: g.period,
          category: g.category,
          current: g.current,
          status: g.status,
          daysLeft: g.daysLeft,
        })),
      });
    }),
  );

  server.registerTool(
    'list_penalties',
    {
      title: 'Cezalar ve kurallar',
      description:
        'Cezaları (varsayılan: açık olanlar) ve ceza kurallarını döner. Kural kimliği update_penalty_rule, ceza kimliği resolve_penalty için gerekir.',
      inputSchema: {
        status: z
          .enum(['open', 'done', 'all'])
          .optional()
          .describe('open: yapılmamış (varsayılan), done: yapılmış, all: hepsi'),
      },
      annotations: { readOnlyHint: true },
    },
    run('list_penalties', async ({ status }: { status?: 'open' | 'done' | 'all' | undefined }) => {
      const s = status ?? 'open';
      const statuses =
        s === 'open' ? [...OPEN_PENALTY_STATUSES] : s === 'done' ? (['done'] as const) : undefined;
      const penalties = (await listPenalties(user, statuses ? [...statuses] : undefined, 30)).map(
        toPenaltyDto,
      );
      const rules = await toRuleDtos(await listRules(user.id));
      return ok(`${penalties.length} ceza, ${rules.length} kural.`, {
        penalties: penalties.map((p) => ({
          id: p.id,
          text: p.text,
          reason: p.reason,
          status: p.status,
          dueAt: p.dueAt,
        })),
        rules: rules.map((r) => ({ id: r.id, sentence: r.sentence, enabled: r.enabled })),
      });
    }),
  );

  server.registerTool(
    'get_journal',
    {
      title: 'Günlük oku',
      description:
        'Günlük kayıtlarını (ruh hâli 0–4, iyi giden, zorlayan, yarın için bir şey) döner. Yalnızca kullanıcı uygulamada "günlüğü okuma" iznini açtıysa çalışır. Varsayılan son 7 gün, en çok 62 gün.',
      inputSchema: {
        from: localDateSchema.optional().describe('Başlangıç günü (dahil)'),
        to: localDateSchema.optional().describe('Bitiş günü (dahil)'),
      },
      annotations: { readOnlyHint: true },
    },
    run(
      'get_journal',
      async ({ from, to }: { from?: string | undefined; to?: string | undefined }) => {
        const perms = mcpPermissionsOf(await getSettings(user.id));
        if (!perms.journalRead) {
          return fail(
            'Günlüğü okuma izni kapalı. Kullanıcı uygulamada Ayarlar → Claude bağlantısı → İzinler bölümünden "Günlüğü okuma"yı açabilir.',
          );
        }
        const end = to ?? journalDefaultDate(user);
        const start = from ?? addDays(end, -6);
        if (start > end)
          throw new AppError(400, 'VALIDATION_ERROR', 'from, to tarihinden sonra olamaz');
        if (addDays(start, 62) <= end)
          throw new AppError(400, 'VALIDATION_ERROR', 'En çok 62 günlük aralık');
        const entries = await JournalEntry.find({
          userId: user.id,
          date: { $gte: start, $lte: end },
        })
          .sort({ date: 1 })
          .lean();
        return ok(`${start} – ${end}: ${entries.length} kayıt.`, {
          entries: entries.map((e) => ({
            date: e.date,
            mood: e.mood,
            wentWell: e.wentWell ?? null,
            hard: e.hard ?? null,
            tomorrowOne: e.tomorrowOne ?? null,
          })),
        });
      },
    ),
  );

  /* ---------- program ---------- */

  server.registerTool(
    'add_block',
    {
      title: 'Blok ekle',
      description:
        'Programa blok ekler. Haftalık tekrar için daysOfWeek, tek seferlik için date ver (ör. "yarın 07:00 30 km bisiklet": date=yarının tarihi, goalName="Bisiklet", goalAmount=30). Kullanıcı izni "onay iste" ise değişiklik onaya düşer.',
      inputSchema: {
        title: z.string().min(1).max(80).describe('Blok adı, ör. "Bisiklet · 30 km"'),
        category: z.enum(CATEGORIES).describe('project, sport, language, reading, other'),
        daysOfWeek: days.optional(),
        date: localDateSchema
          .optional()
          .describe('Tek seferlik blok günü (verilirse daysOfWeek o güne ayarlanır)'),
        startTime: timeOfDaySchema.describe('SS:dd'),
        endTime: timeOfDaySchema.describe('SS:dd, başlangıçtan sonra'),
        repeatWeekly: z
          .boolean()
          .optional()
          .describe('Her hafta tekrar (date verilmezse varsayılan true)'),
        ...goalRef,
        goalAmount: z
          .number()
          .positive()
          .optional()
          .describe('Blok tamamlanınca hedefe sayılacak miktar'),
        reminderMinutes: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .optional()
          .describe('Kaç dk önce hatırlatılsın'),
        description: z.string().max(120).optional(),
        userMessage,
      },
    },
    run('add_block', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const goal = a.goalId || a.goalName ? await resolveGoal(user, a as never) : null;
      const date = a.date as string | undefined;
      if (!date && !a.daysOfWeek)
        throw new AppError(400, 'VALIDATION_ERROR', 'daysOfWeek ya da date gerekli');
      if (date && date < today(user))
        throw new AppError(400, 'VALIDATION_ERROR', 'Geçmiş bir güne blok eklenemez');
      const input = strip({
        title: a.title,
        category: a.category,
        description: a.description,
        daysOfWeek: date ? [isoDayOfWeek(date)] : a.daysOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        repeatWeekly: (a.repeatWeekly as boolean | undefined) ?? !date,
        validFrom: date,
        goalId: goal ? (goal.id as string) : undefined,
        goalAmount: goal ? a.goalAmount : undefined,
        reminderMinutes: a.reminderMinutes,
      });
      blockCreateSchema.parse(input);
      return write('add_block', { input }, a.userMessage);
    }),
  );

  server.registerTool(
    'update_block',
    {
      title: 'Blok değiştir',
      description:
        'Var olan bir bloğu değiştirir (yalnızca verilen alanlar). Değişiklik şu andan itibaren gelecekteki bütün haftalara uygulanır; geçmiş ve tamamlanmış kayıtlar korunur. Kullanıcı izni "onay iste" ise değişiklik onaya düşer.',
      inputSchema: {
        ...blockRef,
        title: z.string().min(1).max(80).optional(),
        category: z.enum(CATEGORIES).optional(),
        daysOfWeek: days.optional(),
        startTime: timeOfDaySchema.optional(),
        endTime: timeOfDaySchema.optional(),
        repeatWeekly: z.boolean().optional(),
        newGoalId: objectIdSchema.optional().describe('Bloğu bu hedefe bağla'),
        newGoalName: z.string().max(60).optional().describe('Bloğu bu adlı hedefe bağla'),
        removeGoal: z.boolean().optional().describe('true: hedef bağını kaldır'),
        goalAmount: z.number().positive().optional().describe('Hedefe sayılacak yeni miktar'),
        reminderMinutes: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .nullable()
          .optional()
          .describe('null: hatırlatma kapalı'),
        description: z.string().max(120).nullable().optional(),
        userMessage,
      },
    },
    run('update_block', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const block = await resolveBlock(user, a as never);
      let goalId: string | null | undefined;
      if (a.removeGoal) goalId = null;
      else if (a.newGoalId || a.newGoalName) {
        goalId = (
          await resolveGoal(user, {
            goalId: a.newGoalId as string,
            goalName: a.newGoalName as string,
          })
        ).id as string;
      }
      const changes = strip({
        title: a.title,
        category: a.category,
        daysOfWeek: a.daysOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        repeatWeekly: a.repeatWeekly,
        goalId,
        goalAmount: a.goalAmount,
        reminderMinutes: a.reminderMinutes,
        description: a.description,
      });
      if (Object.keys(changes).length === 0)
        throw new AppError(400, 'VALIDATION_ERROR', 'Değiştirilecek alan ver');
      blockUpdateSchema.parse(changes);
      return write('update_block', { blockId: block.id as string, changes }, a.userMessage);
    }),
  );

  server.registerTool(
    'delete_block',
    {
      title: 'Blok sil',
      description:
        'Bloğu programdan kaldırır (gelecekteki planlar silinir, geçmiş kayıtlar ve istatistikler kalır). Kullanıcı izni "onay iste" ise (varsayılan) değişiklik onaya düşer.',
      inputSchema: { ...blockRef, userMessage },
    },
    run(
      'delete_block',
      async (a: { blockId?: string; blockName?: string; userMessage?: string }) => {
        const block = await resolveBlock(user, a);
        if (block.archived) throw new AppError(409, 'BLOCK_ARCHIVED', 'Blok zaten silinmiş');
        return write('delete_block', { blockId: block.id as string }, a.userMessage);
      },
    ),
  );

  /* ---------- hedef ve ilerleme ---------- */

  server.registerTool(
    'log_progress',
    {
      title: 'İlerleme gir',
      description:
        'Bir hedefe ilerleme ekler (ör. "bugün 25 km bisiklet yaptım" → goalName="Bisiklet", amount=25). Tarih verilmezse bugün; ileri tarih olmaz.',
      inputSchema: {
        ...goalRef,
        amount: z.number().positive().max(100_000).describe('Hedefin biriminde miktar'),
        date: localDateSchema.optional(),
        note: z.string().max(200).optional(),
        userMessage,
      },
    },
    run('log_progress', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const goal = await resolveGoal(user, a as never);
      const input = strip({
        goalId: goal.id as string,
        amount: a.amount,
        date: a.date,
        note: a.note,
      });
      progressCreateSchema.parse(input);
      return write('log_progress', { input }, a.userMessage);
    }),
  );

  server.registerTool(
    'set_goal',
    {
      title: 'Hedef koy / değiştir',
      description:
        'Hedef ekler ya da değiştirir. goalId verilirse ya da name mevcut bir hedefin adıyla aynıysa o hedef güncellenir; değilse yeni hedef oluşturulur (yeni hedefte target, unit, period zorunlu).',
      inputSchema: {
        goalId: objectIdSchema.optional(),
        name: z.string().min(1).max(60).optional().describe('Hedef adı, ör. "Bisiklet"'),
        target: z.number().positive().max(1_000_000).optional(),
        unit: z.enum(GOAL_UNITS).optional(),
        period: z.enum(GOAL_PERIODS).optional().describe('daily, weekly, monthly'),
        category: z.enum(CATEGORIES).optional(),
        trackStreak: z.boolean().optional(),
        userMessage,
      },
    },
    run('set_goal', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const existing = a.goalId
        ? await resolveGoal(user, { goalId: a.goalId as string })
        : a.name
          ? await findGoalByName(user, a.name as string)
          : null;
      const fields = strip({
        name: a.name,
        target: a.target,
        unit: a.unit,
        period: a.period,
        category: a.category,
        trackStreak: a.trackStreak,
      });
      if (existing) {
        goalUpdateSchema.parse(fields);
        return write('set_goal', { goalId: existing.id as string, input: fields }, a.userMessage);
      }
      goalCreateSchema.parse(fields);
      return write('set_goal', { goalId: null, input: fields }, a.userMessage);
    }),
  );

  /* ---------- cezalar ---------- */

  server.registerTool(
    'add_penalty_rule',
    {
      title: 'Ceza kuralı ekle',
      description:
        'Ceza kuralı ekler: trigger (block_missed: blok kaçarsa, goal_failed: hedef tutmazsa, penalty_postponed: ceza ertelenirse), hedef (targetType: block | goal | category | any), ceza metni ve süre. Kural geriye dönük uygulanmaz. Kullanıcı izni "onay iste" ise (varsayılan) onaya düşer.',
      inputSchema: {
        trigger: z.enum(PENALTY_TRIGGERS),
        targetType: z
          .enum(PENALTY_TARGET_TYPES)
          .describe(
            'block_missed: block|category|any; goal_failed: goal|category|any; penalty_postponed: any',
          ),
        targetId: objectIdSchema.optional().describe('targetType block/goal ise kimlik'),
        targetName: z
          .string()
          .max(80)
          .optional()
          .describe('targetType block/goal ise kimlik yerine ad'),
        category: z.enum(CATEGORIES).optional().describe('targetType category ise'),
        penalty: z.string().min(1).max(80).describe('Ceza, ör. "3 dk soğuk duş"'),
        ...deadlineInput,
        onFail: z
          .enum(PENALTY_ON_FAIL)
          .optional()
          .describe(
            'Süresinde yapılmazsa: double (iki katı, varsayılan), plus_one (bir ceza daha), reset_streak (seri sıfırlanır)',
          ),
        userMessage,
      },
    },
    run('add_penalty_rule', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const targetId =
        (a.targetId as string | undefined) ??
        (await resolveTargetId(user, a.targetType as string, a.targetName as string | undefined));
      const input = strip({
        trigger: a.trigger,
        targetType: a.targetType,
        targetId,
        category: a.category,
        penalty: a.penalty,
        deadline: deadlineOf(a as never),
        onFail: a.onFail,
      });
      return write('add_penalty_rule', { input }, a.userMessage);
    }),
  );

  server.registerTool(
    'update_penalty_rule',
    {
      title: 'Ceza kuralı değiştir',
      description:
        'Ceza kuralını değiştirir ya da kapatır/açar (enabled). Kural kimliği list_penalties çıktısındadır. Kullanıcı izni "onay iste" ise (varsayılan) onaya düşer.',
      inputSchema: {
        ruleId: objectIdSchema,
        trigger: z.enum(PENALTY_TRIGGERS).optional(),
        targetType: z.enum(PENALTY_TARGET_TYPES).optional(),
        targetId: objectIdSchema.optional(),
        targetName: z.string().max(80).optional(),
        category: z.enum(CATEGORIES).optional(),
        penalty: z.string().min(1).max(80).optional(),
        ...deadlineInput,
        onFail: z.enum(PENALTY_ON_FAIL).optional(),
        enabled: z.boolean().optional(),
        userMessage,
      },
    },
    run('update_penalty_rule', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const ruleId = a.ruleId as string;
      const targetId =
        (a.targetId as string | undefined) ??
        (await resolveTargetId(user, a.targetType as string, a.targetName as string | undefined));
      const changes = strip({
        trigger: a.trigger,
        targetType: a.targetType,
        targetId,
        category: a.category,
        penalty: a.penalty,
        deadline: deadlineOf(a as never),
        onFail: a.onFail,
        enabled: a.enabled,
      });
      if (Object.keys(changes).length === 0)
        throw new AppError(400, 'VALIDATION_ERROR', 'Değiştirilecek alan ver');
      penaltyRuleUpdateSchema.parse(changes);
      return write('update_penalty_rule', { ruleId, changes }, a.userMessage);
    }),
  );

  server.registerTool(
    'resolve_penalty',
    {
      title: 'Cezayı kapat / ertele',
      description:
        'Bir cezayı yapıldı işaretler (done) ya da erteler (postpone: ceza iki katına çıkar, süre uzar). Ceza kimliği list_penalties çıktısındadır.',
      inputSchema: { penaltyId: objectIdSchema, action: z.enum(['done', 'postpone']), userMessage },
    },
    run(
      'resolve_penalty',
      async (a: { penaltyId: string; action: 'done' | 'postpone'; userMessage?: string }) =>
        write('resolve_penalty', { penaltyId: a.penaltyId, action: a.action }, a.userMessage),
    ),
  );

  /* ---------- günlük ---------- */

  server.registerTool(
    'write_journal',
    {
      title: 'Günlük yaz',
      description:
        "Günlük kaydı yazar ya da günceller (yalnızca verilen alanlar değişir). mood: 0 çok kötü … 4 çok iyi; ilk kayıtta zorunlu. Tarih verilmezse günlüğün bugünü (gece 04:00'e kadar önceki gün).",
      inputSchema: {
        date: localDateSchema.optional(),
        mood: z.number().int().min(0).max(4).optional(),
        wentWell: z.string().max(1000).optional().describe('İyi giden'),
        hard: z.string().max(1000).optional().describe('Zorlayan'),
        tomorrowOne: z.string().max(1000).optional().describe('Yarın için tek şey'),
        userMessage,
      },
    },
    run('write_journal', async (a: Record<string, unknown> & { userMessage?: string }) => {
      const date = (a.date as string | undefined) ?? journalDefaultDate(user);
      const existing = await JournalEntry.findOne({ userId: user.id, date }).lean();
      const mood = (a.mood as number | undefined) ?? existing?.mood;
      if (mood === undefined) {
        throw new AppError(400, 'VALIDATION_ERROR', 'İlk kayıtta ruh hâli (mood 0–4) gerekli');
      }
      const input = {
        mood,
        wentWell: (a.wentWell as string | undefined) ?? existing?.wentWell ?? null,
        hard: (a.hard as string | undefined) ?? existing?.hard ?? null,
        tomorrowOne: (a.tomorrowOne as string | undefined) ?? existing?.tomorrowOne ?? null,
      };
      journalPutSchema.parse(input);
      return write('write_journal', { date, input }, a.userMessage);
    }),
  );

  /* ---------- geri alma ---------- */

  server.registerTool(
    'undo_last_change',
    {
      title: 'Son değişikliği geri al',
      description:
        "Claude'un yaptığı son değişikliği (ya da auditId verilen değişikliği) geri alır. Kayıt sonradan uygulamada değiştiyse geri alınamaz.",
      inputSchema: { auditId: objectIdSchema.optional() },
      annotations: { destructiveHint: true },
    },
    run('undo_last_change', async ({ auditId }: { auditId?: string | undefined }) => {
      const entry = await undoLastMcpChange(user, auditId);
      return ok(`Geri alındı: ${entry.summary}`, { auditId: entry.id as string });
    }),
  );

  return server;
}
