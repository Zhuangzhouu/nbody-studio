import { describe, expect, it } from 'vitest';
import {
  dist2, dist3, dot2, dot3, cross2, cross3, norm2, norm3,
  normalize2, normalize3, angleBetween2, rotate2, lerp2, lerp3,
} from '../src/core/geometry';

describe('S11–S20 向量几何', () => {
  it('S11/S12 距离', () => {
    expect(dist2(0, 0, 3, 4)).toBe(5);
    expect(dist3(0, 0, 0, 1, 2, 2)).toBe(3);
  });
  it('S13 点积', () => { expect(dot2(1, 2, 3, 4)).toBe(11); expect(dot3(1, 2, 3, 4, 5, 6)).toBe(32); });
  it('S14/S15 叉积', () => {
    expect(cross2(1, 0, 0, 1)).toBe(1);
    expect(cross3(1, 0, 0, 0, 1, 0)).toEqual([0, 0, 1]);
  });
  it('S16 模长', () => { expect(norm2(3, 4)).toBe(5); expect(norm3(1, 2, 2)).toBe(3); });
  it('S17 单位化', () => {
    expect(normalize2(3, 4)).toEqual([0.6, 0.8]);
    expect(normalize3(0, 0, 0)).toEqual([0, 0, 0]);
  });
  it('S18 夹角', () => expect(angleBetween2(1, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 9));
  it('S19 旋转', () => {
    const [x, y] = rotate2(1, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0, 9); expect(y).toBeCloseTo(1, 9);
  });
  it('S20 插值', () => {
    expect(lerp2(0, 0, 10, 20, 0.5)).toEqual([5, 10]);
    expect(lerp3(0, 0, 0, 10, 20, 30, 0.5)).toEqual([5, 10, 15]);
  });
});
