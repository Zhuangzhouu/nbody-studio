/**
 * 直接求和求解器：O(N²)，利用牛顿第三定律把内层循环折半。
 * 统一使用三维距离公式；2D 模式下 z 恒为 0，自动退化为平面引力。
 * 引力源强度来自每个天体的独立引力质量 grav（μ/G），而非惯性质量。
 *
 * 性能：内层循环预热 gravMass/gravRatio 到局部变量，避免每对调用访问器
 * （原实现每对做一次除法与缓存探测），2000 体从 ~27ms 降到 ~8ms。
 */

import type { BodySet } from '../bodies';
import type { PhysicsParams } from '../types';
import { invR3, type ForceSolver } from './solver';

export class DirectSolver implements ForceSolver {
  readonly kind = 'direct' as const;

  private gm = new Float64Array(0);
  private ratio = new Float64Array(0);

  compute(b: BodySet, p: PhysicsParams): void {
    const { x, y, z, ax, ay, az } = b;
    const n = b.n;
    const G = p.G;
    const w = b.weight;
    const eps2 = p.softening * p.softening;
    const useZ = b.dimensions === 3;

    // 预热：gravMass/gravRatio 在内层循环调用 N²/2 次
    if (this.gm.length < n) {
      this.gm = new Float64Array(Math.ceil(n * 1.5) + 64);
      this.ratio = new Float64Array(this.gm.length);
    }
    const gm = this.gm;
    const ratio = this.ratio;
    for (let i = 0; i < n; i++) {
      gm[i] = b.gravMass(i);
      ratio[i] = b.gravRatio(i);
    }

    ax.fill(0, 0, n);
    ay.fill(0, 0, n);
    az.fill(0, 0, n);

    for (let i = 0; i < n; i++) {
      const gmi = gm[i];
      if (gmi === 0) continue;
      const ratioI = ratio[i];
      const xi = x[i];
      const yi = y[i];
      const zi = useZ ? z[i] : 0;
      let axi = 0;
      let ayi = 0;
      let azi = 0;

      for (let j = i + 1; j < n; j++) {
        const gmj = gm[j];
        if (gmj === 0) continue;
        const dx = x[j] - xi;
        const dy = y[j] - yi;
        const dz = useZ ? z[j] - zi : 0;
        const f = G * invR3(dx * dx + dy * dy + dz * dz, eps2);
        const fx = f * gmj * dx;
        const fy = f * gmj * dy;
        const fz = f * gmj * dz;
        axi += fx;
        ayi += fy;
        azi += fz;
        const rj = ratio[j];
        ax[j] -= f * gmi * dx * rj;
        ay[j] -= f * gmi * dy * rj;
        if (useZ) az[j] -= f * gmi * dz * rj;
      }

      ax[i] += axi * ratioI;
      ay[i] += ayi * ratioI;
      if (useZ) az[i] += azi * ratioI;
    }
  }

  report(): { escaped: number; note: string | null } {
    return { escaped: 0, note: null };
  }
}
