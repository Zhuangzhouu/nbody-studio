import { describe, expect, it } from 'vitest';
import {
  mean, variance, stdDev, median, quantile, sum, minMax, movingAverage, normalize, histogram,
} from '../src/core/mathx';

describe('S1–S10 统计工具', () => {
  it('S1 mean', () => { expect(mean([1, 2, 3])).toBe(2); expect(mean([])).toBeNaN(); });
  it('S2 variance', () => expect(variance([1, 2, 3])).toBeCloseTo(2 / 3, 9));
  it('S3 stdDev', () => expect(stdDev([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3), 9));
  it('S4 median 奇数/偶数', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('S5 quantile', () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
  it('S6 sum', () => expect(sum([1, 2, 3])).toBe(6));
  it('S7 minMax', () => expect(minMax([5, 2, 9])).toEqual([2, 9]));
  it('S8 movingAverage', () => expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]));
  it('S9 normalize', () => expect(normalize([10, 20, 30])).toEqual([0, 0.5, 1]));
  it('S10 histogram', () => {
    expect(histogram([0, 0.5, 1], 2)).toEqual([1, 2]);
    expect(histogram([5, 5], 3)[0]).toBe(2);
  });
});
