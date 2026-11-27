/**
 * 天体集合：Structure-of-Arrays 布局，支持 2D / 3D 与逐体引力质量。
 *
 * 两种质量分工：
 *  - mass[i]：惯性质量，用于动能、碰撞与并合；
 *  - grav[i]：引力质量（μ/G），用于引力源强度，默认等于 mass，但可由 JSON 独立指定。
 *
 * 2D 模式下 z/vz/az 恒为 0，物理公式天然 3D，因此同一套引擎同时服务两种维度。
 */

import type { Dimensions, PhysicsParams } from './types';
import type { PhaseType, StarType } from './types';

export interface Bounds3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class BodySet {
  readonly capacity: number;
  n: number;
  dimensions: Dimensions;

  /** 惯性质量。 */
  mass: Float64Array;
  /** 引力质量（μ/G），可与惯性质量不同。 */
  grav: Float64Array;

  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;

  /** 碰撞体半径。 */
  radius: Float64Array;
  /** 显式指定的碰撞半径（导入配置时不随 mass 重算）。 */
  explicitRadius: Uint8Array;

  /** G 组：恒星类型枚举（0=planet 默认，其余见 STAR_TYPE_CODES）。 */
  starType: Uint8Array;
  /** 出生时间（物理 Myr）。 */
  birthMyr: Float64Array;
  /** 当前相位的结束时刻（物理 Myr）；主序相 = t_MS；0 = 不限或非主序。 */
  lifespanMyr: Float64Array;
  /** 该体是否参与演化状态机（仅 auto 体）。 */
  evolvesFlag: Uint8Array;
  /** H2/H3：上次相位事件 / WR 星风批量应用的物理时刻（Myr）。 */
  phaseAppliedMyr: Float64Array;

  /** 采样权重：1 = 逐一模拟；w>1 = 每个代表粒子代表 w 颗真实天体。 */
  weight: number;
  /** 请求的真实天体数。 */
  requested: number;

  constructor(capacity: number, weight = 1, requested = capacity, dimensions: Dimensions = 3) {
    this.capacity = capacity;
    this.n = capacity;
    this.weight = weight;
    this.requested = requested;
    this.dimensions = dimensions;

    const mk = () => new Float64Array(capacity);
    this.mass = mk();
    this.grav = mk();
    this.x = mk();
    this.y = mk();
    this.z = mk();
    this.vx = mk();
    this.vy = mk();
    this.vz = mk();
    this.ax = mk();
    this.ay = mk();
    this.az = mk();
    this.radius = mk();
    this.explicitRadius = new Uint8Array(capacity);
    this.starType = new Uint8Array(capacity);
    this.birthMyr = new Float64Array(capacity);
    this.lifespanMyr = new Float64Array(capacity);
    this.evolvesFlag = new Uint8Array(capacity);
    this.phaseAppliedMyr = new Float64Array(capacity);
  }

  /** 扩容全部 SoA 数组（含恒星旁路），返回新容量。 */
  grow(capacity: number): void {
    if (capacity <= this.capacity) return;
    const growF = (src: Float64Array): Float64Array => {
      const dst = new Float64Array(capacity);
      dst.set(src);
      return dst;
    };
    const growU = (src: Uint8Array): Uint8Array => {
      const dst = new Uint8Array(capacity);
      dst.set(src);
      return dst;
    };
    this.mass = growF(this.mass);
    this.grav = growF(this.grav);
    this.x = growF(this.x);
    this.y = growF(this.y);
    this.z = growF(this.z);
    this.vx = growF(this.vx);
    this.vy = growF(this.vy);
    this.vz = growF(this.vz);
    this.ax = growF(this.ax);
    this.ay = growF(this.ay);
    this.az = growF(this.az);
    this.radius = growF(this.radius);
    this.explicitRadius = growU(this.explicitRadius);
    this.starType = growU(this.starType);
    this.birthMyr = growF(this.birthMyr);
    this.lifespanMyr = growF(this.lifespanMyr);
    this.evolvesFlag = growU(this.evolvesFlag);
    this.phaseAppliedMyr = growF(this.phaseAppliedMyr);
    (this as unknown as { capacity: number }).capacity = capacity;
  }

  /** 交换删除（swap-remove），包含恒星旁路数组。 */
  swapRemove(index: number): void {
    const last = this.n - 1;
    if (index < 0 || index > last) return;
    if (index !== last) {
      const move = <T>(arr: T[] | Float64Array | Uint8Array): void => {
        (arr as unknown as Record<number, unknown>)[index] = (arr as unknown as Record<number, unknown>)[last];
      };
      [this.mass, this.grav, this.x, this.y, this.z, this.vx, this.vy, this.vz,
       this.ax, this.ay, this.az, this.radius, this.birthMyr, this.lifespanMyr,
       this.phaseAppliedMyr].forEach(move);
      [this.explicitRadius, this.starType, this.evolvesFlag].forEach(move);
    }
    this.n = last;
  }

  /** 读取恒星类型（含运行时相位）。 */
  starAt(i: number): StarType | 'auto' | PhaseType {
    return STAR_TYPE_CODES[this.starType[i]] ?? 'planet';
  }

  /**
   * 引力质量（含采样权重）。加速度 a_i = Σ G·grav_mass_j / r²。
   * D4：grav 允许负值（排斥）与零（不施力）。手工构造的 BodySet 若整列 grav 都为 0
   * 则视为「未设置」，自动回退到 mass；否则严格按配置值（含负号）参与计算。
   */
  private gravUnset = true;
  gravMass(i: number): number {
    if (this.gravUnset) {
      // 若 grav 全为 0，视为「未配置」，回退到 mass（兼容手工构造的测试体）。
      // 只要有一个非零 grav，就按配置值计算（含负值）。
      let any = false;
      for (let k = 0; k < this.n; k++) if (this.grav[k] !== 0) { any = true; break; }
      if (!any) return this.mass[i] * this.weight;
      this.gravUnset = false;
    }
    return this.grav[i] * this.weight;
  }
  /**
   * 自身荷质比 μ/m：非等效原理场景中，受力端要乘该因子，
   * 使 F_ij = G·μ_i·μ_j/r² 满足牛顿第三定律。
   */
  gravRatio(i: number): number {
    if (this.gravUnset) {
      let any = false;
      for (let k = 0; k < this.n; k++) if (this.grav[k] !== 0) { any = true; break; }
      if (!any) return 1;
      this.gravUnset = false;
    }
    const m = this.mass[i];
    return m > 0 ? this.grav[i] / m : 0;
  }
  /** 显式声明 grav 已由配置设定（含 0 / 负值）。 */
  markGravConfigured(): void {
    this.gravUnset = false;
  }
  /** 增量插入后重置探测缓存。 */
  invalidateGravCache(): void {
    this.gravUnset = true;
  }

  /** 依据质量与密度参数刷新碰撞半径：r ∝ m^(1/3)；显式半径不覆盖。 */
  refreshRadii(bodyRadius: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.explicitRadius[i]) continue;
      const m = this.mass[i];
      this.radius[i] = m > 0 ? bodyRadius * Math.cbrt(m) : 0;
    }
  }

  /** 把 grav 重置为 mass（生成器/默认路径）。 */
  syncGravToMass(): void {
    for (let i = 0; i < this.n; i++) this.grav[i] = this.mass[i];
  }

  /** 三维包围盒。2D 模式下 minZ=maxZ=0。 */
  bounds(pad = 0): Bounds3 {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.mass[i] <= 0) continue;
      const px = this.x[i];
      const py = this.y[i];
      const pz = this.dimensions === 3 ? this.z[i] : 0;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    if (!Number.isFinite(minX)) {
      return { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 };
    }
    return {
      minX: minX - pad,
      minY: minY - pad,
      minZ: minZ - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      maxZ: maxZ + pad,
    };
  }

  /** 质心（用引力质量加权）。 */
  centerOfMass(): { x: number; y: number; z: number; mass: number } {
    let mx = 0;
    let my = 0;
    let mz = 0;
    let mt = 0;
    for (let i = 0; i < this.n; i++) {
      const m = this.gravMass(i);
      if (m <= 0) continue;
      mx += this.x[i] * m;
      my += this.y[i] * m;
      mz += (this.dimensions === 3 ? this.z[i] : 0) * m;
      mt += m;
    }
    if (mt <= 0) return { x: 0, y: 0, z: 0, mass: 0 };
    return { x: mx / mt, y: my / mt, z: mz / mt, mass: mt };
  }

  /** 整体平移，把质心移到原点（消除整体漂移）。 */
  zeroMomentum(): void {
    let mt = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let i = 0; i < this.n; i++) {
      const m = this.gravMass(i);
      if (m <= 0) continue;
      mt += m;
      px += this.vx[i] * m;
      py += this.vy[i] * m;
      pz += (this.dimensions === 3 ? this.vz[i] : 0) * m;
    }
    if (mt <= 0) return;
    const cvx = px / mt;
    const cvy = py / mt;
    const cvz = pz / mt;
    for (let i = 0; i < this.n; i++) {
      this.vx[i] -= cvx;
      this.vy[i] -= cvy;
      if (this.dimensions === 3) this.vz[i] -= cvz;
    }
  }

  /** 把质心平移到原点。 */
  centerAtOrigin(): void {
    const com = this.centerOfMass();
    for (let i = 0; i < this.n; i++) {
      this.x[i] -= com.x;
      this.y[i] -= com.y;
      if (this.dimensions === 3) this.z[i] -= com.z;
    }
  }

  /** 清除已被并合的天体，返回新的 n。 */
  removeDead(): number {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.mass[i] <= 0) continue;
      if (w !== i) {
        this.mass[w] = this.mass[i];
        this.grav[w] = this.grav[i];
        this.x[w] = this.x[i];
        this.y[w] = this.y[i];
        this.z[w] = this.z[i];
        this.vx[w] = this.vx[i];
        this.vy[w] = this.vy[i];
        this.vz[w] = this.vz[i];
        this.radius[w] = this.radius[i];
        this.explicitRadius[w] = this.explicitRadius[i];
        this.starType[w] = this.starType[i];
        this.birthMyr[w] = this.birthMyr[i];
        this.lifespanMyr[w] = this.lifespanMyr[i];
        this.evolvesFlag[w] = this.evolvesFlag[i];
        this.phaseAppliedMyr[w] = this.phaseAppliedMyr[i];
      }
      w++;
    }
    this.n = w;
    return w;
  }

  /** 依据物理参数重算半径。 */
  applyPhysics(p: PhysicsParams): void {
    this.dimensions = p.dimensions;
    this.refreshRadii(p.bodyRadius);
  }
}


/**
 * starType 字节编码；索引即枚举值，0 保留给 planet（旧配置默认）。
 * H1/H2/H3：褐矮星与三个演化相位追加在尾部（不破坏既有编码值）；
 * 相位类型仅运行时出现，配置层不含。
 */
export const STAR_TYPE_CODES: readonly (StarType | 'auto' | PhaseType)[] = [
  'planet', 'auto', 'O', 'B', 'A', 'F', 'G', 'K', 'M',
  'whiteDwarf', 'neutronStar', 'blackHole',
  'brownDwarf', 'giant', 'supergiant', 'wolfRayet',
];

export function starTypeCode(type: StarType | 'auto' | PhaseType): number {
  const i = STAR_TYPE_CODES.indexOf(type);
  return i >= 0 ? i : 0;
}
