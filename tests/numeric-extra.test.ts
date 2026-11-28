import { describe, expect, it } from 'vitest';
import {
  range, rms, product, countBy, unique, chunk, zip, formatRatio, clamp01, inverseLerp,
} from '../src/core/mathx';

describe('T1–T10 数值补全', () => {
  it('T1 range', () => { expect(range([1, 5, 3])).toBe(4); expect(range([])).toBeNaN(); });
  it('T2 rms', () => expect(rms([3, 4])).toBeCloseTo(Math.sqrt(12.5), 9));
  it('T3 product', () => { expect(product([2, 3, 4])).toBe(24); expect(product([])).toBe(1); });
  it('T4 countBy', () => expect(countBy([1, 2, 3, 4], (v) => v % 2 === 0)).toBe(2));
  it('T5 unique', () => expect(unique([3, 1, 3, 2, 1])).toEqual([3, 1, 2]));
  it('T6 chunk', () => expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]));
  it('T7 zip', () => expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]));
  it('T8 formatRatio', () => { expect(formatRatio(1, 4)).toBe('0.250'); expect(formatRatio(1, 0)).toBe('—'); });
  it('T9 clamp01', () => { expect(clamp01(-1)).toBe(0); expect(clamp01(2)).toBe(1); });
  it('T10 inverseLerp', () => { expect(inverseLerp(0, 10, 3)).toBeCloseTo(0.3, 9); expect(inverseLerp(5, 5, 7)).toBe(0); });
});
