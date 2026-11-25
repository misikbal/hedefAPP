import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BlockInstance, Settings } from '../src/db/models/index.js';
import { createBlock } from '../src/services/blocks.js';
import { markDone, skip, undo } from '../src/services/instances.js';
import type { UserContext } from '../src/services/users.js';
import { createUser, resetClock, resetDb, setNow, startDb, stopDb } from './helpers.js';

describe('instance done / undo / skip', () => {
  let user: UserContext;
  let ids: string[];

  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await resetDb();
    user = await createUser();
    setNow('2026-11-23T03:00:00Z');
    const block = await createBlock(user, {
      title: 'Almanca · 15 kelime',
      category: 'language',
      daysOfWeek: [1, 2, 3],
      startTime: '13:00',
      endTime: '13:30',
    });
    ids = (await BlockInstance.find({ blockId: block._id }).sort({ date: 1 })).map((i) =>
      String(i._id),
    );
  });
  afterEach(resetClock);

  it('done ve undo', async () => {
    const done = await markDone(user, ids[0]!);
    expect(done.status).toBe('done');
    expect(done.doneAt).toBeInstanceOf(Date);
    const back = await undo(user, ids[0]!);
    expect(back.status).toBe('planned');
    expect(back.doneAt).toBeNull();
  });

  it('ileri tarihli blok tamamlanamaz', async () => {
    await expect(markDone(user, ids[1]!)).rejects.toMatchObject({ code: 'INSTANCE_IN_FUTURE' });
  });

  it('haftalık atlama hakkı aşılırsa reddedilir; geri alınca hak geri gelir', async () => {
    await skip(user, ids[1]!);
    await expect(skip(user, ids[2]!)).rejects.toMatchObject({
      code: 'SKIP_LIMIT_REACHED',
      statusCode: 409,
    });
    await undo(user, ids[1]!);
    expect((await skip(user, ids[2]!)).status).toBe('skipped');
  });

  it('atlama hakkı ayardan okunur', async () => {
    await Settings.updateOne({ userId: user.id }, { skipAllowancePerWeek: 2 });
    await skip(user, ids[1]!);
    await skip(user, ids[2]!);
    await expect(skip(user, ids[0]!)).rejects.toMatchObject({ code: 'SKIP_LIMIT_REACHED' });
  });

  it('atlanan blok önce geri alınmadan tamamlanamaz', async () => {
    await skip(user, ids[0]!);
    await expect(markDone(user, ids[0]!)).rejects.toMatchObject({ code: 'INSTANCE_SKIPPED' });
  });
});
