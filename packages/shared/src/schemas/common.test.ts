import { describe, expect, it } from 'vitest';
import { localDateSchema, timeOfDaySchema } from './common.js';

describe('common schemas', () => {
  it('validates local dates', () => {
    expect(localDateSchema.safeParse('2026-11-25').success).toBe(true);
    expect(localDateSchema.safeParse('25.11.2026').success).toBe(false);
  });
  it('validates time of day', () => {
    expect(timeOfDaySchema.safeParse('07:00').success).toBe(true);
    expect(timeOfDaySchema.safeParse('24:00').success).toBe(false);
  });
});
