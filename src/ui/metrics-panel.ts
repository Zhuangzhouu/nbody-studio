/** C1：能量 / 动量 / 角动量曲线（原生 2D canvas，零依赖）。 */

import { el } from './widgets';
import type { MetricsSample } from '../core/types';

const SERIES = [
  { key: 'kinetic', label: '动能', color: '#5eead4' },
  { key: 'potential', label: '势能', color: '#f472b6' },
  { key: 'total', label: '总能量', color: '#fbbf24' },
  { key: 'angularMomentum', label: '|L|', color: '#a78bfa' },
] as const;

export class MetricsPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private driftEl: HTMLElement;
  private samples: MetricsSample[] = [];
  private visible = new Set<string>(SERIES.map((s) => s.key));

  constructor(root: HTMLElement) {
    const title = el('div', 'field-hint', '最近 300 次采样 · 勾选显示曲线');
    root.append(title);

    this.canvas = el('canvas');
    this.canvas.width = 640;
    this.canvas.height = 240;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '120px';
    root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    const chips = el('div', 'chips');
    for (const s of SERIES) {
      const btn = el('button', 'chip', s.label);
      btn.type = 'button';
      btn.dataset.key = s.key;
      btn.style.borderColor = s.color;
      btn.addEventListener('click', () => {
        if (this.visible.has(s.key)) this.visible.delete(s.key);
        else this.visible.add(s.key);
        btn.style.opacity = this.visible.has(s.key) ? '1' : '0.4';
        this.draw();
      });
      chips.append(btn);
    }
    root.append(chips);

    this.driftEl = el('div', 'field-hint', '能量漂移：—');
    this.driftEl.id = 'metrics-drift';
    root.append(this.driftEl);
    this.draw();
  }

  clear(): void {
    this.samples.length = 0;
    this.driftEl.textContent = '能量漂移：—（世界已重建）';
    this.draw();
  }

  push(s: MetricsSample): void {
    this.samples.push(s);
    if (this.samples.length > 300) this.samples.shift();
    const drift = s.drift;
    this.driftEl.textContent = Number.isFinite(drift)
      ? `能量漂移：${((drift as number) * 100).toExponential(2)}% · 维里 Q=${s.virial?.toFixed(3) ?? '—'} · 逃逸 ${s.escapeCount}`
      : `能量漂移：样本过大不可用 · 维里 Q=${s.virial?.toFixed(3) ?? '—'} · 逃逸 ${s.escapeCount}`;
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6,11,20,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(125,170,230,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 4);
      ctx.lineTo(w, (h * i) / 4);
      ctx.stroke();
    }
    if (this.samples.length < 2) return;

    for (const series of SERIES) {
      if (!this.visible.has(series.key)) continue;
      let min = Infinity;
      let max = -Infinity;
      for (const s of this.samples) {
        const v = s[series.key];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min)) continue;
      const span = max - min || 1;
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.samples.length; i++) {
        const v = this.samples[i][series.key];
        if (!Number.isFinite(v)) { started = false; continue; }
        const x = (i / (this.samples.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 12) - 6;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
