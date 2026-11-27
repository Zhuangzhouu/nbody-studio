/**
 * 碰撞处理：按 x 轴 sweep-and-prune（O(N log N + 候选对）），同时支持 2D / 3D。
 *
 *  - merge ：完全非弹性并合，守恒惯性质量、引力质量、总动量，半径按体积相加；
 *  - bounce：带恢复系数的弹性散射，另加位置修正避免穿透粘连。
 *
 * 不再因天体数量自动关闭碰撞；是否使用由配置决定。
 */

import { starTypeCode, type BodySet } from './bodies';
import { spectralClass } from './stellar';
import type { PhysicsParams, StellarConfig } from './types';

export interface CollisionStats {
  contacts: number;
  merges: number;
}

export function resolveCollisions(
  b: BodySet,
  p: PhysicsParams,
  stats: CollisionStats,
  stellar?: StellarConfig,
): boolean {
  stats.contacts = 0;
  stats.merges = 0;
  if (p.collision === 'none' || b.n < 2) return false;

  const n = b.n;
  const { x, y, z, mass, grav, vx, vy, vz, radius } = b;
  const useZ = b.dimensions === 3;

  let maxR = 0;
  let alive = 0;
  for (let i = 0; i < n; i++) {
    if (mass[i] <= 0) continue;
    alive++;
    if (radius[i] > maxR) maxR = radius[i];
  }
  if (alive < 2 || maxR <= 0) return false;

  let order = new Int32Array(alive);
  let m = 0;
  for (let i = 0; i < n; i++) if (mass[i] > 0) order[m++] = i;
  order = order.subarray(0, m);
  order.sort(); // TypedArray 默认数值排序

  const cutoff = maxR * 2;
  const e = Math.max(0, Math.min(1, p.restitution));
  let contacts = 0;
  let merges = 0;

  for (let a = 0; a < m; a++) {
    const i = order[a];
    if (mass[i] <= 0) continue;
    const xi = x[i];
    const yi = y[i];
    const zi = useZ ? z[i] : 0;

    for (let bb = a + 1; bb < m; bb++) {
      const j = order[bb];
      if (mass[j] <= 0) continue;
      const dx = x[j] - xi;
      if (dx > cutoff) break; // x 已排序：后续更远
      const dy = y[j] - yi;
      const dz = useZ ? z[j] - zi : 0;
      const d2 = dx * dx + dy * dy + dz * dz;
      const sum = radius[i] + radius[j];
      if (d2 >= sum * sum) continue;

      contacts++;
      const mi = mass[i];
      const mj = mass[j];

      if (p.collision === 'merge') {
        const total = mi + mj;
        const fi = mi / total;
        const fj = mj / total;
        // G4：BH 吸积（开关开启时黑洞吞任何体，类型保持 BH）
        const ti = b.starAt(i);
        const tj = b.starAt(j);
        const iIsBH = ti === 'blackHole';
        const jIsBH = tj === 'blackHole';
        const bhWins = stellar?.accretion && (iIsBH || jIsBH) && !(iIsBH && jIsBH);
        const survivor = bhWins && jIsBH ? j : i;
        const absorbed = bhWins && jIsBH ? i : j;

        if (bhWins) {
          x[survivor] = xi * fi + x[j] * fj;
          y[survivor] = yi * fi + y[j] * fj;
          if (useZ) z[survivor] = zi * fi + z[j] * fj;
          vx[survivor] = vx[i] * fi + vx[j] * fj;
          vy[survivor] = vy[i] * fi + vy[j] * fj;
          if (useZ) vz[survivor] = vz[i] * fi + vz[j] * fj;
          grav[survivor] += grav[absorbed];
          mass[survivor] = total;
          mass[absorbed] = 0;
          b.starType[survivor] = b.starType[survivor]; // 保持黑洞类型
          b.evolvesFlag[survivor] = 0;
        } else {
          x[i] = xi * fi + x[j] * fj;
          y[i] = yi * fi + y[j] * fj;
          if (useZ) z[i] = zi * fi + z[j] * fj;
          vx[i] = vx[i] * fi + vx[j] * fj;
          vy[i] = vy[i] * fi + vy[j] * fj;
          if (useZ) vz[i] = vz[i] * fi + vz[j] * fj;
          grav[i] += grav[j];
          mass[i] = total;
          mass[j] = 0;
          // 两遗骸相触：类型取质量大者；MS 并合后按质量重分类
          const remnantTypes = ['whiteDwarf', 'neutronStar', 'blackHole'];
          if (remnantTypes.includes(ti) || remnantTypes.includes(tj)) {
            b.starType[i] = mi >= mj ? b.starType[i] : b.starType[j];
            b.evolvesFlag[i] = 0;
          } else if (b.evolvesFlag[i] || b.evolvesFlag[j]) {
            const mPhys = mass[i] / (stellar?.massUnit ?? 1);
            b.starType[i] = spectralCodeForMass(mPhys);
            b.lifespanMyr[i] = 0; // 简化：重算由演化模块负责
          }
        }
        radius[i] = Math.cbrt(radius[i] ** 3 + radius[j] ** 3);
        b.explicitRadius[i] = 1;
        merges++;
        break; // i 已被合并并移动，重新从下一对开始
      }

      // bounce
      const d = Math.sqrt(d2) || 1e-12;
      const nxv = dx / d;
      const nyv = dy / d;
      const nzv = useZ ? dz / d : 0;
      const vn = (vx[j] - vx[i]) * nxv + (vy[j] - vy[i]) * nyv + (useZ ? (vz[j] - vz[i]) * nzv : 0);
      if (vn < 0) {
        const impulse = (-(1 + e) * vn) / (1 / mi + 1 / mj);
        vx[i] -= (impulse / mi) * nxv;
        vy[i] -= (impulse / mi) * nyv;
        if (useZ) vz[i] -= (impulse / mi) * nzv;
        vx[j] += (impulse / mj) * nxv;
        vy[j] += (impulse / mj) * nyv;
        if (useZ) vz[j] += (impulse / mj) * nzv;
      }
      const overlap = sum - d;
      const ci = (overlap * mj) / (mi + mj) * 0.5;
      const cj = (overlap * mi) / (mi + mj) * 0.5;
      x[i] -= nxv * ci;
      y[i] -= nyv * ci;
      if (useZ) z[i] -= nzv * ci;
      x[j] += nxv * cj;
      y[j] += nyv * cj;
      if (useZ) z[j] += nzv * cj;
    }
  }

  stats.contacts = contacts;
  stats.merges = merges;
  return merges > 0;
}


/** 质量 → 恒星类型字节码（H1：统一走 spectralClass + starTypeCode，含褐矮星带）。 */
function spectralCodeForMass(m: number): number {
  return starTypeCode(spectralClass(m));
}
