import { describe, expect, it } from 'vitest';
import {
  formatDuration, wrapAngle, smoothStep01, nearlyEqual,
  hexToRgb, rgbToHex, formatScientific, significantDigits, mod, lerpAngle,
} from '../src/core/mathx';

describe('R1–R10 数值工具', () => {
  it('R1 formatDuration', () => {
    expect(formatDuration(500)).toBe('500 ms');
    expect(formatDuration(2500)).toBe('2.50 s');
    expect(formatDuration(125000)).toBe('2 min 5.0 s');
    expect(formatDuration(NaN)).toBe('—');
  });
  it('R2 wrapAngle', () => {
    expect(wrapAngle(0)).toBeCloseTo(0, 9);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 9); // 区间 [-π, π)
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 9);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 9);
  });
  it('R3 smoothStep01', () => {
    expect(smoothStep01(-1)).toBe(0);
    expect(smoothStep01(0)).toBe(0);
    expect(smoothStep01(0.5)).toBeCloseTo(0.5, 9);
    expect(smoothStep01(1)).toBe(1);
    expect(smoothStep01(2)).toBe(1);
  });
  it('R4 nearlyEqual', () => {
    expect(nearlyEqual(1, 1 + 1e-12)).toBe(true);
    expect(nearlyEqual(1, 1.1)).toBe(false);
    expect(nearlyEqual(NaN, NaN)).toBe(false);
  });
  it('R5/R6 颜色往返', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(rgbToHex(1, 0.5, 0)).toBe('#ff8000');
    expect(rgbToHex(...hexToRgb('#9bb0ff'))).toBe('#9bb0ff');
  });
  it('R7 formatScientific', () => {
    expect(formatScientific(1234, 3)).toBe('1.23e+3');
    expect(formatScientific(-Infinity)).toBe('—');
  });
  it('R8 significantDigits', () => {
    expect(significantDigits(12345, 3)).toBe(12300);
    expect(significantDigits(0.0012345, 3)).toBe(0.00123);
  });
  it('R9 mod 正模', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
    expect(mod(1, 0)).toBeNaN();
  });
  it('R10 lerpAngle 最短弧', () => {
    expect(Math.abs(lerpAngle(3, -3, 0.5))).toBeCloseTo(Math.PI, 9); // ±π 等价
    expect(lerpAngle(0, 0.5, 0.5)).toBeCloseTo(0.25, 9);
  });
});
