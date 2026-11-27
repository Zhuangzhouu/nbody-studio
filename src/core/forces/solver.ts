import type { BodySet } from '../bodies';
import type { EngineKind, PhysicsParams } from '../types';

/** 所有求解器的统一契约：给定天体集合，填充 ax/ay。 */
export interface ForceSolver {
  readonly kind: EngineKind;
  compute(bodies: BodySet, params: PhysicsParams): void;
  /** 引擎自检信息（精度损失、越界粒子等），供 HUD 展示。 */
  report(): { escaped: number; note: string | null };
}

/** 软化核：(r² + ε²)^(-3/2)。ε→0 时退化为牛顿奇点。 */
export function invR3(r2: number, eps2: number): number {
  return 1 / ((r2 + eps2) * Math.sqrt(r2 + eps2));
}
