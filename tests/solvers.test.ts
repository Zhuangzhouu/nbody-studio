import { describe, expect, it } from 'vitest';
import { BodySet } from '../src/core/bodies';
import { BarnesHutSolver } from '../src/core/forces/barnes-hut';
import { DirectSolver } from '../src/core/forces/direct';
import { ParticleMeshSolver } from '../src/core/forces/particle-mesh';
import { DEFAULT_PHYSICS } from '../src/core/params';
import { Rng } from '../src/core/rng';
import type { PhysicsParams } from '../src/core/types';

const base: PhysicsParams = { ...DEFAULT_PHYSICS, softening: 0.4, collision: 'none' };

function randomDisc(n: number, seed = 1): BodySet {
  const rng = new Rng(seed);
  const b = new BodySet(n, 1, n);
  for (let i = 0; i < n; i++) {
    const p = rng.inUnitDisc();
    b.x[i] = p.x * 30;
    b.y[i] = p.y * 30;
    b.mass[i] = 1;
  }
  return b;
}

function relL2(a: Float64Array, b: Float64Array, n: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - b[i]) ** 2;
    den += b[i] ** 2;
  }
  return Math.sqrt(num / Math.max(den, 1e-30));
}

describe('Barnes-Hut 精度', () => {
  it('θ 越小误差越小，且中位相对误差符合 BH 收敛率', () => {
    const n = 600;
    const b = randomDisc(n);
    const direct = new DirectSolver();
    direct.compute(b, base);
    const refX = Float64Array.from(b.ax.subarray(0, n));
    const refY = Float64Array.from(b.ay.subarray(0, n));

    const bh = new BarnesHutSolver();
    const median: number[] = [];
    for (const theta of [0.7, 0.4, 0.2]) {
      b.ax.fill(0);
      b.ay.fill(0);
      bh.compute(b, { ...base, theta });
      const errs: number[] = [];
      for (let i = 0; i < n; i++) {
        const denom = Math.hypot(refX[i], refY[i]) || 1e-12;
        errs.push(Math.hypot(b.ax[i] - refX[i], b.ay[i] - refY[i]) / denom);
      }
      errs.sort((x, y) => x - y);
      median.push(errs[n >> 1]);
    }

    expect(median[0]).toBeLessThan(0.08);
    expect(median[1]).toBeLessThan(0.03);
    expect(median[2]).toBeLessThan(0.01);
    expect(median[2]).toBeLessThan(median[1]);
    expect(median[1]).toBeLessThan(median[0]);
  });

  it('不产生自作用力：单一天体加速度为零', () => {
    const b = new BodySet(1);
    b.mass[0] = 5;
    b.x[0] = 3;
    b.y[0] = -4;
    const bh = new BarnesHutSolver();
    bh.compute(b, base);
    expect(Math.hypot(b.ax[0], b.ay[0])).toBeLessThan(1e-12);
  });

  it('双体对称性：加速度等大反向', () => {
    const b = new BodySet(2);
    b.mass[0] = 1;
    b.mass[1] = 2;
    b.x[1] = 10;
    const bh = new BarnesHutSolver();
    bh.compute(b, base);
    // 天体 1 在 +x，被原点质量吸引 → 加速度指向 -x
    expect(b.ax[1]).toBeLessThan(0);
    expect(b.ay[1]).toBeCloseTo(0, 12);
    // 作用力大小相等：m1·a1 = -m2·a2
    expect(b.ax[0] * b.mass[0]).toBeCloseTo(-b.ax[1] * b.mass[1], 6);
  });
});

describe('粒子网格 (PM) 精度', () => {
  /** 把总质量分散到一个小球状团块里，避免单格 delta 带来的频谱截断噪声。 */
  function blob(totalMass: number, radius: number, count = 1500): BodySet {
    const rng = new Rng(11);
    const b = new BodySet(count + 1);
    b.mass[0] = 1e-6;
    for (let i = 0; i < count; i++) {
      const p = rng.inUnitDisc();
      b.mass[i + 1] = totalMass / count;
      b.x[i + 1] = p.x * radius;
      b.y[i + 1] = p.y * radius;
    }
    return b;
  }

  it('远场近似 1/r²（团块外部）', () => {
    const M = 1000;
    const b = blob(M, 3);
    // 在外围加一圈探针，并把它们也算进包围盒（保证团块居中）
    const probes = [12, 16, 20];
    const total = b.n + probes.length * 4;
    const big = new BodySet(total);
    big.mass.set(b.mass);
    big.x.set(b.x);
    big.y.set(b.y);
    let k = b.n;
    for (const r of probes) {
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2;
        big.mass[k] = 1e-9;
        big.x[k] = Math.cos(a) * r;
        big.y[k] = Math.sin(a) * r;
        k++;
      }
    }

    const pm = new ParticleMeshSolver(64);
    pm.compute(big, { ...base, G: 1, softening: 0 });

    probes.forEach((r, pi) => {
      const idx = b.n + pi * 4;
      const px = big.x[idx];
      const py = big.y[idx];
      const mag = Math.hypot(big.ax[idx], big.ay[idx]);
      const expected = M / (r * r);
      // 方向指向质心
      expect(big.ax[idx] * px + big.ay[idx] * py).toBeLessThan(0);
      expect(mag).toBeGreaterThan(expected * 0.75);
      expect(mag).toBeLessThan(expected * 1.25);
    });
  });

  it('与直接求和整体吻合（平滑盘，L2 误差 < 45%）', () => {
    const n = 4000;
    const rng = new Rng(23);
    const b = new BodySet(n);
    for (let i = 0; i < n; i++) {
      const p = rng.inUnitDisc();
      b.x[i] = p.x * 20;
      b.y[i] = p.y * 20;
      b.mass[i] = 0.005;
    }
    const pm = new ParticleMeshSolver(64);
    pm.compute(b, { ...base, G: 1, softening: 0.4 });
    const pmX = Float64Array.from(b.ax.subarray(0, n));

    const ref = new BodySet(n);
    ref.mass.set(b.mass);
    ref.x.set(b.x);
    ref.y.set(b.y);
    const direct = new DirectSolver();
    direct.compute(ref, { ...base, G: 1, softening: 0.4 });

    expect(relL2(pmX, ref.ax.subarray(0, n), n)).toBeLessThan(0.45);
  });

  it('满足牛顿第三定律：全场内力总和接近零', () => {
    const n = 8000;
    const rng = new Rng(41);
    const b = new BodySet(n);
    for (let i = 0; i < n; i++) {
      const p = rng.inUnitDisc();
      b.mass[i] = 0.01;
      b.x[i] = p.x * 20;
      b.y[i] = p.y * 20;
    }
    const pm = new ParticleMeshSolver(64);
    pm.compute(b, { ...base, G: 1, softening: 0.4 });

    let fx = 0;
    let fy = 0;
    let mag = 0;
    for (let i = 0; i < n; i++) {
      fx += b.mass[i] * b.ax[i];
      fy += b.mass[i] * b.ay[i];
      mag += b.mass[i] * Math.hypot(b.ax[i], b.ay[i]);
    }
    // 网格场是势的梯度，整体冲量应远小于单个天体受力的总和
    expect(Math.hypot(fx, fy) / mag).toBeLessThan(0.01);
  });

  it('输出不含 NaN / Infinity（含越界天体）', () => {
    const b = new BodySet(400);
    const rng = new Rng(77);
    for (let i = 0; i < 400; i++) {
      const p = rng.inUnitDisc();
      b.mass[i] = 0.05;
      b.x[i] = p.x * 50;
      b.y[i] = p.y * 50;
    }
    b.x[0] = 1e4; // 故意飞出网格
    b.y[1] = -1e4;
    const pm = new ParticleMeshSolver(32);
    pm.compute(b, { ...base, G: 1, softening: 0.4 });
    for (let i = 0; i < 400; i++) {
      expect(Number.isFinite(b.ax[i])).toBe(true);
      expect(Number.isFinite(b.ay[i])).toBe(true);
    }
  });
});

