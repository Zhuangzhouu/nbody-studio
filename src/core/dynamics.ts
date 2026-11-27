/**
 * 动力学诊断：质心、动量、角动量、维里比率、逃逸计数。
 * 与 energy.ts 一样用惯性质量计算运动学量、引力质量计算势能。
 */

import type { BodySet } from './bodies';
import { computeEnergy } from './energy';

export interface DynamicsReport {
  comX: number;
  comY: number;
  comZ: number;
  comSpeed: number;
  momentum: number;
  angularMomentum: number;
  virial: number | null;
  escapeCount: number;
  kinetic: number;
  potential: number;
  total: number;
}

/** 计算动力学诊断；大 N 时能量相关项为 null。 */
export function computeDynamics(
  b: BodySet,
  G: number,
  softening: number,
  escapeRadius: number,
  maxBodies = 4096,
): DynamicsReport {
  const { x, y, z, vx, vy, vz, mass } = b;
  const useZ = b.dimensions === 3;
  let mt = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  let lx = 0;
  let ly = 0;
  let lz = 0;

  for (let i = 0; i < b.n; i++) {
    const m = mass[i];
    if (!(m > 0)) continue;
    const xi = x[i];
    const yi = y[i];
    const zi = useZ ? z[i] : 0;
    const vxi = vx[i];
    const vyi = vy[i];
    const vzi = useZ ? vz[i] : 0;
    mt += m;
    mx += xi * m;
    my += yi * m;
    mz += zi * m;
    px += vxi * m;
    py += vyi * m;
    pz += vzi * m;
    lx += (yi * vzi - zi * vyi) * m;
    ly += (zi * vxi - xi * vzi) * m;
    lz += (xi * vyi - yi * vxi) * m;
  }

  const comX = mt > 0 ? mx / mt : 0;
  const comY = mt > 0 ? my / mt : 0;
  const comZ = mt > 0 ? mz / mt : 0;
  const cvx = mt > 0 ? px / mt : 0;
  const cvy = mt > 0 ? py / mt : 0;
  const cvz = mt > 0 ? pz / mt : 0;

  let escapeCount = 0;
  const r2Limit = escapeRadius * escapeRadius;
  for (let i = 0; i < b.n; i++) {
    if (!(mass[i] > 0)) continue;
    const dx = x[i] - comX;
    const dy = y[i] - comY;
    const dz = useZ ? z[i] - comZ : 0;
    if (dx * dx + dy * dy + dz * dz > r2Limit) escapeCount++;
  }

  const energy = computeEnergy(b, G, softening, maxBodies);
  const virial = energy && Math.abs(energy.potential) > 1e-12
    ? (2 * energy.kinetic) / Math.abs(energy.potential)
    : null;

  return {
    comX,
    comY,
    comZ,
    comSpeed: Math.hypot(cvx, cvy, cvz),
    momentum: Math.hypot(px, py, pz),
    angularMomentum: Math.hypot(lx, ly, lz),
    virial,
    escapeCount,
    kinetic: energy ? energy.kinetic : Number.NaN,
    potential: energy ? energy.potential : Number.NaN,
    total: energy ? energy.total : Number.NaN,
  };
}

/** S22：转动惯量 I = Σ m·r²（相对原点）。 */
export function momentOfInertia(
  mass: Float64Array | number[], x: Float64Array | number[], y: Float64Array | number[],
  z: Float64Array | number[] | null, n: number,
): number {
  let I = 0;
  for (let i = 0; i < n; i++) {
    const m = mass[i];
    if (!(m > 0)) continue;
    const zz = z ? z[i] : 0;
    I += m * (x[i] * x[i] + y[i] * y[i] + zz * zz);
  }
  return I;
}

/** S23：维里系数别名 2K/|U|（与 virial.ts 口径一致）。 */
export function virialCoefficient(kinetic: number, potential: number): number {
  if (!Number.isFinite(kinetic) || !Number.isFinite(potential) || potential === 0) return NaN;
  return (2 * kinetic) / Math.abs(potential);
}

/** S25：比角动量 h = |r × v|。 */
export function specificAngularMomentum(
  rx: number, ry: number, rz: number, vx: number, vy: number, vz: number,
): number {
  return Math.hypot(ry * vz - rz * vy, rz * vx - rx * vz, rx * vy - ry * vx);
}

/** S26：拉普拉斯-龙格-楞次向量模 |e| = |v×h|/μ - 1（三维）。 */
export function laplaceRungeLenzNorm(
  rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, mu: number,
): number {
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);
  if (!(mu > 0) || h === 0) return NaN;
  const vxH = vy * hz - vz * hy;
  const vyH = vz * hx - vx * hz;
  const vzH = vx * hy - vy * hx;
  const ev = Math.hypot(vxH, vyH, vzH);
  return Math.abs(ev / mu - 1);
}

/** S27：轨道倾角 i = acos(Lz/|L|)，0–π。 */
export function inclination(lx: number, ly: number, lz: number): number {
  const L = Math.hypot(lx, ly, lz);
  if (L === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, lz / L)));
}

/** S28：真近点角 ν = 2·atan2(√(1+e)·sin(E/2), √(1-e)·cos(E/2))。 */
export function trueAnomaly(e: number, E: number): number {
  if (!(e >= 0 && e < 1)) return NaN;
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
}

/** S29：平近点角 M = E - e·sin(E)（给定偏近点角）。 */
export function meanAnomaly(e: number, E: number): number {
  if (!Number.isFinite(e) || !Number.isFinite(E)) return NaN;
  return E - e * Math.sin(E);
}

/** S30：由半长轴与 μ 求轨道能量 ε = -μ/(2a)。 */
export function orbitEnergyFromElements(a: number, mu: number): number {
  if (!(a > 0) || !Number.isFinite(mu)) return NaN;
  return -mu / (2 * a);
}
