import { describe, expect, it } from 'vitest';
import { BodySet } from '../src/core/bodies';
import { computeEnergy } from '../src/core/energy';
import { DirectSolver } from '../src/core/forces/direct';
import { stepRk4, stepVerlet } from '../src/core/integrator';
import { DEFAULT_PHYSICS } from '../src/core/params';
import type { PhysicsParams } from '../src/core/types';

function makeBodies(rows: Array<[number, number, number, number, number]>): BodySet {
  const b = new BodySet(rows.length);
  rows.forEach(([m, x, y, vx, vy], i) => {
    b.mass[i] = m;
    b.x[i] = x;
    b.y[i] = y;
    b.vx[i] = vx;
    b.vy[i] = vy;
  });
  return b;
}

const P = (over: Partial<PhysicsParams> = {}): PhysicsParams => ({
  ...DEFAULT_PHYSICS,
  softening: 1e-6,
  collision: 'none',
  ...over,
});

describe('二体圆轨道（Velocity Verlet）', () => {
  it('轨道半径与能量在整周期内保持稳定', () => {
    // m=1, 间距 2，圆轨道速度 √(Gm/2d)=0.5，周期 4π
    const b = makeBodies([
      [1, -1, 0, 0, -0.5],
      [1, 1, 0, 0, 0.5],
    ]);
    const solver = new DirectSolver();
    const p = P();
    const e0 = computeEnergy(b, p.G, p.softening)!;
    const dt = 0.005;
    const steps = Math.round((4 * Math.PI) / dt);

    let maxR = 0;
    let minR = Infinity;
    for (let s = 0; s < steps; s++) {
      stepVerlet(b, solver, p, dt, s > 0);
      const r = Math.hypot(b.x[0], b.y[0]);
      maxR = Math.max(maxR, r);
      minR = Math.min(minR, r);
    }

    expect(minR).toBeGreaterThan(0.995);
    expect(maxR).toBeLessThan(1.005);

    const e1 = computeEnergy(b, p.G, p.softening)!;
    const drift = Math.abs((e1.total - e0.total) / e0.total);
    expect(drift).toBeLessThan(1e-4);

    // 质心不应漂移
    const cx = (b.x[0] + b.x[1]) / 2;
    const cy = (b.y[0] + b.y[1]) / 2;
    expect(Math.hypot(cx, cy)).toBeLessThan(1e-3);

    // 总动量为零
    const px = b.mass[0] * b.vx[0] + b.mass[1] * b.vx[1];
    const py = b.mass[0] * b.vy[0] + b.mass[1] * b.vy[1];
    expect(Math.hypot(px, py)).toBeLessThan(1e-9);
  });

  it('Verlet 的长期能量误差有界（辛性）', () => {
    const b = makeBodies([
      [1, -1, 0, 0, -0.5],
      [1, 1, 0, 0, 0.5],
    ]);
    const solver = new DirectSolver();
    const p = P();
    const dt = 0.01;
    const e0 = computeEnergy(b, p.G, p.softening)!.total;

    // 跑 5 个周期
    for (let s = 0; s < Math.round((20 * Math.PI) / dt); s++) {
      stepVerlet(b, solver, p, dt, s > 0);
    }
    const e1 = computeEnergy(b, p.G, p.softening)!.total;
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(2e-3);
  });
});

describe('RK4 积分器', () => {
  it('相同步长下比 Verlet 更精确', () => {
    const mk = () =>
      makeBodies([
        [1, -1, 0, 0, -0.5],
        [1, 1, 0, 0, 0.5],
      ]);
    const p = P();
    const dt = 0.02;
    const steps = Math.round((4 * Math.PI) / dt);

    const a = mk();
    const sa = new DirectSolver();
    for (let s = 0; s < steps; s++) stepRk4(a, sa, p, dt);

    const b = mk();
    const sb = new DirectSolver();
    for (let s = 0; s < steps; s++) stepVerlet(b, sb, p, dt, s > 0);

    const rk4R = Math.hypot(a.x[0], a.y[0]);
    const verletR = Math.hypot(b.x[0], b.y[0]);
    expect(Math.abs(rk4R - 1)).toBeLessThan(Math.abs(verletR - 1));
    expect(Math.abs(rk4R - 1)).toBeLessThan(1e-5);
  });
});
