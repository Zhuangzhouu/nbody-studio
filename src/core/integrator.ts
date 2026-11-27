/**
 * 时间积分器：统一 3D 公式，2D 模式下 z 分量恒为 0。
 *
 *  - Velocity Verlet（默认）：辛积分，长期能量误差有界；加速度可跨步复用。
 *  - RK4：四阶精度，每步 4 次求力；用户可在任意引擎/规模下选择，代价自负。
 */

import type { BodySet } from './bodies';
import type { PhysicsParams } from './types';
import type { ForceSolver } from './forces/solver';

/** 半步踢-漂移-再踢。返回时 ax/ay/az 保存 a(t+dt)。 */
export function stepVerlet(
  b: BodySet,
  solver: ForceSolver,
  p: PhysicsParams,
  dt: number,
  accelReady: boolean,
): void {
  const n = b.n;
  const { vx, vy, vz, x, y, z, ax, ay, az } = b;
  const useZ = b.dimensions === 3;
  const half = dt * 0.5;

  if (!accelReady) solver.compute(b, p);

  for (let i = 0; i < n; i++) {
    vx[i] += half * ax[i];
    vy[i] += half * ay[i];
    x[i] += dt * vx[i];
    y[i] += dt * vy[i];
    if (useZ) {
      vz[i] += half * az[i];
      z[i] += dt * vz[i];
    }
  }

  solver.compute(b, p);

  for (let i = 0; i < n; i++) {
    vx[i] += half * ax[i];
    vy[i] += half * ay[i];
    if (useZ) vz[i] += half * az[i];
  }
}

type Triple = [Float64Array, Float64Array, Float64Array];

interface Rk4Workspace {
  n: number;
  x0: Float64Array;
  y0: Float64Array;
  z0: Float64Array;
  vx0: Float64Array;
  vy0: Float64Array;
  vz0: Float64Array;
  ka: Triple[]; // [stage][component] 加速度
  kx: Triple[]; // [stage][component] 位置导数
}

let rk4ws: Rk4Workspace | null = null;

function ensureRk4(n: number): Rk4Workspace {
  if (rk4ws && rk4ws.n >= n) return rk4ws;
  const mk = () => new Float64Array(n);
  const four = (): Triple => [mk(), mk(), mk()];
  const ws: Rk4Workspace = {
    n,
    x0: mk(),
    y0: mk(),
    z0: mk(),
    vx0: mk(),
    vy0: mk(),
    vz0: mk(),
    ka: [four(), four(), four(), four()],
    kx: [four(), four(), four(), four()],
  };
  rk4ws = ws;
  return ws;
}

/** 经典四阶 Runge-Kutta：每步 4 次求力 + 1 次刷新加速度。 */
export function stepRk4(b: BodySet, solver: ForceSolver, p: PhysicsParams, dt: number): void {
  const n = b.n;
  const ws = ensureRk4(Math.max(1, n));
  const { x, y, z, vx, vy, vz } = b;
  const useZ = b.dimensions === 3;
  const h2 = dt * 0.5;

  for (let i = 0; i < n; i++) {
    ws.x0[i] = x[i];
    ws.y0[i] = y[i];
    ws.z0[i] = z[i];
    ws.vx0[i] = vx[i];
    ws.vy0[i] = vy[i];
    ws.vz0[i] = vz[i];
  }

  const stages = [0, h2, h2, dt];
  const nextStep = [h2, h2, dt];

  for (let s = 0; s < 4; s++) {
    // 当前位置是上一阶段末尾写入的；第 0 阶段即初始状态
    solver.compute(b, p);
    const ka = ws.ka[s];
    const kx = ws.kx[s];

    for (let i = 0; i < n; i++) {
      ka[0][i] = b.ax[i];
      ka[1][i] = b.ay[i];
      ka[2][i] = b.az[i];

      if (s === 0) {
        // dx/dt = v
        kx[0][i] = vx[i];
        kx[1][i] = vy[i];
        kx[2][i] = vz[i];
      } else {
        // dx/dt = v0 + h_prev · a_prev
        const hp = stages[s];
        kx[0][i] = ws.vx0[i] + hp * ws.ka[s - 1][0][i];
        kx[1][i] = ws.vy0[i] + hp * ws.ka[s - 1][1][i];
        kx[2][i] = useZ ? ws.vz0[i] + hp * ws.ka[s - 1][2][i] : 0;
      }
    }

    if (s < 3) {
      const hNext = nextStep[s];
      for (let i = 0; i < n; i++) {
        x[i] = ws.x0[i] + hNext * kx[0][i];
        y[i] = ws.y0[i] + hNext * kx[1][i];
        if (useZ) z[i] = ws.z0[i] + hNext * kx[2][i];
      }
    }
  }

  // 第 4 阶段的 kv 已是最末位置处的加速度，用它做最终累加
  const sixth = dt / 6;
  const a = ws.ka;
  const dx = ws.kx;
  for (let i = 0; i < n; i++) {
    x[i] =
      ws.x0[i] +
      sixth * (dx[0][0][i] + 2 * dx[1][0][i] + 2 * dx[2][0][i] + dx[3][0][i]);
    y[i] =
      ws.y0[i] +
      sixth * (dx[0][1][i] + 2 * dx[1][1][i] + 2 * dx[2][1][i] + dx[3][1][i]);
    vx[i] =
      ws.vx0[i] +
      sixth * (a[0][0][i] + 2 * a[1][0][i] + 2 * a[2][0][i] + a[3][0][i]);
    vy[i] =
      ws.vy0[i] +
      sixth * (a[0][1][i] + 2 * a[1][1][i] + 2 * a[2][1][i] + a[3][1][i]);
    if (useZ) {
      z[i] =
        ws.z0[i] +
        sixth * (dx[0][2][i] + 2 * dx[1][2][i] + 2 * dx[2][2][i] + dx[3][2][i]);
      vz[i] =
        ws.vz0[i] +
        sixth * (a[0][2][i] + 2 * a[1][2][i] + 2 * a[2][2][i] + a[3][2][i]);
    }
  }

  solver.compute(b, p);
}


/** 三阶根与 Yoshida 四阶系数（满足 2w1+w0=1、2w1³+w0³=0）。 */
export const YOSHIDA_W1 = 1 / (2 - Math.cbrt(2));
export const YOSHIDA_W0 = -Math.cbrt(2) / (2 - Math.cbrt(2));

/**
 * Yoshida 四阶辛积分器：KDK(w1·dt) → KDK(w0·dt) → KDK(w1·dt)。
 * 整步 3 次求力；w0 为负（时间反向子步）属正常。
 */
export function stepYoshida4(
  b: BodySet,
  solver: ForceSolver,
  p: PhysicsParams,
  dt: number,
): void {
  kdk(b, solver, p, YOSHIDA_W1 * dt);
  kdk(b, solver, p, YOSHIDA_W0 * dt);
  kdk(b, solver, p, YOSHIDA_W1 * dt);
}

function kdk(b: BodySet, solver: ForceSolver, p: PhysicsParams, h: number): void {
  const { x, y, z, vx, vy, vz, ax, ay, az } = b;
  const n = b.n;
  const useZ = b.dimensions === 3;
  const half = h * 0.5;
  solver.compute(b, p);
  for (let i = 0; i < n; i++) {
    vx[i] += half * ax[i];
    vy[i] += half * ay[i];
    if (useZ) vz[i] += half * az[i];
    x[i] += h * vx[i];
    y[i] += h * vy[i];
    if (useZ) z[i] += h * vz[i];
  }
  solver.compute(b, p);
  for (let i = 0; i < n; i++) {
    vx[i] += half * ax[i];
    vy[i] += half * ay[i];
    if (useZ) vz[i] += half * az[i];
  }
}
