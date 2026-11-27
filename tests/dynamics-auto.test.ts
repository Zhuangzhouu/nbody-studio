import { describe, expect, it } from 'vitest';
import {
  momentOfInertia, virialCoefficient, specificAngularMomentum,
  laplaceRungeLenzNorm, inclination, trueAnomaly, meanAnomaly, orbitEnergyFromElements,
} from '../src/core/dynamics';

describe('S22–S30 诊断数值', () => {
  it('S22 转动惯量', () => {
    expect(momentOfInertia([1, 1], [3, 0], [4, 0], null, 2)).toBe(25);
  });
  it('S23 维里系数', () => expect(virialCoefficient(1, -2)).toBe(1));
  it('S25 比角动量：圆轨道 h=r·v=1', () => {
    expect(specificAngularMomentum(1, 0, 0, 0, 1, 0)).toBeCloseTo(1, 9);
  });
  it('S26 LRL 模：圆轨道 e=0', () => {
    expect(laplaceRungeLenzNorm(1, 0, 0, 0, 1, 0, 1)).toBeCloseTo(0, 9);
  });
  it('S27 倾角：轨道面 xy → 0', () => expect(inclination(0, 0, 1)).toBeCloseTo(0, 9));
  it('S28 真近点角：e=0 → E', () => expect(trueAnomaly(0, 1.2)).toBeCloseTo(1.2, 9));
  it('S29 平近点角：M=E-e·sinE', () => expect(meanAnomaly(0.5, Math.PI)).toBeCloseTo(Math.PI, 9));
  it('S30 轨道能量：a=1,mu=1 → -0.5', () => expect(orbitEnergyFromElements(1, 1)).toBe(-0.5));
  it('非法输入', () => {
    expect(virialCoefficient(1, 0)).toBeNaN();
    expect(inclination(0, 0, 0)).toBeNaN();
  });
});
