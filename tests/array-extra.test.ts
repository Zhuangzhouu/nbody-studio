import { describe, expect, it } from 'vitest';
import {
  first, last, take, drop, flatten, groupBy, partition, shuffle, sample, rotateArray, counts,
} from '../src/core/mathx';

describe('V11–V20 数组集合', () => {
  it('V11 first', () => expect(first([1, 2, 3], (v) => v > 1)).toBe(2));
  it('V12 last', () => { expect(last([1, 2])).toBe(2); expect(last([])).toBeUndefined(); });
  it('V13 take/drop', () => { expect(take([1, 2, 3], 2)).toEqual([1, 2]); expect(drop([1, 2, 3], 1)).toEqual([2, 3]); });
  it('V14 flatten', () => expect(flatten([[1, 2], [3]])).toEqual([1, 2, 3]));
  it('V15 groupBy', () => expect(groupBy(['a1', 'b2', 'a3'], (s) => s[0])).toEqual({ a: ['a1', 'a3'], b: ['b2'] }));
  it('V16 partition', () => expect(partition([1, 2, 3, 4], (v) => v % 2 === 0)).toEqual([[2, 4], [1, 3]]));
  it('V17/V18 固定种子', () => {
    const rng = () => 0.5;
    expect(shuffle([1, 2, 3], rng)).toEqual(shuffle([1, 2, 3], rng));
    expect(sample([1, 2, 3, 4], 2, rng).length).toBe(2);
  });
  it('V19 rotateArray', () => { expect(rotateArray([1, 2, 3], 1)).toEqual([2, 3, 1]); expect(rotateArray([1, 2, 3], -1)).toEqual([3, 1, 2]); });
  it('V20 counts', () => expect(counts(['a', 'b', 'a']).get('a')).toBe(2));
});
