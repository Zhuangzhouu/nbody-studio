/**
 * Worker 客户端封装：Promise 化的初始化、无阻塞推帧、背压控制。
 * 主线程每帧最多只允许一个 "advance" 在途，避免消息堆积导致延迟雪崩。
 */

import type {
  BodyConfig,
  Diagnostics,
  InitParams,
  MetricsSample,
  PerfSample,
  PhysicsParams,
  StellarEvent,
  Snapshot,
  ViewParams,
} from '../core/types';
import type { Strategy } from '../core/scale-policy';
import type { FromWorker, ToWorker } from './protocol';

export interface ReadyInfo {
  strategy: Strategy;
  snapshot: Snapshot;
  diagnostics: Diagnostics;
  buildMs: number;
}

export interface FrameInfo {
  snapshot: Snapshot;
  diagnostics: Diagnostics;
  strategy: Strategy;
}

export class PhysicsClient {
  private worker: Worker;
  private busy = false;
  private readyResolve: ((info: ReadyInfo) => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  /** Worker 忙时暂存的最新参数（只保留最后一次，避免消息堆积）。 */
  private pendingPhysics: PhysicsParams | null = null;
  private pendingView: ViewParams | null = null;
  /** 忙时排队的一次性命令（只保留最新）。 */
  private pendingCommand: ToWorker | null = null;

  onFrame: ((frame: FrameInfo) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  /** 收到按需导出的逐体配置。 */
  onBodies: ((bodies: BodyConfig[]) => void) | null = null;
  onMetrics: ((sample: MetricsSample) => void) | null = null;
  onPerf: ((sample: PerfSample) => void) | null = null;
  onTrail: ((t: { filled: number; points: number; indices: number[]; data: Float32Array }) => void) | null = null;
  onField: ((f: { size: number; data: Float32Array }) => void) | null = null;
  onEvents: ((items: StellarEvent[]) => void) | null = null;
  /** 有未完成的计算在途。 */
  get isBusy(): boolean {
    return this.busy;
  }

  constructor() {
    this.worker = new Worker(new URL('./physics.worker.ts', import.meta.url), {
      type: 'module',
      name: 'nbody-physics',
    });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.handle(ev.data);
    this.worker.onerror = (ev) => {
      this.busy = false;
      this.onError?.(ev.message || '物理 Worker 发生未知错误');
    };
  }

  private handle(msg: FromWorker): void {
    if (msg.type === 'error') {
      this.busy = false;
      this.readyReject?.(new Error(msg.message));
      this.readyResolve = null;
      this.readyReject = null;
      this.onError?.(msg.message);
      return;
    }
    if (msg.type === 'metrics') {
      this.onMetrics?.(msg.sample);
      return;
    }
    if (msg.type === 'perf') {
      this.onPerf?.(msg.sample);
      return;
    }
    if (msg.type === 'events') {
      this.onEvents?.(msg.items);
      return;
    }
    if (msg.type === 'field') {
      this.busy = false;
      this.onField?.({ size: msg.size, data: msg.data });
      this.flushPending();
      return;
    }
    if (msg.type === 'trail') {
      this.busy = false;
      this.onTrail?.({ filled: msg.filled, points: msg.points, indices: msg.indices, data: msg.data });
      this.flushPending();
      return;
    }
    if (msg.type === 'bodies') {
      this.busy = false;
      this.onBodies?.(msg.bodies);
      this.flushPending();
      return;
    }
    if (msg.type === 'ready') {
      this.busy = false;
      const info: ReadyInfo = {
        strategy: msg.strategy,
        snapshot: msg.snapshot,
        diagnostics: msg.diagnostics,
        buildMs: msg.buildMs,
      };
      this.readyResolve?.(info);
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }
    this.busy = false;
    this.onFrame?.({
      snapshot: msg.snapshot,
      diagnostics: msg.diagnostics,
      strategy: msg.strategy,
    });
    this.flushPending();
  }

  /** 把排队中的参数更新补发出去（Worker 空闲时）。 */
  private flushPending(): void {
    if (this.busy) return;
    if (this.pendingPhysics) {
      const physics = this.pendingPhysics;
      this.pendingPhysics = null;
      this.busy = true;
      this.send({ type: 'physics', physics });
      return;
    }
    if (this.pendingView) {
      const view = this.pendingView;
      this.pendingView = null;
      this.busy = true;
      this.send({ type: 'view', view });
      return;
    }
    if (this.pendingCommand) {
      const cmd = this.pendingCommand;
      this.pendingCommand = null;
      this.busy = true;
      this.send(cmd);
    }
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  /** 重建世界（会阻塞 Worker，但不会阻塞 UI）。 */
  init(
    init: InitParams,
    physics: PhysicsParams,
    view: ViewParams,
    bodies?: BodyConfig[],
  ): Promise<ReadyInfo> {
    this.busy = true;
    return new Promise<ReadyInfo>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.send({ type: 'init', init, physics, view, bodies });
    });
  }

  /** 推进若干步；若已有在途请求则跳过本次，实现自然背压。 */
  advance(steps: number): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'advance', steps });
    return true;
  }

  setPhysics(physics: PhysicsParams): void {
    this.pendingPhysics = { ...physics };
    this.flushPending();
  }

  setView(view: ViewParams): void {
    this.pendingView = { ...view };
    this.flushPending();
  }

  /** 请求导出当前世界全部天体（逐体完整配置）。 */
  requestBodies(): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'request-bodies' });
    return true;
  }

  addBodies(bodies: BodyConfig[]): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'add-bodies', bodies });
    return true;
  }

  removeBody(index: number): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'remove-body', index });
    return true;
  }

  removeDrift(centerPosition = false): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'remove-drift', centerPosition });
    return true;
  }

  requestField(): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'request-field' });
    return true;
  }

  requestTrail(indices: number[]): boolean {
    if (this.busy) return false;
    this.busy = true;
    this.send({ type: 'request-trail', indices });
    return true;
  }

  requestFrame(): void {
    if (this.busy) return;
    this.busy = true;
    this.send({ type: 'frame' });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
