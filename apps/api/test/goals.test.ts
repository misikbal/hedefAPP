import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BlockInstance, ProgressLog } from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { archiveGoal, createGoal } from '../src/services/goals.js';
import { markDone, undo } from '../src/services/instances.js';
import { logProgress } from '../src/services/progress.js';
import { goalHistory, goalStreak, goalSummaries, statsOverview } from '../src/services/stats.js';
import type { UserContext } from '../src/services/users.js';
import { createUser, resetClock, resetDb, setNow, startDb, stopDb } from './helpers.js';

// 2026-11-24 Salı 21:00 İstanbul
const TUE_EVENING = '2026-11-24T18:00:00Z';

describe('hedefler ve ilerleme', () => {
  let user: UserContext;
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
  });
  afterEach(resetClock);

  const bike = () =>
    createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      category: 'sport',
      startDate: '2026-09-01',
    });

  it('"92 → 117 / 150" hesabı: haftalık toplam ve yeni kayıt', async () => {
    setNow(TUE_EVENING);
    const goal = await bike();
    await logProgress(user, { goalId: goal.id, amount: 30, date: '2026-11-23' });
    await logProgress(user, { goalId: goal.id, amount: 62, date: '2026-11-24' });
    await logProgress(user, { goalId: goal.id, amount: 40, date: '2026-11-22' }); // geçen hafta (Pazar)

    const [before] = await goalSummaries(user, [goal]);
    expect(before).toMatchObject({
      current: 92,
      target: 150,
      periodStart: '2026-11-23',
      periodEnd: '2026-11-29',
      daysLeft: 5,
    });

    await logProgress(user, { goalId: goal.id, amount: 25 });
    const [after] = await goalSummaries(user, [goal]);
    expect(after!.current).toBe(117);
    expect(after!.status).toBe('on_track');
  });

  it('gece yarısından sonra girilen ilerleme yeni güne yazılır', async () => {
    setNow('2026-11-23T21:30:00Z'); // UTC Pzt 21:30 = yerel Salı 00:30
    const goal = await createGoal(user, {
      name: 'Kitap',
      target: 20,
      unit: 'sayfa',
      period: 'daily',
    });
    const log = await logProgress(user, { goalId: goal.id, amount: 5 });
    expect(log.date).toBe('2026-11-24');
  });

  it('ileri tarihe ve silinmiş hedefe ilerleme girilemez', async () => {
    setNow(TUE_EVENING);
    const goal = await bike();
    await expect(
      logProgress(user, { goalId: goal.id, amount: 5, date: '2026-11-25' }),
    ).rejects.toMatchObject({
      code: 'DATE_IN_FUTURE',
    });
    await archiveGoal(user, goal.id as string);
    await expect(logProgress(user, { goalId: goal.id, amount: 5 })).rejects.toMatchObject({
      code: 'GOAL_ARCHIVED',
    });
  });

  it('hedefe bağlı blok tamamlanınca ilerleme oluşur, geri alınınca silinir', async () => {
    setNow('2026-11-24T03:00:00Z'); // Salı 06:00
    const goal = await bike();
    const block = await createBlock(user, {
      title: 'Bisiklet · 25 km',
      category: 'sport',
      daysOfWeek: [2],
      startTime: '07:00',
      endTime: '08:00',
      goalId: goal.id as string,
      goalAmount: 25,
    });
    const inst = await BlockInstance.findOne({ blockId: block._id }).orFail();
    setNow('2026-11-24T05:10:00Z');
    const done = await markDone(user, String(inst._id));
    const log = await ProgressLog.findById(done.progressLogId).orFail();
    expect(log).toMatchObject({ amount: 25, date: '2026-11-24', source: 'block' });
    expect((await goalSummaries(user, [goal]))[0]!.current).toBe(25);

    await undo(user, String(inst._id));
    expect(await ProgressLog.countDocuments()).toBe(0);
    expect((await goalSummaries(user, [goal]))[0]!.current).toBe(0);
  });

  it('hedefe bağlanan blokta miktar zorunlu', async () => {
    setNow(TUE_EVENING);
    const goal = await bike();
    await expect(
      createBlock(user, {
        title: 'x',
        category: 'sport',
        daysOfWeek: [3],
        startTime: '07:00',
        endTime: '08:00',
        goalId: goal.id as string,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('haftalık hedef geçmişi: son 8 hafta, ortalama / en iyi / kaçırılan', async () => {
    setNow(TUE_EVENING);
    const goal = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      startDate: '2026-10-26',
    });
    // H44 (26 Eki) 160, H45 120, H46 boş, H47 155, H48 (bu hafta) 30
    for (const [date, amount] of [
      ['2026-10-27', 160],
      ['2026-11-03', 120],
      ['2026-11-17', 100],
      ['2026-11-21', 55],
      ['2026-11-24', 30],
    ] as const) {
      await logProgress(user, { goalId: goal.id, amount, date });
    }
    const h = await goalHistory(user, goal, 8);
    expect(h.buckets.map((b) => b.label)).toEqual([
      'H41',
      'H42',
      'H43',
      'H44',
      'H45',
      'H46',
      'H47',
      'H48',
    ]);
    expect(h.buckets.map((b) => b.value)).toEqual([0, 0, 0, 160, 120, 0, 155, 30]);
    expect(h.buckets.at(-1)).toMatchObject({ current: true, met: false });
    // Hedef başlamadan önceki haftalar (H41–H43) ve bu hafta sayılmaz
    expect(h).toMatchObject({ completed: 4, missed: 2, best: 160, avg: 108.8 });
  });

  it('günlük hedef geçmişi haftalık günlük ortalamadır', async () => {
    setNow(TUE_EVENING);
    const goal = await createGoal(user, {
      name: 'Kitap',
      target: 20,
      unit: 'sayfa',
      period: 'daily',
      startDate: '2026-11-01',
    });
    await logProgress(user, { goalId: goal.id, amount: 140, date: '2026-11-18' }); // geçen hafta toplam 140 → 20/gün
    await logProgress(user, { goalId: goal.id, amount: 30, date: '2026-11-23' }); // bu hafta 2 gün → 15/gün
    const h = await goalHistory(user, goal, 2);
    expect(h.aggregate).toBe('daily_avg');
    expect(h.buckets.map((b) => [b.value, b.met])).toEqual([
      [20, true],
      [15, false],
    ]);
  });

  it('seriler: günlük hedefte devam eden gün seriyi bozmaz, boşluk sıfırlar', async () => {
    setNow(TUE_EVENING);
    const goal = await createGoal(user, {
      name: 'Kitap',
      target: 20,
      unit: 'sayfa',
      period: 'daily',
      startDate: '2026-11-15',
    });
    for (const date of [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]) {
      await logProgress(user, { goalId: goal.id, amount: 20, date });
    }
    expect(await goalStreak(user, goal)).toEqual({ current: 3, best: 4 });
    await logProgress(user, { goalId: goal.id, amount: 20 }); // bugün de tuttu
    expect(await goalStreak(user, goal)).toEqual({ current: 4, best: 4 });
  });

  it('seriler: haftalık hedef hafta sayar', async () => {
    setNow(TUE_EVENING);
    const goal = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
      startDate: '2026-11-02',
    });
    for (const date of ['2026-11-03', '2026-11-10', '2026-11-17'])
      await logProgress(user, { goalId: goal.id, amount: 150, date });
    expect(await goalStreak(user, goal)).toEqual({ current: 3, best: 3 });
  });
});

describe('stats.overview', () => {
  let user: UserContext;
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
  });
  afterEach(resetClock);

  it('tamamlama oranı, ısı haritası, toplamlar ve zaman dağılımı', async () => {
    setNow('2026-11-16T03:00:00Z'); // önceki Pazartesi 06:00
    const goal = await createGoal(user, {
      name: 'Bisiklet',
      target: 150,
      unit: 'km',
      period: 'weekly',
    });
    await createBlock(user, {
      title: 'Proje',
      category: 'project',
      daysOfWeek: [1, 2],
      startTime: '09:00',
      endTime: '11:00',
    });
    await createBlock(user, {
      title: 'Spor',
      category: 'sport',
      daysOfWeek: [1, 2],
      startTime: '07:00',
      endTime: '08:00',
    });
    // Geçen hafta: 4 bloktan 2'si yapıldı → %50
    const { ensureWeek } = await import('../src/services/schedule.js');
    await ensureWeek(user.id, '2026-11-23', 'Europe/Istanbul');
    const last = await BlockInstance.find({ date: { $lte: '2026-11-17' } }).sort({
      date: 1,
      startAt: 1,
    });
    await BlockInstance.updateMany(
      { _id: { $in: [last[0]!._id, last[1]!._id] } },
      { status: 'done' },
    );
    await logProgress(user, { goalId: goal.id, amount: 40, date: '2026-11-16' });

    // Bu hafta Salı akşamı: Pzt 2 blok yapıldı, Salı 1 yapıldı 1 kaçtı → 3/4 = %75
    setNow(TUE_EVENING);
    const now = await BlockInstance.find({ date: { $gte: '2026-11-23' } }).sort({
      date: 1,
      startAt: 1,
    });
    await BlockInstance.updateMany(
      { _id: { $in: [now[0]!._id, now[1]!._id, now[2]!._id] } },
      { status: 'done' },
    );
    await logProgress(user, { goalId: goal.id, amount: 50, date: '2026-11-23' });

    const s = await statsOverview(user, 'week');
    expect(s).toMatchObject({ from: '2026-11-23', to: '2026-11-29', score: 75, delta: 25 });
    expect(s.trend).toEqual([
      { label: 'Pzt', value: 100 },
      { label: 'Sal', value: 50 },
    ]);
    expect(s.heatmap).toHaveLength(84);
    expect(s.heatmap[0]!.date).toBe('2026-09-07');
    const byDate = Object.fromEntries(s.heatmap.map((h) => [h.date, h]));
    expect(byDate['2026-11-23']).toMatchObject({ level: 4, future: false });
    expect(byDate['2026-11-24']).toMatchObject({ level: 2 });
    expect(byDate['2026-11-29']).toMatchObject({ future: true });
    // Bu hafta Pzt–Sal 50 km, geçen hafta aynı dönem (Pzt–Sal) 40 km → +%25
    expect(s.totals).toEqual([
      { goalId: goal.id, name: 'Bisiklet', unit: 'km', value: 50, change: 0.25 },
    ]);
    // Yapılanlar: Pzt spor (60), Pzt proje (120), Sal spor (60) → 120 / 120 dk
    expect(s.split).toHaveLength(2);
    expect(s.split).toEqual(
      expect.arrayContaining([
        { category: 'project', minutes: 120, pct: 50 },
        { category: 'sport', minutes: 120, pct: 50 },
      ]),
    );
  });
});
