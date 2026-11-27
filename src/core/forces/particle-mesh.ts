/**
 * 粒子网格求解器（PM）：完整三维网格，天体可位于任意 z。
 *
 * 沉积(CIC) → 三维 FFT → φ̂ = -4πGρ̂/k² → ĝ = -i·k·φ̂ → 逆变换 → 三线性插值。
 * gx/gy 打包成一个复谱做一次逆变换，gz 单独一次（共两次逆变换 + 一次正变换）。
 *
 * 复杂度 O(N + M log M)，M = grid³。远场准确，近场分辨率受网格限制。
 */

import type { BodySet } from '../bodies';
import type { PhysicsParams } from '../types';
import { PM_GRID } from '../constants';
import { Fft3D } from './fft';
import type { ForceSolver } from './solver';

export class ParticleMeshSolver implements ForceSolver {
  readonly kind = 'particle-mesh' as const;
  readonly grid: number;

  private readonly fft: Fft3D;
  private readonly rho: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly xyRe: Float64Array;
  private readonly xyIm: Float64Array;
  private readonly zRe: Float64Array;
  private readonly zIm: Float64Array;
  private readonly km: Float64Array;

  private x0 = 0;
  private y0 = 0;
  private z0 = 0;
  private dx = 1;
  private invDx = 1;
  private domainReady = false;
  private escapedCount = 0;

  constructor(grid: number = PM_GRID) {
    const cells = grid * grid * grid;
    this.grid = grid;
    this.fft = new Fft3D(grid);
    const mk = () => new Float64Array(cells);
    this.rho = mk();
    this.re = mk();
    this.im = mk();
    this.xyRe = mk();
    this.xyIm = mk();
    this.zRe = mk();
    this.zIm = mk();
    this.km = new Float64Array(grid);
  }

  compute(b: BodySet, p: PhysicsParams): void {
    if (!this.domainReady) this.initDomain(b);
    this.escapedCount = 0;
    this.deposit(b);
    this.solve(p.G);
    this.gather(b);
  }

  /** F4：返回指定 z 层的密度切片（降采样到 64×64），用于势场热力图。 */
  densitySlice(layer = -1): { data: Float32Array; size: number } {
    const size = this.grid;
    const outN = 64;
    const data = new Float32Array(outN * outN);
    const n2 = size * size;
    let iz = layer >= 0 ? Math.min(size - 1, layer) : Math.floor(size / 2);
    if (layer < 0) {
      // 自动选 ρ 最大的层
      let best = -Infinity;
      for (let z = 0; z < size; z++) {
        let sum = 0;
        const base = z * n2;
        for (let i = 0; i < n2; i += 7) sum += Math.abs(this.rho[base + i]);
        if (sum > best) { best = sum; iz = z; }
      }
    }
    let max = 1e-12;
    const base = iz * n2;
    for (let i = 0; i < n2; i++) max = Math.max(max, this.rho[base + i]);
    for (let oy = 0; oy < outN; oy++) {
      const sy = Math.min(size - 1, Math.floor((oy / outN) * size));
      for (let ox = 0; ox < outN; ox++) {
        const sx = Math.min(size - 1, Math.floor((ox / outN) * size));
        data[oy * outN + ox] = Math.abs(this.rho[base + sy * size + sx] / max);
      }
    }
    return { data, size: outN };
  }

  report(): { escaped: number; note: string | null } {
    return {
      escaped: this.escapedCount,
      note:
        this.escapedCount > 0
          ? `${this.escapedCount} 个天体越出网格，已在边界截断（近场力失真）`
          : null,
    };
  }

  private initDomain(b: BodySet): void {
    const bb = b.bounds();
    const extent = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, bb.maxZ - bb.minZ, 1e-3);
    // 留出 45% 余量压制周期镜像的影响
    const L = extent * 1.45;
    this.dx = L / this.grid;
    this.invDx = this.grid / L;
    this.x0 = (bb.minX + bb.maxX) * 0.5 - L * 0.5;
    this.y0 = (bb.minY + bb.maxY) * 0.5 - L * 0.5;
    this.z0 = (bb.minZ + bb.maxZ) * 0.5 - L * 0.5;
    this.domainReady = true;
  }

  private deposit(b: BodySet): void {
    const { x, y, z } = b;
    const size = this.grid;
    const n2 = size * size;
    const rho = this.rho;
    rho.fill(0);

    const invDx = this.invDx;
    // 离散 IFFT 相当于 dx³/(2π)³∫d³k，质量先除以 dx³ 变成体密度
    const toDensity = invDx * invDx * invDx;
    const maxIdx = size - 1;
    let escaped = 0;

    for (let i = 0; i < b.n; i++) {
      const m = b.gravMass(i) * toDensity;
      if (m <= 0) continue;

      const fx = (x[i] - this.x0) * invDx;
      const fy = (y[i] - this.y0) * invDx;
      const fz = (b.dimensions === 3 ? z[i] : (this.z0 + this.dx * (size / 2))) * invDx - this.z0 * invDx;
      if (fx < 0 || fy < 0 || fz < 0 || fx >= maxIdx || fy >= maxIdx || fz >= maxIdx) escaped++;

      const ix0 = clampCell(fx, maxIdx);
      const iy0 = clampCell(fy, maxIdx);
      const iz0 = clampCell(fz, maxIdx);
      const tx = cellFrac(fx, ix0, maxIdx);
      const ty = cellFrac(fy, iy0, maxIdx);
      const tz = cellFrac(fz, iz0, maxIdx);
      const ix1 = ix0 < maxIdx ? ix0 + 1 : maxIdx;
      const iy1 = iy0 < maxIdx ? iy0 + 1 : maxIdx;
      const iz1 = iz0 < maxIdx ? iz0 + 1 : maxIdx;

      const wx0 = 1 - tx;
      const wy0 = 1 - ty;
      const wz0 = 1 - tz;

      rho[iz0 * n2 + iy0 * size + ix0] += m * wx0 * wy0 * wz0;
      rho[iz0 * n2 + iy0 * size + ix1] += m * tx * wy0 * wz0;
      rho[iz0 * n2 + iy1 * size + ix0] += m * wx0 * ty * wz0;
      rho[iz0 * n2 + iy1 * size + ix1] += m * tx * ty * wz0;
      rho[iz1 * n2 + iy0 * size + ix0] += m * wx0 * wy0 * tz;
      rho[iz1 * n2 + iy0 * size + ix1] += m * tx * wy0 * tz;
      rho[iz1 * n2 + iy1 * size + ix0] += m * wx0 * ty * tz;
      rho[iz1 * n2 + iy1 * size + ix1] += m * tx * ty * tz;
    }

    this.escapedCount = escaped;
  }

  private solve(G: number): void {
    const size = this.grid;
    const n2 = size * size;
    const re = this.re;
    const im = this.im;
    re.set(this.rho);
    im.fill(0);
    this.fft.transform(re, im, false);

    const km = this.km;
    const base = (2 * Math.PI) / (size * this.dx);
    for (let i = 0; i < size; i++) {
      km[i] = base * (i <= size / 2 ? i : i - size);
    }

    const xyR = this.xyRe;
    const xyI = this.xyIm;
    const zR = this.zRe;
    const zI = this.zIm;
    // 格林函数 φ̂ = -4πGρ̂/k²，g = -∇φ；被积谱符号取负号后与离散傅里叶约定一致
    const fourPiG = 4 * Math.PI * G;

    for (let iz = 0; iz < size; iz++) {
      const kz = km[iz];
      for (let iy = 0; iy < size; iy++) {
        const ky = km[iy];
        const row = iz * n2 + iy * size;
        const ky2kz2 = ky * ky + kz * kz;
        for (let ix = 0; ix < size; ix++) {
          const idx = row + ix;
          const kx = km[ix];
          const k2 = ky2kz2 + kx * kx;
          if (k2 === 0) {
            xyR[idx] = 0;
            xyI[idx] = 0;
            zR[idx] = 0;
            zI[idx] = 0;
            continue;
          }
          const coef = fourPiG / k2;
          const rr = re[idx];
          const ii = im[idx];
          // ĝ = i·k·coef·(rr + i·ii) = (-k·ii) + i·(k·rr)
          const gxr = -coef * kx * ii;
          const gxi = coef * kx * rr;
          const gyr = -coef * ky * ii;
          const gyi = coef * ky * rr;
          const gzr = -coef * kz * ii;
          const gzi = coef * kz * rr;
          // W = ĝx + i·ĝy
          xyR[idx] = gxr - gyi;
          xyI[idx] = gxi + gyr;
          // 第二个复谱只需 gz
          zR[idx] = gzr;
          zI[idx] = gzi;
        }
      }
    }

    this.fft.transform(xyR, xyI, true);
    this.fft.transform(zR, zI, true);
  }

  private gather(b: BodySet): void {
    const size = this.grid;
    const maxIdx = size - 1;
    const invDx = this.invDx;
    const gx = this.xyRe;
    const gy = this.xyIm;
    const gz = this.zRe;

    for (let i = 0; i < b.n; i++) {
      if (b.mass[i] <= 0) {
        b.ax[i] = 0;
        b.ay[i] = 0;
        b.az[i] = 0;
        continue;
      }
      const fx = (b.x[i] - this.x0) * invDx;
      const fy = (b.y[i] - this.y0) * invDx;
      const fz = (b.dimensions === 3 ? b.z[i] : (this.z0 + this.dx * (size / 2))) * invDx - this.z0 * invDx;

      const ix0 = clampCell(fx, maxIdx);
      const iy0 = clampCell(fy, maxIdx);
      const iz0 = clampCell(fz, maxIdx);
      const tx = cellFrac(fx, ix0, maxIdx);
      const ty = cellFrac(fy, iy0, maxIdx);
      const tz = cellFrac(fz, iz0, maxIdx);
      const ix1 = ix0 < maxIdx ? ix0 + 1 : maxIdx;
      const iy1 = iy0 < maxIdx ? iy0 + 1 : maxIdx;
      const iz1 = iz0 < maxIdx ? iz0 + 1 : maxIdx;
      const n2 = size * size;

      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let dz = 0; dz <= 1; dz++) {
        const iz = dz ? iz1 : iz0;
        const wz = dz ? tz : 1 - tz;
        for (let dy = 0; dy <= 1; dy++) {
          const iy = dy ? iy1 : iy0;
          const wy = dy ? ty : 1 - ty;
          for (let dx = 0; dx <= 1; dx++) {
            const ix = dx ? ix1 : ix0;
            const wx = dx ? tx : 1 - tx;
            const weight = wx * wy * wz;
            const idx = iz * n2 + iy * size + ix;
            ax += gx[idx] * weight;
            ay += gy[idx] * weight;
            az += gz[idx] * weight;
          }
        }
      }
      b.ax[i] = ax;
      b.ay[i] = ay;
      b.az[i] = az;
    }
  }
}

function clampCell(f: number, maxIdx: number): number {
  if (!Number.isFinite(f)) return 0;
  return Math.min(maxIdx, Math.max(0, Math.floor(f)));
}

function cellFrac(f: number, cell: number, maxIdx: number): number {
  if (!Number.isFinite(f) || f < 0) return 0;
  if (f >= maxIdx) return 0;
  return Math.max(0, Math.min(1, f - cell));
}
