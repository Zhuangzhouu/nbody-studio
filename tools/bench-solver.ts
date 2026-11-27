/** 单求解器基准：固定引擎与规模，对比优化前后单步耗时。 */
import { World } from '../src/core/world';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';
import type { EngineKind } from '../src/core/types';

function bench(engine: EngineKind, count: number, steps = 20): number {
  const cfg = {
    init: { ...DEFAULT_INIT, count },
    physics: { ...DEFAULT_PHYSICS, engine, collision: 'none' as const, softening: 0.1, theta: 0.6 },
    view: { ...DEFAULT_VIEW, trails: false },
  };
  const w = new World(cfg);
  for (let i = 0; i < 3; i++) w.step();
  const t = performance.now();
  for (let i = 0; i < steps; i++) w.step();
  const ms = (performance.now() - t) / steps;
  console.log(`${engine.padEnd(14)} ${String(count).padStart(7)} 体  ${ms.toFixed(3).padStart(8)} ms/步`);
  return ms;
}
const results: Record<string, number> = {};
for (const [e, n] of [['direct', 1000], ['direct', 2000], ['barnes-hut', 10000], ['multipole', 10000], ['particle-mesh', 10000], ['particle-mesh', 50000]] as const) {
  results[`${e}-${n}`] = bench(e, n);
}
