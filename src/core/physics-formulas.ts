/**
 * 常用天体物理闭式公式（纯函数，无量纲；G/mu 由调用方传入）。
 * R11–R20 自主提示词批次实现。
 */

/** R11 开普勒第三定律：T = 2π√(a³/(G·M))。 */
export function orbitalPeriod(a: number, M: number, G = 1): number {
  if (!(a > 0) || !(M > 0) || !(G > 0)) return NaN;
  return 2 * Math.PI * Math.sqrt(a ** 3 / (G * M));
}

/** R12 逃逸速度 v = √(2GM/r)。 */
export function escapeVelocity(r: number, M: number, G = 1): number {
  if (!(r > 0) || !(M > 0) || !(G > 0)) return NaN;
  return Math.sqrt((2 * G * M) / r);
}

/** R13 史瓦西半径 rs = 2GM/c²。 */
export function schwarzschildRadius(M: number, G = 1, c = 1): number {
  if (!(M > 0) || !(G > 0) || !(c > 0)) return NaN;
  return (2 * G * M) / (c * c);
}

/** R14 维里比率 2KE/|PE|；束缚系统应 ≈1。 */
export function virialRatio(ke: number, pe: number): number {
  if (!Number.isFinite(ke) || !Number.isFinite(pe) || pe === 0) return NaN;
  return (2 * ke) / Math.abs(pe);
}

/** R15 比轨道能 ε = v²/2 - μ/r。 */
export function specificOrbitalEnergy(r: number, v: number, mu: number): number {
  if (!(r > 0) || !Number.isFinite(v) || !Number.isFinite(mu)) return NaN;
  return (v * v) / 2 - mu / r;
}

/** R16 偏心率标量 e = |v×h|/μ - 1（平面圆/椭圆）。h = r×v 标量。 */
export function eccentricity(rx: number, ry: number, vx: number, vy: number, mu: number): number {
  if (!(mu > 0)) return NaN;
  const r = Math.hypot(rx, ry);
  if (!(r > 0)) return NaN;
  const h = rx * vy - ry * vx;
  const v2 = vx * vx + vy * vy;
  const ex = (vy * h) / mu - rx / r;
  const ey = (-vx * h) / mu - ry / r;
  return Math.hypot(ex, ey);
}

/** R17 半长轴 a = -μ/(2ε)（椭圆）；双曲返回负 a。 */
export function semiMajorAxis(r: number, v: number, mu: number): number {
  const eps = specificOrbitalEnergy(r, v, mu);
  if (!Number.isFinite(eps) || eps === 0) return Infinity;
  return -mu / (2 * eps);
}

/** R18 希尔半径 r_H = a·(m/(3M))^(1/3)。 */
export function hillRadius(a: number, m: number, M: number): number {
  if (!(a > 0) || !(m > 0) || !(M > 0)) return NaN;
  return a * Math.cbrt(m / (3 * M));
}

/** R19 洛希极限（流体近似）d ≈ 2.44·R·(ρ_M/ρ_m)^(1/3)。 */
export function rocheLimit(R: number, rhoPrimary: number, rhoSatellite: number): number {
  if (!(R > 0) || !(rhoPrimary > 0) || !(rhoSatellite > 0)) return NaN;
  return 2.44 * R * Math.cbrt(rhoPrimary / rhoSatellite);
}

/** R20 动力学时间 t_dyn ≈ √(R³/(G·M))。 */
export function dynamicalTime(R: number, M: number, G = 1): number {
  if (!(R > 0) || !(M > 0) || !(G > 0)) return NaN;
  return Math.sqrt(R ** 3 / (G * M));
}
