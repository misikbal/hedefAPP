import { describe, expect, it } from 'vitest';
import { MAX_BLOCK_REMINDERS, planBlockReminders } from './reminders.js';
import type { Block } from './schemas/block.js';
import type { Instance, WeekResponse } from './schemas/schedule.js';

const inst = (
  id: string,
  blockId: string,
  startAt: string,
  status: Instance['status'] = 'planned',
) => ({ id, blockId, startAt, startTime: '07:00', title: 'Bisiklet · 25 km', status }) as Instance;
const week = (instances: Instance[]): WeekResponse =>
  ({ weekStart: '2026-11-23', days: [{ date: '2026-11-23', instances }] }) as WeekResponse;
const block = (id: string, reminderMinutes: number | null) => ({ id, reminderMinutes }) as Block;

const NOW = Date.parse('2026-11-23T03:00:00Z'); // Pzt 06:00 yerel

describe('blok hatırlatma planı', () => {
  it('reminderMinutes önce; geçmiş, kapalı ve planned olmayanlar atlanır', () => {
    const plans = planBlockReminders(
      [
        week([
          inst('a', 'b1', '2026-11-23T04:00:00Z'), // 07:00 → 06:50
          inst('b', 'b1', '2026-11-23T03:05:00Z'), // hatırlatma anı geçti
          inst('c', 'b2', '2026-11-23T05:00:00Z'), // hatırlatma kapalı
          inst('d', 'b1', '2026-11-23T06:00:00Z', 'skipped'),
          inst('e', 'b1', '2026-12-05T04:00:00Z'), // 7 günden sonra
        ]),
      ],
      [block('b1', 10), block('b2', null)],
      NOW,
    );
    expect(plans).toEqual([
      {
        identifier: 'block:a',
        at: new Date('2026-11-23T03:50:00Z'),
        title: 'Bisiklet zamanı',
        body: '07:00 · Bisiklet · 25 km',
        url: '/blocks/b1',
      },
    ]);
  });

  it('en yakın 40 hatırlatmayla sınırlı', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      inst(`i${i}`, 'b1', new Date(NOW + (i + 1) * 3_600_000).toISOString()),
    );
    const plans = planBlockReminders([week(many.reverse())], [block('b1', 0)], NOW);
    expect(plans).toHaveLength(MAX_BLOCK_REMINDERS);
    expect(plans[0]!.identifier).toBe('block:i0');
  });
});
