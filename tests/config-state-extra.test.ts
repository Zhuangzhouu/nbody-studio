import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/core/config/validate';
import { engineFor } from '../src/core/scale-policy';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW, DEFAULT_STELLAR } from '../src/core/params';
import { parseConfigText } from '../src/core/config/serialize';

const base = () => ({
  schema: 'nbody-studio/v2' as const, version: 2 as const, dimensions: 2 as const,
  physics: { ...DEFAULT_PHYSICS }, init: { ...DEFAULT_INIT }, view: { ...DEFAULT_VIEW },
  run: { playing: true, speed: 1 }, stellar: { ...DEFAULT_STELLAR },
});

describe('W21–W30 配置与状态', () => {
  it('W23 count 上限（INT_MAX）', () => {
    const c = base(); c.init = { ...c.init, count: 2147483648 };
    expect(validateConfig(c).errors.some((e) => e.includes('count'))).toBe(true);
  });
  it('W24 softening 负数被拒', () => {
    const c = base(); c.physics = { ...c.physics, softening: -1 };
    expect(validateConfig(c).errors.some((e) => e.includes('softening'))).toBe(true);
  });
  it('W25 accretion 非布尔被拒', () => {
    const c = base() as any; c.stellar.accretion = 'yes';
    expect(validateConfig(c).errors.some((e) => e.includes('accretion'))).toBe(true);
  });
  it('W26 JSON 深度超限', () => {
    let deep = '0'; for (let i = 0; i < 70; i++) deep = `[${deep}]`;
    expect(parseConfigText(deep).errors[0]).toContain('嵌套深度');
  });
  it('W27 错误路径精确', () => {
    const c = base(); c.stellar = { ...c.stellar, massUnit: -1 };
    expect(validateConfig(c).errors.some((e) => e.includes('stellar.massUnit'))).toBe(true);
  });
  it('W28 引擎分级边界', () => {
    expect(engineFor(2048)).toBe('direct');
    expect(engineFor(2049)).toBe('barnes-hut');
    expect(engineFor(20001)).toBe('particle-mesh');
  });
  it('W29 合法配置无错', () => expect(validateConfig(base()).ok).toBe(true));
});
