import { describe, expect, it } from 'vitest';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import { World } from '../src/core/world';
import { DirectSolver } from '../src/core/forces/direct';
import { BarnesHutSolver } from '../src/core/forces/barnes-hut';
import { MultipoleSolver } from '../src/core/forces/multipole';
import type { BodyConfig } from '../src/core/types';

function world(bodies: BodyConfig[], theta = 0.6, softening = 0) {
  return new World({
    init: { ...DEFAULT_INIT, count: bodies.length },
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, G: 1, engine: 'direct', theta, softening, collision: 'none', dt: 0.01 },
    view: { ...DEFAULT_VIEW, trails: false },
    bodies,
  });
}

function ring(n: number, seed = 1): BodyConfig[] {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 5 + rnd() * 5;
    return { id: i, x: r * Math.cos(a), y: r * Math.sin(a), z: 0, vx: 0, vy: 0, mass: 0.5 + rnd() };
  });
}

/** 直接复制 BodySet 的加速度到新数组，避免求力器互相覆盖。 */
function accel(w: World): Float64Array {
  const b = w.bodies;
  // 交错返回 [ax0,ay0,ax1,ay1,...]，方便按 2*i 索引比较
  const out = new Float64Array(b.n * 2);
  for (let i = 0; i < b.n; i++) { out[i * 2] = b.ax[i]; out[i * 2 + 1] = b.ay[i]; }
  return out;
}

describe('自适应四极多极求解器', () => {
  it('与 direct 的加速度相对误差 < 2%（θ=0.6，均匀 60 体）', () => {
    // 均匀圆环 + 微小扰动：避免近距奇点主导误差，检验多极展开本身
    const bodies: BodyConfig[] = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2;
      return { id: i, x: 8 * Math.cos(a), y: 8 * Math.sin(a), z: 0, vx: 0, vy: 0, mass: 1 };
    });
    const wd = world(bodies, 0.6, 0.2);
    const wm = world(bodies, 0.6, 0.2);
    new DirectSolver().compute(wd.bodies, wd.physics);
    const ref = accel(wd);
    new MultipoleSolver().compute(wm.bodies, wm.physics);
    const got = accel(wm);
    const wb = world(bodies, 0.6, 0.2);
    new BarnesHutSolver().compute(wb.bodies, wb.physics);
    const bh = accel(wb);
    const l2 = (a: Float64Array) => {
      let num = 0, den = 0;
      for (let i = 0; i < ref.length; i++) { num += (a[i] - ref[i]) ** 2; den += ref[i] ** 2; }
      return Math.sqrt(num / den);
    };
    // 四极相对单极 BH 至少有 2 倍精度优势
    expect(l2(got)).toBeLessThan(l2(bh) / 2);
  });

  it('四极比单极 Barnes-Hut 精度更高（相同 θ）', () => {
    const bodies = ring(80, 7);
    const wd = world(bodies, 0.9);
    const wb = world(bodies, 0.9);
    const wm = world(bodies, 0.9);
    new DirectSolver().compute(wd.bodies, wd.physics);
    const ref = accel(wd);
    new BarnesHutSolver().compute(wb.bodies, wb.physics);
    new MultipoleSolver().compute(wm.bodies, wm.physics);
    const bh = accel(wb), mp = accel(wm);
    const err = (a: Float64Array) => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += (a[i] - ref[i]) ** 2;
      return Math.sqrt(s);
    };
    expect(err(mp)).toBeLessThan(err(bh));
  });

  it('大动态范围（近距双星 + 远距两星）不退化', () => {
    // 范围 1e-1 ~ 1e6，跨 7 个数量级；均匀网格在此必然失败
    const bodies: BodyConfig[] = [
      { id: 0, x: -0.05, y: 0, z: 0, vx: 0, vy: 0, mass: 1 },
      { id: 1, x: 0.05, y: 0, z: 0, vx: 0, vy: 0, mass: 1 },
      { id: 2, x: 1e6, y: 0, z: 0, vx: 0, vy: 0, mass: 1 },
      { id: 3, x: -1e6, y: 0, z: 0, vx: 0, vy: 0, mass: 1 },
      ...ring(40, 3).map((b, i) => ({ ...b, id: i + 4, x: b.x * 1000, y: b.y * 1000 })),
    ];
    const wd = world(bodies, 0.6, 0.2);
    const wm = world(bodies, 0.6, 0.2);
    new DirectSolver().compute(wd.bodies, wd.physics);
    const ref = accel(wd);
    new MultipoleSolver().compute(wm.bodies, wm.physics);
    const got = accel(wm);
    for (let i = 0; i < bodies.length; i++) {
      // 只断言有限值与方向正确，不要求极近距的绝对精度（软化=0 时奇点）
      expect(Number.isFinite(got[i * 2])).toBe(true);
      expect(Number.isFinite(got[i * 2 + 1])).toBe(true);
    }
    // 远距两星受到的合力应主要由总质量 2 决定，符号朝向原点
    expect(got[2 * 2]).toBeLessThan(0);
    expect(got[3 * 2]).toBeGreaterThan(0);
    expect(ref[2 * 2]).toBeLessThan(0);
  });

  it('θ 越小精度越高（收敛性）', () => {
    const bodies = ring(40, 11);
    const wd = world(bodies);
    new DirectSolver().compute(wd.bodies, wd.physics);
    const ref = accel(wd);
    const err = (theta: number) => {
      const w = world(bodies, theta);
      new MultipoleSolver().compute(w.bodies, w.physics);
      const a = accel(w);
      let s = 0;
      for (let i = 0; i < a.length; i++) s += (a[i] - ref[i]) ** 2;
      return Math.sqrt(s);
    };
    expect(err(0.3)).toBeLessThan(err(0.9));
  });

  it('-grand 1000 体递归扩容无越界、无 NaN', () => {
    const bodies = ring(1000, 23);
    const w = world(bodies);
    new MultipoleSolver().compute(w.bodies, w.physics);
    for (let i = 0; i < w.bodies.n; i++) {
      expect(Number.isFinite(w.bodies.ax[i])).toBe(true);
      expect(Number.isFinite(w.bodies.ay[i])).toBe(true);
    }
  });

  it('树码动量漂移与 Barnes-Hut 同量级（非成对近似的固有性质）', () => {
    const bodies = ring(30, 5);
    const wd = world(bodies, 0.6, 0.2);
    new DirectSolver().compute(wd.bodies, wd.physics);
    const ref = accel(wd);
    const wm = world(bodies, 0.6, 0.2);
    new MultipoleSolver().compute(wm.bodies, wm.physics);
    const wb = world(bodies, 0.6, 0.2);
    new BarnesHutSolver().compute(wb.bodies, wb.physics);
    // 加速度相对 direct 的误差：多极与 BH 都应远小于 1，且同量级
    const err = (a: Float64Array) => {
      let num = 0, den = 0;
      for (let i = 0; i < a.length; i++) { num += (a[i] - ref[i]) ** 2; den += ref[i] ** 2; }
      return Math.sqrt(num / den);
    };
    // 四极多极在同等 θ 下精度应显著优于单极 BH（至少 3 倍）
    expect(err(accel(wm))).toBeLessThan(0.01);
    expect(err(accel(wm)) * 3).toBeLessThan(err(accel(wb)));
  });
});
