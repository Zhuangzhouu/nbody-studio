/**
 * JSON 配置校验：把不可信输入转换为完整的 SimulationConfig。
 * 校验严格、错误可读；不设置天体数上限（内存风险由用户自负）。
 */

import {
  DEFAULT_INIT,
  DEFAULT_PHYSICS,
  DEFAULT_RUN,
  DEFAULT_STELLAR,
  DEFAULT_VIEW,
} from '../params';
import type {
  BodyConfig,
  CollisionMode,
  ColorMode,
  Dimensions,
  DistributionKind,
  EnginePreference,
  InitParams,
  IntegratorKind,
  PhysicsParams,
  RunParams,
  SamplingMode,
  StarType,
  StellarConfig,
  SimulationConfig,
  ViewParams,
} from '../types';

export interface ValidationResult {
  ok: boolean;
  config: SimulationConfig | null;
  errors: string[];
  warnings: string[];
}

const ENGINES: EnginePreference[] = ['auto', 'direct', 'barnes-hut', 'multipole', 'particle-mesh', 'treepm'];
const SAMPLING: SamplingMode[] = ['auto', 'never', 'always'];
const DISTRIBUTIONS: DistributionKind[] = ['disc', 'cloud', 'cluster', 'collision', 'grid', 'binary'];
const INTEGRATORS: IntegratorKind[] = ['verlet', 'rk4', 'yoshida4'];
const COLLISIONS: CollisionMode[] = ['none', 'merge', 'bounce'];
const COLORS: ColorMode[] = ['speed', 'mass', 'radius', 'stellar'];
const STAR_TYPES: StarType[] = ['auto', 'planet', 'O', 'B', 'A', 'F', 'G', 'K', 'M', 'brownDwarf', 'whiteDwarf', 'neutronStar', 'blackHole'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(
  src: Record<string, unknown>,
  key: string,
  fallback: number,
  errors: string[],
  path: string,
  opts: { min?: number; max?: number; integer?: boolean; minExclusive?: boolean } = {},
): number {
  const raw = src[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    errors.push(`${path}.${key} 必须是有限数字`);
    return fallback;
  }
  let v = raw;
  if (opts.integer) v = Math.round(v);
  if (opts.min !== undefined && v < opts.min) {
    errors.push(`${path}.${key} 不能小于 ${opts.min}`);
  }
  if (opts.max !== undefined && v > opts.max) {
    errors.push(`${path}.${key} 不能大于 ${opts.max}`);
  }
  if (opts.minExclusive && v <= 0) {
    errors.push(`${path}.${key} 必须大于 0`);
  }
  return v;
}

function bool(src: Record<string, unknown>, key: string, fallback: boolean, path: string, errors: string[]): boolean {
  const raw = src[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'boolean') {
    errors.push(`${path}.${key} 必须是 true/false`);
    return fallback;
  }
  return raw;
}

function str<T extends string>(
  src: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
  path: string,
  errors: string[],
): T {
  const raw = src[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    errors.push(`${path}.${key} 必须是 ${allowed.join(' / ')} 之一`);
    return fallback;
  }
  return raw as T;
}

/** 校验并补齐为完整配置。 */
export function validateConfig(input: unknown, maxBodies = Infinity): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObj(input)) {
    return { ok: false, config: null, errors: ['配置根节点必须是 JSON 对象'], warnings };
  }

  const schema = input.schema;
  if (schema !== undefined && schema !== 'nbody-studio/v2') {
    warnings.push(`未知 schema「${String(schema)}」，按 v2 解析`);
  }

  const dimensions: Dimensions =
    input.dimensions === 3 ? 3 : input.dimensions === 2 ? 2 : (() => {
      if (input.dimensions !== undefined) errors.push('dimensions 必须是 2 或 3');
      return DEFAULT_PHYSICS.dimensions;
    })();

  const p = isObj(input.physics) ? input.physics : {};
  const physics: PhysicsParams = {
    dimensions,
    G: num(p, 'G', DEFAULT_PHYSICS.G, errors, 'physics', { minExclusive: true }),
    dt: num(p, 'dt', DEFAULT_PHYSICS.dt, errors, 'physics', { minExclusive: true, max: 1000 }),
    softening: num(p, 'softening', DEFAULT_PHYSICS.softening, errors, 'physics', { min: 0 }),
    theta: num(p, 'theta', DEFAULT_PHYSICS.theta, errors, 'physics', { min: 0.01, max: 2 }),
    integrator: str(p, 'integrator', INTEGRATORS, DEFAULT_PHYSICS.integrator, 'physics', errors),
    collision: str(p, 'collision', COLLISIONS, DEFAULT_PHYSICS.collision, 'physics', errors),
    restitution: num(p, 'restitution', DEFAULT_PHYSICS.restitution, errors, 'physics', { min: 0, max: 1 }),
    bodyRadius: num(p, 'bodyRadius', DEFAULT_PHYSICS.bodyRadius, errors, 'physics', { min: 0 }),
    engine: str(p, 'engine', ENGINES, DEFAULT_PHYSICS.engine, 'physics', errors),
    sampling: str(p, 'sampling', SAMPLING, DEFAULT_PHYSICS.sampling, 'physics', errors),
    maxSimulated: num(p, 'maxSimulated', DEFAULT_PHYSICS.maxSimulated, errors, 'physics', { min: 0, integer: true }),
    pmGrid: num(p, 'pmGrid', DEFAULT_PHYSICS.pmGrid, errors, 'physics', { min: 0, max: 4096, integer: true }),
    adaptiveDt: bool(p, 'adaptiveDt', DEFAULT_PHYSICS.adaptiveDt, 'physics', errors),
    dtSafety: num(p, 'dtSafety', DEFAULT_PHYSICS.dtSafety, errors, 'physics', { min: 1e-6, max: 1 }),
    escapeRadius: num(p, 'escapeRadius', DEFAULT_PHYSICS.escapeRadius, errors, 'physics', { min: 0 }),
    rSplitGrids: num(p, 'rSplitGrids', DEFAULT_PHYSICS.rSplitGrids, errors, 'physics', { minExclusive: true }),
  };

  const i = isObj(input.init) ? input.init : {};
  const init: InitParams = {
    count: num(i, 'count', DEFAULT_INIT.count, errors, 'init', { min: 1, max: 2147483647, integer: true }),
    distribution: str(i, 'distribution', DISTRIBUTIONS, DEFAULT_INIT.distribution, 'init', errors),
    radius: num(i, 'radius', DEFAULT_INIT.radius, errors, 'init', { minExclusive: true, max: 1e12 }),
    massMin: num(i, 'massMin', DEFAULT_INIT.massMin, errors, 'init', { minExclusive: true }),
    massMax: num(i, 'massMax', DEFAULT_INIT.massMax, errors, 'init', { minExclusive: true }),
    totalMass: num(i, 'totalMass', DEFAULT_INIT.totalMass, errors, 'init', { minExclusive: true }),
    normalizeMass: bool(i, 'normalizeMass', DEFAULT_INIT.normalizeMass, 'init', errors),
    spin: num(i, 'spin', DEFAULT_INIT.spin, errors, 'init', { min: 0 }),
    jitter: num(i, 'jitter', DEFAULT_INIT.jitter, errors, 'init', { min: 0 }),
    thickness: num(i, 'thickness', DEFAULT_INIT.thickness, errors, 'init', { min: 0 }),
    seed: num(i, 'seed', DEFAULT_INIT.seed, errors, 'init', { min: 0, max: 0xffffffff, integer: true }),
  };
  if (init.massMax < init.massMin) {
    errors.push('init.massMax 不能小于 init.massMin');
  }

  const v = isObj(input.view) ? input.view : {};
  const view: ViewParams = {
    trails: bool(v, 'trails', DEFAULT_VIEW.trails, 'view', errors),
    trailLength: num(v, 'trailLength', DEFAULT_VIEW.trailLength, errors, 'view', { min: 0 }),
    trailBodies: num(v, 'trailBodies', DEFAULT_VIEW.trailBodies, errors, 'view', { min: 0, integer: true }),
    trailPoints: num(v, 'trailPoints', DEFAULT_VIEW.trailPoints, errors, 'view', { min: 2, max: 10000, integer: true }),
    maxRenderPoints: num(v, 'maxRenderPoints', DEFAULT_VIEW.maxRenderPoints, errors, 'view', { min: 0, integer: true }),
    colorMode: str(v, 'colorMode', COLORS, DEFAULT_VIEW.colorMode, 'view', errors),
    pointSize: num(v, 'pointSize', DEFAULT_VIEW.pointSize, errors, 'view', { min: 0.5, max: 20 }),
    glow: bool(v, 'glow', DEFAULT_VIEW.glow, 'view', errors),
    showGrid: bool(v, 'showGrid', DEFAULT_VIEW.showGrid, 'view', errors),
  };

  const r = isObj(input.run) ? input.run : {};
  if (physics.pmGrid > 0 && (physics.pmGrid & (physics.pmGrid - 1)) !== 0) {
    errors.push('physics.pmGrid 必须是 2 的幂');
  }

  const run: RunParams = {
    playing: bool(r, 'playing', DEFAULT_RUN.playing, 'run', errors),
    speed: num(r, 'speed', DEFAULT_RUN.speed, errors, 'run', { minExclusive: true }),
  };

  const st = isObj(input.stellar) ? input.stellar : {};
  const stellar: StellarConfig = {
    massUnit: num(st, 'massUnit', DEFAULT_STELLAR.massUnit, errors, 'stellar', { minExclusive: true }),
    timeUnit: num(st, 'timeUnit', DEFAULT_STELLAR.timeUnit, errors, 'stellar', { minExclusive: true }),
    lengthUnit: num(st, 'lengthUnit', DEFAULT_STELLAR.lengthUnit, errors, 'stellar', { minExclusive: true, max: 1e12 }),
    kickRadius: num(st, 'kickRadius', DEFAULT_STELLAR.kickRadius, errors, 'stellar', { min: 0 }),
    kickGain: num(st, 'kickGain', DEFAULT_STELLAR.kickGain, errors, 'stellar', { min: 0, max: 100 }),
    accretion: bool(st, 'accretion', DEFAULT_STELLAR.accretion, 'stellar', errors),
    wind: bool(st, 'wind', DEFAULT_STELLAR.wind, 'stellar', errors),
    transfer: bool(st, 'transfer', DEFAULT_STELLAR.transfer, 'stellar', errors),
    tidalFactor: num(st, 'tidalFactor', DEFAULT_STELLAR.tidalFactor, errors, 'stellar', { min: 0, max: 1e6 }),
  };

  let bodies: BodyConfig[] | undefined;
  if (input.bodies !== undefined) {
    if (!Array.isArray(input.bodies)) {
      errors.push('bodies 必须是数组');
    } else {
      if (input.bodies.length > maxBodies) {
        return { ok: false, config: null, errors: [`bodies 数量超过上限 ${maxBodies}`], warnings };
      }
      bodies = [];
      for (let k = 0; k < input.bodies.length; k++) {
        const parsed = parseBodyConfig(input.bodies[k], `bodies[${k}]`);
        if (parsed.body) bodies.push(parsed.body);
        errors.push(...parsed.errors);
      }
      if (bodies.length === 0) bodies = undefined;
    }
  }

  if (errors.length > 0) {
    return { ok: false, config: null, errors, warnings };
  }

  const meta = isObj(input.meta)
    ? {
        name: typeof input.meta.name === 'string' ? input.meta.name : undefined,
        createdAt: typeof input.meta.createdAt === 'string' ? input.meta.createdAt : undefined,
        note: typeof input.meta.note === 'string' ? input.meta.note : undefined,
      }
    : undefined;

  return {
    ok: true,
    config: {
      schema: 'nbody-studio/v2',
      version: 2,
      meta,
      dimensions,
      physics,
      init,
      view,
      run,
      stellar,
      ...(bodies ? { bodies } : {}),
    },
    errors,
    warnings,
  };
}


/** 校验单个天体配置（供流式解析器复用）。 */
export function parseBodyConfig(
  raw: unknown,
  path: string,
): { body: BodyConfig | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { body: null, errors: [`${path} 必须是对象`] };

  const required = (key: string): number => {
    const val = raw[key];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      errors.push(`${path}.${key} 必须是有限数字`);
      return 0;
    }
    return val;
  };

  const body: BodyConfig = {
    x: required('x'),
    y: required('y'),
    z: raw.z === undefined ? 0 : num(raw, 'z', 0, errors, path),
    vx: required('vx'),
    vy: required('vy'),
    vz: raw.vz === undefined ? 0 : num(raw, 'vz', 0, errors, path),
    mass: num(raw, 'mass', 1, errors, path, { minExclusive: true }),
  };
  if (raw.grav !== undefined) body.grav = num(raw, 'grav', body.mass, errors, path);
  if (raw.radius !== undefined) body.radius = num(raw, 'radius', 0, errors, path, { min: 0 });
  if (raw.id !== undefined) body.id = num(raw, 'id', 0, errors, path, { integer: true });
  if (raw.star !== undefined) {
    if (!isObj(raw.star)) {
      errors.push(`${path}.star 必须是对象`);
    } else {
      const star: NonNullable<BodyConfig['star']> = {};
      if (raw.star.type !== undefined) {
        if (typeof raw.star.type !== 'string' || !STAR_TYPES.includes(raw.star.type as StarType)) {
          errors.push(`${path}.star.type 必须是合法光谱型或遗骸类型`);
        } else {
          star.type = raw.star.type as StarType;
        }
      }
      if (raw.star.age !== undefined) star.age = num(raw.star, 'age', 0, errors, `${path}.star`, { min: 0 });
      body.star = star;
    }
  }

  return errors.length ? { body: null, errors } : { body, errors: [] };
}
