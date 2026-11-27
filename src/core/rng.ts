/** 可复现的伪随机数发生器（mulberry32）。 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // 保证 32 位无符号、非零种子
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** [0, 1) 均匀分布。 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 均匀分布。 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** 标准正态分布（Box-Muller）。 */
  normal(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** 单位圆内均匀采样（开方反演，避免中心聚集）。 */
  inUnitDisc(): { x: number; y: number } {
    const r = Math.sqrt(this.next());
    const a = this.next() * Math.PI * 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  /** 概率为 p 时返回 true。 */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** 由种子派生 N 个稳定子种子，便于并行/分段初始化。 */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
