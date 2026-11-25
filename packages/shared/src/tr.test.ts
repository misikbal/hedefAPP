import { describe, expect, it } from 'vitest';
import { withPossessive } from './tr.js';

describe('withPossessive', () => {
  it.each([
    [0, "0'ı"],
    [1, "1'i"],
    [2, "2'si"],
    [3, "3'ü"],
    [4, "4'ü"],
    [5, "5'i"],
    [6, "6'sı"],
    [7, "7'si"],
    [8, "8'i"],
    [9, "9'u"],
    [10, "10'u"],
    [12, "12'si"],
    [20, "20'si"],
    [40, "40'ı"],
    [60, "60'ı"],
    [100, "100'ü"],
    [1000, "1000'i"],
  ])('%i → %s', (n, s) => expect(withPossessive(n)).toBe(s));
});
