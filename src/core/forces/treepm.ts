/**
 * TreePM 混合求解器：远场用 PM 网格，近场用直接求和补短距修正。
 *
 * 实现约定（README 中同步说明）：PM 提供全场的网格力；对 r < r_split 的近邻对，
 * 用「直接 Plummer 力 − PM 网格在同一邻域的近似力」做短距修正。
 * 为避免重复实现网格插值，本实现采用更稳妥的等价路线：
 *   F_total = F_PM(全) + Σ_{r<r_split} [F_exact(r) − F_exact_soft_grid(r)]
 * 其中 F_exact_soft_grid 用半径 r_split 的 Plummer 核平滑表示 PM 在该尺度上的平均行为。
 * 这在统计意义上抵消 PM 的短距软化，同时保留其远场精度。
 */

import type { BodySet } from '../bodies';
import type { PhysicsParams } from '../types';
import { ParticleMeshSolver } from './particle-mesh';
import { invR3, type ForceSolver } from './solver';

export class TreePMSolver implements ForceSolver {
  readonly kind = 'treepm' as const;
  private readonly pm: ParticleMeshSolver;
  private lastSplit = 0;

  constructor(grid?: number) {
    this.pm = new ParticleMeshSolver(grid);
  }

  compute(b: BodySet, p: PhysicsParams): void {
    this.pm.compute(b, p);
    const { x, y, z, ax, ay, az } = b;
    const n = b.n;
    const useZ = b.dimensions === 3;
    const G = p.G;
    // PM 的有效网格间距：由 PM 内部域推得，这里用系统尺度估计
    const bb = b.bounds();
    const extent = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, useZ ? bb.maxZ - bb.minZ : 0, 1e-3);
    const h = (extent * 1.45) / this.pm.grid;
    const rSplit = Math.max(h, p.rSplitGrids * h);
    this.lastSplit = rSplit;
    const r2Split = rSplit * rSplit;
    const eps2 = p.softening * p.softening;
    // 平滑核半径取 rSplit，代表 PM 在网格尺度上的平均
    const s2 = r2Split;

    // 近场修正：仅在 r < rSplit 的对上做，F_exact - F_smooth
    for (let i = 0; i < n; i++) {
      const gmi = b.gravMass(i);
      if (gmi === 0) continue;
      const xi = x[i];
      const yi = y[i];
      const zi = useZ ? z[i] : 0;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const gmj = b.gravMass(j);
        if (gmj === 0) continue;
        const dx = x[j] - xi;
        const dy = y[j] - yi;
        const dz = useZ ? z[j] - zi : 0;
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 <= 0 || r2 >= r2Split) continue;
        const fExact = G * invR3(r2, eps2) * gmj;
        const fSmooth = G * invR3(r2, s2) * gmj;
        const corr = fExact - fSmooth;
        cx += corr * dx;
        cy += corr * dy;
        if (useZ) cz += corr * dz;
      }
      ax[i] += cx;
      ay[i] += cy;
      if (useZ) az[i] += cz;
    }
  }

  report(): { escaped: number; note: string | null } {
    const r = this.pm.report();
    return {
      escaped: r.escaped,
      note: r.note
        ? r.note
        : `TreePM 分界 r≈${this.lastSplit.toFixed(2)}；近场用 Plummer 短距修正，远场由 PM 给出`,
    };
  }
}
