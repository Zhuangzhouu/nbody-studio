import { describe, expect, it } from 'vitest';
import { BodySet } from '../src/core/bodies';
import { DirectSolver } from '../src/core/forces/direct';
import { BarnesHutSolver } from '../src/core/forces/barnes-hut';
import { ParticleMeshSolver } from '../src/core/forces/particle-mesh';
import { stepRk4, stepVerlet } from '../src/core/integrator';
import { DEFAULT_PHYSICS } from '../src/core/params';
import type { PhysicsParams } from '../src/core/types';

function p3(over: Partial<PhysicsParams> = {}): PhysicsParams {
  return { ...DEFAULT_PHYSICS, dimensions: 3, softening: 1e-6, collision: 'none', ...over };
}

function threeBodies(): BodySet {
  const b = new BodySet(2, 1, 2, 3);
  b.mass.set([1, 1]);
  b.grav.set([1, 1]);
  // xz 平面上的圆轨道：验证 z 分量真正参与积分
  b.x[0] = -1;
  b.z[0] = 0;
  b.x[1] = 1;
  b.z[1] = 0;
  b.vz[0] = -0.5;
  b.vz[1] = 0.5;
  return b;
}

describe('3D 直接求和', () => {
  it('z 方向圆轨道保持半径并守恒动量', () => {
    const b = threeBodies();
    const solver = new DirectSolver();
    const params = p3();
    const dt = 0.005;
    for (let s = 0; s < Math.round((4 * Math.PI) / dt); s++) {
      stepVerlet(b, solver, params, dt, s > 0);
    }
    expect(Math.hypot(b.x[0], b.z[0])).toBeCloseTo(1, 3);
    expect(b.vx[0]).toBeCloseTo(0, 3);
    expect(b.vx[1]).toBeCloseTo(0, 3);
    expect(b.mass[0] * b.vz[0] + b.mass[1] * b.vz[1]).toBeCloseTo(0, 9);
  });

  it('每个天体可独立设置引力参数（μ/G）', () => {
    const b = new BodySet(2, 1, 2, 3);
    b.mass.set([1, 1]);
    b.grav.set([1, 4]);
    b.x[1] = 10;
    const solver = new DirectSolver();
    solver.compute(b, p3());
    // 天体 0 感受到的加速度 ∝ 天体 1 的引力质量 4
    expect(b.ax[0]).toBeCloseTo(4 / 100, 6);
    // D4 新口径：受力端也乘自身荷质比 grav/mass=4，使 F_ij = -F_ji（动量守恒）
    expect(b.ax[1]).toBeCloseTo(-4 / 100, 6);
    expect(b.mass[0] * b.ax[0] + b.mass[1] * b.ax[1]).toBeCloseTo(0, 10);
  });

  it('2D 模式忽略 z 分量', () => {
    const b = new BodySet(2, 1, 2, 2);
    b.mass.set([1, 1]);
    b.grav.set([1, 1]);
    b.z.set([100, -100]);
    b.x[1] = 10;
    new DirectSolver().compute(b, p3({ dimensions: 2 }));
    expect(b.ax[0]).toBeCloseTo(1 / 100, 6);
    expect(b.az[0]).toBe(0);
  });
});

describe('3D Barnes-Hut 八叉树', () => {
  it('与直接求和收敛，且 θ 越小误差越小', () => {
    const n = 400;
    const b = new BodySet(n, 1, n, 3);
    for (let i = 0; i < n; i++) {
      const u = Math.cbrt((i + 0.5) / n);
      const ct = 1 - (2 * (i + 0.5)) / n;
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      const phi = i * 2.399963;
      b.mass[i] = 1;
      b.grav[i] = 1;
      b.x[i] = u * st * Math.cos(phi) * 20;
      b.y[i] = u * st * Math.sin(phi) * 20;
      b.z[i] = u * ct * 20;
    }
    const direct = new DirectSolver();
    direct.compute(b, p3());
    const refX = Float64Array.from(b.ax.subarray(0, n));
    const refY = Float64Array.from(b.ay.subarray(0, n));
    const refZ = Float64Array.from(b.az.subarray(0, n));

    const bh = new BarnesHutSolver();
    const medians: number[] = [];
    for (const theta of [0.7, 0.25]) {
      const errs: number[] = [];
      bh.compute(b, p3({ theta }));
      for (let i = 0; i < n; i++) {
        const denom = Math.hypot(refX[i], refY[i], refZ[i]) || 1e-12;
        errs.push(Math.hypot(b.ax[i] - refX[i], b.ay[i] - refY[i], b.az[i] - refZ[i]) / denom);
      }
      errs.sort((a, c) => a - c);
      medians.push(errs[n >> 1]);
    }
    expect(medians[0]).toBeLessThan(0.3);
    expect(medians[1]).toBeLessThan(0.1);
    expect(medians[1]).toBeLessThan(medians[0]);
  });
});

describe('3D 粒子网格', () => {
  it('平滑三维分布与直接求和整体吻合', () => {
    const n = 4000;
    const R = 20;
    const b = new BodySet(n, 1, n, 3);
    for (let i = 0; i < n; i++) {
      const u = Math.cbrt((i + 0.5) / n);
      const ct = 1 - (2 * (i + 0.5)) / n;
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      const phi = i * 2.399963;
      b.mass[i] = 0.1;
      b.grav[i] = 0.1;
      b.x[i] = u * st * Math.cos(phi) * R;
      b.y[i] = u * st * Math.sin(phi) * R;
      b.z[i] = u * ct * R;
    }
    const pm = new ParticleMeshSolver(64);
    pm.compute(b, p3({ G: 1, softening: 0.4 }));
    const got = Float64Array.from(b.ax.subarray(0, n));
    const gotY = Float64Array.from(b.ay.subarray(0, n));
    const gotZ = Float64Array.from(b.az.subarray(0, n));

    const ref = new BodySet(n, 1, n, 3);
    ref.mass.set(b.mass);
    ref.grav.set(b.grav);
    ref.x.set(b.x);
    ref.y.set(b.y);
    ref.z.set(b.z);
    new DirectSolver().compute(ref, p3({ G: 1, softening: 0.4 }));

    const rel = (a: Float64Array, e: Float64Array): number => {
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (a[i] - e[i]) ** 2;
        den += e[i] ** 2;
      }
      return Math.sqrt(num / den);
    };
    expect(rel(got, ref.ax.subarray(0, n))).toBeLessThan(0.5);
    expect(rel(gotY, ref.ay.subarray(0, n))).toBeLessThan(0.5);
    expect(rel(gotZ, ref.az.subarray(0, n))).toBeLessThan(0.5);
  });
});

describe('3D RK4', () => {
  it('z 方向轨道积分比 Verlet 更精确', () => {
    const params = p3();
    const dt = 0.02;
    const steps = Math.round((4 * Math.PI) / dt);
    const a = threeBodies();
    for (let s = 0; s < steps; s++) stepRk4(a, new DirectSolver(), params, dt);
    const b = threeBodies();
    for (let s = 0; s < steps; s++) stepVerlet(b, new DirectSolver(), params, dt, s > 0);
    expect(Math.abs(Math.hypot(a.x[0], a.z[0]) - 1)).toBeLessThan(
      Math.abs(Math.hypot(b.x[0], b.z[0]) - 1),
    );
  });
});
