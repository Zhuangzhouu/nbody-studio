import { describe, expect, it } from 'vitest';
import {
  orbitalPeriod, escapeVelocity, schwarzschildRadius, virialRatio,
  specificOrbitalEnergy, eccentricity, semiMajorAxis, hillRadius, rocheLimit, dynamicalTime,
} from '../src/core/physics-formulas';

describe('R11–R20 物理公式', () => {
  it('R11 轨道周期：a=1,M=1 → 2π', () => expect(orbitalPeriod(1, 1, 1)).toBeCloseTo(2 * Math.PI, 9));
  it('R12 逃逸速度：r=2,M=1 → 1', () => expect(escapeVelocity(2, 1, 1)).toBeCloseTo(1, 9));
  it('R13 史瓦西半径：M=1,G=c=1 → 2', () => expect(schwarzschildRadius(1, 1, 1)).toBe(2));
  it('R14 维里比率：ke=1,pe=-2 → 1', () => expect(virialRatio(1, -2)).toBe(1));
  it('R15 比轨道能：圆轨道 v=1,r=1,mu=1 → -0.5', () => expect(specificOrbitalEnergy(1, 1, 1)).toBeCloseTo(-0.5, 9));
  it('R16 偏心率：圆轨道 e=0', () => {
    expect(eccentricity(1, 0, 0, 1, 1)).toBeCloseTo(0, 9);
  });
  it('R17 半长轴：圆轨道 a=1', () => expect(semiMajorAxis(1, 1, 1)).toBeCloseTo(1, 9));
  it('R18 希尔半径：a=1,m=1,M=81 → 1/3', () => expect(hillRadius(1, 1, 81)).toBeCloseTo(Math.cbrt(1 / 243), 9));
  it('R19 洛希极限：等密度 → 2.44R', () => expect(rocheLimit(1, 1, 1)).toBeCloseTo(2.44, 9));
  it('R20 动力学时间：R=1,M=1 → 1', () => expect(dynamicalTime(1, 1, 1)).toBeCloseTo(1, 9));
  it('非法输入返回 NaN', () => {
    expect(orbitalPeriod(0, 1)).toBeNaN();
    expect(escapeVelocity(-1, 1)).toBeNaN();
    expect(virialRatio(1, 0)).toBeNaN();
  });
});
