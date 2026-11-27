import { describe, expect, it } from 'vitest';
import {
  advanceEvolution,
  C_AU_PER_MYR,
  mainSequenceLifespan,
  remnantRadiusAu,
  SPECTRAL_TABLE,
  spectralClass,
  starLabel,
  starSizeMul,
  supernovaKick,
  kickMagnitude,
  WR_WIND_RATE_PER_MYR,
  windLossFraction,
} from '../src/core/stellar';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_STELLAR, DEFAULT_VIEW } from '../src/core/params';
import { DEFAULT_RUN } from '../src/core/params';
import { validateConfig } from '../src/core/config/validate';
import { World } from '../src/core/world';
import { STAR_COLOR_COUNT, STELLAR_COLOR_LUT, stellarColor } from '../src/render/palette';
import type { BodyConfig, SimulationConfig } from '../src/core/types';

function cfgWith(bodies: BodyConfig[], patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    schema: 'nbody-studio/v2',
    version: 2,
    dimensions: 2,
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', collision: 'none', softening: 0, dt: 0.01 },
    init: { ...DEFAULT_INIT, count: bodies.length },
    view: { ...DEFAULT_VIEW, trails: false },
    run: { ...DEFAULT_RUN },
    stellar: { ...DEFAULT_STELLAR },
    bodies,
    ...patch,
  };
}

describe('G1 · 光谱型质量表', () => {
  it('边界归属正确（H1：<0.013 行星，0.013–0.45 褐矮星，0.45→K）', () => {
    expect(spectralClass(0.01)).toBe('planet');
    expect(spectralClass(0.013)).toBe('brownDwarf');
    expect(spectralClass(0.1)).toBe('brownDwarf');
    expect(spectralClass(0.4499)).toBe('brownDwarf');
    expect(spectralClass(0.45)).toBe('K');
    expect(spectralClass(0.7999)).toBe('K');
    expect(spectralClass(0.8)).toBe('G');
    expect(spectralClass(1.04)).toBe('F');
    expect(spectralClass(1.4)).toBe('A');
    expect(spectralClass(2.1)).toBe('B');
    expect(spectralClass(16)).toBe('O');
  });

  it('H1：光谱表全区间覆盖无空洞无重叠（降序排列，上界=下一档下界）', () => {
    for (let i = 0; i < SPECTRAL_TABLE.length; i++) {
      const band = SPECTRAL_TABLE[i];
      expect(band.max).toBeGreaterThan(band.min);
      if (i < SPECTRAL_TABLE.length - 1) expect(band.min).toBe(SPECTRAL_TABLE[i + 1].max);
    }
    expect(SPECTRAL_TABLE[0].min).toBe(16);
    expect(SPECTRAL_TABLE[0].max).toBe(Infinity);
    expect(SPECTRAL_TABLE[SPECTRAL_TABLE.length - 1].min).toBe(0);
  });

  it('massUnit=50 时 mass=800 → 16 M☉ → O 型', () => {
    const r = validateConfig(cfgWith([
      { x: 0, y: 0, vx: 0, vy: 0, mass: 800 },
    ], { stellar: { ...DEFAULT_STELLAR, massUnit: 50 } }));
    expect(r.ok).toBe(true);
    const w = new World({
      init: r.config!.init,
      physics: r.config!.physics,
      view: r.config!.view,
      stellar: r.config!.stellar,
      bodies: r.config!.bodies,
    });
    expect(w.bodies.starAt(0)).toBe('O');
  });

  it('显式 blackHole 且小质量不被改写、不演化', () => {
    const b: BodyConfig = { x: 0, y: 0, vx: 0, vy: 0, mass: 0.1, star: { type: 'blackHole' } };
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: DEFAULT_PHYSICS,
      view: DEFAULT_VIEW,
      bodies: [b],
    });
    expect(w.bodies.starAt(0)).toBe('blackHole');
    expect(w.bodies.evolvesFlag[0]).toBe(0);
    for (let i = 0; i < 100; i++) w.step();
    expect(w.bodies.starAt(0)).toBe('blackHole');
    expect(w.bodies.mass[0]).toBeCloseTo(0.1, 9);
  });

  it('新天体插入与中间删除后旁路数组不错位', () => {
    const cfg = cfgWith([
      { id: 1, x: -2, y: 0, vx: 0, vy: 0.3, vz: 0, mass: 1 },
      { id: 2, x: 2, y: 0, vx: 0, vy: -0.3, vz: 0, mass: 10 },
      { id: 3, x: 0, y: 3, vx: 0.3, vy: 0, vz: 0, mass: 0.5 },
    ]);
    const w = new World({
      init: cfg.init, physics: cfg.physics, view: cfg.view, stellar: cfg.stellar, bodies: cfg.bodies,
    });
    const before = Array.from(w.bodies.starType.subarray(0, 3));
    expect(w.bodies.starAt(2)).toBe('K');
    w.addBodies([{ id: 4, x: 5, y: 0, vx: 0, vy: 0.1, vz: 0, mass: 20, star: { type: 'O' } }]);
    expect(w.bodies.starAt(3)).toBe('O');
    expect(Array.from(w.bodies.starType.subarray(0, 3))).toEqual(before);
    w.removeBody(1);
    expect(w.bodies.n).toBe(3);
    expect(w.bodies.starAt(0)).toBe(before[0] === undefined ? 0 : spectralClass(1));
  });
});

describe('G2 · 寿命与演化', () => {
  it('寿命公式三点校验', () => {
    expect(mainSequenceLifespan(1)).toBeCloseTo(10000, 6);
    expect(mainSequenceLifespan(20)).toBeCloseTo(5.59, 1); // 提示词公式为 M^-2.5；56.6 是其笔误
    expect(mainSequenceLifespan(0.3) / 2.03e5).toBeGreaterThan(0.8);
    expect(mainSequenceLifespan(0.3) / 2.03e5).toBeLessThan(1.2);
  });

  it('状态机在阈值处返回正确相位/遗骸（H2/H3 路径）', () => {
    expect(advanceEvolution(1, 9999, 1).kind).toBe('none');
    // 口径变化（H2）：主序耗尽先入巨星相，不再一步到遗骸
    expect(advanceEvolution(1, 10000, 1)).toMatchObject({ kind: 'toGiant' });
    expect(advanceEvolution(1, 10000, 1)).toMatchObject({ durationMyr: 1000 }); // 0.1×t_MS(1)
    expect(advanceEvolution(10, 1, 1).kind).toBe('none');
    expect(advanceEvolution(10, 100, 1)).toMatchObject({ kind: 'toSupergiant', durationMyr: 0.05 * mainSequenceLifespan(10) });
    expect(advanceEvolution(10, 100, 1, 'supergiant')).toMatchObject({ kind: 'supernova', remnant: 'neutronStar' });
    expect(advanceEvolution(25, 10, 1)).toMatchObject({ kind: 'toSupergiant' });
    expect(advanceEvolution(25, 10, 1, 'supergiant')).toMatchObject({ kind: 'toWolfRayet' });
    expect(advanceEvolution(25, 10, 1, 'wolfRayet')).toMatchObject({ kind: 'supernova', remnant: 'blackHole' });
    expect(advanceEvolution(0.3, 1e9, 1).kind).toBe('none'); // 矮星永驻
    expect(advanceEvolution(0.1, 1e9, 1).kind).toBe('none'); // H1：褐矮星永驻
  });

  it('H2：相位时长公式正确（0.8/2/20/25 M☉ 四点）', () => {
    const t = (m: number) => mainSequenceLifespan(m);
    expect(advanceEvolution(2, t(2), 1)).toMatchObject({ kind: 'toGiant', durationMyr: 0.1 * t(2) });
    expect(advanceEvolution(8, t(8), 1)).toMatchObject({ kind: 'toSupergiant' });
    expect(advanceEvolution(20, t(20), 1)).toMatchObject({ kind: 'toSupergiant', durationMyr: 0.05 * t(20) });
    expect(advanceEvolution(20, t(20), 1, 'supergiant')).toMatchObject({ kind: 'toWolfRayet', durationMyr: 0.05 * t(20) });
    expect(advanceEvolution(25, t(25), 1, 'wolfRayet')).toMatchObject({
      kind: 'supernova', remnant: 'blackHole', remnantMass: 3,
    });
  });

  it('timeUnit=10 时演化按物理 Myr 记账（15 M☉ 经红超巨星在 12.075 Myr 触发超新星）', () => {
    const bodies: BodyConfig[] = [{ id: 7, x: 0, y: 0, vx: 0, vy: 0, mass: 15 }];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.01, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, timeUnit: 10 },
      bodies,
    });
    // H2：t_MS(15)=11.5 → 红超巨星（0.575 Myr）→ 超新星 ≈12.075 Myr；timeUnit=10 → 模拟时间 120.75
    while (w.time < 125) w.step();
    expect(w.bodies.starAt(0)).toBe('neutronStar');
    const texts = w.stellarEvents.map((e) => e.text).join('|');
    expect(texts).toContain('红超巨星');
    expect(texts).toContain('II 型超新星');
    // 相位顺序：先巨星后超新星
    const gi = w.stellarEvents.findIndex((e) => e.text.includes('红超巨星'));
    const si = w.stellarEvents.findIndex((e) => e.text.includes('超新星'));
    expect(gi).toBeGreaterThanOrEqual(0);
    expect(si).toBeGreaterThan(gi);
    // 巨星事件时间 ≈ 11.5 Myr
    const gEvt = w.stellarEvents[gi];
    expect(gEvt.t).toBeGreaterThan(11);
    expect(gEvt.t).toBeLessThan(12);
  });

  it('H2：1 M☉ 全路径 MS → 红巨星 → 白矮星', () => {
    const bodies: BodyConfig[] = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 1 }];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies,
    });
    // t_MS=10000，巨星 1000 Myr → 总 11000 模拟时间
    let guard = 0;
    while (w.bodies.starAt(0) !== 'whiteDwarf' && guard++ < 20000) w.step();
    expect(w.bodies.starAt(0)).toBe('whiteDwarf');
    const texts = w.stellarEvents.map((e) => e.text).join('|');
    expect(texts).toContain('主序耗尽 → 红巨星');
    expect(texts).toContain('红巨星包层抛射 → 白矮星');
    expect(w.bodies.mass[0]).toBeCloseTo(0.6, 6); // min(0.6·M, 1.4)
  });

  it('初始 age 可让星体导入即演化（H2：先入红巨星相）', () => {
    const bodies: BodyConfig[] = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 0.8, star: { age: 17468.5 } }];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies,
    });
    expect(w.bodies.birthMyr[0]).toBeCloseTo(-17468.5, 1);
    w.step();
    // 口径变化（H2）：0.8 M☉ 在 t_MS 处先入红巨星相，时长 0.1×t_MS ≈ 1746.9 Myr
    expect(w.bodies.starAt(0)).toBe('giant');
    expect(w.stellarEvents[0].text).toContain('红巨星');
    let guard = 0;
    while (w.bodies.starAt(0) !== 'whiteDwarf' && guard++ < 5000) w.step();
    expect(w.bodies.starAt(0)).toBe('whiteDwarf');
  });

  it('白矮星过渡后总动量守恒', () => {
    const bodies: BodyConfig[] = [
      { id: 1, x: -50, y: 0, vx: 0, vy: 0.2, vz: 0, mass: 1 },
      { id: 2, x: 50, y: 0, vx: 0, vy: -0.2, vz: 0, mass: 1 },
      { id: 3, x: 0, y: 80, vx: -0.1, vy: 0, vz: 0, mass: 1.2 },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 3 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies,
    });
    let p = 0;
    for (let i = 0; i < w.bodies.n; i++) p += w.bodies.mass[i] * w.bodies.vy[i];
    const before = p;
    // 推进到 1 M☉ 星完成 MS → 红巨星 → 白矮星（t_MS=10000 + 1000，dt=1）
    let guard = 0;
    while (!w.stellarEvents.some((e) => e.text.includes('白矮星')) && guard++ < 13000) w.step();
    p = 0;
    for (let i = 0; i < w.bodies.n; i++) p += w.bodies.mass[i] * w.bodies.vy[i];
    expect(w.stellarEvents.length).toBeGreaterThan(0);
    expect(Math.abs(p - before)).toBeLessThan(1e-9);
  });
});

describe('G5 · 光谱渲染色表', () => {
  it('15 类颜色查表正确（H1/H2/H3 后 LUT 动态长度）', () => {
    const o = stellarColor('O');
    expect(o[0]).toBeCloseTo(0x9b / 255, 6);
    expect(o[1]).toBeCloseTo(0xb0 / 255, 6);
    expect(o[2]).toBeCloseTo(0xff / 255, 6);
    const bh = stellarColor('blackHole');
    expect(bh[0]).toBeCloseTo(1, 6);
    expect(bh[1]).toBeCloseTo(0xaa / 255, 6);
    expect(STAR_COLOR_COUNT).toBe(16);
    expect(STELLAR_COLOR_LUT.length).toBe(16 * 3);
    // H1：褐矮星暗红棕
    const bd = stellarColor('brownDwarf');
    expect(bd[0]).toBeCloseTo(0x9b / 255, 6);
    expect(bd[1]).toBeCloseTo(0x6a / 255, 6);
    // H2：相位色
    expect(stellarColor('giant')[0]).toBeCloseTo(0xff / 255, 6);
    expect(stellarColor('wolfRayet')[2]).toBeCloseTo(0xff / 255, 6);
  });

  it('H2：相位尺寸倍率（giant ×6 / supergiant ×14 / WR ×3 / 褐矮星 ×0.8）', () => {
    expect(starSizeMul('giant')).toBe(6);
    expect(starSizeMul('supergiant')).toBe(14);
    expect(starSizeMul('wolfRayet')).toBe(3);
    expect(starSizeMul('brownDwarf')).toBe(0.8);
    expect(starSizeMul('G')).toBe(1);
  });

  it('starLabel 全名', () => {
    expect(starLabel('G')).toContain('G 型');
    expect(starLabel('blackHole')).toBe('黑洞');
    expect(starLabel('brownDwarf')).toBe('褐矮星');
    expect(starLabel('giant')).toBe('红巨星');
    expect(starLabel('supergiant')).toBe('红超巨星');
    expect(starLabel('wolfRayet')).toBe('沃尔夫-拉叶星');
  });
});

describe('G4 · 遗骸半径换算', () => {
  it('光速换算链合理', () => {
    expect(C_AU_PER_MYR).toBeGreaterThan(6e10);
    expect(C_AU_PER_MYR).toBeLessThan(6.4e10);
  });

  it('WD/NS/BH 半径量级正确', () => {
    const wd = remnantRadiusAu('whiteDwarf', 1);
    const ns = remnantRadiusAu('neutronStar', 1.4);
    const bh = remnantRadiusAu('blackHole', 10);
    expect(wd).toBeGreaterThan(4e-5);
    expect(wd).toBeLessThan(5e-5);
    expect(ns).toBeGreaterThan(5e-8);
    expect(bh).toBeGreaterThan(ns); // 10 M☉ 黑洞 rs≈2e-7 AU > 中子星 6.7e-8 AU
  });
});

describe('G3 · 超新星冲量', () => {
  it('500 体非对称星场爆发后总动量守恒 < 1e-10', () => {
    const n = 500;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const z = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const vz = new Float64Array(n);
    const mass = new Float64Array(n);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      x[i] = (rnd() - 0.5) * 20;
      y[i] = (rnd() - 0.5) * 20;
      z[i] = 0;
      vx[i] = (rnd() - 0.5) * 0.1;
      vy[i] = (rnd() - 0.5) * 0.1;
      mass[i] = 0.5 + rnd();
    }
    const idx = 0;
    let px = 0; let py = 0;
    for (let i = 0; i < n; i++) { px += mass[i] * vx[i]; py += mass[i] * vy[i]; }
    supernovaKick(x, y, z, vx, vy, vz, mass, n, idx, 20, 10, 1, 0.5, 0.01, false);
    let qx = 0; let qy = 0;
    for (let i = 0; i < n; i++) { qx += mass[i] * vx[i]; qy += mass[i] * vy[i]; }
    expect(Math.hypot(qx - px, qy - py)).toBeLessThan(1e-10);
  });

  it('kickRadius=0 无冲量；近邻速度封顶', () => {
    const n = 3;
    const x = new Float64Array([0, 1, 50]);
    const y = new Float64Array(n);
    const z = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const vz = new Float64Array(n);
    const mass = new Float64Array([10, 1, 1]);
    supernovaKick(x, y, z, vx, vy, vz, mass, n, 0, 20, 0, 1, 0.5, 0.01, false);
    expect(vx[1]).toBe(0);
    expect(vx[2]).toBe(0);
    const cap = (50 * 0.5) / 0.01;
    expect(kickMagnitude(1, 20, 0.1, 1, 0.5, 0.01)).toBeLessThanOrEqual(cap);
  });
});

describe('G4 · BH 吸积', () => {
  it('accretion=on 时 BH 吞并 1 M☉ 体，类型不变且动量守恒', () => {
    const cfg = cfgWith([
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 10, star: { type: 'blackHole' } },
      { id: 2, x: 0.05, y: 0, vx: 0, vy: 0.5, mass: 1 },
    ], {
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', collision: 'merge', softening: 0, dt: 0.001 },
      stellar: { ...DEFAULT_STELLAR, accretion: true },
    });
    const w = new World({ init: cfg.init, physics: cfg.physics, view: cfg.view, stellar: cfg.stellar, bodies: cfg.bodies });
    const p0 = w.bodies.mass[0] * w.bodies.vy[0] + w.bodies.mass[1] * w.bodies.vy[1];
    w.step();
    expect(w.bodies.n).toBe(2); // removeDead 尚未触发（dead<32 阈值）
    expect(w.bodies.mass[0]).toBeGreaterThan(10);
    expect(w.bodies.starAt(0)).toBe('blackHole');
    const p1 = w.bodies.mass[0] * w.bodies.vy[0] + w.bodies.mass[1] * w.bodies.vy[1];
    expect(Math.abs(p1 - p0)).toBeLessThan(1e-9);
  });
});

describe('H1 · 褐矮星', () => {
  it('显式 brownDwarf 永驻：质量与类型不变、无事件', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 0.05, star: { type: 'brownDwarf' } }],
    });
    for (let i = 0; i < 200; i++) w.step();
    expect(w.bodies.starAt(0)).toBe('brownDwarf');
    expect(w.bodies.mass[0]).toBeCloseTo(0.05, 9);
    expect(w.stellarEvents.length).toBe(0);
  });

  it('auto 0.1 M☉ 推导为褐矮星且不演化', () => {
    const r = validateConfig(cfgWith([{ x: 0, y: 0, vx: 0, vy: 0, mass: 0.1 }]));
    expect(r.ok).toBe(true);
    const w = new World({
      init: r.config!.init, physics: r.config!.physics, view: r.config!.view,
      stellar: r.config!.stellar, bodies: r.config!.bodies,
    });
    expect(w.bodies.starAt(0)).toBe('brownDwarf');
    for (let i = 0; i < 100; i++) w.step();
    expect(w.bodies.starAt(0)).toBe('brownDwarf');
  });

  it('显式行星质量配置为 brownDwarf 不被改写（红线：显式不推导）', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: DEFAULT_PHYSICS,
      view: DEFAULT_VIEW,
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 0.001, star: { type: 'brownDwarf' } }],
    });
    expect(w.bodies.starAt(0)).toBe('brownDwarf');
  });

  it('validate 拒收相位类型（配置层不含 giant/supergiant/wolfRayet）', () => {
    const r = validateConfig(cfgWith([{ x: 0, y: 0, vx: 0, vy: 0, mass: 1, star: { type: 'giant' as never } }]));
    expect(r.ok).toBe(false);
  });
});

describe('H3 · 沃尔夫-拉叶相', () => {
  it('流失比例公式：windLossFraction(0.16) ≈ 6.2%', () => {
    expect(windLossFraction(0)).toBe(0);
    expect(windLossFraction(0.16)).toBeGreaterThan(0.05);
    expect(windLossFraction(0.16)).toBeLessThan(0.08);
    expect(windLossFraction(10)).toBeGreaterThan(0.98);
  });

  it('25 M☉ 全路径：MS → 红超巨星 → WR → 超新星 → 黑洞', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.005, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 25 }],
    });
    let guard = 0;
    while (w.bodies.starAt(0) !== 'blackHole' && guard++ < 200000) w.step();
    expect(w.bodies.starAt(0)).toBe('blackHole');
    expect(w.bodies.mass[0]).toBeCloseTo(3, 6);
    const texts = w.stellarEvents.map((e) => e.text).join('|');
    expect(texts).toContain('主序耗尽 → 红超巨星');
    expect(texts).toContain('沃尔夫-拉叶星');
    expect(texts).toContain('II 型超新星 → 黑洞');
  });

  it('WR 相内质量连续下降（流失随步应用）', () => {
    // 20 M☉：t_MS=5.59，super 到 5.868，WR 到 6.148。取 WR 中段时刻检查质量 < 20
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.005, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 20 }],
    });
    let sawWrDrop = false;
    let prev = 20;
    let guard = 0;
    while (w.bodies.starAt(0) !== 'blackHole' && guard++ < 200000) {
      w.step();
      const t = w.time; // timeUnit=1 → 模拟时间即 Myr
      const st = w.bodies.starAt(0);
      if (st === 'wolfRayet' && w.bodies.mass[0] < prev - 1e-9) sawWrDrop = true;
      prev = Math.min(prev, st === 'wolfRayet' ? w.bodies.mass[0] : 20);
      void t;
    }
    expect(sawWrDrop).toBe(true);
  });
});

describe('I1/I2 · 恒星快照与事件', () => {
  it('相位事件携带恒星快照（type/质量/相位名）', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies: [{ id: 3, x: 0, y: 0, vx: 0, vy: 0, mass: 1 }],
    });
    let guard = 0;
    while (!w.stellarEvents.some((e) => e.text.includes('红巨星')) && guard++ < 12000) w.step();
    const evt = w.stellarEvents.find((e) => e.text.includes('红巨星'))!;
    expect(evt.star).toBeDefined();
    expect(evt.star!.type).toBe('giant');
    expect(evt.star!.massPhys).toBeCloseTo(1, 5);
    expect(evt.star!.phase).toBe('红巨星');
    expect(evt.star!.phaseEndMyr).toBeGreaterThan(0);
    expect(evt.star!.ageMyr).toBeGreaterThan(0);
  });

  it('遗骸事件快照切到遗骸（I1：卡片在超新星后显示遗骸）', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 1 }],
    });
    let guard = 0;
    while (w.bodies.starAt(0) !== 'whiteDwarf' && guard++ < 20000) w.step();
    const evt = w.stellarEvents[w.stellarEvents.length - 1];
    expect(evt.star!.type).toBe('whiteDwarf');
    expect(evt.star!.massPhys).toBeCloseTo(0.6, 5);
    expect(evt.star!.phase).toBe('遗骸');
  });
});

describe('J1 · 大质量主序星星风', () => {
  it('wind=true：8.5 M☉ 主序期质量按 1e-4·M Myr⁻¹ 流失，动量守恒', () => {
    const bodies: BodyConfig[] = [{ id: 1, x: -30, y: 0, vx: 0, vy: 0.2, mass: 8.5 }];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, wind: true },
      bodies,
    });
    for (let i = 0; i < 40; i++) w.step(); // 40 Myr < t_MS(8.5)≈47.5
    const expected = 8.5 * Math.exp(-1e-4 * 40);
    expect(w.bodies.mass[0]).toBeCloseTo(expected, 2);
    // 简化模型：流失不改速度（星风带走动量的口径见 README）
    expect(w.bodies.vy[0]).toBeCloseTo(0.2, 12);
    expect(w.stellarEvents.some((e) => e.text.includes('星风流失'))).toBe(true);
  });

  it('wind=false 回归：质量恒定', () => {
    const w = new World({
      init: { ...DEFAULT_INIT, count: 1 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, wind: false },
      bodies: [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 8.5 }],
    });
    for (let i = 0; i < 30; i++) w.step();
    expect(w.bodies.mass[0]).toBeCloseTo(8.5, 9);
  });
});

describe('J3 · 超新星冲击波汽化', () => {
  it('kickRadius 内行星被汽化，外圈恒星不受影响', () => {
    // 25 M☉ → BH 全路径 ≈3.5 Myr；radiusKick = 10 × softening
    const bodies: BodyConfig[] = [
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 25 },
      { id: 2, x: 1, y: 0, vx: 0, vy: 0, mass: 0.01, star: { type: 'planet' } }, // 内
      { id: 3, x: 40, y: 0, vx: 0, vy: 0, mass: 1, star: { type: 'G' } },       // 外
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 3 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.005, collision: 'none', softening: 0.6 },
      view: DEFAULT_VIEW,
      bodies,
    });
    let guard = 0;
    while (w.bodies.starAt(0) !== 'blackHole' && guard++ < 200000) w.step();
    const texts = w.stellarEvents.map((e) => e.text).join('|');
    expect(texts).toContain('被冲击波汽化');
    const vaporized = w.stellarEvents.find((e) => e.text.includes('汽化'))!;
    expect(vaporized.bodyId).toBe(1); // SoA 索引 1 = 行星（removeDead 未触发）
    expect(w.bodies.mass[1]).toBe(0);
    expect(w.bodies.mass[2]).toBeCloseTo(1, 9); // 外圈恒星完好
    expect(w.bodies.starAt(2)).toBe('G');
  });
});

describe('J4 · 黑洞潮汐瓦解', () => {
  it('行星进入 r_td 被整体并入：黑洞增质、动量守恒加权', () => {
    // 1 M☉ BH：r_s=1.974e-8 AU；tidalFactor=1e6 → r_td≈0.0197 模拟单位
    const bodies: BodyConfig[] = [
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 1, star: { type: 'blackHole' } },
      { id: 2, x: 0.01, y: 0, vx: 0, vy: 0, mass: 0.5, star: { type: 'planet' } },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1e-4, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, accretion: true, tidalFactor: 1e6 },
      bodies,
    });
    // 第 1 步 dtMyr=0（初始化），第 2 步起每步瓦解判定生效
    for (let i = 0; i < 5; i++) w.step();
    expect(w.bodies.mass[0]).toBeCloseTo(1.5, 6);
    expect(w.bodies.mass[1]).toBe(0);
    expect(w.stellarEvents.some((e) => e.text.includes('潮汐瓦解'))).toBe(true);
  });

  it('恒星被持续剥离：总质量守恒（黑洞+恒星账目）', () => {
    const bodies: BodyConfig[] = [
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 5, star: { type: 'blackHole' } },
      { id: 2, x: 0.05, y: 0, vx: 0, vy: 0, mass: 3, star: { type: 'G' } },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 1e-4, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, accretion: true, tidalFactor: 1e6 },
      bodies,
    });
    for (let i = 0; i < 50; i++) w.step(); // 0.005 Myr → 剥离 ≈ 3×0.01×0.005
    const total = w.bodies.mass[0] + w.bodies.mass[1];
    expect(total).toBeCloseTo(8, 6);
    expect(w.bodies.mass[1]).toBeLessThan(3);
    expect(w.bodies.mass[0]).toBeGreaterThan(5);
  });

  it('accretion=false 回归：不发生潮汐瓦解', () => {
    const bodies: BodyConfig[] = [
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, mass: 1, star: { type: 'blackHole' } },
      { id: 2, x: 1e-9, y: 0, vx: 0, vy: 0, mass: 0.5, star: { type: 'planet' } },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.001, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, accretion: false, tidalFactor: 1e6 },
      bodies,
    });
    for (let i = 0; i < 5; i++) w.step();
    expect(w.bodies.mass[1]).toBeCloseTo(0.5, 9);
  });
});

describe('J2 · 双星质量转移', () => {
  it('束缚轨道双星持续转移：donor 流失、accretor 增质、抛失使总质量减少', () => {
    // 5 + 3 M☉ 圆轨道（v_rel=sqrt(8/0.5)=4 → v1=1.5, v2=-2.5），间距恒 0.5 < 3×(r1+r2)≈0.76
    const bodies: BodyConfig[] = [
      { id: 1, x: -0.25, y: 0, vx: 0, vy: 1.5, mass: 5 },
      { id: 2, x: 0.25, y: 0, vx: 0, vy: -2.5, mass: 3 },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.01, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, transfer: true },
      bodies,
    });
    for (let i = 0; i < 1000; i++) w.step(); // 10 Myr：近距对穿轨道内双向转移
    const m0 = w.bodies.mass[0];
    const m1 = w.bodies.mass[1];
    // 不变量断言（轨道震荡下 donor/accretor 会互换，不用方向性断言）：
    expect(m0).not.toBeCloseTo(5, 3); // 双方质量都被改写
    expect(m1).not.toBeCloseTo(3, 3);
    expect(Math.abs(m0 - 5) + Math.abs(m1 - 3)).toBeGreaterThan(0.01);
    expect(m0 + m1).toBeLessThan(8); // 抛失 20% 离系统
    expect(m0 + m1).toBeGreaterThan(6); // 漏损有限（不吞掉全部质量）
    expect(w.stellarEvents.some((e) => e.text.includes('洛希瓣溢出'))).toBe(true);
  });

  it('transfer=false 回归：质量不变', () => {
    const bodies: BodyConfig[] = [
      { id: 1, x: -0.25, y: 0, vx: 0, vy: 0, mass: 5 },
      { id: 2, x: 0.25, y: 0, vx: 0, vy: 0, mass: 3 },
    ];
    const w = new World({
      init: { ...DEFAULT_INIT, count: 2 },
      physics: { ...DEFAULT_PHYSICS, dimensions: 2, engine: 'direct', dt: 0.01, collision: 'none', softening: 0 },
      view: DEFAULT_VIEW,
      stellar: { ...DEFAULT_STELLAR, transfer: false },
      bodies,
    });
    for (let i = 0; i < 100; i++) w.step();
    expect(w.bodies.mass[0]).toBeCloseTo(5, 6);
    expect(w.bodies.mass[1]).toBeCloseTo(3, 6);
  });
});

describe('J 组 · 配置校验', () => {
  it('wind/transfer/tidalFactor 默认值与非法值', () => {
    const ok = validateConfig(cfgWith([{ x: 0, y: 0, vx: 0, vy: 0, mass: 1 }]));
    expect(ok.ok).toBe(true);
    expect(ok.config!.stellar!.wind).toBe(false);
    expect(ok.config!.stellar!.transfer).toBe(false);
    expect(ok.config!.stellar!.tidalFactor).toBe(100);
    const bad = validateConfig(cfgWith([{ x: 0, y: 0, vx: 0, vy: 0, mass: 1 }], {
      stellar: { ...DEFAULT_STELLAR, tidalFactor: -5 },
    }));
    expect(bad.ok).toBe(false);
  });
});
