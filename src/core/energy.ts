/**
 * 能量诊断（2D/3D 通用）：
 *   E = Σ½·mass·v² − ½·ΣΣ G·grav_i·grav_j / √(r²+ε²)
 * 引力质量可与惯性质量不同（逐体配置），因此势能使用 grav。
 * 大规模下 O(N²) 统计代价过高，返回 null（界面显示“—”）。
 */

import type { BodySet } from './bodies';

export interface EnergyBreakdown {
  kinetic: number;
  potential: number;
  total: number;
}

export function computeEnergy(
  b: BodySet,
  G: number,
  softening: number,
  maxBodies = 4096,
): EnergyBreakdown | null {
  if (b.n > maxBodies) return null;
  const { x, y, z, vx, vy, vz, mass } = b;
  const useZ = b.dimensions === 3;
  const eps2 = softening * softening;

  let kinetic = 0;
  let potential = 0;

  for (let i = 0; i < b.n; i++) {
    if (mass[i] <= 0) continue;
    kinetic += 0.5 * mass[i] * (vx[i] * vx[i] + vy[i] * vy[i] + (useZ ? vz[i] * vz[i] : 0));
    const gi = b.gravMass(i);
    for (let j = i + 1; j < b.n; j++) {
      if (mass[j] <= 0) continue;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const dz = useZ ? z[j] - z[i] : 0;
      potential -= (G * gi * b.gravMass(j)) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
    }
  }

  return { kinetic, potential, total: kinetic + potential };
}
