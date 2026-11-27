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

/** R1：毫秒时长格式化（<1s 显示毫秒，<60s 显示秒，否则分秒）。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${((ms % 60_000) / 1000).toFixed(1)} s`;
}

/** R2：角度归一到 [-π, π]。 */
export function wrapAngle(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  const twoPi = Math.PI * 2;
  let a = ((rad + Math.PI) % twoPi + twoPi) % twoPi;
  a -= Math.PI;
  return a;
}

/** R3：三次平滑 3t²-2t³，输入钳制到 [0,1]。 */
export function smoothStep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** R4：近似相等（绝对+相对误差）。 */
export function nearlyEqual(a: number, b: number, eps = 1e-9): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** R5：#rrggbb → [r,g,b] 0–1。 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** R6：[r,g,b] 0–1 → #rrggbb（与 R5 往返）。 */
export function rgbToHex(r: number, g: number, b: number): string {
  const q = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

/** R7：统一科学计数（保留有效位）。 */
export function formatScientific(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  return v.toExponential(Math.max(0, digits - 1));
}

/** R8：有效位截断（非格式化字符串，返回数值）。 */
export function significantDigits(v: number, n = 3): number {
  if (!Number.isFinite(v) || v === 0 || n < 1) return v;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const f = 10 ** (n - 1 - mag);
  return Math.round(v * f) / f;
}

/** R9：正模（负数也返回非负）。 */
export function mod(a: number, n: number): number {
  if (!(n > 0)) return NaN;
  return ((a % n) + n) % n;
}

/** R10：角度插值走最短弧。 */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + wrapAngle(b - a) * clamp(t, 0, 1));
}
