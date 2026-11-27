/**
 * 恒星演化唯一真源：光谱型质量表、主序寿命公式、遗骸质量、物理量换算。
 *
 * 设计约束：
 *  - 光谱表与寿命公式只在本文件出现一次，palette / validate / UI 不得复制第二份；
 *  - 全部为纯函数，便于单元测试；
 *  - 质量口径 M_phys = mass / massUnit（M☉）；时间口径 t_phys = world.time / timeUnit（Myr）。
 */

import type {
  BodyConfig,
  EvolutionPhase,
  PhaseType,
  RuntimeStarType,
  StarType,
  StellarConfig,
} from './types';

/** 运行时光谱型（配置里的 'auto' 已推导掉）。 */
export type ResolvedStarType = Exclude<StarType, 'auto'>;

export const STAR_TYPES: readonly ResolvedStarType[] = [
  'planet', 'O', 'B', 'A', 'F', 'G', 'K', 'M', 'brownDwarf',
  'whiteDwarf', 'neutronStar', 'blackHole',
];

/** 15 类恒星/行星/相位的渲染色（唯一真源，palette.ts 从这里转换）。 */
export const STELLAR_COLORS: Record<RuntimeStarType, string> = {
  O: '#9bb0ff',
  B: '#aabfff',
  A: '#cad7ff',
  F: '#f8f7ff',
  G: '#fff4ea',
  K: '#ffd2a1',
  M: '#ffcc6f',
  brownDwarf: '#9b6a5a',
  whiteDwarf: '#cfe0ff',
  neutronStar: '#ccddff',
  blackHole: '#ffaa33',
  planet: '#8a8f98',
  giant: '#ff9a6f',
  supergiant: '#ff8f5f',
  wolfRayet: '#7a9cff',
};

export const REMNANTS: readonly StarType[] = ['whiteDwarf', 'neutronStar', 'blackHole'];

export function isRemnant(t: RuntimeStarType): boolean {
  return t === 'whiteDwarf' || t === 'neutronStar' || t === 'blackHole';
}

/**
 * H2/H3：运行时类型 → 演化相位。遗骸/行星/褐矮星/auto 不在状态机中，返回 null。
 */
export function phaseOf(t: RuntimeStarType | 'auto'): EvolutionPhase | null {
  if (t === 'giant' || t === 'supergiant' || t === 'wolfRayet') return t;
  if (t === 'auto') return null;
  if (t === 'planet' || t === 'brownDwarf' || isRemnant(t)) return null;
  return 'ms';
}

/** 光谱型质量表（升序），上界即下一档下界。 */
export interface SpectralBand {
  type: ResolvedStarType;
  /** 含下界。 */
  min: number;
  /** 不含上界；最后一档为 Infinity。 */
  max: number;
  label: string;
  tempK: number;
  color: string;
}

export const SPECTRAL_TABLE: readonly SpectralBand[] = [
  { type: 'O', min: 16, max: Infinity, label: 'O 型蓝巨星', tempK: 30000, color: '#9bb0ff' },
  { type: 'B', min: 2.1, max: 16, label: 'B 型蓝白星', tempK: 20000, color: '#aabfff' },
  { type: 'A', min: 1.4, max: 2.1, label: 'A 型白星', tempK: 9000, color: '#cad7ff' },
  { type: 'F', min: 1.04, max: 1.4, label: 'F 型黄白星', tempK: 7000, color: '#f8f7ff' },
  { type: 'G', min: 0.8, max: 1.04, label: 'G 型主序星（太阳级）', tempK: 5800, color: '#fff4ea' },
  { type: 'K', min: 0.45, max: 0.8, label: 'K 型橙矮星', tempK: 4500, color: '#ffd2a1' },
  { type: 'brownDwarf', min: 0.013, max: 0.45, label: '褐矮星', tempK: 1500, color: '#9b6a5a' },
  { type: 'planet', min: 0, max: 0.013, label: '行星 / 未分类', tempK: 0, color: '#8a8f98' },
];

/**
 * 按物理质量（M☉）查光谱型。边界归属严格按表：0.45→K，0.013→褐矮星，0.8→G，16→O。
 * H1：auto 推导不再产生 M 型（0.013–0.45 归褐矮星；<0.013 归行星）；M 仍可显式指定。
 */
export function spectralClass(massPhys: number): ResolvedStarType {
  for (const band of SPECTRAL_TABLE) {
    if (massPhys >= band.min && massPhys < band.max) return band.type;
  }
  return massPhys < 0 ? 'planet' : 'O';
}

/** 主序寿命 t_MS = 10000 · M^(-2.5) Myr。 */
export function mainSequenceLifespan(massPhys: number): number {
  if (!(massPhys > 0)) return Infinity;
  return 10000 * Math.pow(massPhys, -2.5);
}

/** M < 0.8（含褐矮星与行星质量段）永驻主序，不进状态机。 */
export function neverEvolves(massPhys: number): boolean {
  return massPhys < 0.8;
}

/** H3：沃尔夫-拉叶星风质量流失率 dM/dt = 0.4·M Myr⁻¹（指数衰减）。 */
export const WR_WIND_RATE_PER_MYR = 0.4;
/** H3/J1：星风与星风事件的聚合间隔（物理 Myr），流失本身每步连续应用。 */
export const WR_WIND_BATCH_MYR = 10;
/** J1：大质量主序星星风流失率 dM/dt = 1e-4·M Myr⁻¹（仅 M > 8 M☉ 主序体）。 */
export const MS_WIND_RATE_PER_MYR = 1e-4;
/** J1：星风作用的最低主序质量。 */
export const MS_WIND_MIN_MSUN = 8;
/** J2：洛希瓣溢出质量转移率 dM/dt = 0.05·M_donor Myr⁻¹。 */
export const TRANSFER_RATE_PER_MYR = 0.05;
/** J2：转移事件的聚合间隔（物理 Myr）。 */
export const TRANSFER_EVENT_BATCH_MYR = 1;
/** J2：触发转移的最低质量比（donor > 1.2 × accretor）。 */
export const TRANSFER_MASS_RATIO = 1.2;
/** J2：触发转移的最大间距（× 两体半径之和）。 */
export const TRANSFER_DISTANCE_FACTOR = 3;
/** J2：转移质量中抛失出系统的比例（其余 80% 落到 accretor）。 */
export const TRANSFER_ESCAPE_FRACTION = 0.2;
/** J4：恒星被黑洞持续剥离的速率（每 Myr 剥离当前质量的 1%）。 */
export const TIDAL_STRIPPING_RATE_PER_MYR = 0.01;

/** H3/J1：dtMyr 内的质量流失比例 1 − e^(−rate·dt)（流失每步连续应用）。 */
export function windLossFraction(dtMyr: number, rate = WR_WIND_RATE_PER_MYR): number {
  return 1 - Math.exp(-rate * Math.max(0, dtMyr));
}
/** H2：主序后相位时长（以该星主序寿命为基准）。 */
export const GIANT_LIFETIME_FRACTION = 0.1;
export const SUPERGIANT_LIFETIME_FRACTION = 0.05;
export const WOLF_RAYET_LIFETIME_FRACTION = 0.05;

export type EvolutionEvent =
  | { kind: 'none' }
  | { kind: 'toGiant'; durationMyr: number }
  | { kind: 'toSupergiant'; durationMyr: number }
  | { kind: 'toWolfRayet'; durationMyr: number }
  | { kind: 'toWhiteDwarf'; remnantMass: number }
  | { kind: 'supernova'; remnant: 'neutronStar' | 'blackHole'; remnantMass: number };

/**
 * H2/H3 状态机：给定当前相位、物理质量与年龄，返回此刻应触发的演化事件。
 *
 * 相位路径（t_MS 以当前质量的公式值计）：
 *  - 0.8–8  M☉：MS → giant(0.1·t_MS) → 白矮星；
 *  - 8–20   M☉：MS → supergiant(0.05·t_MS) → II 型超新星 → 中子星；
 *  - ≥20    M☉：MS → supergiant(0.05·t_MS) → wolfRayet(0.05·t_MS) → 超新星 → 黑洞。
 *
 * 相位推进的触发时机由调用方的 lifespanMyr（进入相位时固定为 age + duration）控制；
 * 'ms' 相在函数内部按 t_MS 判断（兼容旧调用）。遗骸质量为模拟单位。
 */
export function advanceEvolution(
  massPhys: number,
  ageMyr: number,
  massUnit: number,
  phase: EvolutionPhase = 'ms',
): EvolutionEvent {
  // 矮星/褐矮星（<0.8 M☉）永驻主序，不进状态机
  if (neverEvolves(massPhys)) return { kind: 'none' };
  const tMS = mainSequenceLifespan(massPhys);
  if (phase === 'ms') {
    if (ageMyr < tMS) return { kind: 'none' };
    return massPhys < 8
      ? { kind: 'toGiant', durationMyr: GIANT_LIFETIME_FRACTION * tMS }
      : { kind: 'toSupergiant', durationMyr: SUPERGIANT_LIFETIME_FRACTION * tMS };
  }
  if (phase === 'giant') {
    return { kind: 'toWhiteDwarf', remnantMass: Math.min(0.6 * massPhys, 1.4) * massUnit };
  }
  if (phase === 'supergiant') {
    return massPhys >= 20
      ? { kind: 'toWolfRayet', durationMyr: WOLF_RAYET_LIFETIME_FRACTION * tMS }
      : { kind: 'supernova', remnant: 'neutronStar', remnantMass: 1.4 * massUnit };
  }
  // wolfRayet：流失结束后坍缩为黑洞
  return { kind: 'supernova', remnant: 'blackHole', remnantMass: 3 * massUnit };
}

/** 遗骸质量（模拟单位）：用于显式遗骸的换算与并合。 */
export function remnantMass(type: StarType, massUnit: number): number {
  if (type === 'whiteDwarf') return 1.4 * massUnit;
  if (type === 'neutronStar') return 1.4 * massUnit;
  if (type === 'blackHole') return 3 * massUnit;
  return 0;
}

/**
 * H2/H1：光谱配色下的点大小倍率。
 * 红巨星 ×6、红超巨星 ×14（膨胀包层）、沃尔夫-拉叶 ×3（致密亮星）、褐矮星 ×0.8（暗淡小体）。
 */
export function starSizeMul(type: RuntimeStarType | 'auto'): number {
  if (type === 'giant') return 6;
  if (type === 'supergiant') return 14;
  if (type === 'wolfRayet') return 3;
  if (type === 'brownDwarf') return 0.8;
  return 1;
}

/**
 * 恒星类型的显示名。MS 星用光谱表全名，相位/遗骸/行星用固定文案。
 */
export function starLabel(type: RuntimeStarType): string {
  if (type === 'planet') return '行星 / 未分类';
  if (type === 'giant') return '红巨星';
  if (type === 'supergiant') return '红超巨星';
  if (type === 'wolfRayet') return '沃尔夫-拉叶星';
  if (type === 'brownDwarf') return '褐矮星';
  if (isRemnant(type)) {
    return type === 'whiteDwarf' ? '白矮星' : type === 'neutronStar' ? '中子星' : '黑洞';
  }
  return SPECTRAL_TABLE.find((b) => b.type === type)?.label ?? '主序星';
}

/** 类型为显式指定（非 auto）：不做质量推导、不参与演化。 */
export function isExplicitStar(body: BodyConfig): boolean {
  return !!body.star?.type && body.star.type !== 'auto';
}

/** 从 BodyConfig 得到该体的恒星类型（auto 按质量推导）。 */
export function resolveStarType(body: BodyConfig, massUnit: number): ResolvedStarType {
  const explicit = body.star?.type;
  if (explicit && explicit !== 'auto') return explicit;
  return spectralClass(body.mass / Math.max(1e-12, massUnit));
}

/** 该体是否参与演化状态机：只有未显式指定的 auto 体，且不是行星/遗骸。 */
export function evolves(body: BodyConfig, massUnit: number): boolean {
  if (isExplicitStar(body)) return false;
  const t = resolveStarType(body, massUnit);
  return t !== 'planet' && !isRemnant(t);
}

/** 物理质量 M☉。 */
export function physMass(simMass: number, stellar: StellarConfig): number {
  return simMass / Math.max(1e-12, stellar.massUnit);
}

/** 物理时间 Myr。 */
export function physTime(simTime: number, stellar: StellarConfig): number {
  return simTime / Math.max(1e-12, stellar.timeUnit);
}

// ---- G4：遗骸半径换算链（常量集中于此，README 引用同一链路） ----

/** 太阳半径，单位 AU。R☉ = 695700 km，1 AU = 149597870.7 km。 */
export const R_SUN_AU = 695700 / 149597870.7; // ≈ 0.00465
/** 光速，单位 AU/Myr。c = 299792.458 km/s × 3.15576e13 s/Myr ÷ 1.495978707e8 km/AU。 */
export const C_AU_PER_MYR = (299792.458 * 3.15576e13) / 149597870.7; // ≈ 63241
/**
 * G 在 AU³/(M☉·Myr²) 单位下的值。
 * 由 1 M☉ 的史瓦西半径 2GM☉/c² = 2953 m = 1.974e-8 AU 反标定：
 * G_AU = rs(1M☉)·c²/2 = 1.974e-8 × (6.324e10)² / 2 ≈ 3.95e13。
 */
export const R_S_PER_MSUN_AU = 2953 / 149597870.7; // ≈ 1.974e-8 AU
export const G_AU = (R_S_PER_MSUN_AU * C_AU_PER_MYR * C_AU_PER_MYR) / 2;

/**
 * 遗骸的物理半径，单位 AU。
 * WD: 0.01 R☉；NS: 10 km；BH: 史瓦西半径 r_s = 2GM/c²。
 */
export function remnantRadiusAu(type: ResolvedStarType, massPhys: number): number {
  if (type === 'whiteDwarf') return 0.01 * R_SUN_AU;
  if (type === 'neutronStar') return 10 / 149597870.7;
  if (type === 'blackHole') {
    return (2 * G_AU * Math.max(1e-12, massPhys)) / (C_AU_PER_MYR * C_AU_PER_MYR);
  }
  return 0;
}

/** 物理半径 → 模拟半径（lengthUnit = 每 AU 对应的模拟长度）。 */
export function toSimRadius(radiusAu: number, lengthUnit: number): number {
  return radiusAu * Math.max(1e-12, lengthUnit);
}

/**
 * 超新星径向冲量：Δv = k · G · M_ejecta / r²，方向沿径向向外。
 * 对称性由调用方保证（对每对邻居施加等大反向冲量），本函数只算标量大小。
 * Δv 封顶 Δv_max = 50 × softening / dt。
 */
export function kickMagnitude(
  G: number,
  ejectaMass: number,
  r: number,
  gain: number,
  softening: number,
  dt: number,
): number {
  if (!(r > 0)) return 0;
  const raw = (gain * G * ejectaMass) / (r * r);
  const cap = (50 * softening) / Math.max(1e-12, dt);
  return Math.min(raw, cap);
}

/**
 * 超新星对称径向冲量：对半径 radiusKick 内每体施加向外 Δv，
 * 同时给爆发体等大反向的动量补偿，保证系统总动量严格守恒。
 * 返回每个邻居的 Δv（与 bodies 同索引，未受冲量者为 0）。
 */
export function supernovaKick(
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  vx: Float64Array,
  vy: Float64Array,
  vz: Float64Array,
  mass: Float64Array,
  n: number,
  index: number,
  ejectaMass: number,
  radiusKick: number,
  gain: number,
  softening: number,
  dt: number,
  useZ: boolean,
): Float64Array {
  const dv = new Float64Array(n);
  if (radiusKick <= 0) return dv;
  const xi = x[index];
  const yi = y[index];
  const zi = useZ ? z[index] : 0;
  const mi = mass[index];
  let px = 0;
  let py = 0;
  let pz = 0;
  const r2Max = radiusKick * radiusKick;
  for (let j = 0; j < n; j++) {
    if (j === index || !(mass[j] > 0)) continue;
    const dx = x[j] - xi;
    const dy = y[j] - yi;
    const dz = useZ ? z[j] - zi : 0;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 <= 0 || r2 >= r2Max) continue;
    const r = Math.sqrt(r2);
    const mag = kickMagnitude(1, ejectaMass, r, gain, softening, dt);
    const dvx = (dx / r) * mag;
    const dvy = (dy / r) * mag;
    const dvz = useZ ? (dz / r) * mag : 0;
    dv[j * 3] = dvx;
    dv[j * 3 + 1] = dvy;
    dv[j * 3 + 2] = dvz;
    vx[j] += dvx;
    vy[j] += dvy;
    if (useZ) vz[j] += dvz;
    px += mass[j] * dvx;
    py += mass[j] * dvy;
    pz += useZ ? mass[j] * dvz : 0;
  }
  // 爆发体反向补偿：系统总动量变化 = 0
  if (mi > 0) {
    vx[index] -= px / mi;
    vy[index] -= py / mi;
    if (useZ) vz[index] -= pz / mi;
  }
  return dv;
}
