/**
 * Barnes-Hut 树求解器：2D 四叉树 / 3D 八叉树，O(N log N)。
 *
 * 设计要点：
 *  1. 扁平节点池（TypedArray，SoA），节点创建时初始化，避免每步清零；
 *  2. 桶式叶节点（≤2 体时精确两两），避免节点数膨胀；
 *  3. 质心/总质量沿插入路径增量维护（含 z）；
 *  4. 显式栈遍历；
 *  5. 节点池按需增长，不因预设容量而降级精度。
 */

import type { BodySet } from '../bodies';
import type { PhysicsParams } from '../types';
import type { ForceSolver } from './solver';

const BUCKET = 2;

export class BarnesHutSolver implements ForceSolver {
  readonly kind = 'barnes-hut' as const;

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

  private nodeCount = 0;
  private minSize = 1e-6;

  compute(b: BodySet, p: PhysicsParams): void {
    // 即使标记为 3D，若所有天体都在 z=0 平面，用四叉树更高效也更准确
    let flat = b.dimensions === 2;
    if (!flat) {
      flat = true;
      for (let i = 0; i < b.n; i++) {
        if (b.mass[i] > 0 && b.z[i] !== 0) {
          flat = false;
          break;
        }
      }
    }
    this.k = flat ? 4 : 8;
    this.ensureCapacity(Math.max(b.n, 1));
    this.build(b);
    this.traverse(b, p);
  }

  report(): { escaped: number; note: string | null } {
    return { escaped: 0, note: null };
  }

  /** 容量不足时扩展而非降级，保证精度不因规模被人为牺牲。 */
  private ensureCapacity(n: number): void {
    const need = Math.ceil(n * (this.k === 8 ? 2.5 : 1.6)) + 512;
    this.grow(need);
  }

  /** 复制并扩容节点池。 */
  private grow(need: number): void {
    if (need <= this.cap) return;
    const oldCap = this.cap;
    this.cap = need;

    const child = new Int32Array(need * this.k);
    const mass = new Float64Array(need);
    const cx = new Float64Array(need);
    const cy = new Float64Array(need);
    const cz = new Float64Array(need);
    const sx = new Float64Array(need);
    const sy = new Float64Array(need);
    const sz = new Float64Array(need);
    const head = new Int32Array(need);
    const next = new Int32Array(need).fill(-1);

    if (oldCap > 0) {
      child.set(this.nodeChild.subarray(0, oldCap * this.k));
      mass.set(this.nodeMass.subarray(0, oldCap));
      cx.set(this.nodeCx.subarray(0, oldCap));
      cy.set(this.nodeCy.subarray(0, oldCap));
      cz.set(this.nodeCz.subarray(0, oldCap));
      sx.set(this.nodeSX.subarray(0, oldCap));
      sy.set(this.nodeSY.subarray(0, oldCap));
      sz.set(this.nodeSZ.subarray(0, oldCap));
      head.set(this.nodeHead.subarray(0, oldCap));
      next.set(this.bodyNext.subarray(0, oldCap));
    }
    this.nodeChild = child;
    this.nodeMass = mass;
    this.nodeCx = cx;
    this.nodeCy = cy;
    this.nodeCz = cz;
    this.nodeSX = sx;
    this.nodeSY = sy;
    this.nodeSZ = sz;
    this.nodeHead = head;
    this.bodyNext = next;
  }

  private createNode(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
  ): number {
    if (this.nodeCount >= this.cap) this.grow(Math.ceil(this.cap * 1.6) + 256);
    const idx = this.nodeCount++;
    const base = idx * this.k;
    for (let q = 0; q < this.k; q++) this.nodeChild[base + q] = -1;
    this.nodeMass[idx] = 0;
    this.nodeCx[idx] = cx;
    this.nodeCy[idx] = cy;
    this.nodeCz[idx] = cz;
    this.nodeSX[idx] = sx;
    this.nodeSY[idx] = sy;
    this.nodeSZ[idx] = sz;
    this.nodeHead[idx] = -1;
    return idx;
  }

  private build(b: BodySet): void {
    const { x, y, z, mass } = b;
    const n = b.n;
    const useZ = b.dimensions === 3;
    this.nodeCount = 0;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
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
      const gm = b.gravMass(i);
      const total = this.nodeMass[0] + gm;
      const f = gm / total;
      this.nodeCx[0] += (x[i] - this.nodeCx[0]) * f;
      this.nodeCy[0] += (y[i] - this.nodeCy[0]) * f;
      this.nodeCz[0] += ((useZ ? z[i] : 0) - this.nodeCz[0]) * f;
      this.nodeMass[0] = total;
      this.place(0, i, b);
    }
  }

  /** 节点质量已包含 body，这里决定放进叶链表还是继续下钻。 */
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
      return;
    }
    this.placeInChild(node, body, b);
  }

  private placeInChild(node: number, body: number, b: BodySet): void {
    const q = this.octant(node, b.x[body], b.y[body], b.dimensions === 3 ? b.z[body] : 0) & (this.k - 1);
    let child = this.nodeChild[node * this.k + q];
    if (child === -1) {
      const qx = this.nodeSX[node] * 0.25;
      const qy = this.nodeSY[node] * 0.25;
      const qz = this.nodeSZ[node] * 0.25;
      const ox = (q & 1) ? qx : -qx;
      const oy = (q & 2) ? qy : -qy;
      const oz = (q & 4) ? qz : -qz;
      child = this.createNode(
        this.nodeCx[node] + ox,
        this.nodeCy[node] + oy,
        this.nodeCz[node] + oz,
        this.nodeSX[node] * 0.5,
        this.nodeSY[node] * 0.5,
        this.nodeSZ[node] * 0.5,
      );
      if (child === -1) return;
      this.nodeChild[node * this.k + q] = child;
    }

    const gm = b.gravMass(body);
    const prev = this.nodeMass[child];
    const total = prev + gm;
    if (total > 0) {
      const f = gm / total;
      this.nodeCx[child] += (b.x[body] - this.nodeCx[child]) * f;
      this.nodeCy[child] += (b.y[body] - this.nodeCy[child]) * f;
      this.nodeCz[child] += ((b.dimensions === 3 ? b.z[body] : 0) - this.nodeCz[child]) * f;
    }
    this.nodeMass[child] = total;
    this.place(child, body, b);
  }

  private maxSize(node: number): number {
    return Math.max(this.nodeSX[node], this.nodeSY[node], this.nodeSZ[node]);
  }

  /** 八分位索引：bit0=+x, bit1=+y, bit2=+z（2D 时 bit2 恒为 0）。 */
  private octant(node: number, px: number, py: number, pz: number): number {
    return (px >= this.nodeCx[node] ? 1 : 0) |
      (py >= this.nodeCy[node] ? 2 : 0) |
      (pz >= this.nodeCz[node] ? 4 : 0);
  }

  private listLength(head: number): number {
    let c = 0;
    let k = head;
    while (k !== -1 && c <= BUCKET) {
      c++;
      k = this.bodyNext[k];
    }
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
    const qx = this.nodeSX[node] * 0.25;
    const qy = this.nodeSY[node] * 0.25;
    const qz = this.nodeSZ[node] * 0.25;
    const hsx = this.nodeSX[node] * 0.5;
    const hsy = this.nodeSY[node] * 0.5;
    const hsz = this.nodeSZ[node] * 0.5;
    for (let q = 0; q < this.k; q++) {
      const ox = (q & 1) ? qx : -qx;
      const oy = (q & 2) ? qy : -qy;
      const oz = (q & 4) ? qz : -qz;
      const child = this.createNode(
        this.nodeCx[node] + ox,
        this.nodeCy[node] + oy,
        this.nodeCz[node] + oz,
        hsx,
        hsy,
        hsz,
      );
      if (child === -1) return;
      this.nodeChild[node * this.k + q] = child;
    }
  }

  private traverse(b: BodySet, p: PhysicsParams): void {
    const n = b.n;
    const { x, y, z, mass, ax, ay, az } = b;
    const useZ = b.dimensions === 3;
    const G = p.G;
    const eps2 = p.softening * p.softening;
    const theta2 = p.theta * p.theta;
    const K = this.k;
    const stack = this.stack;
    const child = this.nodeChild;
    const nmass = this.nodeMass;
    const ncx = this.nodeCx;
    const ncy = this.nodeCy;
    const ncz = this.nodeCz;
    const nsizeX = this.nodeSX;
    const nsizeY = this.nodeSY;
    const nsizeZ = this.nodeSZ;
    const nhead = this.nodeHead;
    const next = this.bodyNext;

    ax.fill(0, 0, n);
    ay.fill(0, 0, n);
    az.fill(0, 0, n);

    for (let i = 0; i < n; i++) {
      if (mass[i] <= 0) continue;
      const xi = x[i];
      const yi = y[i];
      const zi = useZ ? z[i] : 0;
      let axi = 0;
      let ayi = 0;
      let azi = 0;
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
                const ddx = x[k] - xi;
                const ddy = y[k] - yi;
                const ddz = useZ ? z[k] - zi : 0;
                const r2 = ddx * ddx + ddy * ddy + ddz * ddz;
                const f = (G * gmk) / ((r2 + eps2) * Math.sqrt(r2 + eps2));
                axi += f * ddx;
                ayi += f * ddy;
                if (useZ) azi += f * ddz;
              }
            }
            k = next[k];
          }
          continue;
        }

        const s = Math.max(nsizeX[node], nsizeY[node], useZ ? nsizeZ[node] : 0);
        if (s * s < theta2 * d2) {
          const f = (G * m) / (d2 * Math.sqrt(d2));
          axi += f * dx;
          ayi += f * dy;
          if (useZ) azi += f * dz;
          continue;
        }

        if (sp + K >= stack.length) continue;
        for (let q = 0; q < K; q++) {
          const c = child[base + q];
          if (c !== -1) stack[sp++] = c;
        }
      }

      ax[i] = axi;
      ay[i] = ayi;
      if (useZ) az[i] = azi;
    }
  }
}
