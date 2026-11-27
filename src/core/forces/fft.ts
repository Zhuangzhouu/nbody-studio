/**
 * 立方网格上的三维 FFT（就地、radix-2），供粒子网格求解器使用。
 * 必须是 2 的幂。对质量场做泊松求解时，一维网格 FFT 会遗漏 y/z 方向的模，
 * 极大，会得到量级错误的力场。三维网格 + 三维 FFT 才是 PM 方法的标准做法。
 *
 * 性能：预计算位反转置换对（π(i)>i 的 i 列表），避免每条 line 重复 O(N) 全扫描。
 */

export class Fft3D {
  readonly size: number;
  private readonly cells: number;
  private readonly rev: Int32Array;
  /** 需要交换的索引 i（j=rev[i]>i），避免每步全扫描 n 次。 */
  private readonly swapI: Int32Array;
  private readonly swapJ: Int32Array;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;

  constructor(size: number) {
    if (size < 4 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT 尺寸必须是 ≥4 的 2 的幂，收到 ${size}`);
    }
    this.size = size;
    this.cells = size * size * size;
    const bits = Math.log2(size) | 0;
    this.rev = new Int32Array(size);
    const si: number[] = [];
    const sj: number[] = [];
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
      if (r > i) { si.push(i); sj.push(r); }
    }
    this.swapI = Int32Array.from(si);
    this.swapJ = Int32Array.from(sj);
    const half = size >> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      const a = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(a);
      this.sinTable[i] = Math.sin(a);
    }
  }

  private line(
    re: Float64Array,
    im: Float64Array,
    offset: number,
    stride: number,
    inverse: boolean,
  ): void {
    const n = this.size;
    const si = this.swapI;
    const sj = this.swapJ;
    for (let k = 0; k < si.length; k++) {
      const a = offset + si[k] * stride;
      const b = offset + sj[k] * stride;
      const tr = re[a]; re[a] = re[b]; re[b] = tr;
      const ti = im[a]; im[a] = im[b]; im[b] = ti;
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const tw = k * step;
          const wr = this.cosTable[tw];
          const wi = inverse ? -this.sinTable[tw] : this.sinTable[tw];
          const a = offset + (i + k) * stride;
          const b = offset + (i + k + half) * stride;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  /** 三维变换：沿 x / y / z 三个方向依次做一维 FFT。 */
  transform(re: Float64Array, im: Float64Array, inverse: boolean): void {
    const n = this.size;
    const n2 = n * n;
    for (let z = 0; z < n; z++) {
      const base = z * n2;
      for (let y = 0; y < n; y++) this.line(re, im, base + y * n, 1, inverse);
    }
    for (let z = 0; z < n; z++) {
      const base = z * n2;
      for (let x = 0; x < n; x++) this.line(re, im, base + x, n, inverse);
    }
    for (let y = 0; y < n; y++) {
      const base = y * n;
      for (let x = 0; x < n; x++) this.line(re, im, base + x, n2, inverse);
    }
    if (inverse) {
      const scale = 1 / this.cells;
      for (let i = 0; i < re.length; i++) { re[i] *= scale; im[i] *= scale; }
    }
  }
}
