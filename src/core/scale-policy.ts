/**
 * 规模策略：把「用户配置」翻译成「引擎如何算」。
 *
 * 与旧版不同：这里的规模数字都是 auto 模式的默认建议，不是硬限制。
 * 用户可以通过 JSON 指定 engine / sampling / maxSimulated / pmGrid / maxRenderPoints /
 * trailBodies / trailPoints 来完全接管，代价与风险自负。
 */

import {
  BARNES_HUT_MAX,
  DIRECT_MAX,
  PM_GRID,
  PM_GRID_SMALL,
  PM_SMALL_MAX,
  SIM_CAP,
} from './constants';
import type { EngineKind, PhysicsParams, ViewParams } from './types';

export interface Notice {
  level: 'info' | 'warn' | 'critical';
  text: string;
}

export interface Strategy {
  requested: number;
  simulated: number;
  weight: number;
  engine: EngineKind;
  gridSize: number;
  renderCount: number;
  renderStride: number;
  collisionsEnabled: boolean;
  trailsEnabled: boolean;
  trailCount: number;
  trailPoints: number;
  estimatedBytes: number;
  label: string;
  tier: 1 | 2 | 3 | 4;
  notices: Notice[];
}

const ENGINE_LABEL: Record<EngineKind, string> = {
  direct: '直接求和 O(N²)',
  'barnes-hut': 'Barnes-Hut O(N log N)',
  'particle-mesh': '粒子网格 PM O(N+M log M)',
  treepm: 'TreePM 混合 O(N log N + M log M)',
};

export function engineFor(n: number): EngineKind {
  if (n <= DIRECT_MAX) return 'direct';
  if (n <= BARNES_HUT_MAX) return 'barnes-hut';
  return 'particle-mesh';
}

export function resolveStrategy(
  requestedInput: number,
  physics: PhysicsParams,
  view: ViewParams,
): Strategy {
  const requested = Math.max(1, Math.floor(Number.isFinite(requestedInput) ? requestedInput : 1));
  const cap =
    physics.maxSimulated > 0
      ? Math.floor(physics.maxSimulated)
      : physics.sampling === 'never'
        ? requested
        : SIM_CAP;

  const sampled = physics.sampling === 'never' ? requested : Math.min(requested, cap);
  const simulated = Math.max(1, sampled);
  const weight = requested / simulated;

  let engine =
    physics.engine === 'auto'
      ? engineFor(simulated)
      : physics.engine;

  // 3D 八叉树的单步代价显著高于 2D：auto 模式在 6000 体以上改用 PM；
  // 用户仍可通过 engine 强制指定 BH（只是会很慢）。
  if (physics.engine === 'auto' && engine === 'barnes-hut' && physics.dimensions === 3 && simulated > 6000) {
    engine = 'particle-mesh';
  }
  if (physics.engine === 'auto' && engine === 'particle-mesh' && simulated >= 20_000) {
    engine = 'treepm';
  }

  const gridSize =
    engine === 'particle-mesh'
      ? physics.pmGrid >= 4
        ? Math.max(4, 2 ** Math.floor(Math.log2(physics.pmGrid)))
        : simulated <= PM_SMALL_MAX
          ? PM_GRID_SMALL
          : PM_GRID
      : 0;

  const maxRender = Math.max(0, Math.floor(view.maxRenderPoints));
  const renderCount = maxRender === 0 ? simulated : Math.min(simulated, maxRender);
  const renderStride = Math.max(1, Math.ceil(simulated / renderCount));

  const trailCount =
    view.trailBodies <= 0 ? simulated : Math.min(simulated, Math.floor(view.trailBodies));
  const trailPoints = Math.max(2, Math.floor(view.trailPoints));

  // SoA：mass、grav、x/y/z、vx/vy/vz、ax/ay/az、radius、explicitRadius
  const perBody = (2 + 3 + 3 + 3 + 1 + 1) * 8;
  const estimatedBytes = Math.round(simulated * perBody);

  const notices: Notice[] = [];

  if (engine === 'barnes-hut' && physics.dimensions === 3) {
    notices.push({
      level: 'info',
      text: '3D 八叉树代价较高（约为 2D 的十倍）；auto 模式在 6000 体以上自动切换 PM。',
    });
  }
  if (weight > 1) {
    notices.push({
      level: 'critical',
      text:
        `统计采样：请求 ${requested.toLocaleString('en-US')} 颗，当前上限 ${simulated.toLocaleString('en-US')}。` +
        `每个代表粒子携带 ${weight.toFixed(1)} 颗真实天体的引力质量；场量为蒙特卡洛估计。`,
    });
  }
  if (physics.sampling === 'never' && requested > cap && physics.maxSimulated > 0) {
    notices.push({
      level: 'critical',
      text: `已按配置关闭采样：试图逐一积分 ${requested.toLocaleString('en-US')} 颗天体，内存需求约 ${(estimatedBytes / 1e9).toFixed(1)} GB。`,
    });
  }
  if (engine === 'direct' && simulated > 4096) {
    notices.push({
      level: 'warn',
      text: `强制使用直接求和：${simulated.toLocaleString('en-US')} 体需要约 ${(simulated * simulated * 1.6e-6 / 1000).toFixed(1)} 秒/步。`,
    });
  }
  if (engine === 'particle-mesh') {
    notices.push({
      level: 'info',
      text: `粒子网格：${gridSize}³ 网格，三维 FFT 解泊松方程；近距分辨率约一个格距。`,
    });
  }
  if (physics.integrator === 'rk4') {
    notices.push({
      level: 'info',
      text: `RK4 已启用：每步 4 次求力（约 4 倍代价），精度更高但非辛积分。`,
    });
  }
  if (renderStride > 1) {
    notices.push({
      level: 'info',
      text: `渲染抽样：每 ${renderStride} 个天体绘制 1 个（物理仍按全量计算）。`,
    });
  }
  if (physics.collision !== 'none' && simulated > 50_000) {
    notices.push({
      level: 'warn',
      text: `碰撞检测已按配置在 ${simulated.toLocaleString('en-US')} 体上启用，可能显著增加单步耗时。`,
    });
  }
  if (trailCount < simulated) {
    notices.push({
      level: 'info',
      text: `轨迹记录 ${trailCount.toLocaleString('en-US')} / ${simulated.toLocaleString('en-US')} 个天体（可在配置中调高）。`,
    });
  }

  return {
    requested,
    simulated,
    weight,
    engine,
    gridSize,
    renderCount,
    renderStride,
    collisionsEnabled: physics.collision !== 'none',
    trailsEnabled: view.trails,
    trailCount,
    trailPoints,
    estimatedBytes,
    label: ENGINE_LABEL[engine],
    tier: weight > 1 ? 4 : engine === 'direct' ? 1 : engine === 'barnes-hut' ? 2 : 3,
    notices,
  };
}

/** 积分器完全由用户决定，不再按引擎强制降级。 */
export function effectiveIntegrator(
  _engine: EngineKind,
  integrator: PhysicsParams['integrator'],
): PhysicsParams['integrator'] {
  return integrator;
}

/** 预估单步成本（毫秒），仅供界面展示。 */
export function estimateStepMs(engine: EngineKind, n: number, grid = PM_GRID): number {
  switch (engine) {
    case 'direct':
      return n * n * 1.6e-6 + n * 1e-5;
    case 'barnes-hut':
      return n * Math.log2(Math.max(2, n)) * 5.5e-5;
    case 'particle-mesh':
      return n * 4.2e-4 + grid * grid * grid * 3e-6;
    case 'treepm':
      return n * 2.2e-4 + grid * grid * grid * 3e-6;
    default:
      return n * 1e-4;
  }
}
