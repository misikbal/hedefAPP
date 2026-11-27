import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_TOOLS, mcpStatusSchema, pendingChangeSchema, auditListSchema } from '@takip/shared';
import { maskUrl } from '../src/app.js';
import {
  AuditLog,
  Block,
  BlockInstance,
  JournalEntry,
  Notification,
  PendingChange,
  Settings,
} from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { createGoal } from '../src/services/goals.js';
import { getSettings } from '../src/services/users.js';
import type { UserContext } from '../src/services/users.js';
import {
  TEST_CONFIG,
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  startDb,
  stopDb,
} from './helpers.js';

const SECRET = TEST_CONFIG.MCP_SECRET;

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

describe('Claude (MCP)', () => {
  let app: FastifyInstance;
  let base: string;
  let user: UserContext;
  let token: string;
  let client: Client;

  beforeAll(async () => {
    await startDb();
    app = await makeApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('adres yok');
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(async () => {
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    resetClock();
    await resetDb();
    user = await createUser();
    token = await loginToken(app);
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/api/v1/mcp/${SECRET}`)),
    );
  });

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const setPerm = (perm: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: '/api/v1/settings',
      headers: auth(),
      payload: { mcpPermissions: perm },
    });

  it('yanlış anahtar 404 (ortak hata biçimi), GET 405', async () => {
    const wrong = await fetch(`${base}/api/v1/mcp/${'x'.repeat(40)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(wrong.status).toBe(404);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    const short = await fetch(`${base}/api/v1/mcp/kisa`, { method: 'POST' });
    expect(short.status).toBe(404);
    const get = await fetch(`${base}/api/v1/mcp/${SECRET}`);
    expect(get.status).toBe(405);
  });

  it('initialize + tools/list: bütün araçlar', async () => {
    expect(client.getServerVersion()?.name).toBe('takip');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    const add = tools.find((t) => t.name === 'add_block')!;
    expect(add.description).toContain('blok');
    expect(add.inputSchema.required).toEqual(expect.arrayContaining(['title', 'startTime']));
  });

  it('add_block (auto): blok oluşur, audit yazılır, bildirim gider; get_today lastClaudeChange', async () => {
    await createGoal(user, { name: 'Bisiklet', target: 150, unit: 'km', period: 'weekly' });
    const res = await call('add_block', {
      title: 'Bisiklet',
      category: 'sport',
      daysOfWeek: [2, 4],
      startTime: '07:00',
      endTime: '08:00',
      goalName: 'bisiklet',
      goalAmount: 30,
      userMessage: 'salı ve perşembe 7de bisiklet ekle',
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.text).toContain('Blok eklendi');
    const block = await Block.findOne({ title: 'Bisiklet' }).orFail();
    expect(block.goalAmount).toBe(30);
    const audit = await AuditLog.findOne({ tool: 'add_block' }).orFail();
    expect(audit.actor).toBe('mcp');
    expect(audit.before).toBeNull();
    expect(String(audit.entityId)).toBe(block.id);
    const n = await Notification.findOne({ kind: 'claude_change' }).orFail();
    expect(n.type).toBe('claude');
    expect(n.deepLink).toBe('/claude');

    const today = await app.inject({ method: 'GET', url: '/api/v1/today', headers: auth() });
    expect(today.json().lastClaudeChange.summary).toContain('Bisiklet');
    expect(today.json().lastClaudeChange.canUndo).toBe(true);

    const status = await app.inject({ method: 'GET', url: '/api/v1/mcp-status', headers: auth() });
    const s = mcpStatusSchema.parse(status.json());
    expect(s.enabled).toBe(true);
    expect(s.endpointPath).toBe(`/mcp/${SECRET}`);
    expect(s.lastTool).toBe('add_block');
    expect(s.lastAccessAt).not.toBeNull();
    expect(s.tools).toHaveLength(MCP_TOOLS.length);
    expect(s.permissions).toEqual({
      blockWrite: 'auto',
      blockDelete: 'approve',
      penaltyRuleWrite: 'approve',
      journalRead: false,
      journalRawNote: true,
    });
  });

  it('geçersiz girdi araç hatası olarak döner', async () => {
    const res = await call('add_block', {
      title: 'X',
      category: 'sport',
      daysOfWeek: [1],
      startTime: '09:00',
      endTime: '08:00',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Bitiş');
    const missing = await call('log_progress', { goalName: 'yok', amount: 3 });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain('bulunamadı');
  });

  it('delete_block (approve): uygulanmaz → pending → onayla → silinir', async () => {
    const block = await createBlock(user, {
      title: 'Almanca',
      category: 'language',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startTime: '23:00',
      endTime: '23:30',
    });
    const res = await call('delete_block', { blockName: 'almanca', userMessage: 'almancayı sil' });
    expect(res.content[0]!.text).toContain('Değişiklik kullanıcı onayı bekliyor (id: ');
    expect((await Block.findById(block._id))!.archived).toBe(false);
    const pc = await PendingChange.findOne().orFail();
    const n = await Notification.findOne({ kind: 'claude_pending' }).orFail();
    expect(n.deepLink).toBe(`/claude/pending/${pc.id as string}`);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/pending-changes?status=pending',
      headers: auth(),
    });
    const item = pendingChangeSchema.parse(list.json().items[0]);
    expect(item.preview.destructive).toBe(true);
    expect(item.preview.title).toBe('Almanca bloğunu sil');
    expect(item.userMessage).toBe('almancayı sil');

    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/pending-changes/${pc.id as string}/approve`,
      headers: auth(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('approved');
    expect(ok.json().resultMessage).toContain('Blok silindi');
    expect((await Block.findById(block._id))!.archived).toBe(true);
    expect(await AuditLog.countDocuments({ tool: 'delete_block' })).toBe(1);

    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/pending-changes/${pc.id as string}/approve`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(409);
  });

  it('reddet: uygulanmaz; süresi geçen onaylanamaz ve listede bekleyen görünmez', async () => {
    await createBlock(user, {
      title: 'Kitap',
      category: 'reading',
      daysOfWeek: [1],
      startTime: '21:00',
      endTime: '22:00',
    });
    await call('delete_block', { blockName: 'Kitap' });
    const pc = await PendingChange.findOne().orFail();
    const rej = await app.inject({
      method: 'POST',
      url: `/api/v1/pending-changes/${pc.id as string}/reject`,
      headers: auth(),
    });
    expect(rej.json().status).toBe('rejected');
    expect((await Block.findOne({ title: 'Kitap' }))!.archived).toBe(false);

    await call('delete_block', { blockName: 'Kitap' });
    const pc2 = await PendingChange.findOne({ status: 'pending' }).orFail();
    // 24 saat geçmiş gibi: kaydın süresini geriye al (token süresi bozulmasın)
    await PendingChange.updateOne({ _id: pc2._id }, { expiresAt: new Date(Date.now() - 1000) });
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/pending-changes?status=pending',
      headers: auth(),
    });
    expect(list.json().items).toHaveLength(0);
    const status = await app.inject({ method: 'GET', url: '/api/v1/mcp-status', headers: auth() });
    expect(status.json().pendingCount).toBe(0);
    const ap = await app.inject({
      method: 'POST',
      url: `/api/v1/pending-changes/${pc2.id as string}/approve`,
      headers: auth(),
    });
    expect(ap.statusCode).toBe(409);
    expect(ap.json().error.code).toBe('PENDING_CHANGE_EXPIRED');
  });

  it('update_block → geri al → yinele; uygulamadan değişince geri alma kapanır', async () => {
    const goal = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
    });
    const block = await createBlock(user, {
      title: 'Cumartesi bisikleti',
      category: 'sport',
      daysOfWeek: [6],
      startTime: '09:00',
      endTime: '11:00',
      goalId: goal.id as string,
      goalAmount: 40,
    });
    const res = await call('update_block', { blockName: 'cumartesi', goalAmount: 60 });
    expect(res.isError).toBeFalsy();
    const audit = await AuditLog.findOne({ tool: 'update_block' }).orFail();
    expect(audit.summary).toContain('40 → 60 km');
    expect((await Block.findById(block._id))!.goalAmount).toBe(60);

    const undo = await app.inject({
      method: 'POST',
      url: `/api/v1/audit/${audit.id as string}/undo`,
      headers: auth(),
    });
    expect(undo.statusCode).toBe(200);
    expect(undo.json()).toMatchObject({ canUndo: false, canRedo: true });
    expect(undo.json().undoneAt).not.toBeNull();
    expect((await Block.findById(block._id))!.goalAmount).toBe(40);

    const redo = await app.inject({
      method: 'POST',
      url: `/api/v1/audit/${audit.id as string}/redo`,
      headers: auth(),
    });
    expect(redo.json()).toMatchObject({ canUndo: true, canRedo: false, undoneAt: null });
    expect((await Block.findById(block._id))!.goalAmount).toBe(60);

    // Uygulamadan değişiklik → geri alma kapalı
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/blocks/${block.id as string}`,
      headers: auth(),
      payload: { goalAmount: 50 },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?actor=mcp',
      headers: auth(),
    });
    const [entry] = auditListSchema.parse(list.json()).items;
    expect(entry!.canUndo).toBe(false);
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/audit/${audit.id as string}/undo`,
      headers: auth(),
    });
    expect(blocked.statusCode).toBe(409);
  });

  it('add_block geri alınınca blok ve planları kalkar; undo_last_change aracı', async () => {
    await call('add_block', {
      title: 'Yüzme',
      category: 'sport',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startTime: '23:00',
      endTime: '23:45',
    });
    const block = await Block.findOne({ title: 'Yüzme' }).orFail();
    const res = await call('undo_last_change');
    expect(res.content[0]!.text).toContain('Geri alındı');
    expect(await Block.findById(block._id)).toBeNull();
    expect(await BlockInstance.countDocuments({ blockId: block._id })).toBe(0);
    const none = await call('undo_last_change');
    expect(none.isError).toBe(true);
  });

  it('add_block izin approve ise onaya düşer; log_progress ve write_journal doğrudan', async () => {
    await setPerm({ blockWrite: 'approve' });
    const res = await call('add_block', {
      title: 'Koşu',
      category: 'sport',
      date: '2099-01-05',
      startTime: '07:00',
      endTime: '08:00',
    });
    expect(res.content[0]!.text).toContain('onayı bekliyor');
    expect(await Block.countDocuments()).toBe(0);

    await createGoal(user, { name: 'Kitap', target: 20, unit: 'sayfa', period: 'daily' });
    const p = await call('log_progress', { goalName: 'Kitap', amount: 12 });
    expect(p.content[0]!.text).toContain('12 sayfa');
    const j = await call('write_journal', { mood: 3, wentWell: 'Erken kalktım' });
    expect(j.isError).toBeFalsy();
    const j2 = await call('write_journal', { hard: 'Toplantılar' });
    expect(j2.isError).toBeFalsy();
  });

  it('get_journal izin kapalıyken hata, açınca okur', async () => {
    await call('write_journal', { mood: 2, wentWell: 'iyi' });
    const closed = await call('get_journal');
    expect(closed.isError).toBe(true);
    expect(closed.content[0]!.text).toContain('izni kapalı');
    await setPerm({ journalRead: true });
    const open = await call('get_journal');
    expect(open.isError).toBeFalsy();
    expect(open.content[0]!.text).toContain('iyi');
    const settings = await getSettings(user.id);
    expect(settings.mcpPermissions?.journalRead).toBe(true);
  });

  it('write_journal yeni alanlar: kaynak claude, rawNote ayarı, insights izinli', async () => {
    const w = await call('write_journal', {
      mood: 3,
      energy: 1,
      tags: ['Kod', 'Bahçe'],
      summary: 'Kod tamam, öğleden sonra yoruldum.',
      rawNote: 'Bugün kod iyi gitti ama yoruldum',
    });
    expect(w.isError).toBeFalsy();
    let entry = await JournalEntry.findOne({ userId: user.id }).lean();
    expect(entry).toMatchObject({
      source: 'claude',
      energy: 1,
      tags: ['kod', 'other:bahçe'],
      rawNote: 'Bugün kod iyi gitti ama yoruldum',
    });
    expect(entry!.daySnapshot).toBeTruthy();
    // kısmi güncelleme: etiketler ve enerji kalır
    await call('write_journal', { hard: 'Almanca kaçtı' });
    entry = await JournalEntry.findOne({ userId: user.id }).lean();
    expect(entry).toMatchObject({ energy: 1, tags: ['kod', 'other:bahçe'], hard: 'Almanca kaçtı' });

    await setPerm({ journalRawNote: false });
    await call('write_journal', { rawNote: 'saklanmamalı' });
    entry = await JournalEntry.findOne({ userId: user.id }).lean();
    expect(entry!.rawNote).toBe('Bugün kod iyi gitti ama yoruldum');

    const closed = await call('get_journal_insights');
    expect(closed.isError).toBe(true);
    await setPerm({ journalRead: true });
    const open = await call('get_journal_insights', { range: 'week' });
    expect(open.isError).toBeFalsy();
    expect(open.content[0]!.text).toContain('"moodAvg":3');
  });

  it('okuma araçları çalışır', async () => {
    await createGoal(user, { name: 'Bisiklet', target: 150, unit: 'km', period: 'weekly' });
    for (const name of ['get_today', 'get_week', 'get_stats', 'list_goals', 'list_penalties']) {
      const r = await call(name);
      expect(r.isError, name).toBeFalsy();
    }
    const goal = await call('set_goal', { name: 'Bisiklet', target: 180 });
    expect(goal.content[0]!.text).toContain('180');
    const rule = await call('add_penalty_rule', {
      trigger: 'block_missed',
      targetType: 'any',
      penalty: '3 dk soğuk duş',
    });
    expect(rule.content[0]!.text).toContain('onayı bekliyor');
  });

  it('MCP kullanıcısı yoksa anlamlı hata', async () => {
    await resetDb();
    const res = await fetch(`${base}/api/v1/mcp/${SECRET}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('MCP_NO_USER');
    await Settings.deleteMany({});
  });
});

describe('log maskesi', () => {
  it('gizli anahtar hem kökte hem /api/v1 altında maskelenir', () => {
    expect(maskUrl(`/api/v1/mcp/${SECRET}`)).toBe('/api/v1/mcp/***');
    expect(maskUrl(`/mcp/${SECRET}?x=1`)).toBe('/mcp/***?x=1');
    expect(maskUrl('/api/v1/today')).toBe('/api/v1/today');
  });
});
