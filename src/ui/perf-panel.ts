/** E4：性能分段条（零依赖）。 */

import type { PerfSample } from '../core/types';
import { el } from './widgets';

export class PerformancePanel {
  private root: HTMLElement;
  private values: HTMLElement;
  private barForce: HTMLElement;
  private barIntegrate: HTMLElement;
  private barCollision: HTMLElement;
  private last: PerfSample | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'perf-panel');
    this.root.style.display = 'none';

    this.values = el('div', 'field-hint', '—');
    this.values.id = 'perf-values';
    this.root.append(this.values);

    const bar = el('div', 'perf-bar');
    this.barForce = el('div', 'perf-seg perf-force');
    this.barIntegrate = el('div', 'perf-seg perf-integrate');
    this.barCollision = el('div', 'perf-seg perf-collision');
    bar.append(this.barForce, this.barIntegrate, this.barCollision);
    this.root.append(bar);

    const legend = el('div', 'field-hint', '青=求力 · 紫=积分 · 橙=碰撞');
    this.root.append(legend);
    parent.append(this.root);
  }

  update(s: PerfSample): void {
    this.last = s;
    this.root.style.display = '';
    const total = Math.max(1e-9, s.force + s.integrate + s.collision);
    this.barForce.style.width = `${Math.max(2, (s.force / total) * 100)}%`;
    this.barIntegrate.style.width = `${Math.max(1, (s.integrate / total) * 100)}%`;
    this.barCollision.style.width = `${Math.max(1, (s.collision / total) * 100)}%`;
    this.values.textContent = `${s.ms.toFixed(2)} ms/步 · 求力 ${s.force.toFixed(2)} · 碰撞 ${s.collision.toFixed(2)} · ${s.simulated.toLocaleString('en-US')} 体`;
  }

  get sample(): PerfSample | null {
    return this.last;
  }
}
