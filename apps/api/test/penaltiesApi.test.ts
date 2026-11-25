import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  blockSchema,
  penaltyRuleSchema,
  penaltySchema,
  statsOverviewSchema,
  todayResponseSchema,
  weekResponseSchema,
} from '@takip/shared';
import { Block, BlockInstance, Goal } from '../src/db/models/index.js';
import { runPenaltyEngine } from '../src/services/penaltyEngine.js';
import {
  createUser,
  loginToken,
  makeApp,
  resetClock,
  resetDb,
  setNow,
  startDb,
  stopDb,
} from './helpers.js';

describe('ceza REST API', () => {
  let app: FastifyInstance;
  let token: string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: auth(), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    await startDb();
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
    await stopDb();
  });
  beforeEach(async () => {
    await resetDb();
    await createUser();
    token = await loginToken(app);
    setNow('2026-11-23T03:00:00Z'); // Pzt 06:00 yerel
  });
  afterEach(resetClock);

  const sportRule = {
    trigger: 'block_missed',
    targetType: 'category',
    category: 'sport',
    penalty: '3 dk soğuk duş',
  };
  const bike = {
    title: 'Bisiklet · 25 km',
    category: 'sport',
    daysOfWeek: [1],
    startTime: '07:00',
    endTime: '08:00',
  };

  it('kural CRUD: cümleler Türkçe üretilir, PATCH tutarlılığı korur, DELETE bağları kaldırır', async () => {
    const created = await call('POST', '/penalty-rules', sportRule);
    expect(created.statusCode).toBe(201);
    const rule = penaltyRuleSchema.parse(created.json());
    expect(rule).toMatchObject({
      when: 'Spor bloğu kaçarsa',
      then: '3 dk soğuk duş · 24 saat içinde',
      sentence: 'Spor bloğu kaçarsa → 24 saat içinde 3 dk soğuk duş. Yapmazsan iki katı.',
      deadline: { type: 'hours', hours: 24 },
      onFail: 'double',
      enabled: true,
    });

    const block = blockSchema.parse(
      (await call('POST', '/blocks', { ...bike, penaltyRuleId: rule.id })).json(),
    );
    expect(block.penaltyRuleId).toBe(rule.id);

    const toBlock = await call('PATCH', `/penalty-rules/${rule.id}`, {
      targetType: 'block',
      targetId: block.id,
    });
    expect(toBlock.json()).toMatchObject({ when: 'Bisiklet bloğu kaçarsa', category: null });

    const bad = await call('PATCH', `/penalty-rules/${rule.id}`, { targetType: 'goal' });
    expect(bad.statusCode).toBe(400);

    const off = await call('PATCH', `/penalty-rules/${rule.id}`, {
      enabled: false,
      deadline: { type: 'end_of_week' },
    });
    expect(off.json()).toMatchObject({
      enabled: false,
      then: '3 dk soğuk duş · hafta sonuna kadar',
    });

    const list = z.array(penaltyRuleSchema).parse((await call('GET', '/penalty-rules')).json());
    expect(list).toHaveLength(1);

    expect((await call('DELETE', `/penalty-rules/${rule.id}`)).statusCode).toBe(200);
    expect((await call('GET', '/penalty-rules')).json()).toEqual([]);
    expect((await Block.findById(block.id))!.penaltyRuleId).toBeNull();
  });

  it('hedef kuralı: hedefin adı, periyodu ve miktarıyla anılır', async () => {
    const goal = (
      await call('POST', '/goals', { name: 'Kitap', target: 20, unit: 'sayfa', period: 'daily' })
    ).json() as { id: string };
    const res = await call('POST', '/penalty-rules', {
      trigger: 'goal_failed',
      targetType: 'goal',
      targetId: goal.id,
      penalty: 'Ertesi gün +10 sayfa',
      onFail: 'plus_one',
    });
    expect(res.json()).toMatchObject({
      when: 'Kitap günlük 20 sayfa tutmazsa',
      sentence:
        'Kitap günlük 20 sayfa tutmazsa → 24 saat içinde Ertesi gün +10 sayfa. Yapmazsan +1 ceza.',
    });
  });

  it('kural doğrulaması: başkasının/olmayan hedefi ve yanlış tetikleyici reddedilir', async () => {
    const missing = await call('POST', '/penalty-rules', {
      trigger: 'block_missed',
      targetType: 'block',
      targetId: 'a'.repeat(24),
      penalty: 'x',
    });
    expect(missing.json().error.code).toBe('BLOCK_NOT_FOUND');

    const goalRule = (
      await call('POST', '/penalty-rules', {
        trigger: 'goal_failed',
        targetType: 'any',
        penalty: 'x',
      })
    ).json() as { id: string };
    const res = await call('POST', '/blocks', { ...bike, penaltyRuleId: goalRule.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('PENALTY_RULE_MISMATCH');
  });

  it('bugün, hafta ve ceza uçları birlikte çalışır', async () => {
    await call('POST', '/penalty-rules', sportRule);
    await call('POST', '/blocks', bike);

    // "kaçarsa:" etiketi
    const week = weekResponseSchema.parse((await call('GET', '/week')).json());
    expect(week.days[0]!.instances[0]!.penalty).toBe('3 dk soğuk duş');
    let today = todayResponseSchema.parse((await call('GET', '/today')).json());
    expect(today.pendingPenalty).toBeNull();

    setNow('2026-11-23T05:31:00Z');
    await runPenaltyEngine(new Date('2026-11-23T05:31:00Z'));

    today = todayResponseSchema.parse((await call('GET', '/today')).json());
    expect(today.instances[0]!.status).toBe('missed');
    expect(today.pendingPenalty).toMatchObject({
      text: '3 dk soğuk duş',
      reason: 'Pazartesi 07:00 Bisiklet bloğu yapılmadı',
      consequence: '24 saat içinde yapılmazsa iki katına çıkar.',
      status: 'pending',
      dueAt: '2026-11-24T05:31:00.000Z',
    });
    const id = today.pendingPenalty!.id;

    const open = z.array(penaltySchema).parse((await call('GET', '/penalties?status=open')).json());
    expect(open.map((p) => p.id)).toEqual([id]);
    expect((await call('GET', '/penalties?status=bogus')).statusCode).toBe(400);

    const postponed = penaltySchema.parse((await call('POST', `/penalties/${id}/postpone`)).json());
    expect(postponed).toMatchObject({ status: 'postponed', multiplier: 2, text: '6 dk soğuk duş' });

    const done = penaltySchema.parse((await call('POST', `/penalties/${id}/done`)).json());
    expect(done.status).toBe('done');
    expect(done.resolvedAt).toBe('2026-11-23T05:31:00.000Z');
    expect((await call('POST', `/penalties/${id}/postpone`)).statusCode).toBe(409);

    const history = (await call('GET', '/penalties?status=done')).json() as unknown[];
    expect(history).toHaveLength(1);
    today = todayResponseSchema.parse((await call('GET', '/today')).json());
    expect(today.pendingPenalty).toBeNull();

    expect((await call('POST', `/penalties/${'b'.repeat(24)}/done`)).statusCode).toBe(404);
  });

  it('istatistik: motor çalışmadan önce bitişten 30 dk geçmemiş planned kayıt kaçırılmış sayılmaz', async () => {
    await call('POST', '/blocks', bike);
    setNow('2026-11-23T05:20:00Z'); // bitişten 20 dk sonra
    let stats = statsOverviewSchema.parse((await call('GET', '/stats/overview?range=week')).json());
    expect(stats.score).toBeNull();
    setNow('2026-11-23T05:31:00Z');
    stats = statsOverviewSchema.parse((await call('GET', '/stats/overview?range=week')).json());
    expect(stats.score).toBe(0);
    expect(await BlockInstance.countDocuments({ status: 'missed' })).toBe(0);
    expect(await Goal.countDocuments()).toBe(0);
  });
});
