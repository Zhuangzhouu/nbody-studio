import { describe, expect, it } from 'vitest';
import {
  BARNES_HUT_MAX,
  DIRECT_MAX,
  MAX_BODY_INPUT,
  RENDER_CAP,
  SIM_CAP,
} from '../src/core/constants';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import { engineFor, resolveStrategy } from '../src/core/scale-policy';

describe('规模策略分级', () => {
  it('小规模走直接求和', () => {
    const s = resolveStrategy(1000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.engine).toBe('direct');
    expect(s.simulated).toBe(1000);
    expect(s.weight).toBe(1);
    expect(s.tier).toBe(1);
  });

  it('中规模走 Barnes-Hut', () => {
    const s = resolveStrategy(5_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.engine).toBe('barnes-hut');
    expect(s.renderStride).toBe(1);
  });

  it('大规模走 TreePM（D3：auto 在 2 万体以上优先混合引擎）', () => {
    const s = resolveStrategy(800_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.engine).toBe('treepm');
    expect(s.tier).toBe(3);
  });

  it('中等规模仍走粒子网格', () => {
    const s = resolveStrategy(15_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.engine).toBe('particle-mesh');
  });

  it('超过逐体上限时启用统计采样', () => {
    const s = resolveStrategy(5_000_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.simulated).toBe(SIM_CAP);
    expect(s.weight).toBeCloseTo(2.5, 6);
    expect(s.tier).toBe(4);
    expect(s.notices.some((n) => n.level === 'critical')).toBe(true);
  });

  it('INT_MAX 也不会崩溃，权重按比例放大', () => {
    const s = resolveStrategy(MAX_BODY_INPUT, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(s.requested).toBe(MAX_BODY_INPUT);
    expect(s.simulated).toBe(SIM_CAP);
    expect(s.weight).toBeCloseTo(MAX_BODY_INPUT / SIM_CAP, 6);
    expect(s.renderCount).toBe(RENDER_CAP);
    expect(s.renderStride).toBeGreaterThan(1);
  });

  it('阈值边界精确落在设计值上', () => {
    expect(engineFor(DIRECT_MAX)).toBe('direct');
    expect(engineFor(DIRECT_MAX + 1)).toBe('barnes-hut');
    expect(engineFor(BARNES_HUT_MAX)).toBe('barnes-hut');
    expect(engineFor(BARNES_HUT_MAX + 1)).toBe('particle-mesh');
  });

  it('大 N 不强制关闭碰撞，只提示成本', () => {
    const s = resolveStrategy(200_000, { ...DEFAULT_PHYSICS, collision: 'merge' }, DEFAULT_VIEW);
    expect(s.collisionsEnabled).toBe(true);
    expect(s.notices.some((n) => n.level === 'warn')).toBe(true);
  });

  it('用户可强制引擎与关闭采样', () => {
    const s = resolveStrategy(
      1_000_000,
      { ...DEFAULT_PHYSICS, engine: 'direct', sampling: 'never', maxSimulated: 1000 },
      DEFAULT_VIEW,
    );
    expect(s.engine).toBe('direct');
    expect(s.simulated).toBe(1_000_000);
    expect(s.weight).toBe(1);
    expect(s.notices.some((n) => n.level === 'warn')).toBe(true);
  });

  it('内存预估随规模线性增长', () => {
    const a = resolveStrategy(10_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    const b = resolveStrategy(100_000, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(b.estimatedBytes).toBeGreaterThan(a.estimatedBytes * 5);
  });
});

describe('内存安全闸', () => {
  it('sampling=never + 超大 count 不导致不可分配内存', () => {
    const st = resolveStrategy(
      2_000_000_000,
      { ...DEFAULT_PHYSICS, sampling: 'never', maxSimulated: 0 },
      DEFAULT_VIEW,
    );
    expect(st.simulated).toBeLessThanOrEqual(4_200_000);
    expect(st.estimatedBytes).toBeLessThanOrEqual(520_000_000);
    expect(st.notices.some((n) => n.level === 'critical' && n.text.includes('超出浏览器可分配内存'))).toBe(true);
    expect(st.weight).toBeGreaterThan(1);
  });

  it('正常规模不受影响', () => {
    const st = resolveStrategy(1200, DEFAULT_PHYSICS, DEFAULT_VIEW);
    expect(st.simulated).toBe(1200);
    expect(st.weight).toBe(1);
    expect(st.notices.some((n) => n.text.includes('超出浏览器可分配内存'))).toBe(false);
  });
});
