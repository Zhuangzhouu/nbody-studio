/**
 * 自适应多极求解器（Barnes-Hut + 四极矩），O(N log N)，常数显著小于单极 BH。
 *
 * 为什么不用均匀网格（桶排）：网格间距固定，动态范围大时要么格数爆炸、
 * 要么近场分辨率不足。这里用自适应八叉树按密度细分，判据 s/d < θ 与尺度无关。
 *
 * 多极展开（以块质心 R 为中心，r = 场点 - R）：
 *   a = -G·M·r/r³ + G·[3(Q·r)/r⁵ + 1.5·tr(Q)·r/r⁵ - 7.5·(rᵀQr)·r/r⁷]
 *   Q = Σ m·δδᵀ（δ = 粒子相对质心位移），由平行轴定理增量维护。
 * 单极误差 O(s/d)，四极误差 O((s/d)³)，故同精度可用更大 θ。
 *
 * 与 ForceSolver 同步契约兼容；不修改既有 BarnesHutSolver，避免回归。
 */

import type { BodySet } from '../bodies';
import type { PhysicsParams } from '../types';
import type { ForceSolver } from './solver';

const BUCKET = 2;

export class MultipoleSolver implements ForceSolver {
  readonly kind = 'multipole' as const;

  private cap = 0;
  private k = 4;
  private nodeChild = new Int32Array(0);
  private nodeMass = new Float64Array(0);
  private nodeCx = new Float64Array(0);
  private nodeCy = new Float64Array(0);
  private nodeCz = new Float64Array(0);
  private nodeSX = new Float64Array(0);
  private nodeSY = new Float64Array(0);
  private nodeSZ = new Float64Array(0);
  private nodeHead = new Int32Array(0);
  private bodyNext = new Int32Array(0);
  private stack = new Int32Array(16384);

  /** 二阶矩张量（对称 6 分量，关于本节点质心）。 */
  private qxx = new Float64Array(0);
  private qyy = new Float64Array(0);
  private qzz = new Float64Array(0);
  private qxy = new Float64Array(0);
  private qxz = new Float64Array(0);
  private qyz = new Float64Array(0);

  private nodeCount = 0;
  private minSize = 1e-6;
  /** 每体最终所在叶节点索引（build 时记录，用于排除自作用祖先）。 */
  private bodyLeaf = new Int32Array(0);
  /** 父节点索引（build 期维护）。 */
  private nodeParent = new Int32Array(0);
  /** 当前目标体 i 的祖先标记：build 后按叶路径置 1，遍历时 O(1) 查询。 */
  private ancestorMark = new Uint8Array(0);
  private lastTheta = 0.6;

  compute(b: BodySet, p: PhysicsParams): void {
    let flat = b.dimensions === 2;
    if (!flat) {
      flat = true;
      for (let i = 0; i < b.n; i++) {
        if (b.mass[i] > 0 && b.z[i] !== 0) { flat = false; break; }
      }
    }
    this.k = flat ? 4 : 8;
    this.lastTheta = p.theta;
    this.ensureCapacity(Math.max(b.n, 1));
    if (this.bodyLeaf.length < b.n) {
      const cap = Math.ceil(b.n * 1.5) + 64;
      this.bodyLeaf = new Int32Array(cap);
      this.ancestorMark = new Uint8Array(cap);
    }
    this.build(b);
    this.traverse(b, p);
  }

  report(): { escaped: number; note: string | null } {
    return {
      escaped: 0,
      note: `四极多极展开，开角 θ=${this.lastTheta.toFixed(2)}；误差 O((s/d)³)`,
    };
  }

  private ensureCapacity(n: number): void {
    this.grow(Math.ceil(n * (this.k === 8 ? 2.5 : 1.6)) + 512);
  }

  private grow(need: number): void {
    if (need <= this.cap) return;
    const old = this.cap;
    this.cap = need;
    const f = (src: Float64Array) => { const d = new Float64Array(need); d.set(src.subarray(0, old)); return d; };
    const u = (src: Int32Array, fill = 0) => { const d = new Int32Array(need).fill(fill); if (old) d.set(src.subarray(0, old)); return d; };
    const child = new Int32Array(need * this.k);
    if (old) child.set(this.nodeChild.subarray(0, old * this.k));
    this.nodeChild = child;
    this.nodeMass = f(this.nodeMass);
    this.nodeCx = f(this.nodeCx); this.nodeCy = f(this.nodeCy); this.nodeCz = f(this.nodeCz);
    this.nodeSX = f(this.nodeSX); this.nodeSY = f(this.nodeSY); this.nodeSZ = f(this.nodeSZ);
    this.qxx = f(this.qxx); this.qyy = f(this.qyy); this.qzz = f(this.qzz);
    this.qxy = f(this.qxy); this.qxz = f(this.qxz); this.qyz = f(this.qyz);
    this.nodeHead = u(this.nodeHead, -1);
    this.bodyNext = u(this.bodyNext, -1);
    this.nodeParent = u(this.nodeParent, -1);
  }

  private createNode(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, parent = -1): number {
    if (this.nodeCount >= this.cap) this.grow(Math.ceil(this.cap * 1.6) + 256);
    const idx = this.nodeCount++;
    const base = idx * this.k;
    for (let q = 0; q < this.k; q++) this.nodeChild[base + q] = -1;
    this.nodeMass[idx] = 0;
    this.nodeCx[idx] = cx; this.nodeCy[idx] = cy; this.nodeCz[idx] = cz;
    this.nodeSX[idx] = sx; this.nodeSY[idx] = sy; this.nodeSZ[idx] = sz;
    this.nodeHead[idx] = -1;
    this.qxx[idx] = this.qyy[idx] = this.qzz[idx] = 0;
    this.qxy[idx] = this.qxz[idx] = this.qyz[idx] = 0;
    return idx;
  }

  /**
   * 把质量 m 在位置 (px,py,pz) 累加到节点：质心增量更新，
   * 二阶矩按平行轴定理 Q += M·m/(M+m)·d·dᵀ（d = 新粒子 - 旧质心）。
   */
  private accumulate(node: number, px: number, py: number, pz: number, m: number): void {
    const M = this.nodeMass[node];
    if (M <= 0) {
      this.nodeMass[node] = m;
      this.nodeCx[node] = px; this.nodeCy[node] = py; this.nodeCz[node] = pz;
      return;
    }
    const dx = px - this.nodeCx[node];
    const dy = py - this.nodeCy[node];
    const dz = pz - this.nodeCz[node];
    const total = M + m;
    const f = m / total;
    this.nodeCx[node] += dx * f;
    this.nodeCy[node] += dy * f;
    this.nodeCz[node] += dz * f;
    const w = (M * m) / total;
    this.qxx[node] += w * dx * dx;
    this.qyy[node] += w * dy * dy;
    this.qzz[node] += w * dz * dz;
    this.qxy[node] += w * dx * dy;
    this.qxz[node] += w * dx * dz;
    this.qyz[node] += w * dy * dz;
    this.nodeMass[node] = total;
  }

  private build(b: BodySet): void {
    const { x, y, z, mass } = b;
    const n = b.n;
    const useZ = b.dimensions === 3;
    this.nodeCount = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      if (mass[i] <= 0) continue;
      alive++;
      const pz = useZ ? z[i] : 0;
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    if (alive === 0) return;
    const ex = (maxX - minX) * 1.02 + 1e-6;
    const ey = (maxY - minY) * 1.02 + 1e-6;
    const ez = (useZ ? maxZ - minZ : 0) * 1.02 + 1e-6;
    this.createNode((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, ex, ey, ez);
    this.minSize = Math.max(ex, ey, ez) * 1e-8;
    for (let i = 0; i < n; i++) {
      if (mass[i] <= 0) continue;
      this.bodyNext[i] = -1;
      this.accumulate(0, x[i], y[i], useZ ? z[i] : 0, b.gravMass(i));
      this.place(0, i, b);
    }
  }

  private place(node: number, body: number, b: BodySet): void {
    const base = node * this.k;
    if (this.nodeChild[base] === -1) {
      const head = this.nodeHead[node];
      if (head !== -1 && this.listLength(head) >= BUCKET && this.maxSize(node) > this.minSize) {
        this.split(node);
        const bodies = this.detachList(node);
        for (let i = 0; i < bodies.length; i++) this.placeInChild(node, bodies[i], b);
        this.placeInChild(node, body, b);
        return;
      }
      this.bodyNext[body] = head;
      this.nodeHead[node] = body;
      this.bodyLeaf[body] = node;
      return;
    }
    this.placeInChild(node, body, b);
  }

  private placeInChild(node: number, body: number, b: BodySet): void {
    const useZ = b.dimensions === 3;
    const q = this.octant(node, b.x[body], b.y[body], useZ ? b.z[body] : 0) & (this.k - 1);
    let child = this.nodeChild[node * this.k + q];
    if (child === -1) {
      const qx = this.nodeSX[node] * 0.25, qy = this.nodeSY[node] * 0.25, qz = this.nodeSZ[node] * 0.25;
      child = this.createNode(
        this.nodeCx[node] + ((q & 1) ? qx : -qx),
        this.nodeCy[node] + ((q & 2) ? qy : -qy),
        this.nodeCz[node] + ((q & 4) ? qz : -qz),
        this.nodeSX[node] * 0.5, this.nodeSY[node] * 0.5, this.nodeSZ[node] * 0.5,
        node,
      );
      this.nodeChild[node * this.k + q] = child;
    }
    this.accumulate(child, b.x[body], b.y[body], useZ ? b.z[body] : 0, b.gravMass(body));
    this.place(child, body, b);
  }

  private maxSize(node: number): number {
    return Math.max(this.nodeSX[node], this.nodeSY[node], this.nodeSZ[node]);
  }

  private octant(node: number, px: number, py: number, pz: number): number {
    return (px >= this.nodeCx[node] ? 1 : 0) | (py >= this.nodeCy[node] ? 2 : 0) | (pz >= this.nodeCz[node] ? 4 : 0);
  }

  private listLength(head: number): number {
    let c = 0, k = head;
    while (k !== -1 && c <= BUCKET) { c++; k = this.bodyNext[k]; }
    return c;
  }

  private detachList(node: number): number[] {
    const out: number[] = [];
    let k = this.nodeHead[node];
    while (k !== -1) {
      const nxt = this.bodyNext[k];
      this.bodyNext[k] = -1;
      out.push(k);
      k = nxt;
    }
    this.nodeHead[node] = -1;
    return out;
  }

  private split(node: number): void {
    const qx = this.nodeSX[node] * 0.25, qy = this.nodeSY[node] * 0.25, qz = this.nodeSZ[node] * 0.25;
    const hsx = this.nodeSX[node] * 0.5, hsy = this.nodeSY[node] * 0.5, hsz = this.nodeSZ[node] * 0.5;
    for (let q = 0; q < this.k; q++) {
      const child = this.createNode(
        this.nodeCx[node] + ((q & 1) ? qx : -qx),
        this.nodeCy[node] + ((q & 2) ? qy : -qy),
        this.nodeCz[node] + ((q & 4) ? qz : -qz),
        hsx, hsy, hsz, node,
      );
      this.nodeChild[node * this.k + q] = child;
    }
  }

  private traverse(b: BodySet, p: PhysicsParams): void {
    const n = b.n;
    const { x, y, z, mass, ax, ay, az } = b;
    const useZ = b.dimensions === 3;
    const G = p.G;
    const eps2 = p.softening * p.softening;
    // 四极展开误差 O((s/d)³)，需比单极更严的判据；θ 折半保证收敛
    const theta2 = (p.theta * 0.5) ** 2;
    const K = this.k;
    let stack = this.stack;
    const child = this.nodeChild, nmass = this.nodeMass;
    const ncx = this.nodeCx, ncy = this.nodeCy, ncz = this.nodeCz;
    const nsizeX = this.nodeSX, nsizeY = this.nodeSY, nsizeZ = this.nodeSZ;
    const nhead = this.nodeHead, next = this.bodyNext;

    ax.fill(0, 0, n); ay.fill(0, 0, n); az.fill(0, 0, n);

    for (let i = 0; i < n; i++) {
      if (mass[i] <= 0) continue;
      const xi = x[i], yi = y[i], zi = useZ ? z[i] : 0;
      let axi = 0, ayi = 0, azi = 0;
      // 标记 i 的祖先路径（含自身叶），遍历时 O(1) 排除自作用
      this.ancestorMark.fill(0, 0, this.nodeCount);
      let anc = this.bodyLeaf[i];
      while (anc !== -1) { this.ancestorMark[anc] = 1; anc = this.nodeParent[anc]; }
      let sp = 0;
      stack[sp++] = 0;

      while (sp > 0) {
        const node = stack[--sp];
        const m = nmass[node];
        if (m <= 0) continue;

        const dx = ncx[node] - xi;
        const dy = ncy[node] - yi;
        const dz = useZ ? ncz[node] - zi : 0;
        const d2 = dx * dx + dy * dy + dz * dz + eps2;
        const base = node * K;

        if (child[base] === -1) {
          let k = nhead[node];
          while (k !== -1) {
            if (k !== i) {
              const gmk = b.gravMass(k);
              if (gmk > 0) {
                const ddx = x[k] - xi, ddy = y[k] - yi, ddz = useZ ? z[k] - zi : 0;
                const r2 = ddx * ddx + ddy * ddy + ddz * ddz;
                const f = (G * gmk) / ((r2 + eps2) * Math.sqrt(r2 + eps2));
                axi += f * ddx; ayi += f * ddy;
                if (useZ) azi += f * ddz;
              }
            }
            k = next[k];
          }
          continue;
        }

        // 排除自作用：祖先标记在每体遍历开始时一次性置位，查询 O(1)
        const isAncestor = this.ancestorMark[node] !== 0;

        const s = Math.max(nsizeX[node], nsizeY[node], useZ ? nsizeZ[node] : 0);
        if (!isAncestor && s * s < theta2 * d2) {
          // 单极项（吸引，方向指向块质心）
          const invR = 1 / Math.sqrt(d2);
          const invR3 = invR / d2;
          const fMono = G * m * invR3;
          axi += fMono * dx; ayi += fMono * dy;
          if (useZ) azi += fMono * dz;

          // 四极项仅在块尺度远大于软化尺度时有效；否则展开不收敛（近距奇点）
          // 用 s/d 作为展开参数：要求 (s/d)² < 0.25，配合 θ 判据自动满足
          const u2 = s * s / d2;
          if (u2 < 0.25) {
            // dx = 源质心 - 场点，与单极保持一致；四极张量 Q 关于质心
            const rx = dx, ry = dy, rz = useZ ? dz : 0;
            const qx = this.qxx[node], qy = this.qyy[node], qz = this.qzz[node];
            const qxy = this.qxy[node], qxz = this.qxz[node], qyz = this.qyz[node];
            const tr = qx + qy + qz;
            const qrX = qx * rx + qxy * ry + qxz * rz;
            const qrY = qxy * rx + qy * ry + qyz * rz;
            const qrZ = qxz * rx + qyz * ry + qz * rz;
            const rQr = qrX * rx + qrY * ry + qrZ * rz;
            const invR5 = invR3 * invR * invR;
            const invR7 = invR5 * invR * invR;
            // 标准四极加速度修正：a_q = G/2 · [ (5 (rᵀQr)/r² - trQ) r - 2 Qr ] / r⁵
            const cA = 2.5 * G * invR7 * rQr;
            const cB = 0.5 * G * tr * invR5;
            const cC = G * invR5;
            axi += (cA - cB) * rx - cC * qrX;
            ayi += (cA - cB) * ry - cC * qrY;
            if (useZ) azi += (cA - cB) * rz - cC * qrZ;
          }
          continue;
        }

        if (sp + K >= stack.length) {
          const bigger = new Int32Array(stack.length * 2);
          bigger.set(stack);
          this.stack = stack = bigger;
        }
        for (let q = 0; q < K; q++) {
          const c = child[base + q];
          if (c !== -1) stack[sp++] = c;
        }
      }

      ax[i] = axi; ay[i] = ayi;
      if (useZ) az[i] = azi;
    }
  }
}
