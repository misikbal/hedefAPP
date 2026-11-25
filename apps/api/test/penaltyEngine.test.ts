import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PenaltyRuleCreate } from '@takip/shared';
import { BlockInstance, Goal, Penalty, ProgressLog } from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { createGoal } from '../src/services/goals.js';
import { markDone, skip } from '../src/services/instances.js';
import { notify, type NotifyEvent } from '../src/services/notify.js';
import { markPenaltyDone, postponePenalty } from '../src/services/penalties.js';
import { runPenaltyEngine } from '../src/services/penaltyEngine.js';
import { createRule, updateRule } from '../src/services/penaltyRules.js';
import { goalStreak } from '../src/services/stats.js';
import type { UserContext } from '../src/services/users.js';
import { createUser, resetClock, resetDb, setNow, startDb, stopDb } from './helpers.js';

// 2026-11-23 Pazartesi. İstanbul = UTC+3 (yaz saati yok).
const run = (iso: string) => {
  setNow(iso);
  return runPenaltyEngine(new Date(iso));
};

const bike = {
  title: 'Bisiklet · 25 km',
  category: 'sport' as const,
  daysOfWeek: [1],
  startTime: '07:00', // 04:00Z
  endTime: '08:00', // 05:00Z
};

const coldShower: PenaltyRuleCreate = {
  trigger: 'block_missed',
  targetType: 'category',
  category: 'sport',
  penalty: '3 dk soğuk duş',
};

describe('ceza motoru', () => {
  let user: UserContext;
  let events: NotifyEvent[];

  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    events = [];
    notify.handler = async (_u, e) => {
      events.push(e);
    };
    setNow('2026-11-23T03:00:00Z'); // Pzt 06:00 yerel
  });
  afterEach(() => {
    resetClock();
    notify.handler = async () => {};
  });

  describe('kaçırılan blok', () => {
    it('bitişten 29 dakika sonra ceza yok, 31 dakika sonra var', async () => {
      await createRule(user, coldShower);
      const block = await createBlock(user, bike);

      expect(await run('2026-11-23T05:29:00Z')).toMatchObject({ missed: 0, created: 0 });
      expect(await Penalty.countDocuments()).toBe(0);

      expect(await run('2026-11-23T05:31:00Z')).toMatchObject({ missed: 1, created: 1 });
      const inst = await BlockInstance.findOne({ blockId: block._id, date: '2026-11-23' });
      expect(inst!.status).toBe('missed');
      const [p] = await Penalty.find();
      expect(p).toMatchObject({
        status: 'pending',
        multiplier: 1,
        penalty: '3 dk soğuk duş',
        reason: 'Pazartesi 07:00 Bisiklet bloğu yapılmadı',
      });
      expect(p!.sourceRef).toMatchObject({ type: 'instance', id: inst!.id });
      expect(p!.dueAt.toISOString()).toBe('2026-11-24T05:31:00.000Z'); // +24 saat
      expect(events.map((e) => e.type)).toEqual(['penalty_created']);
    });

    it('atlanan blok için ceza yok', async () => {
      await createRule(user, coldShower);
      const block = await createBlock(user, bike);
      const inst = await BlockInstance.findOne({ blockId: block._id }).orFail();
      await skip(user, inst.id as string);
      expect(await run('2026-11-23T06:00:00Z')).toMatchObject({ missed: 0, created: 0 });
      expect((await BlockInstance.findById(inst._id))!.status).toBe('skipped');
    });

    it('tamamlanan blok için ceza yok', async () => {
      await createRule(user, coldShower);
      const block = await createBlock(user, bike);
      const inst = await BlockInstance.findOne({ blockId: block._id }).orFail();
      setNow('2026-11-23T05:10:00Z');
      await markDone(user, inst.id as string);
      expect(await run('2026-11-23T06:00:00Z')).toMatchObject({ missed: 0, created: 0 });
    });

    it('motor iki kez çalışınca tek ceza oluşur', async () => {
      await createRule(user, coldShower);
      await createBlock(user, bike);
      await run('2026-11-23T05:31:00Z');
      await run('2026-11-23T05:31:00Z');
      await run('2026-11-23T05:46:00Z');
      expect(await Penalty.countDocuments()).toBe(1);
      // Durum sonradan geri çevrilse bile (yarıda kalan çalışma) unique index ikinci cezayı engeller.
      await BlockInstance.updateMany({}, { status: 'planned' });
      expect(await run('2026-11-23T06:01:00Z')).toMatchObject({ missed: 1, created: 0 });
      expect(await Penalty.countDocuments()).toBe(1);
    });

    it('kapalı kural ceza üretmez; yalnızca uyan kurallar uygulanır', async () => {
      const rule = await createRule(user, coldShower);
      await updateRule(user, rule.id as string, { enabled: false });
      await createRule(user, { ...coldShower, category: 'language' });
      await createBlock(user, bike);
      expect(await run('2026-11-23T06:00:00Z')).toMatchObject({ missed: 1, created: 0 });
    });

    it('bloğa doğrudan bağlı kural da uygulanır; her kural ayrı ceza üretir', async () => {
      // Dil kategorisi kuralı spor bloğuna kendiliğinden uymaz; doğrudan bağlanınca uyar.
      const direct = await createRule(user, {
        trigger: 'block_missed',
        targetType: 'category',
        category: 'language',
        penalty: '50 şınav',
      });
      await createRule(user, coldShower);
      await createBlock(user, { ...bike, penaltyRuleId: direct.id as string });
      expect(await run('2026-11-23T06:00:00Z')).toMatchObject({ created: 2 });
    });

    it('kural, blok kaçırıldıktan sonra eklendiyse geriye dönük ceza yok', async () => {
      await createBlock(user, bike);
      setNow('2026-11-23T05:45:00Z'); // blok 05:30Z'de kaçırılmış sayıldı
      await createRule(user, coldShower);
      expect(await run('2026-11-23T06:00:00Z')).toMatchObject({ missed: 1, created: 0 });
    });

    it('kaçırılan blok sonradan yapıldı işaretlenirse ceza kalır', async () => {
      await createRule(user, coldShower);
      const block = await createBlock(user, bike);
      await run('2026-11-23T06:00:00Z');
      const inst = await BlockInstance.findOne({ blockId: block._id }).orFail();
      await markDone(user, inst.id as string);
      expect((await BlockInstance.findById(inst._id))!.status).toBe('done');
      expect(await Penalty.countDocuments({ status: 'pending' })).toBe(1);
    });

    it('gece yarısı sınırı: 23:00–23:45 bloğu ertesi gün 00:15’te kaçmış sayılır', async () => {
      await createRule(user, coldShower);
      await createBlock(user, { ...bike, startTime: '23:00', endTime: '23:45' });
      // Pzt 23:45 yerel = 20:45Z; +30 dk = Salı 00:15 yerel = 21:15Z
      expect(await run('2026-11-23T21:14:00Z')).toMatchObject({ missed: 0 });
      expect(await run('2026-11-23T21:16:00Z')).toMatchObject({ missed: 1, created: 1 });
      const [p] = await Penalty.find();
      expect(p!.reason).toBe('Pazartesi 23:00 Bisiklet bloğu yapılmadı');
    });

    it('saat dilimi: yerel 01:00 bloğu UTC’de önceki güne düşse de doğru günle anılır', async () => {
      setNow('2026-11-23T20:00:00Z'); // Pzt 23:00 yerel
      await createRule(user, coldShower);
      // Salı 01:00–01:30 yerel = Pzt 22:00–22:30Z
      await createBlock(user, { ...bike, daysOfWeek: [2], startTime: '01:00', endTime: '01:30' });
      expect(await run('2026-11-23T23:01:00Z')).toMatchObject({ missed: 1, created: 1 });
      const [p] = await Penalty.find();
      expect(p!.reason).toBe('Salı 01:00 Bisiklet bloğu yapılmadı');
    });
  });

  describe('hedef periyot kapanışı', () => {
    const books = {
      name: 'Kitap',
      target: 20,
      unit: 'sayfa' as const,
      period: 'daily' as const,
      category: 'reading' as const,
    };

    it('günlük hedef yerel 00:05’te kapanır (UTC 21:05)', async () => {
      const goal = await createGoal(user, { ...books, startDate: '2026-11-23' });
      await createRule(user, {
        trigger: 'goal_failed',
        targetType: 'goal',
        targetId: goal.id as string,
        penalty: 'Ertesi gün +10 sayfa',
      });
      await ProgressLog.create({
        userId: user.id,
        goalId: goal._id,
        amount: 12,
        date: '2026-11-23',
      });

      expect(await run('2026-11-23T21:04:00Z')).toMatchObject({ created: 0 });
      expect(await run('2026-11-23T21:06:00Z')).toMatchObject({ created: 1 });
      const [p] = await Penalty.find();
      expect(p!.sourceRef).toMatchObject({ type: 'goal_period', id: `${goal.id}:2026-11-23` });
      expect(p!.reason).toBe('23 Kasım Kitap hedefi tutmadı (12/20 sayfa)');
      expect(String(p!.goalId)).toBe(goal.id);

      // Tekrar çalışınca aynı periyot yeniden cezalandırılmaz.
      expect(await run('2026-11-23T21:21:00Z')).toMatchObject({ created: 0 });
    });

    it('hedef tutulduysa ceza yok', async () => {
      const goal = await createGoal(user, { ...books, startDate: '2026-11-23' });
      await createRule(user, { trigger: 'goal_failed', targetType: 'any', penalty: '50 şınav' });
      await ProgressLog.create({
        userId: user.id,
        goalId: goal._id,
        amount: 20,
        date: '2026-11-23',
      });
      expect(await run('2026-11-23T21:10:00Z')).toMatchObject({ created: 0 });
    });

    it('haftalık hedef pazartesi 00:05’te kapanır; eksik ilk hafta ve kural öncesi kapanışlar sayılmaz', async () => {
      setNow('2026-11-10T09:00:00Z'); // Salı
      const goal = await createGoal(user, {
        name: 'Almanca',
        target: 75,
        unit: 'kelime',
        period: 'weekly',
        category: 'language',
        startDate: '2026-11-11', // Çarşamba: 9–15 Kasım haftası eksik, değerlendirilmez
      });
      await createRule(user, { trigger: 'goal_failed', targetType: 'any', penalty: '50 şınav' });
      await ProgressLog.create({
        userId: user.id,
        goalId: goal._id,
        amount: 65,
        date: '2026-11-18',
      });

      // 16–22 Kasım haftası Pzt 23 Kasım 00:05 yerel = 22 Kasım 21:05Z'de kapanır.
      expect(await run('2026-11-22T21:04:00Z')).toMatchObject({ created: 0 });
      expect(await run('2026-11-22T21:06:00Z')).toMatchObject({ created: 1 });
      const [p] = await Penalty.find();
      expect(p!.sourceRef.id).toBe(`${goal.id}:2026-11-16`);
      expect(p!.reason).toBe('Hafta 47 Almanca hedefi tutmadı (65/75 kelime)');

      // Hafta kapandıktan sonra eklenen kural o haftayı geriye dönük cezalandırmaz.
      setNow('2026-11-23T09:00:00Z');
      await createRule(user, {
        trigger: 'goal_failed',
        targetType: 'category',
        category: 'language',
        penalty: '1 gün sosyal medya yok',
      });
      expect(await run('2026-11-23T09:15:00Z')).toMatchObject({ created: 0 });
    });
  });

  describe('yükseltme', () => {
    async function missedPenalty(rule: Partial<PenaltyRuleCreate> = {}) {
      await createRule(user, { ...coldShower, ...rule });
      await createBlock(user, bike);
      await run('2026-11-23T05:31:00Z'); // dueAt = 24 Kasım 05:31Z
      return Penalty.findOne().orFail();
    }

    it('double: süre geçince çarpan ikiye katlanır ve yeni süre verilir; bir kez', async () => {
      await missedPenalty();
      expect(await run('2026-11-24T05:30:00Z')).toMatchObject({ escalated: 0 });
      expect(await run('2026-11-24T05:32:00Z')).toMatchObject({ escalated: 1 });
      expect(await run('2026-11-24T05:32:00Z')).toMatchObject({ escalated: 0 });
      const p = await Penalty.findOne().orFail();
      expect(p).toMatchObject({ status: 'escalated', multiplier: 2, escalations: 1 });
      expect(p.dueAt.toISOString()).toBe('2026-11-25T05:32:00.000Z');
      expect(events.at(-1)).toMatchObject({
        type: 'penalty_escalated',
        title: 'Ceza büyüdü: 6 dk soğuk duş',
      });

      // Yükseltilmiş ceza da süresi geçerse yeniden ikiye katlanır.
      await run('2026-11-25T05:40:00Z');
      expect((await Penalty.findOne().orFail()).multiplier).toBe(4);
    });

    it('plus_one: aynı cezadan bir tane daha eklenir; eklenen ceza çoğalmaz, ikiye katlanır', async () => {
      await missedPenalty({ onFail: 'plus_one' });
      await run('2026-11-24T05:32:00Z');
      const [orig, extra] = await Penalty.find().sort({ createdAt: 1 });
      expect(orig).toMatchObject({ status: 'escalated', multiplier: 1, escalations: 1 });
      expect(extra).toMatchObject({
        status: 'pending',
        multiplier: 1,
        onFail: 'double',
        reason: 'Süresinde yapılmadı: 3 dk soğuk duş',
      });
      expect(extra!.sourceRef).toMatchObject({ type: 'penalty_escalation', id: `${orig!.id}:1` });

      await run('2026-11-25T05:40:00Z');
      const after = await Penalty.find().sort({ createdAt: 1 });
      expect(after).toHaveLength(3); // orijinal bir tane daha üretti, ek ceza ikiye katlandı
      expect(after[1]!.multiplier).toBe(2);
    });

    it('reset_streak: bağlı hedefin güncel serisi sıfırlanır, en iyi seri korunur', async () => {
      setNow('2026-11-02T09:00:00Z');
      const goal = await createGoal(user, {
        name: 'Bisiklet',
        target: 10,
        unit: 'km',
        period: 'weekly',
        startDate: '2026-11-02',
      });
      for (const date of ['2026-11-03', '2026-11-10', '2026-11-17']) {
        await ProgressLog.create({ userId: user.id, goalId: goal._id, amount: 10, date });
      }
      setNow('2026-11-23T03:00:00Z');
      expect(await goalStreak(user, goal)).toEqual({ current: 3, best: 3 });

      await createRule(user, { ...coldShower, onFail: 'reset_streak' });
      await createBlock(user, { ...bike, goalId: goal.id as string, goalAmount: 25 });
      await run('2026-11-23T05:31:00Z');
      await run('2026-11-24T05:32:00Z');

      const fresh = await Goal.findById(goal._id).orFail();
      expect(fresh.streakResetAt?.toISOString()).toBe('2026-11-24T05:32:00.000Z');
      expect(await goalStreak(user, fresh)).toEqual({ current: 0, best: 3 });
      expect((await Penalty.findOne().orFail()).multiplier).toBe(1);
    });

    it('yapılan ceza yükseltilmez', async () => {
      const p = await missedPenalty();
      await markPenaltyDone(user, p.id as string);
      expect(await run('2026-11-25T00:00:00Z')).toMatchObject({ escalated: 0 });
      expect(await Penalty.findById(p._id)).toMatchObject({ status: 'done', multiplier: 1 });
    });
  });

  describe('erteleme', () => {
    it('erteleme zinciri: ×2, süre uzar, penalty_postponed kuralı her ertelemede tetiklenir', async () => {
      await createRule(user, coldShower);
      await createRule(user, {
        trigger: 'penalty_postponed',
        targetType: 'any',
        penalty: '2 saat telefonsuz',
        deadline: { type: 'hours', hours: 48 },
      });
      await createBlock(user, bike);
      await run('2026-11-23T05:31:00Z');
      const p = await Penalty.findOne().orFail();

      setNow('2026-11-23T10:00:00Z');
      const once = await postponePenalty(user, p.id as string);
      expect(once).toMatchObject({ status: 'postponed', multiplier: 2, postponements: 1 });
      // Süre mevcut bitişten (24 Kasım 05:31Z) 24 saat uzar.
      expect(once.dueAt.toISOString()).toBe('2026-11-25T05:31:00.000Z');

      const followUp = await Penalty.findOne({ 'sourceRef.type': 'penalty_postpone' }).orFail();
      expect(followUp).toMatchObject({
        penalty: '2 saat telefonsuz',
        reason: 'Ceza ertelendi: 3 dk soğuk duş',
      });
      expect(followUp.sourceRef.id).toBe(`${p.id}:1`);
      expect(followUp.dueAt.toISOString()).toBe('2026-11-25T10:00:00.000Z'); // 48 saat

      const twice = await postponePenalty(user, p.id as string);
      expect(twice.multiplier).toBe(4);
      // Ertelemeden doğan ceza da ertelenebilir ve kuralı yeniden tetikler.
      await postponePenalty(user, followUp.id as string);
      expect(await Penalty.countDocuments({ 'sourceRef.type': 'penalty_postpone' })).toBe(3);

      // Süresi geçince yükseltme sürer: ertelenen ceza ve süresi dolan iki takip cezası.
      expect(await run('2026-11-26T05:32:00Z')).toMatchObject({ escalated: 3 });
      expect((await Penalty.findById(p._id))!.multiplier).toBe(8);
    });

    it('yapılmış ceza ertelenemez', async () => {
      await createRule(user, coldShower);
      await createBlock(user, bike);
      await run('2026-11-23T05:31:00Z');
      const p = await Penalty.findOne().orFail();
      await markPenaltyDone(user, p.id as string);
      await expect(postponePenalty(user, p.id as string)).rejects.toMatchObject({
        code: 'PENALTY_CLOSED',
      });
    });

    it('hafta sonuna kadar: ceza oluştuğu haftanın pazar 23:59’u; 24 saatten azsa sonraki pazar', async () => {
      await createRule(user, { ...coldShower, deadline: { type: 'end_of_week' } });
      await createBlock(user, { ...bike, daysOfWeek: [1, 7] });
      await run('2026-11-23T05:31:00Z');
      const p = await Penalty.findOne().orFail();
      expect(p.dueAt.toISOString()).toBe('2026-11-29T20:59:00.000Z'); // Paz 23:59 yerel

      // Pazar 07:00 bloğu: aynı gün 23:59'a 24 saatten az kalır → bir sonraki pazar
      await run('2026-11-29T05:31:00Z');
      const sunday = await Penalty.findOne({ _id: { $ne: p._id } }).orFail();
      expect(sunday.dueAt.toISOString()).toBe('2026-12-06T20:59:00.000Z');
    });
  });
});
