import { describe, expect, it } from 'vitest';
import {
  orbitalSpeedAt, gravitationalBindingEnergy, rocheLobeRadius, freeFallTime,
  surfaceGravity, densityFromMassRadius, keplerSolver, lorentzFactor,
  relativisticBeta, angularFrequency,
} from '../src/core/physics-formulas';

describe('T11–T20 物理补全', () => {
  it('T11 活力公式：圆轨道 a=r → v=√(μ/r)', () => expect(orbitalSpeedAt(1, 1, 1)).toBeCloseTo(1, 9));
  it('T12 束缚能', () => expect(gravitationalBindingEnergy(1, 1, 2, 1)).toBe(-0.5));
  it('T13 洛希瓣：q→0 时 r_L/a ≈ 0.49q^(2/3)/0.6', () => {
    expect(rocheLobeRadius(1, 0.001)).toBeGreaterThan(0);
    expect(rocheLobeRadius(1, 1)).toBeCloseTo(0.379, 2);
  });
  it('T14 自由落体时间', () => expect(freeFallTime(1, 1, 1)).toBeCloseTo(Math.PI / (2 * Math.SQRT2), 9));
  it('T15 表面重力', () => expect(surfaceGravity(1, 2, 1)).toBe(0.25));
  it('T16 密度', () => expect(densityFromMassRadius(1, 1)).toBeCloseTo(3 / (4 * Math.PI), 9));
  it('T17 Kepler 求解：e=0 → E=M', () => expect(keplerSolver(1.2, 0)).toBeCloseTo(1.2, 9));
  it('T18/T19 相对论', () => {
    expect(lorentzFactor(0.6, 1)).toBeCloseTo(1.25, 9);
    expect(relativisticBeta(0.5, 2)).toBe(0.25);
    expect(lorentzFactor(1, 1)).toBe(Infinity);
  });
  it('T20 平均运动', () => expect(angularFrequency(1, 1, 1)).toBeCloseTo(1, 9));
  it('非法输入', () => {
    expect(orbitalSpeedAt(-1, 1, 1)).toBeNaN();
    expect(keplerSolver(0, 1)).toBeNaN();
  });
});
