import { describe, expect, it } from 'vitest';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import { World } from '../src/core/world';

function few(count: number) {
  const bodies = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: i * 2 - count,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0.3 + i * 0.1,
    vz: 0,
    mass: 1,
  }));
  return new World({
    init: { ...DEFAULT_INIT, count },
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', softening: 0, collision: 'none' },
    view: { ...DEFAULT_VIEW, trails: false },
    bodies,
  });
}

describe('1–10 体工作台数据支撑', () => {
  it('快照携带 1–10 体实时速度', () => {
    for (const n of [1, 2, 3, 5, 10]) {
      const w = few(n);
      w.step();
      const s = w.snapshot();
      expect(s.velocities).not.toBeNull();
      expect(s.velocities!.length).toBe(s.count * 3);
      for (let i = 0; i < s.count; i++) {
        expect(Number.isFinite(s.velocities![i * 3])).toBe(true);
      }
    }
  });

  it('大规模快照不携带速度（避免带宽浪费）', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 50 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2 },
      view: { ...DEFAULT_VIEW, trails: false },
    });
    expect(w.snapshot().velocities).toBeNull();
  });

  it('少体束缚圆轨道能量守恒（直接求和 + 零软化）', () => {
    const bodies = [
      { id: 0, x: -5, y: 0, z: 0, vx: 0, vy: -Math.sqrt(1 / 20), vz: 0, mass: 1 },
      { id: 1, x: 5, y: 0, z: 0, vx: 0, vy: Math.sqrt(1 / 20), vz: 0, mass: 1 },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, G: 1, engine: 'direct', softening: 0, collision: 'none', dt: 0.01 },
      view: { ...DEFAULT_VIEW, trails: false },
      bodies,
    });
    const d0 = w.diagnostics();
    for (let i = 0; i < 500; i++) w.step();
    const d1 = w.diagnostics();
    expect(Math.abs(d1.energyDrift ?? 0)).toBeLessThan(1e-3);
    expect(d0.simulated).toBe(2);
  });
});
