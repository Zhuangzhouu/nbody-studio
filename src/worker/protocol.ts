/**
 * 主线程 ⇄ 物理 Worker 的消息契约。
 * 全部为可结构化克隆的纯数据；快照复用同一块 Float32Array，交由 postMessage 复制。
 */

import type {
  BodyConfig,
  Diagnostics,
  InitParams,
  MetricsSample,
  PerfSample,
  StellarEvent,
  PhysicsParams,
  Snapshot,
  ViewParams,
} from '../core/types';
import type { Strategy } from '../core/scale-policy';

export type ToWorker =
  | {
      type: 'init';
      init: InitParams;
      physics: PhysicsParams;
      view: ViewParams;
      bodies?: BodyConfig[];
    }
  | { type: 'advance'; steps: number }
  | { type: 'physics'; physics: PhysicsParams }
  | { type: 'view'; view: ViewParams }
  | { type: 'frame' }
  | { type: 'request-bodies' }
  /** A1：运行时增量插入。 */
  | { type: 'add-bodies'; bodies: BodyConfig[] }
  /** A2：按快照索引删除。 */
  | { type: 'remove-body'; index: number }
  /** C3：移除质心漂移。 */
  | { type: 'remove-drift'; centerPosition: boolean }
  /** F2：请求轨迹。 */
  | { type: 'request-trail'; indices: number[] }
  | { type: 'request-field' };

export type FromWorker =
  | {
      type: 'ready';
      strategy: Strategy;
      snapshot: Snapshot;
      diagnostics: Diagnostics;
      buildMs: number;
    }
  | {
      type: 'frame';
      snapshot: Snapshot;
      diagnostics: Diagnostics;
      strategy: Strategy;
    }
  | { type: 'bodies'; bodies: BodyConfig[] }
  /** C1 / C4：诊断采样。 */
  | { type: 'metrics'; sample: MetricsSample }
  /** E4：性能分段。 */
  | { type: 'perf'; sample: PerfSample }
  /** F2：轨迹数据。 */
  | { type: 'trail'; filled: number; points: number; indices: number[]; data: Float32Array }
  | { type: 'field'; size: number; data: Float32Array }
  /** G2/G3：恒星演化事件流。 */
  | { type: 'events'; items: StellarEvent[] }
  | { type: 'error'; message: string };
