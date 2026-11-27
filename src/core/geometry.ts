/**
 * 向量几何纯函数（S11–S20）。
 * 2D 函数为 3D 的 z=0 特例，但单独实现以避免数组分配。
 */

/** S11 二维距离。 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** S12 三维距离。 */
export function dist3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

/** S13 点积。 */
export function dot2(ax: number, ay: number, bx: number, by: number): number { return ax * bx + ay * by; }
export function dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

/** S14 二维叉积（标量 z 分量）。 */
export function cross2(ax: number, ay: number, bx: number, by: number): number { return ax * by - ay * bx; }

/** S15 三维叉积，返回 [x,y,z]。 */
export function cross3(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** S16 模长。 */
export function norm2(x: number, y: number): number { return Math.hypot(x, y); }
export function norm3(x: number, y: number, z: number): number { return Math.hypot(x, y, z); }

/** S17 单位化，零向量返回 [0,0(,0)]。 */
export function normalize2(x: number, y: number): [number, number] {
  const n = norm2(x, y);
  return n > 0 ? [x / n, y / n] : [0, 0];
}
export function normalize3(x: number, y: number, z: number): [number, number, number] {
  const n = norm3(x, y, z);
  return n > 0 ? [x / n, y / n, z / n] : [0, 0, 0];
}

/** S18 二维夹角（弧度，0–π）。 */
export function angleBetween2(ax: number, ay: number, bx: number, by: number): number {
  const na = norm2(ax, ay), nb = norm2(bx, by);
  if (na === 0 || nb === 0) return NaN;
  const c = dot2(ax, ay, bx, by) / (na * nb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** S19 二维旋转。 */
export function rotate2(x: number, y: number, rad: number): [number, number] {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

/** S20 线性插值。 */
export function lerp2(ax: number, ay: number, bx: number, by: number, t: number): [number, number] {
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}
export function lerp3(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number,
): [number, number, number] {
  return [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t];
}
