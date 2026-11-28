import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/core/config/validate';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW, DEFAULT_STELLAR } from '../src/core/params';
import { configToJSON } from '../src/core/config/serialize';

const base = () => ({
  schema: 'nbody-studio/v2' as const, version: 2 as const, dimensions: 2 as const,
  physics: { ...DEFAULT_PHYSICS }, init: { ...DEFAULT_INIT }, view: { ...DEFAULT_VIEW },
  run: { playing: true, speed: 1 }, stellar: { ...DEFAULT_STELLAR },
  bodies: undefined as any,
});

describe('T21–T30 数据完整性', () => {
  it('T23 dtSafety 超限被拒', () => {
    const c = base(); c.physics = { ...c.physics, dtSafety: 2 };
    expect(validateConfig(c).errors.some((e) => e.includes('dtSafety'))).toBe(true);
  });
  it('T24 trailBodies 负数被拒', () => {
    const c = base(); c.view = { ...c.view, trailBodies: -1 };
    expect(validateConfig(c).errors.some((e) => e.includes('trailBodies'))).toBe(true);
  });
  it('T26 kickRadius 负数被拒', () => {
    const c = base(); c.stellar = { ...c.stellar, kickRadius: -1 };
    expect(validateConfig(c).errors.some((e) => e.includes('kickRadius'))).toBe(true);
  });
  it('T28 spin >1 被拒', () => {
    const c = base(); c.init = { ...c.init, spin: 2 };
    expect(validateConfig(c).errors.some((e) => e.includes('spin'))).toBe(true);
  });
  it('T21 bodies 超限导出被拒', () => {
    const c = base(); c.bodies = new Array(1_000_001).fill({ x: 0, y: 0, mass: 1 });
    expect(() => configToJSON(c)).toThrow('超过 100 万上限');
  });
  it('合法配置无错误', () => expect(validateConfig(base()).ok).toBe(true));
});
