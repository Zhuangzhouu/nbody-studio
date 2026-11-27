/** 3D 引擎规模基准：npm run bench3 */
import { World } from '../src/core/world';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_VIEW } from '../src/core/params';

function bench(count: number, steps = 3): void {
  const physics = { ...DEFAULT_PHYSICS, dimensions: 3 as const, collision: 'none' as const };
  const t0 = performance.now();
  const w = new World({
    init: { ...DEFAULT_INIT, count },
    physics,
    view: { ...DEFAULT_VIEW, trails: false },
  });
  const build = performance.now() - t0;
  w.step();
  const t1 = performance.now();
  for (let i = 0; i < steps; i++) w.step();
  const step = (performance.now() - t1) / steps;
  const t2 = performance.now();
  const snap = w.snapshot();
  console.log(
    `${String(count).padStart(8)} | ${w.strategy.label.padEnd(24)} | build ${build.toFixed(0)}ms | step ${step.toFixed(1)}ms | snap ${(performance.now() - t2).toFixed(1)}ms | pts ${snap.count}`,
  );
}

console.log('--- 3D 基准 ---');
for (const n of [1000, 2000, 10000, 50000, 200000, 1000000]) bench(n);
