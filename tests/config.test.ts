import { describe, expect, it } from 'vitest';
import { configFromParams, bodiesFromSet, configToJSON, parseConfigText } from '../src/core/config/serialize';
import { StreamingConfigParser, parseConfigStreaming } from '../src/core/config/stream';
import { validateConfig } from '../src/core/config/validate';
import { BodySet } from '../src/core/bodies';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_RUN, DEFAULT_VIEW } from '../src/core/params';
import { World } from '../src/core/world';
import type { SimulationConfig } from '../src/core/types';

function baseConfig(): SimulationConfig {
  return {
    ...configFromParams(DEFAULT_PHYSICS, DEFAULT_INIT, DEFAULT_VIEW, DEFAULT_RUN),
    bodies: [
      { id: 0, x: -1, y: 2, z: 3, vx: 0.1, vy: -0.2, vz: 0.3, mass: 2, grav: 5, radius: 0.4 },
      { id: 1, x: 4, y: -5, z: 6, vx: -0.3, vy: 0.2, vz: -0.1, mass: 3 },
    ],
  };
}

describe('JSON 配置校验', () => {
  it('完整 2D/3D 参数与逐体字段 roundtrip', () => {
    const cfg = baseConfig();
    const text = configToJSON(cfg, false);
    const parsed = parseConfigText(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.config).toEqual(cfg);
  });

  it('拒绝非法维度、非数字坐标、非正质量', () => {
    const bad = parseConfigText(
      JSON.stringify({
        ...baseConfig(),
        dimensions: 4,
        bodies: [{ x: 'oops', y: 0, vx: 0, vy: 0, mass: -1 }],
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.includes('dimensions'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('bodies[0].x'))).toBe(true);
    expect(bad.errors.some((e) => e.includes('mass'))).toBe(true);
  });

  it('省略的可选字段回退到默认值', () => {
    const result = validateConfig({ dimensions: 3, physics: { G: 2 } });
    expect(result.ok).toBe(true);
    expect(result.config?.physics.G).toBe(2);
    expect(result.config?.physics.dt).toBe(DEFAULT_PHYSICS.dt);
    expect(result.config?.view.pointSize).toBe(DEFAULT_VIEW.pointSize);
    expect(result.config?.init.count).toBe(DEFAULT_INIT.count);
  });

  it('接受超大规模逐体数组（不设人为上限）', () => {
    const cfg = baseConfig();
    const big = Array.from({ length: 5000 }, (_, i) => ({
      x: i, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1,
    }));
    const result = validateConfig({ ...cfg, bodies: big });
    expect(result.ok).toBe(true);
    expect(result.config?.bodies?.length).toBe(5000);
  });
});

describe('流式 bodies 解析', () => {
  it('逐体回调且不丢失全局参数', () => {
    const cfg = baseConfig();
    const text = configToJSON(cfg, false);
    const seen: number[] = [];
    const out = parseConfigStreaming(text, (body, i) => seen.push(i + body.mass));
    expect(out.result.ok).toBe(true);
    expect(out.bodyCount).toBe(2);
    expect(seen).toEqual([2, 4]);
    expect(out.result.config?.physics.G).toBe(cfg.physics.G);
  });

  it('分块推送也能正确解析', () => {
    const cfg = baseConfig();
    const text = configToJSON(cfg, false);
    const parser = new StreamingConfigParser();
    for (let i = 0; i < text.length; i += 7) parser.push(text.slice(i, i + 7));
    const result = parser.finish();
    expect(result.result.ok).toBe(true);
    expect(result.bodyCount).toBe(2);
  });

  it('无 bodies 字段时退化为普通配置解析', () => {
    const cfg = configFromParams(DEFAULT_PHYSICS, DEFAULT_INIT, DEFAULT_VIEW, DEFAULT_RUN);
    const out = parseConfigStreaming(configToJSON(cfg, false));
    expect(out.result.ok).toBe(true);
    expect(out.bodyCount).toBe(0);
  });
});

describe('逐体配置驱动 World', () => {
  it('显式配置完全替代生成器并保留每体引力参数', () => {
    const cfg = baseConfig();
    const world = new World({
      init: cfg.init,
      physics: cfg.physics,
      view: cfg.view,
      bodies: cfg.bodies,
    });
    expect(world.bodies.n).toBe(2);
    expect(world.explicitBodies).toBe(true);
    expect(world.bodies.x[0]).toBe(-1);
    expect(world.bodies.z[0]).toBe(3);
    expect(world.bodies.vz[1]).toBeCloseTo(-0.1, 12);
    expect(world.bodies.grav[0]).toBe(5);
    expect(world.bodies.mass[0]).toBe(2);
    expect(world.bodies.radius[0]).toBe(0.4);
    expect(world.bodies.explicitRadius[0]).toBe(1);
  });

  it('世界运行后仍可导出完整逐体数据', () => {
    const cfg = baseConfig();
    const world = new World({
      init: cfg.init,
      physics: cfg.physics,
      view: cfg.view,
      bodies: cfg.bodies,
    });
    world.step();
    const out = bodiesFromSet(world.bodies);
    expect(out.length).toBe(2);
    expect(out[0].grav).toBe(5);
    expect(out[0].radius).toBe(0.4);
    expect(Number.isFinite(out[1].x)).toBe(true);
  });

  it('2D 配置强制 z=0', () => {
    const cfg = baseConfig();
    cfg.physics = { ...cfg.physics, dimensions: 2 };
    const world = new World({
      init: cfg.init,
      physics: cfg.physics,
      view: cfg.view,
      bodies: cfg.bodies,
    });
    expect(world.bodies.z[0]).toBe(0);
    expect(world.bodies.vz[0]).toBe(0);
    expect(world.snapshot().bounds3[2]).toBe(0);
  });

  it('快照顶点为五分量 [x,y,z,scalar,size]', () => {
    const cfg = baseConfig();
    const world = new World({
      init: cfg.init,
      physics: cfg.physics,
      view: cfg.view,
      bodies: cfg.bodies,
    });
    const snap = world.snapshot();
    expect(snap.count).toBe(2);
    expect(snap.vertex.length).toBeGreaterThanOrEqual(10);
    expect(snap.vertex[2]).toBe(3);
    expect(snap.dimensions).toBe(3);
    expect(snap.bounds3.length).toBe(6);
  });
});

describe('导出结构', () => {
  it('bodiesFromSet 保留显式半径与引力参数', () => {
    const b = new BodySet(2, 1, 2, 3);
    b.mass.set([2, 3]);
    b.grav.set([5, 3]);
    b.x.set([1, -1]);
    b.y.set([2, -2]);
    b.z.set([3, -3]);
    b.radius.set([0.7, 0.4]);
    b.explicitRadius.set([1, 0]);
    const out = bodiesFromSet(b);
    expect(out[0].grav).toBe(5);
    expect(out[0].radius).toBe(0.7);
    expect(out[1].grav).toBeUndefined();
    expect(out[1].radius).toBeUndefined();
    expect(out[0].z).toBe(3);
  });
});
