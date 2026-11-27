import { describe, expect, it } from 'vitest';
import { BodySet } from '../src/core/bodies';
import { resolveCollisions, type CollisionStats } from '../src/core/collision';
import { DEFAULT_PHYSICS } from '../src/core/params';
import { generateBodies } from '../src/core/generator';
import { DEFAULT_INIT } from '../src/core/params';
import type { PhysicsParams } from '../src/core/types';

const stats: CollisionStats = { contacts: 0, merges: 0 };

describe('碰撞处理', () => {
  it('并合守恒总质量与总动量', () => {
    const b = new BodySet(2);
    b.mass[0] = 1;
    b.mass[1] = 3;
    b.x[0] = -0.5;
    b.x[1] = 0.5;
    b.vx[0] = 1;
    b.vx[1] = -0.5;
    b.refreshRadii(0.8);

    const p: PhysicsParams = { ...DEFAULT_PHYSICS, collision: 'merge' };
    const merged = resolveCollisions(b, p, stats);

    expect(merged).toBe(true);
    expect(stats.merges).toBe(1);
    expect(b.mass[0]).toBeCloseTo(4, 12);
    expect(b.mass[1]).toBe(0);
    // 动量 = 1*1 + 3*(-0.5) = -0.5 → v = -0.125
    expect(b.vx[0]).toBeCloseTo(-0.125, 12);
    // 质心 = (-0.5*1 + 0.5*3)/4 = 0.25
    expect(b.x[0]).toBeCloseTo(0.25, 12);
    // 体积相加
    const expectedR = Math.cbrt((0.8 * 1) ** 3 + (0.8 * Math.cbrt(3)) ** 3);
    expect(b.radius[0]).toBeCloseTo(expectedR, 10);
  });

  it('弹性散射交换动量且保持总动量', () => {
    const b = new BodySet(2);
    b.mass[0] = 1;
    b.mass[1] = 1;
    b.x[0] = -0.5;
    b.x[1] = 0.5;
    b.vx[0] = 1;
    b.vx[1] = -1;
    b.refreshRadii(0.8);

    const p: PhysicsParams = { ...DEFAULT_PHYSICS, collision: 'bounce', restitution: 1 };
    resolveCollisions(b, p, stats);

    expect(b.mass[0] + b.mass[1]).toBeCloseTo(2, 12);
    const totalP = b.mass[0] * b.vx[0] + b.mass[1] * b.vx[1];
    expect(totalP).toBeCloseTo(0, 9);
    // 等质量完全弹性碰撞：速度互换
    expect(b.vx[0]).toBeCloseTo(-1, 6);
    expect(b.vx[1]).toBeCloseTo(1, 6);
  });

  it('不接触的天体不受影响', () => {
    const b = new BodySet(2);
    b.mass[0] = 1;
    b.mass[1] = 1;
    b.x[0] = -100;
    b.x[1] = 100;
    b.vx[0] = 3;
    b.refreshRadii(0.1);
    const p: PhysicsParams = { ...DEFAULT_PHYSICS, collision: 'merge' };
    const merged = resolveCollisions(b, p, stats);
    expect(merged).toBe(false);
    expect(b.vx[0]).toBe(3);
  });
});

describe('初始条件生成器', () => {
  const opts = { simulated: 500, weight: 1, requested: 500, G: 1, bodyRadius: 0.35 };

  it('同种子完全可复现', () => {
    const a = generateBodies(DEFAULT_INIT, opts);
    const b = generateBodies(DEFAULT_INIT, opts);
    expect(Array.from(a.x.subarray(0, 100))).toEqual(Array.from(b.x.subarray(0, 100)));
    expect(Array.from(a.vy.subarray(0, 100))).toEqual(Array.from(b.vy.subarray(0, 100)));
    expect(a.n).toBe(500);
  });

  it('质心与总动量归零', () => {
    const b = generateBodies(DEFAULT_INIT, opts);
    const com = b.centerOfMass();
    expect(Math.hypot(com.x, com.y)).toBeLessThan(1e-9);

    let px = 0;
    let py = 0;
    for (let i = 0; i < b.n; i++) {
      px += b.mass[i] * b.vx[i];
      py += b.mass[i] * b.vy[i];
    }
    expect(Math.hypot(px, py)).toBeLessThan(1e-9);
  });

  it('统计采样时引力总质量仍等于设定值（防止权重被重复计入）', () => {
    const requested = 250_000;
    const simulated = 1_000;
    const weight = requested / simulated;
    const b = generateBodies(
      { ...DEFAULT_INIT, totalMass: 2000 },
      { simulated, weight, requested, G: 1, bodyRadius: 0.08 },
    );
    let gravitating = 0;
    for (let i = 0; i < b.n; i++) gravitating += b.mass[i] * b.weight;
    expect(gravitating).toBeCloseTo(2000, 3);
    // 平均每个代表粒子的引力质量 = 总质量 / 实际积分数量
    expect(gravitating / b.n).toBeCloseTo(2000 / simulated, 6);
  });

  it('质量归一化后总质量等于设定值', () => {
    const b = generateBodies({ ...DEFAULT_INIT, totalMass: 1234 }, opts);
    let total = 0;
    for (let i = 0; i < b.n; i++) total += b.mass[i];
    expect(total).toBeCloseTo(1234, 4);
  });

  it('所有分布都能生成且无 NaN', () => {
    for (const distribution of ['disc', 'cloud', 'cluster', 'collision', 'grid', 'binary'] as const) {
      const b = generateBodies({ ...DEFAULT_INIT, distribution }, { ...opts, simulated: 64 });
      expect(b.n).toBe(64);
      for (let i = 0; i < b.n; i++) {
        expect(Number.isFinite(b.x[i])).toBe(true);
        expect(Number.isFinite(b.vy[i])).toBe(true);
        expect(b.mass[i]).toBeGreaterThan(0);
      }
    }
  });
});
