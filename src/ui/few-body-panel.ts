/**
 * 1–10 体专用工作台：小规模精确模拟的主入口。
 *
 * 设计目标：把常用的「少体」场景从通用控件中抽出来，一屏完成
 * 数量选择 → 构型模板 → 精确物理参数 → 实时状态与轨道要素。
 * 所有配置最终都编译为 SimulationConfig，走与 JSON 导入相同的管线。
 */

import { orbitalElements } from '../core/orbit';
import type { BodyConfig, Diagnostics, SimulationConfig, Snapshot } from '../core/types';
import { chip, el } from './widgets';

export interface FewBodyCallbacks {
  /** 应用完整配置（与预设/JSON 同一入口）。 */
  apply: (config: SimulationConfig, label: string) => void;
  /** 读取当前完整配置（用于以当前状态为基础修改）。 */
  current: () => SimulationConfig;
}

type TemplateId = 'single' | 'binary' | 'figure8' | 'lagrange' | 'star-planets' | 'binary-ring';

interface TemplateDef {
  id: TemplateId;
  name: string;
  hint: string;
  build: (G: number) => BodyConfig[];
  dimensions: 2 | 3;
  dt: number;
}

function orbit(cx: number, cy: number, vx: number, vy: number, r: number, mu: number, phase: number): BodyConfig {
  const v = Math.sqrt(Math.max(1e-12, mu) / r);
  return {
    x: cx + r * Math.cos(phase),
    y: cy + r * Math.sin(phase),
    z: 0,
    vx: vx - v * Math.sin(phase),
    vy: vy + v * Math.cos(phase),
    vz: 0,
    mass: 1,
  };
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'single', name: '单星', hint: '1 体静止，验证积分器', dimensions: 2, dt: 0.02,
    build: () => [{ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1 }],
  },
  {
    id: 'binary', name: '双星圆轨道', hint: '2 等质量体互绕', dimensions: 2, dt: 0.01,
    build: (G) => {
      const d = 8;
      const v = Math.sqrt((G * 1) / (2 * d));
      return [
        { id: 1, x: -d / 2, y: 0, z: 0, vx: 0, vy: -v, vz: 0, mass: 1 },
        { id: 2, x: d / 2, y: 0, z: 0, vx: 0, vy: v, vz: 0, mass: 1 },
      ];
    },
  },
  {
    id: 'figure8', name: 'figure-8 三体', hint: '经典蝴蝶轨道，周期 6.33', dimensions: 2, dt: 0.02,
    build: () => {
      const r1 = 0.97000436;
      const r2 = -0.24308753;
      const v3x = -0.93240737;
      const v3y = -0.86473146;
      return [
        { id: 1, x: r1, y: r2, z: 0, vx: -v3x / 2, vy: -v3y / 2, vz: 0, mass: 1 },
        { id: 2, x: -r1, y: -r2, z: 0, vx: -v3x / 2, vy: -v3y / 2, vz: 0, mass: 1 },
        { id: 3, x: 0, y: 0, z: 0, vx: v3x, vy: v3y, vz: 0, mass: 1 },
      ];
    },
  },
  {
    id: 'lagrange', name: '拉格朗日三角', hint: '3 体等边三角旋转解', dimensions: 2, dt: 0.005,
    build: (G) => {
      const d = 10;
      const m = 10;
      const v = Math.sqrt((G * m) / d);
      const R = d / Math.sqrt(3);
      return [0, 1, 2].map((i) => {
        const a = (i * 2 * Math.PI) / 3;
        return {
          id: i + 1,
          x: R * Math.cos(a), y: R * Math.sin(a), z: 0,
          vx: -v * Math.sin(a), vy: v * Math.cos(a), vz: 0,
          mass: m,
        };
      });
    },
  },
  {
    id: 'star-planets', name: '恒星 + 行星', hint: '中心大质量 + 4 颗圆轨道行星', dimensions: 3, dt: 0.005,
    build: (G) => {
      const M = 1000;
      const bodies: BodyConfig[] = [{ id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: M }];
      for (let i = 0; i < 4; i++) {
        const b = orbit(0, 0, 0, 0, 5 + i * 5, G * M, (i * Math.PI) / 3);
        b.id = i + 1;
        b.mass = 0.1;
        bodies.push(b);
      }
      return bodies;
    },
  },
  {
    id: 'binary-ring', name: '双星 + 环星', hint: '双星互绕 + 外围小天体', dimensions: 2, dt: 0.01,
    build: (G) => {
      const m = 100;
      const d = 8;
      const v = Math.sqrt((G * m) / (2 * d));
      const outer = orbit(0, 0, 0, 0, 30, G * 2 * m, 0);
      outer.id = 3;
      outer.mass = 0.1;
      return [
        { id: 1, x: -d / 2, y: 0, z: 0, vx: 0, vy: -v, vz: 0, mass: m },
        { id: 2, x: d / 2, y: 0, z: 0, vx: 0, vy: v, vz: 0, mass: m },
        outer,
      ];
    },
  },
];

/** 用当前 G 生成随机 N 体圆轨道盘（1–10 体）。 */
function randomFew(count: number, G: number): BodyConfig[] {
  const bodies: BodyConfig[] = [];
  const total = count * 2;
  for (let i = 0; i < count; i++) {
    const r = 6 + (i % 4) * 4;
    const mu = G * total;
    const b = orbit(0, 0, 0, 0, r, mu, (i / count) * Math.PI * 2);
    b.id = i;
    bodies.push(b);
  }
  return bodies;
}

export class FewBodyPanel {
  private count = 2;
  private bodyTable!: HTMLElement;
  private elementLines!: HTMLElement;
  private statusEl!: HTMLElement;
  private countLabel!: HTMLElement;
  private precisionNote!: HTMLElement;
  private lastConfig: SimulationConfig | null = null;
  private selectedTemplate: TemplateDef = TEMPLATES[1];

  constructor(root: HTMLElement, private cb: FewBodyCallbacks) {
    this.build(root);
    this.renderCount();
    // 构造阶段 App 尚未把 panel 引用赋值完成，不能回调 current()；首帧 update() 会填充表格。
    this.bodyTable.textContent = '等待模拟就绪…';
    this.elementLines.textContent = '—';
  }

  private build(root: HTMLElement): void {
    const hint = el('div', 'field-hint', '少体精确模拟专用：直接求和 + 零软化 + 无采样，可逐体查看状态。');
    root.append(hint);

    // 数量选择
    const countBox = el('div', 'fb-count');
    const head = el('div', 'fb-head');
    head.append(el('span', 'fb-label', '天体数量'));
    this.countLabel = el('b', 'field-value', '2 体');
    head.append(this.countLabel);
    countBox.append(head);
    const grid = el('div', 'fb-grid');
    for (let n = 1; n <= 10; n++) {
      const btn = el('button', 'chip fb-num', String(n));
      btn.type = 'button';
      btn.dataset.n = String(n);
      btn.addEventListener('click', () => {
        this.count = n;
        this.renderCount();
        this.applyRandom();
      });
      grid.append(btn);
    }
    countBox.append(grid);
    root.append(countBox);

    // 构型模板
    const tplHead = el('div', 'fb-head');
    tplHead.append(el('span', 'fb-label', '经典构型'));
    root.append(tplHead);
    const tplGrid = el('div', 'chips');
    for (const t of TEMPLATES) {
      const btn = el('button', 'chip', t.name);
      btn.type = 'button';
      btn.title = t.hint;
      btn.addEventListener('click', () => {
        this.selectedTemplate = t;
        this.count = t.build(this.cb.current().physics.G).length;
        this.renderCount();
        this.applyTemplate(t);
      });
      tplGrid.append(btn);
    }
    root.append(tplGrid);

    // 精确模式说明 + 一键校准
    this.precisionNote = el('div', 'field-hint', '');
    root.append(this.precisionNote);
    const actions = el('div', 'chips');
    const precisionBtn = el('button', 'chip', '应用精确模式');
    precisionBtn.type = 'button';
    precisionBtn.id = 'fb-precision';
    precisionBtn.addEventListener('click', () => this.applyPrecision());
    const randomBtn = el('button', 'chip', '随机圆轨道');
    randomBtn.type = 'button';
    randomBtn.id = 'fb-random';
    randomBtn.addEventListener('click', () => this.applyRandom());
    actions.append(precisionBtn, randomBtn);
    root.append(actions);

    // 实时状态表
    const tableHead = el('div', 'fb-head');
    tableHead.append(el('span', 'fb-label', '天体状态（实时）'));
    root.append(tableHead);
    this.bodyTable = el('div', 'fb-table');
    this.bodyTable.id = 'fb-body-table';
    root.append(this.bodyTable);

    const elHead = el('div', 'fb-head');
    elHead.append(el('span', 'fb-label', '双体轨道要素'));
    root.append(elHead);
    this.elementLines = el('div', 'fb-elements');
    this.elementLines.id = 'fb-elements';
    root.append(this.elementLines);

    this.statusEl = el('div', 'be-status');
    this.statusEl.id = 'fb-status';
    root.append(this.statusEl);
  }

  private renderCount(): void {
    this.countLabel.textContent = `${this.count} 体`;
    const btns = this.elementCountButtons();
    for (const b of btns) b.classList.toggle('chip--active', Number((b as HTMLElement).dataset.n) === this.count);
    if (this.lastConfig) {
      this.precisionNote.textContent = `当前：${this.lastConfig.physics.engine} · ${this.lastConfig.physics.integrator} · ε=${this.lastConfig.physics.softening} · dt=${this.lastConfig.physics.dt}`;
    }
  }

  private elementCountButtons(): HTMLElement[] {
    const root = this.bodyTable.closest('.fb-workbench') ?? this.bodyTable.parentElement?.parentElement;
    return root ? Array.from(root.querySelectorAll('.fb-num')) as HTMLElement[] : [];
  }

  /** 以当前配置为基底，替换为指定 bodies 并强制精确参数。 */
  private makeConfig(bodies: BodyConfig[], dimensions: 2 | 3, dt: number): SimulationConfig {
    const base = this.cb.current();
    const physics = {
      ...base.physics,
      dimensions,
      engine: 'direct' as const,
      integrator: 'verlet' as const,
      sampling: 'never' as const,
      softening: 0,
      collision: 'none' as const,
      adaptiveDt: false,
      maxSimulated: 0,
      dt,
    };
    return {
      ...base,
      schema: 'nbody-studio/v2',
      version: 2,
      dimensions,
      physics,
      init: { ...base.init, count: bodies.length },
      view: { ...base.view, trails: true, trailBodies: bodies.length, trailPoints: 120 },
      bodies,
    };
  }

  private applyTemplate(t: TemplateDef): void {
    const G = this.cb.current().physics.G;
    const cfg = this.makeConfig(t.build(G), t.dimensions, t.dt);
    this.lastConfig = cfg;
    this.cb.apply(cfg, `少体模板：${t.name}`);
    this.setStatus(`已载入「${t.name}」${cfg.bodies!.length} 体，直接求和 + 零软化。`, 'ok');
    this.renderCount();
  }

  private applyRandom(): void {
    const G = this.cb.current().physics.G;
    const cfg = this.makeConfig(randomFew(this.count, G), 2, 0.01);
    this.lastConfig = cfg;
    this.cb.apply(cfg, `少体随机 ${this.count} 体`);
    this.setStatus(`已生成 ${this.count} 体圆轨道盘。`, 'ok');
    this.renderCount();
  }

  private applyPrecision(): void {
    const base = this.cb.current();
    const cfg: SimulationConfig = {
      ...base,
      physics: {
        ...base.physics,
        engine: 'direct',
        integrator: 'verlet',
        sampling: 'never',
        softening: 0,
        collision: 'none',
        adaptiveDt: false,
        maxSimulated: 0,
      },
      view: { ...base.view, trails: true, trailBodies: Math.min(10, base.init.count) },
    };
    this.lastConfig = cfg;
    this.cb.apply(cfg, '少体精确模式');
    this.setStatus('已切换：直接求和 / Verlet / 零软化 / 无采样 / 无碰撞。', 'ok');
    this.renderCount();
  }

  /** 每帧刷新状态表与双体轨道要素。 */
  update(snapshot: Snapshot | null, diag: Diagnostics | null): void {
    this.renderTable(snapshot, diag);
  }

  private renderTable(snapshot: Snapshot | null, diag: Diagnostics | null): void {
    let cfg: SimulationConfig | null = this.lastConfig;
    if (!cfg) {
      try { cfg = this.cb.current(); } catch { cfg = null; }
    }
    if (!cfg) { this.bodyTable.textContent = '—'; return; }
    const bodies = cfg.bodies ?? [];
    if (!snapshot || !bodies.length) {
      this.bodyTable.textContent = '—';
      this.elementLines.textContent = '—';
      return;
    }
    const rows: string[] = ['<div class="fb-row fb-row--head"><span>#</span><span>r</span><span>|v|</span><span>m</span><span>μ</span></div>'];
    const states: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number }> = [];
    const useZ = snapshot.dimensions === 3;
    for (let i = 0; i < Math.min(bodies.length, 10); i++) {
      const o = i * 5;
      if (o + 4 >= snapshot.vertex.length) break;
      const x = snapshot.vertex[o];
      const y = snapshot.vertex[o + 1];
      const z = useZ ? snapshot.vertex[o + 2] : 0;
      const b = bodies[i];
      const r = Math.hypot(x, y, z);
      const sv = snapshot.velocities;
      const vx = sv ? sv[i * 3] : b.vx;
      const vy = sv ? sv[i * 3 + 1] : b.vy;
      const vz = sv && useZ ? sv[i * 3 + 2] : (b.vz ?? 0);
      const speed = Math.hypot(vx, vy, vz);
      // R33/R34：逐体动能与比角动量放进 title，避免破坏 5 列布局
      const ke = 0.5 * b.mass * (vx * vx + vy * vy + vz * vz);
      const h = Math.hypot(y * vz - z * vy, z * vx - x * vz, x * vy - y * vx);
      rows.push(
        `<div class="fb-row" title="Eₖ=${ke.toFixed(4)} · h=${h.toFixed(4)}">` +
        `<span>${b.id ?? i}</span><span>${r.toFixed(3)}</span>` +
        `<span>${speed.toFixed(3)}</span><span>${b.mass.toFixed(3)}</span><span>${(b.grav ?? b.mass).toFixed(3)}</span></div>`,
      );
      states.push({ x, y, z, vx, vy, vz });
    }
    this.bodyTable.innerHTML = rows.join('');
    // T33/T34：总质量与质心速度汇总（独立行，不破坏表格 5 列布局）
    let totalMass = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < Math.min(bodies.length, 10); i++) {
      const b = bodies[i];
      const sv = snapshot.velocities;
      const vx = sv ? sv[i * 3] : b.vx;
      const vy = sv ? sv[i * 3 + 1] : b.vy;
      const vz = sv ? sv[i * 3 + 2] : (b.vz ?? 0);
      totalMass += b.mass;
      px += b.mass * vx; py += b.mass * vy; pz += b.mass * vz;
    }
    const summary = el('div', 'fb-row');
    summary.style.color = '#7dd3fc';
    summary.innerHTML = `<span>Σ</span><span>m=${totalMass.toFixed(3)}</span>` +
      `<span>|P|=${Math.hypot(px, py, pz).toFixed(3)}</span><span>—</span><span>—</span>`;
    this.bodyTable.append(summary);

    if (states.length === 2 && cfg.physics.G > 0) {
      const mu = cfg.physics.G * ((bodies[0].grav ?? bodies[0].mass) + (bodies[1].grav ?? bodies[1].mass));
      const el = orbitalElements(states[0], states[1], mu, useZ);
      if (el && Number.isFinite(el.a)) {
        this.elementLines.textContent =
          `a=${el.a.toFixed(3)} · e=${el.e.toFixed(4)} · ` +
          (el.escape ? '逃逸轨道' : `T=${el.period?.toFixed(3)}`) +
          (diag ? ` · |L|=${diag.angularMomentum.toFixed(3)} · 漂移=${diag.energyDrift === null ? '—' : (diag.energyDrift * 100).toExponential(2) + '%'}` : '');
      } else {
        this.elementLines.textContent = '轨道退化（重合或 μ≤0）';
      }
    } else {
      this.elementLines.textContent = states.length === 2 ? '—' : `选中恰好 2 体时显示 a / e / T（当前 ${states.length} 体）`;
    }
  }

  private setStatus(text: string, level: 'info' | 'ok' | 'warn' | 'error'): void {
    this.statusEl.textContent = text;
    this.statusEl.dataset.level = level;
  }
}
