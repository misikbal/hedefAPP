import { describe, expect, it } from 'vitest';
import {
  countdownText,
  penaltyConsequence,
  remainingText,
  ruleCondition,
  ruleSentence,
  ruleThen,
  rulesForBlock,
  rulesForGoal,
  scalePenaltyText,
} from './penalty.js';
import { penaltyListQuerySchema, penaltyRuleCreateSchema } from './schemas/penalty.js';

describe('scalePenaltyText', () => {
  it.each([
    ['3 dk soğuk duş', 2, '6 dk soğuk duş'],
    ['50 şınav', 4, '200 şınav'],
    ['Ertesi gün +10 sayfa', 2, 'Ertesi gün +20 sayfa'],
    ['1 gün sosyal medya yok', 2, '2 gün sosyal medya yok'],
    ['Ertesi gün 06:00 kalk', 2, 'Ertesi gün 06:00 kalk ×2'],
    ['Odayı topla', 2, 'Odayı topla ×2'],
    ['1,5 km koşu', 2, '3 km koşu'],
    ['3 dk soğuk duş', 1, '3 dk soğuk duş'],
  ])('%s ×%d → %s', (text, m, out) => {
    expect(scalePenaltyText(text, m)).toBe(out);
  });
});

describe('kural cümleleri', () => {
  it('tasarımdaki örnek cümle', () => {
    expect(
      ruleSentence({
        trigger: 'block_missed',
        targetType: 'category',
        category: 'sport',
        penalty: '3 dk soğuk duş',
        deadline: { type: 'hours', hours: 24 },
        onFail: 'double',
      }),
    ).toBe('Spor bloğu kaçarsa → 24 saat içinde 3 dk soğuk duş. Yapmazsan iki katı.');
  });

  it('koşullar', () => {
    expect(
      ruleCondition({ trigger: 'block_missed', targetType: 'block', targetLabel: 'Almanca' }),
    ).toBe('Almanca bloğu kaçarsa');
    expect(
      ruleCondition({
        trigger: 'goal_failed',
        targetType: 'goal',
        targetLabel: 'Kitap günlük 20 sayfa',
      }),
    ).toBe('Kitap günlük 20 sayfa tutmazsa');
    expect(ruleCondition({ trigger: 'goal_failed', targetType: 'any' })).toBe(
      'Herhangi bir hedef tutmazsa',
    );
    expect(ruleCondition({ trigger: 'penalty_postponed', targetType: 'any' })).toBe(
      'Bir ceza ertelenirse',
    );
  });

  it('alt metin ve sonuç', () => {
    expect(ruleThen('50 şınav', { type: 'end_of_week' })).toBe('50 şınav · hafta sonuna kadar');
    expect(penaltyConsequence({ type: 'hours', hours: 24 }, 'double')).toBe(
      '24 saat içinde yapılmazsa iki katına çıkar.',
    );
    expect(penaltyConsequence({ type: 'end_of_week' }, 'plus_one')).toBe(
      'Hafta sonuna kadar yapılmazsa bir ceza daha eklenir.',
    );
  });
});

describe('süre metinleri', () => {
  it('kalan süre ve geri sayım', () => {
    expect(remainingText(14 * 3600_000 + 5 * 60_000)).toBe('14 sa kaldı');
    expect(remainingText(35 * 60_000)).toBe('35 dk kaldı');
    expect(remainingText(3 * 86400_000)).toBe('3 gün kaldı');
    expect(remainingText(-1)).toBe('süre doldu');
    expect(countdownText(14 * 3600_000 + 2 * 60_000 + 37_000)).toBe('14:02:37');
  });
});

describe('penaltyRuleCreateSchema', () => {
  it('varsayılanlar', () => {
    const r = penaltyRuleCreateSchema.parse({
      trigger: 'block_missed',
      targetType: 'any',
      penalty: '50 şınav',
    });
    expect(r.deadline).toEqual({ type: 'hours', hours: 24 });
    expect(r.onFail).toBe('double');
    expect(r.enabled).toBe(true);
  });

  it('tetikleyici ve hedef uyumsuzsa reddeder', () => {
    expect(
      penaltyRuleCreateSchema.safeParse({
        trigger: 'block_missed',
        targetType: 'goal',
        targetId: 'a'.repeat(24),
        penalty: 'x',
      }).success,
    ).toBe(false);
    expect(
      penaltyRuleCreateSchema.safeParse({
        trigger: 'block_missed',
        targetType: 'block',
        penalty: 'x',
      }).success,
    ).toBe(false);
    expect(
      penaltyRuleCreateSchema.safeParse({
        trigger: 'goal_failed',
        targetType: 'category',
        penalty: 'x',
      }).success,
    ).toBe(false);
  });

  it('durum filtresi', () => {
    expect(penaltyListQuerySchema.parse({ status: 'open' }).status).toEqual([
      'pending',
      'postponed',
      'escalated',
    ]);
    expect(penaltyListQuerySchema.safeParse({ status: 'nope' }).success).toBe(false);
  });
});

describe('rulesForBlock / rulesForGoal', () => {
  const base = { targetId: null, category: null, enabled: true } as const;
  const rules = [
    { ...base, id: 'any', trigger: 'block_missed', targetType: 'any' },
    { ...base, id: 'cat', trigger: 'block_missed', targetType: 'category', category: 'sport' },
    { ...base, id: 'blk', trigger: 'block_missed', targetType: 'block', targetId: 'b1' },
    { ...base, id: 'direct', trigger: 'block_missed', targetType: 'category', category: 'reading' },
    { ...base, id: 'off', trigger: 'block_missed', targetType: 'any', enabled: false },
    { ...base, id: 'goal', trigger: 'goal_failed', targetType: 'any' },
  ] as const;

  it('öncelik: doğrudan > blok > kategori > herhangi; kapalı kural yok', () => {
    const ids = rulesForBlock({ id: 'b1', category: 'sport', penaltyRuleId: 'direct' }, rules).map(
      (r) => r.id,
    );
    expect(ids).toEqual(['direct', 'blk', 'cat', 'any']);
  });

  it('başka bloğa ve kategoriye uymaz', () => {
    expect(
      rulesForBlock({ id: 'b2', category: 'language', penaltyRuleId: null }, rules).map(
        (r) => r.id,
      ),
    ).toEqual(['any']);
  });

  it('hedef kuralları ayrı', () => {
    expect(
      rulesForGoal({ id: 'g1', category: 'sport', penaltyRuleId: null }, rules).map((r) => r.id),
    ).toEqual(['goal']);
  });
});
