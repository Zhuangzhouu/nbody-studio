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
