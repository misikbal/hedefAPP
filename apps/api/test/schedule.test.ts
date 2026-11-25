import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { BlockInstance } from '../src/db/models/index.js';
import { archiveBlock, createBlock, updateBlock } from '../src/services/blocks.js';
import { markDone } from '../src/services/instances.js';
import { ensureWeek } from '../src/services/schedule.js';
import type { UserContext } from '../src/services/users.js';
import { getToday, getWeek } from '../src/services/views.js';
import { TZ, createUser, resetClock, resetDb, setNow, startDb, stopDb } from './helpers.js';

// 2026-11-23 Pazartesi. İstanbul = UTC+3.
const MON = '2026-11-23';
const NEXT_MON = '2026-11-30';

const bike = {
  title: 'Bisiklet · 25 km',
  category: 'sport' as const,
  daysOfWeek: [1, 3, 5],
  startTime: '07:00',
  endTime: '08:00',
};

const instancesOf = (blockId: Types.ObjectId) =>
  BlockInstance.find({ blockId }).sort({ date: 1 }).lean();

describe('schedule.ensureWeek', () => {
  let user: UserContext;
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
  });
  afterEach(resetClock);

  it('blok doğru günlere ve doğru UTC saatine düşer', async () => {
    setNow('2026-11-23T03:00:00Z'); // Pzt 06:00 yerel
    const block = await createBlock(user, bike);
    const list = await instancesOf(block._id);
    expect(list.map((i) => i.date)).toEqual(['2026-11-23', '2026-11-25', '2026-11-27']);
    expect(list[0]!.startAt.toISOString()).toBe('2026-11-23T04:00:00.000Z');
    expect(list[0]!.endAt.toISOString()).toBe('2026-11-23T05:00:00.000Z');
    expect(list.every((i) => i.status === 'planned')).toBe(true);
  });

  it('idempotenttir: tekrar çağrılınca kopya üretmez', async () => {
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, bike);
    expect(await ensureWeek(user.id, MON, TZ)).toBe(0);
    expect(await ensureWeek(user.id, MON, TZ)).toBe(0);
    expect(await BlockInstance.countDocuments({ blockId: block._id })).toBe(3);
    // Sonraki hafta ilk çağrıda üretilir, ikinci çağrıda üretilmez.
    expect(await ensureWeek(user.id, NEXT_MON, TZ)).toBe(3);
    expect(await ensureWeek(user.id, NEXT_MON, TZ)).toBe(0);
  });

  it('hafta ortasında eklenen blok geçmiş günlere ve geçmiş saate düşmez', async () => {
    setNow('2026-11-25T07:00:00Z'); // Çar 10:00 yerel; Çar 07:00 geçti
    const block = await createBlock(user, bike);
    expect((await instancesOf(block._id)).map((i) => i.date)).toEqual(['2026-11-27']);
  });

  it('haftalık tekrar kapalıysa yalnızca bu haftaya düşer', async () => {
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, { ...bike, repeatWeekly: false });
    await ensureWeek(user.id, NEXT_MON, TZ);
    expect((await instancesOf(block._id)).map((i) => i.date)).toEqual([
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
    ]);
  });

  it('blok düzenlenince yalnızca gelecekteki planned kayıtlar yeniden üretilir', async () => {
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, bike);
    await ensureWeek(user.id, NEXT_MON, TZ);
    const [mon] = await instancesOf(block._id);
    setNow('2026-11-23T05:30:00Z');
    await markDone(user, String(mon!._id));

    setNow('2026-11-25T09:00:00Z'); // Çar 12:00; Çar 07:00 bloğu geçmişte, planned
    await updateBlock(user, block.id as string, {
      startTime: '18:00',
      endTime: '19:00',
      daysOfWeek: [2, 5],
    });

    const list = await instancesOf(block._id);
    const byDate = Object.fromEntries(list.map((i) => [i.date, i]));
    expect(byDate['2026-11-23']!.status).toBe('done'); // geçmiş, dokunulmadı
    expect(byDate['2026-11-25']!.startAt.toISOString()).toBe('2026-11-25T04:00:00.000Z'); // geçmiş, dokunulmadı
    expect(byDate['2026-11-27']!.startAt.toISOString()).toBe('2026-11-27T15:00:00.000Z'); // yeni saat
    // Sonraki hafta (zaten üretilmişti) yeni günlere göre: Sal + Cum
    expect(list.filter((i) => i.date >= NEXT_MON).map((i) => i.date)).toEqual([
      '2026-12-01',
      '2026-12-04',
    ]);
  });

  it('silinen blok geçmişi korur, gelecekteki planlar silinir', async () => {
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, bike);
    setNow('2026-11-25T09:00:00Z');
    await archiveBlock(user, block.id as string);
    expect((await instancesOf(block._id)).map((i) => i.date)).toEqual(['2026-11-23', '2026-11-25']);
    expect(await ensureWeek(user.id, NEXT_MON, TZ)).toBe(0);
  });

  it('gece yarısı sınırı: 00:30 bloğu yerel güne göre üretilir, "bugün" yerel saate göre hesaplanır', async () => {
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, {
      ...bike,
      daysOfWeek: [3],
      startTime: '00:30',
      endTime: '01:00',
    });
    const [wed] = await instancesOf(block._id);
    expect(wed!.date).toBe('2026-11-25');
    expect(wed!.startAt.toISOString()).toBe('2026-11-24T21:30:00.000Z'); // UTC'de bir önceki gün

    setNow('2026-11-24T22:00:00Z'); // UTC Salı 22:00 = yerel Çarşamba 01:00
    const today = await getToday(user);
    expect(today.date).toBe('2026-11-25');
    expect(today.instances.map((i) => i.title)).toEqual(['Bisiklet · 25 km']);
  });

  it('getWeek 7 gün döner ve haftayı pazartesiden başlatır', async () => {
    setNow('2026-11-23T03:00:00Z');
    await createBlock(user, bike);
    const week = await getWeek(user, '2026-11-26');
    expect(week.weekStart).toBe(MON);
    expect(week.days).toHaveLength(7);
    expect(week.days.map((d) => d.instances.length)).toEqual([1, 0, 1, 0, 1, 0, 0]);
  });
});
