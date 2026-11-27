/** 默认参数与预设，集中管理避免散落各处。 */

import type { InitParams, PhysicsParams, RunParams, StellarConfig, ViewParams } from './types';

export const DEFAULT_PHYSICS: PhysicsParams = {
  dimensions: 3,
  G: 1,
  dt: 0.02,
  softening: 0.6,
  theta: 0.6,
  integrator: 'verlet',
  collision: 'none',
  restitution: 0.7,
  bodyRadius: 0.08,
  engine: 'auto',
  sampling: 'auto',
  maxSimulated: 2_000_000,
  pmGrid: 0,
  adaptiveDt: false,
  dtSafety: 0.3,
  escapeRadius: 0,
  rSplitGrids: 2.5,
};

export const DEFAULT_INIT: InitParams = {
  count: 1200,
  distribution: 'disc',
  radius: 32,
  massMin: 0.6,
  massMax: 1.8,
  /** 总质量归一化目标：保证不同天体数下动力学尺度一致。 */
  totalMass: 2000,
  normalizeMass: true,
  spin: 1,
  jitter: 0.02,
  thickness: 0.08,
  seed: 20261125,
};

export const DEFAULT_VIEW: ViewParams = {
  trails: true,
  trailLength: 1,
  trailBodies: 400,
  trailPoints: 48,
  maxRenderPoints: 250_000,
  colorMode: 'speed',
  pointSize: 2.6,
  glow: true,
  showGrid: false,
};

export const DEFAULT_STELLAR: StellarConfig = {
  massUnit: 1,
  timeUnit: 1,
  lengthUnit: 1,
  kickRadius: 10,
  kickGain: 1,
  accretion: false,
  wind: false,
  transfer: false,
  tidalFactor: 100,
};

export const DEFAULT_RUN: RunParams = {
  playing: true,
  speed: 1,
};

export const DEFAULT_SPEED = 1;

export const QUALITY_PRESETS = [
  { id: 'low', label: '低（快）', theta: 0.9 },
  { id: 'medium', label: '中（默认）', theta: 0.6 },
  { id: 'high', label: '高', theta: 0.4 },
  { id: 'ultra', label: '极高（慢）', theta: 0.2 },
] as const;

export type QualityId = (typeof QUALITY_PRESETS)[number]['id'];

/** 由 θ 反查最接近的预设，用于界面回显。 */
export function qualityFromTheta(theta: number): QualityId {
  let best: QualityId = 'medium';
  let bestDiff = Infinity;
  for (const p of QUALITY_PRESETS) {
    const d = Math.abs(p.theta - theta);
    if (d < bestDiff) {
      bestDiff = d;
      best = p.id;
    }
  }
  return best;
}

/** 深拷贝，避免面板与运行态共享引用。 */
export function cloneParams<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
