import { describe, expect, it } from 'vitest';
import type { TodayResponse } from '@takip/shared';
import { buildWidgetModel, selectBlocks, widgetLayout } from './model';

type Inst = TodayResponse['instances'][number];

// 2026-11-26 Perşembe, İstanbul = UTC+3
const inst = (
  id: string,
  start: string,
  end: string,
  status: Inst['status'] = 'planned',
): Inst => ({
  id,
  blockId: `b${id}`,
  date: '2026-11-26',
  startAt: `2026-11-26T${start}:00+03:00`,
  endAt: `2026-11-26T${end}:00+03:00`,
  startTime: start,
  endTime: end,
  status,
  doneAt: null,
  title: `Blok ${id}`,
  description: null,
  category: 'project',
  penalty: null,
});

const instances = [
  inst('1', '07:00', '08:00', 'done'),
  inst('2', '09:00', '10:00', 'missed'),
  inst('3', '11:00', '12:00'),
  inst('4', '13:00', '14:00'),
  inst('5', '15:00', '16:00'),
  inst('6', '18:00', '19:00'),
];

const at = (hhmm: string) => new Date(`2026-11-26T${hhmm}:00+03:00`);

const today = (over: Partial<TodayResponse> = {}): TodayResponse => ({
  date: '2026-11-26',
  instances,
  goals: [],
  pendingPenalty: null,
  note: null,
  lastClaudeChange: null,
  skip: { used: 0, allowance: 2 },
  ...over,
});

describe('selectBlocks', () => {
  it('şu anki bloğu vurgular ve bir öncesinden başlar', () => {
    const { blocks, hidden } = selectBlocks(instances, at('11:30'), 3);
    expect(blocks.map((b) => b.id)).toEqual(['2', '3', '4']);
    expect(blocks[1]).toMatchObject({ emphasis: 'now', statusLabel: 'şimdi' });
    expect(blocks[0]).toMatchObject({ emphasis: null, statusLabel: 'kaçtı' });
    expect(hidden).toBe(3);
  });

  it('aradaysa sıradaki planlı bloğu vurgular', () => {
    const { blocks } = selectBlocks(instances, at('14:30'), 2);
    expect(blocks.map((b) => [b.id, b.emphasis])).toEqual([
      ['4', null],
      ['5', 'next'],
    ]);
  });

  it('gün bittiyse son blokları gösterir', () => {
    const { blocks } = selectBlocks(instances, at('22:00'), 3);
    expect(blocks.map((b) => b.id)).toEqual(['4', '5', '6']);
    expect(blocks.every((b) => b.emphasis === null)).toBe(true);
  });
});

describe('widgetLayout', () => {
  it('4x2 widget iki sütun', () => {
    expect(widgetLayout(320, 160, false)).toEqual({ twoColumns: true, maxBlocks: 5, maxGoals: 3 });
  });
  it('dar ve kısa widget yalnız blok', () => {
    expect(widgetLayout(250, 110, true)).toMatchObject({
      twoColumns: false,
      maxGoals: 0,
      maxBlocks: 1,
    });
  });
});

describe('buildWidgetModel', () => {
  const size = { width: 320, height: 180 };

  it('sayaç, hedef ve ceza satırı', () => {
    const m = buildWidgetModel(
      {
        kind: 'data',
        fetchedAt: '2026-11-26T08:00:00Z',
        stale: false,
        today: today({
          goals: [
            {
              id: 'g1',
              name: 'Bisiklet',
              target: 150,
              unit: 'km',
              period: 'weekly',
              startDate: '2026-11-01',
              trackStreak: true,
              category: 'sport',
              penaltyRuleId: null,
              archived: false,
              current: 92.5,
              periodStart: '2026-11-23',
              periodEnd: '2026-11-29',
              daysLeft: 3,
              status: 'on_track',
            },
          ],
          pendingPenalty: {
            id: 'p1',
            ruleId: 'r1',
            reason: 'Almanca bloğu yapılmadı',
            sourceRef: { type: 'instance', id: 'i2' },
            penalty: '3 dk soğuk duş',
            multiplier: 1,
            text: '3 dk soğuk duş',
            consequence: '',
            onFail: 'double',
            dueAt: '2026-11-27T02:00:00+03:00',
            status: 'pending',
            resolvedAt: null,
            createdAt: '2026-11-26T09:30:00+03:00',
          },
        }),
      },
      size,
      at('12:00'),
    );
    expect(m.kind).toBe('today');
    if (m.kind !== 'today') return;
    expect(m.eyebrow).toBe('PERŞEMBE · 26 KASIM');
    expect(m.counter).toBe('1/6');
    expect(m.goals[0]).toMatchObject({ valueText: '92,5/150 km' });
    expect(m.goals[0]!.ratio).toBeCloseTo(92.5 / 150);
    expect(m.penalty).toEqual({ text: '3 dk soğuk duş', remaining: '14 sa kaldı', overdue: false });
    expect(m.emptyText).toBeNull();
  });

  it('önbellek önceki güne aitse blokları göstermez', () => {
    const m = buildWidgetModel(
      {
        kind: 'data',
        fetchedAt: '2026-11-25T20:00:00Z',
        stale: true,
        today: today({ date: '2026-11-25' }),
      },
      size,
      at('08:00'),
    );
    expect(m).toMatchObject({
      kind: 'today',
      staleDay: true,
      stale: true,
      blocks: [],
      counter: '',
      eyebrow: 'PERŞEMBE · 26 KASIM',
    });
  });

  it('program yoksa boş metin', () => {
    const m = buildWidgetModel(
      { kind: 'data', fetchedAt: 'x', stale: false, today: today({ instances: [] }) },
      size,
      at('08:00'),
    );
    expect(m).toMatchObject({ kind: 'today', emptyText: 'Bugün için program yok', counter: '0/0' });
  });

  it('oturum yoksa giriş durumu', () => {
    expect(buildWidgetModel({ kind: 'signedOut' }, size)).toEqual({ kind: 'signedOut' });
  });
});
