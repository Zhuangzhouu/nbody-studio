/** 底部 HUD 与顶栏徽标的状态刷新。 */

import { formatCount, formatInt, formatNumber } from '../core/mathx';
import { physTime } from '../core/stellar';
import type { Diagnostics, Snapshot, StellarConfig } from '../core/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 DOM 节点 #${id}`);
  return node as T;
};

export class Hud {
  private n = $('hud-n');
  private t = $('hud-t');
  private myr = $('hud-myr');
  private step = $('hud-step');
  private energy = $('hud-energy');
  private drift = $('hud-drift');
  private merge = $('hud-merge');
  private engine = $('engine-badge');
  private fps = $('fps-badge');
  private dt = $('hud-dt');
  private integrator = $('hud-integrator');
  private virial = $('hud-virial');
  private escape = $('hud-escape');

  private lastFpsUpdate = 0;
  private frames = 0;
  /** 单步耗时做指数平滑，避免首次计算的冷启动峰值吓人。 */
  private stepMsEma = 0;
  /** I3：演化速率 EMA（Myr / 真实秒）。 */
  private rateEma = 0;
  private lastWallMs = 0;
  private lastMyr = 0;

  update(
    diag: Diagnostics,
    snapshot: Snapshot,
    stepMs: number,
    stellar?: StellarConfig,
    playing = true,
  ): void {
    if (stepMs > 0) {
      this.stepMsEma = this.stepMsEma === 0 ? stepMs : this.stepMsEma * 0.82 + stepMs * 0.18;
    }
    const smoothStep = this.stepMsEma;
    const simText =
      snapshot.weight > 1
        ? `${formatCount(diag.simulated)} / ${formatCount(diag.requested)}`
        : formatInt(diag.simulated);
    this.n.textContent = simText;
    this.n.title =
      snapshot.weight > 1
        ? `统计采样：${formatInt(diag.simulated)} 个代表粒子，每个代表 ${snapshot.weight.toFixed(1)} 颗真实恒星`
        : `全量逐体积分 ${formatInt(diag.simulated)} 个天体`;

    this.t.textContent = diag.time.toFixed(2);
    this.step.textContent = formatInt(diag.step);
    this.dt.textContent = formatNumber(diag.dtEff ?? 0, 4);
    this.integrator.textContent = diag.integrator ?? '—';
    this.virial.textContent = diag.virial === null ? '—' : diag.virial.toFixed(3);
    this.escape.textContent = formatInt(diag.escapeCount);

    // I3：物理时钟（Myr 换算 + 演化速率 = ΔMyr / Δ真实秒，EMA 平滑）
    if (stellar) {
      const myr = physTime(diag.time, stellar);
      const now = performance.now();
      if (this.lastWallMs > 0 && myr > this.lastMyr) {
        const instant = (myr - this.lastMyr) / ((now - this.lastWallMs) / 1000);
        this.rateEma = this.rateEma === 0 ? instant : this.rateEma * 0.9 + instant * 0.1;
      }
      this.myr.textContent = `${myr < 1e4 ? myr.toFixed(2) : myr.toExponential(2)} Myr · ${
        playing && this.rateEma > 0
          ? this.rateEma < 1e4 ? this.rateEma.toFixed(1) : this.rateEma.toExponential(2)
          : '0'
      }/s`;
      this.lastWallMs = now;
      this.lastMyr = myr;
    }

    if (Number.isFinite(diag.totalEnergy)) {
      this.energy.textContent = formatNumber(diag.totalEnergy, 4);
      this.energy.title = `动能 ${formatNumber(diag.kinetic, 4)} · 势能 ${formatNumber(
        diag.potential,
        4,
      )}`;
    } else {
      this.energy.textContent = '—';
      this.energy.title = '大规模下不统计总能量（O(N²) 代价过高）';
    }

    if (diag.energyDrift === null) {
      this.drift.textContent = '—';
      this.drift.className = 'hud-v';
    } else {
      const pct = diag.energyDrift * 100;
      this.drift.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(3)}%`;
      const abs = Math.abs(pct);
      this.drift.className = `hud-v ${abs < 0.05 ? 'good' : abs < 1 ? 'warn' : 'bad'}`;
    }

    this.merge.textContent = formatInt(diag.merged);

    this.engine.textContent = engineLabel(diag.engine);
    this.engine.title = `单步 ${smoothStep.toFixed(2)} ms · ${formatInt(diag.simulated)} 体`;

    const now = performance.now();
    this.frames++;
    if (now - this.lastFpsUpdate > 480) {
      const fps = (this.frames * 1000) / (now - this.lastFpsUpdate);
      this.fps.textContent = `${fps.toFixed(0)} FPS · ${smoothStep.toFixed(1)} ms`;
      this.lastFpsUpdate = now;
      this.frames = 0;
    }
  }
}

function engineLabel(engine: Diagnostics['engine']): string {
  switch (engine) {
    case 'direct':
      return '直接求和 O(N²)';
    case 'barnes-hut':
      return 'Barnes-Hut O(N log N)';
    case 'multipole':
      return '四极多极 O(N log N)';
    case 'particle-mesh':
      return '粒子网格 PM';
    case 'treepm':
      return 'TreePM 混合';
  }
}
