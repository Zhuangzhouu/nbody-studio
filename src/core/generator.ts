/**
 * 初始条件生成器（2D / 3D）。
 *
 * 同种子完全可复现。2D 路径保持原有平面分布；3D 路径生成真实空间分布
 * （带厚度盘、球体、立体晶格、三维双星）。质量归一保证不同 N 下轨道尺度一致。
 */

import { BodySet } from './bodies';
import { Rng } from './rng';
import type { Dimensions, InitParams } from './types';

export interface GenerateOptions {
  simulated: number;
  weight: number;
  requested: number;
  G: number;
  bodyRadius: number;
  dimensions?: Dimensions;
}

export function generateBodies(init: InitParams, opts: GenerateOptions): BodySet {
  const n = Math.max(1, Math.floor(opts.simulated));
  const dimensions = opts.dimensions ?? 3;
  const bodies = new BodySet(n, opts.weight, opts.requested, dimensions);
  const rng = new Rng(init.seed);
  const R = Math.max(1e-3, init.radius);
  const jitter = Math.max(0, init.jitter);
  const thickness = Math.max(0, init.thickness);

  const masses = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const m = rng.range(init.massMin, init.massMax);
    masses[i] = m > 0 ? m : 1;
    sum += masses[i];
  }
  let totalPhysical = sum;
  if (init.normalizeMass && sum > 0) {
    // 归一化到「每颗真实恒星」：Σ(grav_i · weight) = totalMass
    const target = Math.max(1e-9, init.totalMass) / Math.max(1, opts.weight);
    const scale = target / sum;
    for (let i = 0; i < n; i++) masses[i] *= scale;
    totalPhysical = target * Math.max(1, opts.weight);
  }
  bodies.mass.set(masses);
  bodies.syncGravToMass();

  const GM = opts.G * totalPhysical;

  if (dimensions === 2) {
    switch (init.distribution) {
      case 'disc':
        fillDisc(bodies, rng, R, GM, init.spin, jitter);
        break;
      case 'cloud':
        fillUniformDisc(bodies, rng, R, GM, init.spin * 0.12, jitter);
        break;
      case 'cluster':
        fillCluster2D(bodies, rng, R, GM, init.spin, jitter);
        break;
      case 'collision':
        fillCollision2D(bodies, rng, R, GM, init.spin, jitter);
        break;
      case 'grid':
        fillGrid2D(bodies, rng, R, jitter);
        break;
      case 'binary':
        fillBinaries2D(bodies, rng, R, opts.G, jitter);
        break;
    }
  } else {
    switch (init.distribution) {
      case 'disc':
        fillDisc3D(bodies, rng, R, GM, init.spin, jitter, thickness);
        break;
      case 'cloud':
        fillSphere3D(bodies, rng, R, GM, init.spin * 0.12, jitter);
        break;
      case 'cluster':
        fillCluster3D(bodies, rng, R, GM, init.spin, jitter);
        break;
      case 'collision':
        fillCollision3D(bodies, rng, R, GM, init.spin, jitter);
        break;
      case 'grid':
        fillGrid3D(bodies, rng, R, jitter);
        break;
      case 'binary':
        fillBinaries3D(bodies, rng, R, opts.G, jitter);
        break;
    }
  }

  bodies.centerAtOrigin();
  bodies.zeroMomentum();
  bodies.refreshRadii(opts.bodyRadius);
  return bodies;
}

// ---------------------------------------------------------------- 2D

/** 指数盘（中心亮、外围稀），圆轨道速度。 */
function fillDisc(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  const h = R / 3.2;
  for (let i = 0; i < b.n; i++) {
    const u = rng.next() * 0.995;
    const r = Math.max(0.02 * h, -h * Math.log(1 - u));
    const a = rng.next() * Math.PI * 2;
    b.x[i] = r * Math.cos(a);
    b.y[i] = r * Math.sin(a);
    const enclosed = GM * (1 - (1 + r / h) * Math.exp(-r / h));
    const vc = Math.sqrt(Math.max(enclosed, 1e-9) / r);
    const vt = vc * spin;
    b.vx[i] = -Math.sin(a) * vt + rng.normal() * jitter * vc;
    b.vy[i] = Math.cos(a) * vt + rng.normal() * jitter * vc;
  }
}

function fillUniformDisc(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  for (let i = 0; i < b.n; i++) {
    const p = rng.inUnitDisc();
    const r = Math.max(0.02 * R, Math.hypot(p.x, p.y) * R);
    const a = Math.atan2(p.y, p.x);
    b.x[i] = r * Math.cos(a);
    b.y[i] = r * Math.sin(a);
    const vc = Math.sqrt(Math.max(GM * Math.min(1, (r * r) / (R * R)), 1e-9) / r);
    b.vx[i] = -Math.sin(a) * vc * spin + rng.normal() * jitter * vc;
    b.vy[i] = Math.cos(a) * vc * spin + rng.normal() * jitter * vc;
  }
}

function fillCluster2D(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  for (let i = 0; i < b.n; i++) {
    const r = Math.max(0.01 * R, Math.pow(rng.next(), 1.7) * R);
    const a = rng.next() * Math.PI * 2;
    b.x[i] = r * Math.cos(a);
    b.y[i] = r * Math.sin(a);
    const vc = Math.sqrt(Math.max(GM * Math.pow(Math.min(1, r / R), 2.4), 1e-9) / r);
    const vt = vc * spin * 0.55;
    b.vx[i] = -Math.sin(a) * vt + rng.normal() * jitter * vc;
    b.vy[i] = Math.cos(a) * vt + rng.normal() * jitter * vc;
  }
}

function fillCollision2D(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  const half = Math.floor(b.n / 2);
  const sub = 0.62 * R;
  const offset = 0.85 * R;
  const subGM = GM * (half / Math.max(1, b.n));
  const h = sub / 3.2;
  for (let i = 0; i < b.n; i++) {
    const second = i >= half;
    const cx = second ? offset : -offset;
    const r = Math.max(0.02 * sub, -h * Math.log(1 - rng.next() * 0.995));
    const a = rng.next() * Math.PI * 2;
    b.x[i] = cx + r * Math.cos(a);
    b.y[i] = r * Math.sin(a);
    const vc = Math.sqrt(Math.max(subGM * (1 - (1 + r / h) * Math.exp(-r / h)), 1e-9) / r);
    const dir = second ? -1 : 1;
    const vt = vc * spin * dir;
    b.vx[i] = -Math.sin(a) * vt + dir * 0.45 * vc + rng.normal() * jitter * vc;
    b.vy[i] = Math.cos(a) * vt + rng.normal() * jitter * vc;
  }
}

function fillGrid2D(b: BodySet, rng: Rng, R: number, jitter: number): void {
  const cols = Math.ceil(Math.sqrt(b.n));
  const rows = Math.ceil(b.n / cols);
  const sx = (2 * R) / Math.max(1, cols - 1 || 1);
  const sy = (2 * R) / Math.max(1, rows - 1 || 1);
  for (let i = 0; i < b.n; i++) {
    b.x[i] = -R + (i % cols) * sx + rng.normal() * jitter * sx;
    b.y[i] = -R + Math.floor(i / cols) * sy + rng.normal() * jitter * sy;
  }
}

function fillBinaries2D(b: BodySet, rng: Rng, R: number, G: number, jitter: number): void {
  let i = 0;
  const pairs = Math.floor(b.n / 2);
  const slot = Math.max(1, Math.ceil(Math.sqrt(pairs)));
  const sep = Math.max(0.004 * R, (0.9 * R) / slot);
  for (let p = 0; p < pairs && i + 1 < b.n; p++, i += 2) {
    const px = rng.range(-0.9 * R, 0.9 * R);
    const py = rng.range(-0.9 * R, 0.9 * R);
    const ang = rng.next() * Math.PI * 2;
    const m1 = b.mass[i];
    const m2 = b.mass[i + 1];
    const total = m1 + m2;
    const v = Math.sqrt((G * Math.max(m1, 1e-12)) / (2 * sep)) * 0.95;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    b.x[i] = px - (ux * sep * m2) / total;
    b.y[i] = py - (uy * sep * m2) / total;
    b.x[i + 1] = px + (ux * sep * m1) / total;
    b.y[i + 1] = py + (uy * sep * m1) / total;
    b.vx[i] = -uy * v + rng.normal() * jitter;
    b.vy[i] = ux * v + rng.normal() * jitter;
    b.vx[i + 1] = uy * v + rng.normal() * jitter;
    b.vy[i + 1] = -ux * v + rng.normal() * jitter;
  }
  if (i < b.n) {
    b.x[i] = rng.range(-R, R);
    b.y[i] = rng.range(-R, R);
  }
}

// ---------------------------------------------------------------- 3D

/** 带厚度的指数盘：xy 面圆轨道，z 方向高斯散布。 */
function fillDisc3D(
  b: BodySet,
  rng: Rng,
  R: number,
  GM: number,
  spin: number,
  jitter: number,
  thickness: number,
): void {
  const h = R / 3.2;
  const hz = Math.max(1e-4, thickness * R);
  for (let i = 0; i < b.n; i++) {
    const u = rng.next() * 0.995;
    const r = Math.max(0.02 * h, -h * Math.log(1 - u));
    const a = rng.next() * Math.PI * 2;
    b.x[i] = r * Math.cos(a);
    b.y[i] = r * Math.sin(a);
    b.z[i] = rng.normal() * hz;

    const enclosed = GM * (1 - (1 + r / h) * Math.exp(-r / h));
    const vc = Math.sqrt(Math.max(enclosed, 1e-9) / r);
    const vt = vc * spin;
    b.vx[i] = -Math.sin(a) * vt + rng.normal() * jitter * vc;
    b.vy[i] = Math.cos(a) * vt + rng.normal() * jitter * vc;
    b.vz[i] = rng.normal() * jitter * vc * 0.4;
  }
}

/** 均匀球体：内含质量 ∝ r³，速度方向随机切向。 */
function fillSphere3D(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  for (let i = 0; i < b.n; i++) {
    const u = rng.next();
    const r = Math.max(0.02 * R, Math.cbrt(u) * R);
    const cosT = rng.range(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rng.next() * Math.PI * 2;
    const nx = sinT * Math.cos(phi);
    const ny = sinT * Math.sin(phi);
    const nz = cosT;
    b.x[i] = r * nx;
    b.y[i] = r * ny;
    b.z[i] = r * nz;

    const vc = Math.sqrt(Math.max(GM * Math.pow(Math.min(1, r / R), 3), 1e-9) / r);
    // 随机正交切向量
    let tx = -ny;
    let ty = nx;
    let tz = 0;
    const len = Math.hypot(tx, ty, tz);
    if (len < 1e-6) {
      tx = 1;
      ty = 0;
      tz = 0;
    } else {
      tx /= len;
      ty /= len;
      tz /= len;
    }
    const vt = vc * spin;
    b.vx[i] = tx * vt + rng.normal() * jitter * vc;
    b.vy[i] = ty * vt + rng.normal() * jitter * vc;
    b.vz[i] = tz * vt + rng.normal() * jitter * vc;
  }
}

/** 核聚球团：Plummer 风格径向分布，速度低于圆轨道 → 缓慢塌缩。 */
function fillCluster3D(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  for (let i = 0; i < b.n; i++) {
    const r = Math.max(0.01 * R, Math.pow(rng.next(), 1.4) * R);
    const cosT = rng.range(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rng.next() * Math.PI * 2;
    const nx = sinT * Math.cos(phi);
    const ny = sinT * Math.sin(phi);
    const nz = cosT;
    b.x[i] = r * nx;
    b.y[i] = r * ny;
    b.z[i] = r * nz;
    const vc = Math.sqrt(Math.max(GM * Math.pow(Math.min(1, r / R), 2.6), 1e-9) / r);
    const vt = vc * spin * 0.5;
    b.vx[i] = -ny * vt + rng.normal() * jitter * vc;
    b.vy[i] = nx * vt + rng.normal() * jitter * vc;
    b.vz[i] = rng.normal() * jitter * vc;
  }
}

/** 两个球状星团对撞。 */
function fillCollision3D(b: BodySet, rng: Rng, R: number, GM: number, spin: number, jitter: number): void {
  const half = Math.floor(b.n / 2);
  const sub = 0.5 * R;
  const offset = 0.8 * R;
  const subGM = GM * (half / Math.max(1, b.n));
  for (let i = 0; i < b.n; i++) {
    const second = i >= half;
    const dir = second ? -1 : 1;
    const r = Math.max(0.02 * sub, Math.cbrt(rng.next()) * sub);
    const cosT = rng.range(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rng.next() * Math.PI * 2;
    const nx = sinT * Math.cos(phi);
    const ny = sinT * Math.sin(phi);
    const nz = cosT;
    b.x[i] = dir * offset + r * nx;
    b.y[i] = r * ny;
    b.z[i] = r * nz;
    const vc = Math.sqrt(Math.max(subGM * Math.pow(Math.min(1, r / sub), 3), 1e-9) / r);
    const vt = vc * spin * dir;
    b.vx[i] = -ny * vt + dir * 0.45 * vc + rng.normal() * jitter * vc;
    b.vy[i] = nx * vt + rng.normal() * jitter * vc;
    b.vz[i] = rng.normal() * jitter * vc;
  }
}

/** 三维立方晶格。 */
function fillGrid3D(b: BodySet, rng: Rng, R: number, jitter: number): void {
  const side = Math.max(1, Math.ceil(Math.cbrt(b.n)));
  const step = (2 * R) / Math.max(1, side - 1 || 1);
  for (let i = 0; i < b.n; i++) {
    const ix = i % side;
    const iy = Math.floor(i / side) % side;
    const iz = Math.floor(i / (side * side));
    b.x[i] = -R + ix * step + rng.normal() * jitter * step;
    b.y[i] = -R + iy * step + rng.normal() * jitter * step;
    b.z[i] = -R + iz * step + rng.normal() * jitter * step;
  }
}

/** 三维双星群：在随机轨道平面上互绕。 */
function fillBinaries3D(b: BodySet, rng: Rng, R: number, G: number, jitter: number): void {
  let i = 0;
  const pairs = Math.floor(b.n / 2);
  const slot = Math.max(1, Math.ceil(Math.cbrt(pairs)));
  const sep = Math.max(0.004 * R, (0.9 * R) / slot);
  for (let p = 0; p < pairs && i + 1 < b.n; p++, i += 2) {
    const px = rng.range(-0.9 * R, 0.9 * R);
    const py = rng.range(-0.9 * R, 0.9 * R);
    const pz = rng.range(-0.9 * R, 0.9 * R);
    // 随机轨道法向量 n 与平面内基向量 u、w
    const cosT = rng.range(-1, 1);
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rng.next() * Math.PI * 2;
    const nx = sinT * Math.cos(phi);
    const ny = sinT * Math.sin(phi);
    const nz = cosT;
    let ux = -ny;
    let uy = nx;
    let uz = 0;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const wx = ny * uz - nz * uy;
    const wy = nz * ux - nx * uz;
    const wz = nx * uy - ny * ux;

    const m1 = b.mass[i];
    const m2 = b.mass[i + 1];
    const total = m1 + m2;
    const v = Math.sqrt((G * Math.max(m1, 1e-12)) / (2 * sep)) * 0.95;
    b.x[i] = px - (ux * sep * m2) / total;
    b.y[i] = py - (uy * sep * m2) / total;
    b.z[i] = pz - (uz * sep * m2) / total;
    b.x[i + 1] = px + (ux * sep * m1) / total;
    b.y[i + 1] = py + (uy * sep * m1) / total;
    b.z[i + 1] = pz + (uz * sep * m1) / total;
    b.vx[i] = -wx * v + rng.normal() * jitter;
    b.vy[i] = -wy * v + rng.normal() * jitter;
    b.vz[i] = -wz * v + rng.normal() * jitter;
    b.vx[i + 1] = wx * v + rng.normal() * jitter;
    b.vy[i + 1] = wy * v + rng.normal() * jitter;
    b.vz[i + 1] = wz * v + rng.normal() * jitter;
  }
  if (i < b.n) {
    b.x[i] = rng.range(-R, R);
    b.y[i] = rng.range(-R, R);
    b.z[i] = rng.range(-R, R);
  }
}
