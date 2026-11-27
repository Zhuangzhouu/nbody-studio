/**
 * 轨道助手：圆轨道初速与二体轨道要素。
 *
 * 口径：μ = G · (gravMass_1 + gravMass_2)，gravMass = grav × weight；
 * 与 forces/direct.ts 和 energy.ts 完全一致（用引力质量，不用惯性质量）。
 */

export type OrbitPlane = 'xy' | 'xz' | 'yz';

export interface OrbitState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface CircularResult extends OrbitState {
  /** 相对中心的速度大小。 */
  speed: number;
  /** 使用的 μ = G·(m1+m2)。 */
  mu: number;
}

/**
 * 以 center 为中心、半径 r 的圆轨道状态（相对坐标 + 相对速度）。
 * plane 指定轨道平面，方向按该平面的右手系定向。
 */
export function circularOrbit(
  radius: number,
  plane: OrbitPlane,
  mu: number,
  phase = 0,
): CircularResult {
  const r = Math.max(1e-9, radius);
  const speed = Math.sqrt(Math.max(1e-12, mu) / r);
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  let x = 0;
  let y = 0;
  let z = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  if (plane === 'xy') {
    x = r * c;
    y = r * s;
    vx = -speed * s;
    vy = speed * c;
  } else if (plane === 'xz') {
    x = r * c;
    z = r * s;
    vx = -speed * s;
    vz = speed * c;
  } else {
    y = r * c;
    z = r * s;
    vy = -speed * s;
    vz = speed * c;
  }
  return { x, y, z, vx, vy, vz, speed, mu };
}

/** 把相对圆轨道叠加到中心体当前状态，得到惯性系初值。 */
export function orbitAround(
  center: OrbitState,
  radius: number,
  plane: OrbitPlane,
  mu: number,
  phase = 0,
  useZ = true,
): OrbitState {
  const o = circularOrbit(radius, plane, mu, phase);
  return {
    x: center.x + o.x,
    y: center.y + o.y,
    z: useZ ? center.z + o.z : 0,
    vx: center.vx + o.vx,
    vy: center.vy + o.vy,
    vz: useZ ? center.vz + o.vz : 0,
  };
}

export interface OrbitalElements {
  /** 半长轴（椭圆/圆）。 */
  a: number;
  /** 偏心率。 */
  e: number;
  /** 周期（e < 1）。 */
  period: number | null;
  /** 逃逸轨道。 */
  escape: boolean;
  /** 比能量。 */
  epsilon: number;
  /** 角动量模长。 */
  h: number;
}

/** 二体相对轨道要素。输入为两体的位置/速度；返回 null 表示退化（重合或 μ≤0）。 */
export function orbitalElements(
  a: OrbitState,
  b: OrbitState,
  mu: number,
  useZ = true,
): OrbitalElements | null {
  if (!(mu > 0)) return null;
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const rz = useZ ? b.z - a.z : 0;
  const vx = b.vx - a.vx;
  const vy = b.vy - a.vy;
  const vz = useZ ? b.vz - a.vz : 0;
  const r = Math.hypot(rx, ry, rz);
  if (r < 1e-12) return null;

  const v2 = vx * vx + vy * vy + vz * vz;
  const epsilon = v2 / 2 - mu / r;

  // h = r × v
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = useZ ? rx * vy - ry * vx : rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);

  // e 向量 = (v × h)/μ - r̂
  const evx = (vy * hz - vz * hy) / mu - rx / r;
  const evy = (vz * hx - vx * hz) / mu - ry / r;
  const evz = (vx * hy - vy * hx) / mu - rz / r;
  const e = Math.hypot(evx, evy, evz);

  if (e >= 1 || epsilon >= 0) {
    return { a: epsilon < 0 ? -mu / (2 * epsilon) : Infinity, e, period: null, escape: true, epsilon, h };
  }
  const semiMajor = -mu / (2 * epsilon);
  const period = 2 * Math.PI * Math.sqrt((semiMajor * semiMajor * semiMajor) / mu);
  return { a: semiMajor, e, period, escape: false, epsilon, h };
}

/** 相对速度 → 形成圆轨道所需的速度大小。 */
export function circularSpeed(mu: number, radius: number): number {
  return Math.sqrt(Math.max(1e-12, mu) / Math.max(1e-9, radius));
}
