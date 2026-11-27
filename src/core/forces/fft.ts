/**
 * 立方网格上的三维 FFT（就地、radix-2），供粒子网格求解器使用。
 *
 * 为什么不用二维网格？因为我们要的是三维引力（1/r²），而 1/r² 的二维采样混叠误差
 * 极大，会得到量级错误的力场。三维网格 + 三维 FFT 才是 PM 方法的标准做法。
 */

export class Fft3D {
  readonly size: number;
  readonly cells: number;
  private readonly rev: Int32Array;
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
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
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
    const rev = this.rev;

    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const a = offset + i * stride;
        const b = offset + j * stride;
        const tr = re[a];
        re[a] = re[b];
        re[b] = tr;
        const ti = im[a];
        im[a] = im[b];
        im[b] = ti;
      }
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
      for (let y = 0; y < n; y++) {
        this.line(re, im, z * n2 + y * n, 1, inverse);
      }
    }
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        this.line(re, im, z * n2 + x, n, inverse);
      }
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        this.line(re, im, y * n + x, n2, inverse);
      }
    }

    if (inverse) {
      const scale = 1 / (n * n * n);
      for (let i = 0; i < re.length; i++) {
        re[i] *= scale;
        im[i] *= scale;
      }
    }
  }
}
