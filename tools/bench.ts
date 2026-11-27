/**
 * 规模基准：验证三档引擎在典型天体数下的单步耗时。
 * 运行：npm run bench
 */

import { World } from '../src/core/world';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import { resolveStrategy } from '../src/core/scale-policy';

function bench(count: number, steps = 5): void {
  const cfg = {
    init: { ...DEFAULT_INIT, count },
    physics: { ...DEFAULT_PHYSICS, collision: 'none' as const },
    view: { ...DEFAULT_VIEW, trails: false },
  };
  const strategy = resolveStrategy(count, cfg.physics, cfg.view);
  const t0 = performance.now();
  const world = new World(cfg);
  const buildMs = performance.now() - t0;

  // 预热
  world.step();
  const t1 = performance.now();
  for (let i = 0; i < steps; i++) world.step();
  const stepMs = (performance.now() - t1) / steps;

  console.log(
    `${String(count).padStart(10)} 体 | ${strategy.label.padEnd(26)} | 构建 ${buildMs
      .toFixed(0)
      .padStart(5)} ms | 单步 ${stepMs.toFixed(2).padStart(7)} ms | 采样权重 ${strategy.weight.toFixed(2)}`,
  );
}

console.log('--- N-Body Studio 性能基准 ---');
bench(1000);
bench(2000);
bench(10_000);
bench(50_000);
bench(150_000);
bench(400_000, 3);
bench(1_000_000, 3);
