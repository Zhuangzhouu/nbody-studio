/**
 * 物理 Worker：所有 O(N²)/O(N log N)/FFT 计算都在这里跑，主线程只负责渲染与交互。
 * 这样即使单步要 200ms，界面输入、拖拽、缩放也不会卡死。
 */

import { bodiesFromSet } from '../core/config/serialize';
import { World } from '../core/world';
import type { ToWorker, FromWorker } from './protocol';

interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;

let world: World | null = null;

function post(msg: FromWorker): void {
  scope.postMessage(msg);
}

let metricsCounter = 0;
let metricsStepTarget = 1;

function pushFrame(): void {
  if (!world) return;
  const diag = world.diagnostics();
  post({
    type: 'frame',
    snapshot: world.snapshot(),
    diagnostics: diag,
    strategy: world.strategy,
  });
  // C1：自适应采样，目标每秒约 20 条（Worker 不直接知道 fps，用步数节流）
  if (world.stellarEvents.length) {
    post({ type: 'events', items: world.stellarEvents.slice() });
    world.stellarEvents.length = 0;
    world.flashes.length = 0;
  }
  if (++metricsCounter >= metricsStepTarget) {
    metricsCounter = 0;
    post({ type: 'metrics', sample: world.metricsSample() });
    post({ type: 'perf', sample: world.perfSample() });
  }
}

scope.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init': {
        const t0 = performance.now();
        world = new World({
          init: msg.init,
          physics: msg.physics,
          view: msg.view,
          bodies: msg.bodies,
        });
        const buildMs = performance.now() - t0;
        post({
          type: 'ready',
          strategy: world.strategy,
          snapshot: world.snapshot(),
          diagnostics: world.diagnostics(),
          buildMs,
        });
        break;
      }
      case 'advance': {
        if (!world) return;
        const steps = Math.max(0, Math.min(64, Math.floor(msg.steps)));
        for (let i = 0; i < steps; i++) world.step();
        pushFrame();
        break;
      }
      case 'physics': {
        if (!world) return;
        world.setPhysics(msg.physics);
        pushFrame();
        break;
      }
      case 'view': {
        if (!world) return;
        world.setView(msg.view);
        pushFrame();
        break;
      }
      case 'frame': {
        pushFrame();
        break;
      }
      case 'request-bodies': {
        if (!world) return;
        post({ type: 'bodies', bodies: bodiesFromSet(world.bodies) });
        break;
      }
      case 'add-bodies': {
        if (!world) return;
        world.addBodies(msg.bodies);
        pushFrame();
        break;
      }
      case 'remove-body': {
        if (!world) return;
        world.removeBody(msg.index);
        pushFrame();
        break;
      }
      case 'remove-drift': {
        if (!world) return;
        world.removeDrift(msg.centerPosition);
        pushFrame();
        break;
      }
      case 'request-field': {
        if (!world) return;
        const slice = world.fieldSlice();
        if (slice) post({ type: 'field', size: slice.size, data: slice.data });
        break;
      }
      case 'request-trail': {
        if (!world) return;
        const t = world.trailData(msg.indices);
        post({ type: 'trail', filled: t.filled, points: t.points, indices: msg.indices, data: t.data });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
