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

/** S1：算术平均；空数组返回 NaN。 */
export function mean(values: readonly number[]): number {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** S2：总体方差（除以 n）。 */
export function variance(values: readonly number[]): number {
  if (!values.length) return NaN;
  const m = mean(values);
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
}

/** S3：标准差 = √方差。 */
export function stdDev(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

/** S4：中位数（排序副本，不改原数组）。 */
export function median(values: readonly number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** S5：分位数（线性插值，q∈[0,1]）。 */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = clamp(q, 0, 1) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(s.length - 1, lo + 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** S6：求和。 */
export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** S7：返回 [min, max]，空数组返回 [NaN, NaN]。 */
export function minMax(values: readonly number[]): [number, number] {
  if (!values.length) return [NaN, NaN];
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

/** S8：滑动平均，窗口长度 ≤0 返回原数组副本。 */
export function movingAverage(values: readonly number[], window: number): number[] {
  const w = Math.max(1, Math.floor(window));
  if (w <= 1) return [...values];
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= w) acc -= values[i - w];
    out.push(acc / Math.min(i + 1, w));
  }
  return out;
}

/** S9：归一化到 [0,1]；全相等时返回全 0。 */
export function normalize(values: readonly number[]): number[] {
  const [lo, hi] = minMax(values);
  if (!Number.isFinite(lo) || hi === lo) return values.map(() => 0);
  return values.map((v) => (v - lo) / (hi - lo));
}

/** S10：直方图计数，bin = floor((v-lo)/(hi-lo)*bins)，边界值归入最后一 bin。 */
export function histogram(values: readonly number[], bins: number): number[] {
  const n = Math.max(1, Math.floor(bins));
  const out = new Array<number>(n).fill(0);
  if (!values.length) return out;
  const [lo, hi] = minMax(values);
  if (hi === lo) { out[0] = values.length; return out; }
  for (const v of values) {
    const b = Math.min(n - 1, Math.floor(((v - lo) / (hi - lo)) * n));
    out[b]++;
  }
  return out;
}

/** T1：极差 max-min，空数组 NaN。 */
export function range(values: readonly number[]): number {
  const [lo, hi] = minMax(values);
  return Number.isFinite(lo) ? hi - lo : NaN;
}

/** T2：均方根 √(Σv²/n)。 */
export function rms(values: readonly number[]): number {
  if (!values.length) return NaN;
  return Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
}

/** T3：连乘，空数组返回 1。 */
export function product(values: readonly number[]): number {
  return values.reduce((a, b) => a * b, 1);
}

/** T4：条件计数。 */
export function countBy(values: readonly number[], pred: (v: number) => boolean): number {
  let c = 0;
  for (const v of values) if (pred(v)) c++;
  return c;
}

/** T5：去重保序。 */
export function unique(values: readonly number[]): number[] {
  return [...new Set(values)];
}

/** T6：分块，size≤0 返回单块副本。 */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const s = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += s) out.push(values.slice(i, i + s));
  return out;
}

/** T7：配对，长度取较短者。 */
export function zip<A, B>(a: readonly A[], b: readonly B[]): Array<[A, B]> {
  const n = Math.min(a.length, b.length);
  const out: Array<[A, B]> = [];
  for (let i = 0; i < n; i++) out.push([a[i], b[i]]);
  return out;
}

/** T8：比率格式化，b=0 返回 '—'。 */
export function formatRatio(a: number, b: number): string {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return '—';
  const r = a / b;
  return Math.abs(r) >= 100 || (Math.abs(r) < 0.01 && r !== 0) ? r.toExponential(2) : r.toFixed(3);
}

/** T9：快捷钳制到 [0,1]。 */
export function clamp01(v: number): number { return clamp(v, 0, 1); }

/** T10：反插值 v 在 [a,b] 的位置，a=b 返回 0。 */
export function inverseLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp01((v - a) / (b - a));
}

/** U1：省略号截断（按字符数）。 */
export function truncate(str: string, max: number): string {
  if (max <= 0) return '';
  return str.length <= max ? str : `${str.slice(0, Math.max(0, max - 1))}…`;
}

/** U2：前导零。 */
export function padZero(n: number, width: number): string {
  return Math.abs(Math.trunc(n)).toString().padStart(Math.max(1, width), '0');
}

/** U3：SI 前缀格式化（n/k/M/G）。 */
export function formatSI(v: number, unit = ''): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const units: Array<[number, string]> = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
  for (const [scale, prefix] of units) {
    if (a >= scale) return `${(v / scale).toFixed(a >= scale * 10 ? 0 : 2)}${prefix}${unit}`;
  }
  return `${v.toFixed(a < 10 && a !== 0 ? 2 : 0)}${unit}`;
}

/** U4：带符号格式化。 */
export function formatSigned(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/** U5：mm:ss 计时。 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds);
  return `${padZero(Math.floor(s / 60), 2)}:${padZero(s % 60, 2)}`;
}

/** U6：中文折行（按字符宽度，ASCII 算半宽）。 */
export function splitLines(text: string, maxLen: number): string[] {
  const width = (ch: string) => (/[\x00-\xff]/.test(ch) ? 0.5 : 1);
  const out: string[] = [];
  let line = '', w = 0;
  for (const ch of text) {
    const cw = width(ch);
    if (w + cw > maxLen && line) { out.push(line); line = ''; w = 0; }
    line += ch; w += cw;
  }
  if (line) out.push(line);
  return out;
}

/** U7/U8：HTML 转义与反转义。 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function unescapeHtml(s: string): string {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** U9：驼峰转空格标签。 */
export function camelToLabel(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** U10：中间省略。 */
export function truncateMiddle(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** V11：首个满足条件的元素，找不到返回 undefined。 */
export function first<T>(values: readonly T[], pred: (v: T) => boolean): T | undefined {
  for (const v of values) if (pred(v)) return v;
  return undefined;
}

/** V12：末元素，空数组 undefined。 */
export function last<T>(values: readonly T[]): T | undefined {
  return values.length ? values[values.length - 1] : undefined;
}

/** V13：取前 n / 跳前 n。 */
export function take<T>(values: readonly T[], n: number): T[] { return values.slice(0, Math.max(0, n)); }
export function drop<T>(values: readonly T[], n: number): T[] { return values.slice(Math.max(0, n)); }

/** V14：展平一层。 */
export function flatten<T>(arrays: readonly (readonly T[])[]): T[] {
  const out: T[] = [];
  for (const arr of arrays) out.push(...arr);
  return out;
}

/** V15：按键字符串分组。 */
export function groupBy<T>(values: readonly T[], keyFn: (v: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const v of values) {
    const k = keyFn(v);
    (out[k] ??= []).push(v);
  }
  return out;
}

/** V16：按条件分成 [满足, 不满足]。 */
export function partition<T>(values: readonly T[], pred: (v: T) => boolean): [T[], T[]] {
  const yes: T[] = [], no: T[] = [];
  for (const v of values) (pred(v) ? yes : no).push(v);
  return [yes, no];
}

/** V17：固定种子洗牌（Fisher-Yates，不改原数组）。 */
export function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** V18：固定种子抽样（不改原数组）。 */
export function sample<T>(values: readonly T[], n: number, rng: () => number): T[] {
  return shuffle(values, rng).slice(0, Math.max(0, Math.min(n, values.length)));
}

/** V19：循环移位，k 可负。 */
export function rotateArray<T>(values: readonly T[], k: number): T[] {
  if (!values.length) return [];
  const s = mod(k, values.length);
  return [...values.slice(s), ...values.slice(0, s)];
}

/** V20：频次映射。 */
export function counts(values: readonly string[] | readonly number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = String(v);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
