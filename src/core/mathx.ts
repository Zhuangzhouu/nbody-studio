/** 通用数值小工具（避免散落的魔法写法）。 */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 有限数校验：NaN/Infinity 一律替换为回退值。 */
export const finiteOr = (v: number, fallback: number): number =>
  Number.isFinite(v) ? v : fallback;

/** 数值格式化：大数用紧凑单位，小数保留有效位。 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} 万亿`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 2)} 万`;
  return Math.round(n).toLocaleString('en-US');
}

/** 精确整数千分位格式化。 */
export function formatInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 科学计数/定点自适应。 */
export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(Math.max(1, digits - 1));
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

/** 人类可读字节。 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 相对误差（分母保护）。 */
export function relativeError(actual: number, expected: number): number {
  const scale = Math.max(Math.abs(expected), 1e-12);
  return Math.abs(actual - expected) / scale;
}
