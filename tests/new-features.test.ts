import { describe, expect, it } from 'vitest';
import { BodySet } from '../src/core/bodies';
import { computeEnergy } from '../src/core/energy';
import { DirectSolver } from '../src/core/forces/direct';
import { stepRk4, stepVerlet, stepYoshida4, YOSHIDA_W0, YOSHIDA_W1 } from '../src/core/integrator';
import { circularOrbit, orbitalElements } from '../src/core/orbit';
import { DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import { PRESETS } from '../src/core/presets';
import { World } from '../src/core/world';
import { Camera } from '../src/render/camera';

const base = { ...DEFAULT_PHYSICS, collision: 'none' as const, G: 1, softening: 0 };

describe('D1 · Yoshida 四阶辛积分', () => {
  it('系数满足辛复合条件', () => {
    expect(2 * YOSHIDA_W1 + YOSHIDA_W0).toBeCloseTo(1, 12);
    expect(2 * YOSHIDA_W1 ** 3 + YOSHIDA_W0 ** 3).toBeCloseTo(0, 12);
  });

  const drift = (integrator: 'verlet' | 'yoshida4', steps: number): number => {
    const b = new BodySet(2);
    b.mass[0] = b.grav[0] = 1;
    b.mass[1] = b.grav[1] = 1;
    b.x[0] = -1; b.y[0] = 0;
    b.x[1] = 1; b.y[1] = 0;
    // e=0.5：近心 r=1 → v = sqrt(mu*(1-e)/(a(1-e)))...
    // 用 vis-viva，a=2，r=1 → v² = μ(2/r - 1/a) = 1.5
    const v = Math.sqrt(1.5);
    b.vy[0] = -v / 2;
    b.vy[1] = v / 2;
    const solver = new DirectSolver();
    const e0 = computeEnergy(b, 1, 0)!.total;
    for (let i = 0; i < steps; i++) {
      if (integrator === 'verlet') stepVerlet(b, solver, base, 0.005, i > 0);
      else stepYoshida4(b, solver, base, 0.005);
    }
    const e1 = computeEnergy(b, 1, 0)!.total;
    return Math.abs((e1 - e0) / e0);
  };

  it('4 阶漂移显著优于 2 阶 Verlet', () => {
    const v2 = drift('verlet', 2000);
    const v4 = drift('yoshida4', 2000);
    expect(v4).toBeLessThan(v2);
  });
});

describe('D4 · 负引力参数', () => {
  it('等大正负 grav 两体加速度等大反向', () => {
    const b = new BodySet(2);
    b.mass[0] = b.grav[0] = 1;
    b.mass[1] = 1; b.grav[1] = -1;
    b.markGravConfigured();
    b.x[1] = 4;
    new DirectSolver().compute(b, base);
    expect(b.ax[0]).toBeCloseTo(-b.ax[1], 10);
    expect(b.ax[0]).toBeLessThan(0); // 正质量被负质量排斥，推向 -x
  });

  it('grav=0 的天体不施力', () => {
    const b = new BodySet(2);
    b.mass[0] = b.grav[0] = 1;
    b.mass[1] = 1; b.grav[1] = 0;
    b.markGravConfigured();
    b.x[1] = 3;
    new DirectSolver().compute(b, base);
    expect(b.ax[0]).toBe(0);
  });
});

describe('B1 · 预设场景', () => {
  const cfg = PRESETS.find((p) => p.id === 'figure8')!.build();
  it('figure-8 一周期后回到初始位置附近', () => {
    const w = new World({
      init: cfg.init,
      physics: { ...cfg.physics, dt: 0.02 },
      view: { ...DEFAULT_VIEW, trails: false },
      bodies: cfg.bodies,
    });
    const x0 = Array.from(w.bodies.x.subarray(0, 3));
    const y0 = Array.from(w.bodies.y.subarray(0, 3));
    const period = 6.32591398;
    const steps = Math.round(period / 0.02);
    for (let i = 0; i < steps; i++) w.step();
    let err = 0;
    for (let i = 0; i < 3; i++) err = Math.max(err, Math.hypot(w.bodies.x[i] - x0[i], w.bodies.y[i] - y0[i]));
    expect(err).toBeLessThan(0.05);
  });

  it('全部预设可构建 World', () => {
    for (const p of PRESETS) {
      const c = p.build();
      const w = new World({ init: c.init, physics: c.physics, view: c.view, bodies: c.bodies });
      expect(w.bodies.n).toBeGreaterThan(0);
      w.step();
      expect(Number.isFinite(w.bodies.x[0])).toBe(true);
    }
  });
});

describe('轨道助手', () => {
  it('圆轨道要素：a=r、e≈0、T=2π√(r³/μ)', () => {
    const r = 10;
    const mu = 100;
    const v = circularOrbit(r, 'xy', mu);
    const el = orbitalElements(
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      { x: v.x, y: v.y, z: v.z, vx: v.vx, vy: v.vy, vz: v.vz },
      mu,
    )!;
    expect(el.a).toBeCloseTo(r, 6);
    expect(el.e).toBeLessThan(1e-6);
    expect(el.period).toBeCloseTo(2 * Math.PI * Math.sqrt(r ** 3 / mu), 5);
  });

  it('抛物线速度 → e≈1', () => {
    const r = 5;
    const mu = 20;
    const v = Math.sqrt((2 * mu) / r);
    const el = orbitalElements(
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      { x: r, y: 0, z: 0, vx: 0, vy: v, vz: 0 },
      mu,
    )!;
    expect(Math.abs(el.e - 1)).toBeLessThan(1e-6);
  });
});

describe('相机投影唯一真源', () => {
  it('2D 投影/反投影往返', () => {
    const c = new Camera();
    c.dimensions = 2;
    c.zoom = 7;
    c.cx = 3; c.cy = -2;
    c.offsetX = 40;
    const p = c.project(5, 4, 0, 1200, 800);
    const q = c.screenToWorldPlane(p.x, p.y, 1200, 800);
    expect(q.x).toBeCloseTo(5, 8);
    expect(q.y).toBeCloseTo(4, 8);
  });

  it('3D 视平面投影/反投影往返', () => {
    const c = new Camera();
    c.dimensions = 3;
    c.zoom = 5;
    c.yaw = 0.7; c.pitch = 0.4;
    c.targetX = 2; c.targetY = -1; c.targetZ = 3;
    c.offsetX = 30;
    const wx = 4; const wy = 2; const wz = 3;
    const p = c.project(wx, wy, wz, 1200, 800);
    const q = c.screenToWorldPlane(p.x, p.y, 1200, 800);
    // 反投影落在过 target 的视平面上，不是原点本身；沿视线方向的距离分量允许不同
    const back = c.project(q.x, q.y, q.z, 1200, 800);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
});
