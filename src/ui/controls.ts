/**
 * 参数面板：规模 / 初始条件 / 物理 / 显示 / JSON 配置。
 *
 *  - 改「天体数量 / 初始条件」→ 标记待应用（重建世界）；
 *  - 改「物理 / 显示」→ 立即生效；
 *  - JSON 区支持文本粘贴、文件导入、完整/压缩/仅参数导出。
 */

import { MAX_BODY_INPUT } from '../core/constants';
import { formatBytes, formatCount, formatInt } from '../core/mathx';
import { STELLAR_COLORS, starLabel } from '../core/stellar';
import {
  DEFAULT_INIT,
  DEFAULT_PHYSICS,
  DEFAULT_VIEW,
  QUALITY_PRESETS,
  qualityFromTheta,
} from '../core/params';
import { resolveStrategy, type Strategy } from '../core/scale-policy';
import { BodyEditor } from './body-editor';
import { MetricsPanel } from './metrics-panel';
import { PerformancePanel } from './perf-panel';
import { PRESETS } from '../core/presets';
import { FewBodyPanel } from './few-body-panel';
import type {
  CollisionMode,
  Dimensions,
  DistributionKind,
  EnginePreference,
  InitParams,
  PhysicsParams,
  SamplingMode,
  SimulationConfig,
  ViewParams,
  BodyConfig,
  StellarEvent,
} from '../core/types';
import { parseBodyCount } from '../core/validation';
import { chip, el, numberField, section, selectField, sliderField, toggleField } from './widgets';

export interface PanelCallbacks {
  onApply: () => void;
  onPhysicsChange: (physics: PhysicsParams) => void;
  onViewChange: (view: ViewParams) => void;
  onInitChange: (init: InitParams) => void;
  /** 从 JSON 文本应用完整配置。 */
  onConfigText: (text: string) => void;
  /** 从文件应用完整配置。 */
  onConfigFile: (file: File) => void;
  /** 导出配置。 */
  onExport: (mode: 'json' | 'gz' | 'params') => void;
  /** 逐条编辑器列表变化。 */
  onBodiesChange: (bodies: BodyConfig[]) => void;
  /** 逐条编辑器点击应用到模拟。 */
  onBodiesApply: (bodies: BodyConfig[]) => void;
  /** 逐条编辑器点击从模拟载入。 */
  onBodiesLoad: () => void;
  /** 应用预设场景。 */
  onPreset: (id: string) => void;
  /** 应用环绕轨道助手。 */
  onOrbitHelper: (radius: number, plane: 'xy' | 'xz' | 'yz') => void;
  /** 移除质心漂移。 */
  onRemoveDrift: (centerPosition: boolean) => void;
  /** 导出轨迹 CSV。 */
  onExportTrail: () => void;
  /** 复制分享链接。 */
  onShareLink: () => void;
  /** 开始/停止录制。 */
  onRecord: () => void;
  /** 导出 PNG。 */
  onExportPng: () => void;
  /** 少体工作台应用配置。 */
  onFewBodyApply: (config: SimulationConfig, label: string) => void;
  /** 撤销/重做。 */
  onUndo: () => void;
  onRedo: () => void;
  /** 读取当前完整配置（少体工作台基底）。 */
  onFewBodyCurrent: () => SimulationConfig;
  /** 画面回放。 */
  onReplay: (direction: -1 | 1) => void;
  onToggleField: () => void;
  /** I2：轻量提示（复制日志等）。 */
  onToast?: (message: string) => void;
}

const DISTRIBUTIONS: Array<{ value: DistributionKind; label: string }> = [
  { value: 'disc', label: '盘（2D 平面 / 3D 带厚度）' },
  { value: 'cloud', label: '弥散星云（2D 圆 / 3D 球）' },
  { value: 'cluster', label: '核聚星团' },
  { value: 'collision', label: '双盘 / 双球对撞' },
  { value: 'binary', label: '双星群落（2D / 3D 轨道面）' },
  { value: 'grid', label: '规则晶格（2D / 3D）' },
];

const COLLISIONS: Array<{ value: CollisionMode; label: string }> = [
  { value: 'none', label: '关闭（穿透）' },
  { value: 'merge', label: '并合（守恒质量与动量）' },
  { value: 'bounce', label: '弹性散射' },
];

const ENGINES: Array<{ value: EnginePreference; label: string }> = [
  { value: 'auto', label: 'auto（按规模自动）' },
  { value: 'direct', label: '直接求和（最精确）' },
  { value: 'barnes-hut', label: 'Barnes-Hut 树（单极）' },
  { value: 'multipole', label: '自适应四极多极（更精确，较慢）' },
  { value: 'particle-mesh', label: '粒子网格 PM' },
  { value: 'treepm', label: 'TreePM（近场 BH + 远场 PM）' },
];

const SAMPLING: Array<{ value: SamplingMode; label: string }> = [
  { value: 'auto', label: 'auto（超过上限才采样）' },
  { value: 'never', label: 'never（绝不采样，风险自负）' },
  { value: 'always', label: 'always（始终按上限采样）' },
];

export class ControlPanel {
  readonly state: { init: InitParams; physics: PhysicsParams; view: ViewParams };

  private cb: PanelCallbacks;
  readonly root: HTMLElement;

  private countInput!: HTMLInputElement;
  private countValueTag!: HTMLElement;
  private countHint!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private strategyEl!: HTMLElement;
  private restitutionWrap!: HTMLElement;
  private thetaSlider!: { root: HTMLElement; set: (v: number) => void };
  private qualitySelect!: HTMLSelectElement;
  private trailSlider!: { root: HTMLElement; set: (v: number) => void };
  private configText!: HTMLTextAreaElement;
  private configStatus!: HTMLElement;
  private bodyEditor!: BodyEditor;
  fewBodyPanel!: FewBodyPanel;
  lastConfigForEditor: SimulationConfig | null = null;
  private dimensionSelect!: HTMLSelectElement;
  private engineSelect!: HTMLSelectElement;
  private samplingSelect!: HTMLSelectElement;
  private integratorSelect!: HTMLSelectElement;
  private collisionSelect!: HTMLSelectElement;
  private colorSelect!: HTMLSelectElement;
  private glowToggle!: HTMLInputElement;
  private gridToggle!: HTMLInputElement;
  private trailsToggle!: HTMLInputElement;

  private countValue = DEFAULT_INIT.count;
  private dirty = false;
  private strategy: Strategy;

  constructor(root: HTMLElement, cb: PanelCallbacks) {
    this.root = root;
    this.cb = cb;
    this.state = {
      init: { ...DEFAULT_INIT },
      physics: { ...DEFAULT_PHYSICS },
      view: { ...DEFAULT_VIEW },
    };
    this.strategy = resolveStrategy(this.countValue, this.state.physics, this.state.view);
    this.build();
  }

  get isDirty(): boolean { return this.dirty; }
  get currentStrategy(): Strategy { return this.strategy; }

  private build(): void {
    this.buildFewBodySection();
    this.buildScaleSection();
    this.buildInitSection();
    this.buildPhysicsSection();
    this.buildPresetSection();
    this.buildViewSection();
    this.buildAnalysisSection();
    this.buildBodyEditorSection();
    this.buildConfigSection();
    this.refreshStrategy();
    this.setDirty(false);
  }

  // ------------------------------------------------------------ 1-10 体工作台

  private buildFewBodySection(): void {
    const { root, body } = section('★ 1–10 体工作台');
    root.classList.add('fb-workbench');
    this.fewBodyPanel = new FewBodyPanel(body, {
      apply: (config, label) => this.cb.onFewBodyApply(config, label),
      current: () => this.cb.onFewBodyCurrent(),
    });
    this.root.append(root);
  }

  // ------------------------------------------------------------ 规模

  private buildScaleSection(): void {
    const { root, body } = section('系统规模');
    root.dataset.collapsed = 'false';

    const field = el('label', 'field');
    const label = el('span', 'field-label');
    label.append(el('span', '', '天体数量 N'));
    this.countValueTag = el('b', 'field-value', formatCount(DEFAULT_INIT.count));
    label.append(this.countValueTag);
    this.countInput = el('input');
    this.countInput.id = 'count-input';
    this.countInput.type = 'text';
    this.countInput.inputMode = 'numeric';
    this.countInput.value = String(DEFAULT_INIT.count);
    this.countInput.spellcheck = false;
    field.append(label, this.countInput);
    this.countHint = el('span', 'field-hint', `1 – ${formatInt(MAX_BODY_INPUT)}（INT_MAX），支持 1e6 写法`);
    field.append(this.countHint);

    const chips = el('div', 'chips');
    for (const [text, n] of [
      ['1,000', 1_000],
      ['1 万', 10_000],
      ['10 万', 100_000],
      ['100 万', 1_000_000],
      ['INT_MAX', MAX_BODY_INPUT],
    ] as Array<[string, number]>) {
      chips.append(chip(text, () => this.setCount(n)));
    }
    field.append(chips);

    this.strategyEl = el('div');
    this.applyBtn = el('button', 'btn btn--apply', '应用并重置');
    this.applyBtn.type = 'button';
    this.applyBtn.addEventListener('click', () => {
      if (this.countOk) this.cb.onApply();
    });

    body.append(field, this.strategyEl, this.applyBtn);
    this.root.append(root);

    this.countInput.addEventListener('input', () => this.onCountEdited());
    this.countInput.addEventListener('blur', () => this.onCountEdited());
  }

  private countOk = true;

  private onCountEdited(): void {
    const result = parseBodyCount(this.countInput.value);
    if (result.ok) {
      this.countOk = true;
      this.countValue = result.value;
      this.countValueTag.textContent = formatCount(result.value);
      this.countInput.classList.remove('invalid');
      this.countHint.textContent = result.note
        ? `${result.note}，实际使用 ${formatInt(result.value)}`
        : `1 – ${formatInt(MAX_BODY_INPUT)}（INT_MAX），支持 1e6 写法`;
      this.countHint.style.color = '';
      this.state.init.count = result.value;
      this.markDirty();
      this.refreshStrategy();
    } else {
      this.countOk = false;
      this.countInput.classList.add('invalid');
      this.countHint.textContent = result.message;
      this.countHint.style.color = 'var(--danger)';
      this.applyBtn.disabled = true;
    }
  }

  // ------------------------------------------------------------ 初始条件

  private buildInitSection(): void {
    const { root, body } = section('初始条件（位置 / 速度）');
    body.append(
      selectField<DistributionKind>({
        label: '分布形态',
        value: this.state.init.distribution,
        options: DISTRIBUTIONS,
        onChange: (v) => { this.state.init.distribution = v; this.markDirty(); },
      }).root,
    );
    body.append(
      numberField({
        label: '系统半径',
        value: this.state.init.radius,
        min: 1,
        max: 1e6,
        step: 1,
        onCommit: (v) => { this.state.init.radius = v; this.markDirty(); },
      }).root,
    );
    const massRow = el('div', 'row');
    massRow.append(
      numberField({
        label: '质量下限',
        value: this.state.init.massMin,
        min: 1e-6,
        max: 1e9,
        step: 0.1,
        onCommit: (v) => { this.state.init.massMin = Math.min(v, this.state.init.massMax); this.markDirty(); },
      }).root,
      numberField({
        label: '质量上限',
        value: this.state.init.massMax,
        min: 1e-6,
        max: 1e9,
        step: 0.1,
        onCommit: (v) => { this.state.init.massMax = Math.max(v, this.state.init.massMin); this.markDirty(); },
      }).root,
    );
    body.append(massRow);
    body.append(
      toggleField({
        label: '总质量归一（不同 N 下轨道尺度一致）',
        value: this.state.init.normalizeMass,
        onChange: (v) => { this.state.init.normalizeMass = v; this.markDirty(); },
      }).root,
    );
    body.append(
      numberField({
        label: '系统总质量',
        value: this.state.init.totalMass,
        min: 1e-6,
        max: 1e12,
        step: 100,
        onCommit: (v) => { this.state.init.totalMass = v; this.markDirty(); },
      }).root,
    );
    body.append(
      sliderField({
        label: '旋转强度',
        value: this.state.init.spin,
        min: 0,
        max: 1.6,
        step: 0.02,
        format: (v) => `${v.toFixed(2)}×`,
        hint: '1.0 = 圆轨道速度',
        onInput: (v) => { this.state.init.spin = v; this.markDirty(); },
      }).root,
    );
    body.append(
      sliderField({
        label: '速度扰动',
        value: this.state.init.jitter,
        min: 0,
        max: 0.3,
        step: 0.005,
        format: (v) => `${(v * 100).toFixed(1)}%`,
        onInput: (v) => { this.state.init.jitter = v; this.markDirty(); },
      }).root,
    );
    body.append(
      sliderField({
        label: 'z 向厚度（仅 3D 盘）',
        value: this.state.init.thickness,
        min: 0,
        max: 0.5,
        step: 0.005,
        format: (v) => `${(v * 100).toFixed(1)}% R`,
        onInput: (v) => { this.state.init.thickness = v; this.markDirty(); },
      }).root,
    );
    const seedRow = el('label', 'field');
    seedRow.append(el('span', 'field-label', '随机种子'));
    const seedInput = el('input');
    seedInput.type = 'text';
    seedInput.value = String(this.state.init.seed);
    seedInput.addEventListener('change', () => {
      const value = Number(seedInput.value);
      if (Number.isFinite(value)) {
        this.state.init.seed = Math.abs(Math.floor(value)) >>> 0;
        seedInput.value = String(this.state.init.seed);
        this.markDirty();
      }
    });
    seedRow.append(seedInput);
    const seedChips = el('div', 'chips');
    seedChips.append(chip('换个种子', () => {
      this.state.init.seed = (Math.random() * 0xffffffff) >>> 0;
      seedInput.value = String(this.state.init.seed);
      this.markDirty();
    }));
    seedRow.append(seedChips);
    body.append(seedRow);
    this.root.append(root);
  }

  // ------------------------------------------------------------ 物理

  private buildPhysicsSection(): void {
    const { root, body } = section('物理与引擎');
    body.append(
      (() => {
        const field = selectField({
          label: '维度',
          value: String(this.state.physics.dimensions),
          options: [
            { value: '2', label: '2D（平面，z = 0）' },
            { value: '3', label: '3D（完整 xyz）' },
          ],
          onChange: (v) => {
            const dim = Number(v) as Dimensions;
            this.bodyEditor?.setDimensions(dim);
            this.commitPhysics({ dimensions: dim });
            this.markDirty();
          },
        });
        this.dimensionSelect = field.select;
        return field.root;
      })(),
    );
    body.append(
      (() => {
        const field = selectField<EnginePreference>({
          label: '求解引擎',
          value: this.state.physics.engine,
          options: ENGINES,
          onChange: (v) => this.commitPhysics({ engine: v }),
        });
        this.engineSelect = field.select;
        return field.root;
      })(),
    );
    body.append(
      (() => {
        const field = selectField<SamplingMode>({
          label: '采样策略',
          value: this.state.physics.sampling,
          options: SAMPLING,
          onChange: (v) => this.commitPhysics({ sampling: v }),
        });
        this.samplingSelect = field.select;
        return field.root;
      })(),
    );
    body.append(
      numberField({
        label: '逐体积分上限（auto 采样）',
        value: this.state.physics.maxSimulated,
        min: 0,
        max: MAX_BODY_INPUT,
        step: 100000,
        integer: true,
        hint: '0 = 不设上限；never 模式下忽略该值',
        onCommit: (v) => this.commitPhysics({ maxSimulated: v }),
      }).root,
    );
    body.append(
      numberField({
        label: 'PM 网格（每轴，2 的幂）',
        value: this.state.physics.pmGrid || 64,
        min: 0,
        max: 512,
        step: 8,
        integer: true,
        hint: '0 = 自动；越大越精确，代价 ∝ 格数³',
        onCommit: (v) => this.commitPhysics({ pmGrid: v }),
      }).root,
    );
    body.append(
      toggleField({
        label: '自适应步长（近距交会缩小 dt）',
        value: this.state.physics.adaptiveDt,
        onChange: (v) => this.commitPhysics({ adaptiveDt: v }),
      }).root,
    );
    body.append(
      numberField({
        label: '步长安全系数',
        value: this.state.physics.dtSafety,
        min: 1e-6,
        max: 1,
        step: 0.05,
        onCommit: (v) => this.commitPhysics({ dtSafety: v }),
      }).root,
    );
    body.append(
      numberField({
        label: 'TreePM 分界（格距倍数）',
        value: this.state.physics.rSplitGrids,
        min: 0.1,
        max: 20,
        step: 0.5,
        onCommit: (v) => this.commitPhysics({ rSplitGrids: v }),
      }).root,
    );
    body.append(
      numberField({
        label: '逃逸半径（0 = 系统半径×10）',
        value: this.state.physics.escapeRadius,
        min: 0,
        max: 1e6,
        step: 10,
        onCommit: (v) => this.commitPhysics({ escapeRadius: v }),
      }).root,
    );
    body.append(
      numberField({
        label: '引力常数 G',
        value: this.state.physics.G,
        min: 1e-9,
        max: 1e6,
        step: 0.1,
        onCommit: (v) => this.commitPhysics({ G: v }),
      }).root,
    );
    body.append(
      numberField({
        label: '时间步长 dt',
        value: this.state.physics.dt,
        min: 1e-8,
        max: 10,
        step: 0.001,
        onCommit: (v) => this.commitPhysics({ dt: v }),
      }).root,
    );
    body.append(
      numberField({
        label: '软化长度 ε',
        value: this.state.physics.softening,
        min: 0,
        max: 1e4,
        step: 0.05,
        onCommit: (v) => this.commitPhysics({ softening: v }),
      }).root,
    );

    const quality = selectField({
      label: '精度预设（Barnes-Hut 开角 θ）',
      value: qualityFromTheta(this.state.physics.theta) as string,
      options: QUALITY_PRESETS.map((p) => ({ value: p.id, label: p.label })),
      onChange: (v) => {
        const preset = QUALITY_PRESETS.find((p) => p.id === v);
        if (!preset) return;
        this.state.physics.theta = preset.theta;
        this.thetaSlider.set(preset.theta);
        this.commitPhysics({});
      },
    });
    this.qualitySelect = quality.select;
    body.append(quality.root);
    this.thetaSlider = sliderField({
      label: '开角 θ（手动）',
      value: this.state.physics.theta,
      min: 0.05,
      max: 1.5,
      step: 0.01,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        this.state.physics.theta = v;
        this.qualitySelect.value = qualityFromTheta(v);
        this.commitPhysics({});
      },
    });
    body.append(this.thetaSlider.root);

    body.append(
      (() => {
        const field = selectField({
          label: '积分器（任意引擎可用）',
          value: this.state.physics.integrator,
          options: [
            { value: 'verlet', label: 'Velocity Verlet（辛，推荐）' },
            { value: 'rk4', label: 'RK4（四阶，4 倍求力）' },
            { value: 'yoshida4', label: 'Yoshida4（辛，3 倍求力）' },
          ],
          onChange: (v) => this.commitPhysics({ integrator: v as PhysicsParams['integrator'] }),
        });
        this.integratorSelect = field.select;
        return field.root;
      })(),
    );
    body.append(
      (() => {
        const field = selectField<CollisionMode>({
          label: '碰撞处理',
          value: this.state.physics.collision,
          options: COLLISIONS,
          onChange: (v) => {
            this.restitutionWrap.style.display = v === 'bounce' ? '' : 'none';
            this.commitPhysics({ collision: v });
          },
        });
        this.collisionSelect = field.select;
        return field.root;
      })(),
    );
    const restitution = sliderField({
      label: '恢复系数 e',
      value: this.state.physics.restitution,
      min: 0,
      max: 1,
      step: 0.02,
      format: (v) => v.toFixed(2),
      onInput: (v) => this.commitPhysics({ restitution: v }),
    });
    this.restitutionWrap = restitution.root;
    this.restitutionWrap.style.display = this.state.physics.collision === 'bounce' ? '' : 'none';
    body.append(this.restitutionWrap);
    body.append(
      sliderField({
        label: '天体半径系数',
        value: this.state.physics.bodyRadius,
        min: 0.001,
        max: 10,
        step: 0.01,
        format: (v) => v.toFixed(3),
        onInput: (v) => this.commitPhysics({ bodyRadius: v }),
      }).root,
    );
    this.root.append(root);
  }

  // ------------------------------------------------------------ 显示

  private buildViewSection(): void {
    const { root, body } = section('显示与轨迹');
    body.append(
      (() => {
        const field = selectField({
          label: '颜色映射',
          value: this.state.view.colorMode,
          options: [
            { value: 'speed', label: '速度（蓝 → 青 → 暖白）' },
            { value: 'mass', label: '质量（靛 → 品红 → 金）' },
            { value: 'radius', label: '距心距离' },
            { value: 'stellar', label: '恒星光谱（O B A F G K M / 遗骸）' },
          ],
          onChange: (v) => { this.state.view.colorMode = v as ViewParams['colorMode']; this.cb.onViewChange(this.state.view); },
        });
        this.colorSelect = field.select;
        return field.root;
      })(),
    );
    body.append(
      sliderField({
        label: '点大小',
        value: this.state.view.pointSize,
        min: 0.5,
        max: 12,
        step: 0.1,
        format: (v) => `${v.toFixed(1)} px`,
        onInput: (v) => { this.state.view.pointSize = v; this.cb.onViewChange(this.state.view); },
      }).root,
    );
    body.append(
      (() => {
        const f = toggleField({
          label: '辉光',
          value: this.state.view.glow,
          onChange: (v) => { this.state.view.glow = v; this.cb.onViewChange(this.state.view); },
        });
        this.glowToggle = f.input;
        return f.root;
      })(),
    );
    body.append(
      (() => {
        const f = toggleField({
          label: '参考网格',
          value: this.state.view.showGrid,
          onChange: (v) => { this.state.view.showGrid = v; this.cb.onViewChange(this.state.view); },
        });
        this.gridToggle = f.input;
        return f.root;
      })(),
    );
    body.append(
      (() => {
        const f = toggleField({
          label: '轨迹线',
          value: this.state.view.trails,
          onChange: (v) => {
            this.state.view.trails = v;
            this.trailSlider.root.style.display = v ? '' : 'none';
            this.cb.onViewChange(this.state.view);
          },
        });
        this.trailsToggle = f.input;
        return f.root;
      })(),
    );
    this.trailSlider = sliderField({
      label: '轨迹亮度',
      value: this.state.view.trailLength,
      min: 0.1,
      max: 2,
      step: 0.05,
      format: (v) => `${v.toFixed(2)}×`,
      onInput: (v) => { this.state.view.trailLength = v; this.cb.onViewChange(this.state.view); },
    });
    body.append(this.trailSlider.root);
    body.append(
      numberField({
        label: '记录轨迹的天体数（0 = 全部）',
        value: this.state.view.trailBodies,
        min: 0,
        max: MAX_BODY_INPUT,
        step: 100,
        integer: true,
        onCommit: (v) => { this.state.view.trailBodies = v; this.cb.onViewChange(this.state.view); },
      }).root,
    );
    body.append(
      numberField({
        label: '每体历史点数',
        value: this.state.view.trailPoints,
        min: 2,
        max: 10000,
        step: 8,
        integer: true,
        onCommit: (v) => { this.state.view.trailPoints = v; this.cb.onViewChange(this.state.view); },
      }).root,
    );
    body.append(
      numberField({
        label: '每帧最大绘制点数（0 = 全部）',
        value: this.state.view.maxRenderPoints,
        min: 0,
        max: MAX_BODY_INPUT,
        step: 50000,
        integer: true,
        onCommit: (v) => { this.state.view.maxRenderPoints = v; this.cb.onViewChange(this.state.view); },
      }).root,
    );
    this.root.append(root);
  }

  // ------------------------------------------------------------ 预设场景

  private buildPresetSection(): void {
    const { root, body } = section('预设场景');
    const sel = el('select');
    sel.id = 'preset-select';
    for (const p of PRESETS) {
      const o = el('option');
      o.value = p.id;
      o.textContent = `${p.name}（${p.dimensions}D · ${p.build().init.count} 体）`;
      sel.append(o);
    }
    const desc = el('div', 'field-hint', PRESETS[0].description);
    const seedHint = el('div', 'field-hint', `种子：${PRESETS[0].build().init.seed}`);
    seedHint.style.fontSize = '10px';
    sel.addEventListener('change', () => {
      const p = PRESETS.find((x) => x.id === sel.value);
      if (p) {
        desc.textContent = p.description;
        seedHint.textContent = `种子：${p.build().init.seed}`;
      }
    });
    const conflictHint = el('div', 'field-hint', '载入预设不会改变快捷键；若发现键位冲突可在帮助面板（?）查看全部 63 项。');
    conflictHint.style.fontSize = '10px';
    const apply = el('button', 'btn btn--apply', '载入预设');
    apply.type = 'button';
    apply.id = 'preset-apply';
    apply.addEventListener('click', () => this.cb.onPreset(sel.value));
    body.append(sel, desc, seedHint, conflictHint, apply);
    this.root.append(root);
  }

  // ------------------------------------------------------------ 分析诊断

  metricsPanel!: MetricsPanel;
  perfPanel!: PerformancePanel;
  private eventsEl!: HTMLElement;
  private starCardEl!: HTMLElement;
  private events: StellarEvent[] = [];
  private eventFilter = 'all';

  /**
   * G2→I2：接收演化事件流。环形缓冲 200，倒序展示最近 50 条，遗骸行带色点；
   * I1：最近一条事件的恒星快照渲染为「最近演化天体」信息卡。
   */
  pushEvents(items: StellarEvent[]): void {
    if (!items.length) return;
    this.events.push(...items);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    this.renderEvents();
    const last = this.events[this.events.length - 1];
    if (last?.star) this.renderStarCard(last);
  }

  /** I2：清空日志（世界重建时调用）。 */
  clearEvents(): void {
    this.events.length = 0;
    this.eventsEl.innerHTML = '';
    this.starCardEl.innerHTML = '';
  }

  private renderEvents(): void {
    this.eventsEl.innerHTML = '';
    let filtered = this.events;
    if (this.eventFilter === 'remnant') filtered = this.events.filter((e) => !!e.remnant);
    else if (this.eventFilter === 'phase') filtered = this.events.filter((e) => !e.remnant);
    const view = filtered.slice(-50).reverse();
    for (const e of view) {
      const row = el('div', 'field-hint');
      const dot = el('span', 'ev-dot');
      if (e.star?.type) {
        const hex = STELLAR_COLORS[e.star.type as keyof typeof STELLAR_COLORS] ?? '#8a8f98';
        dot.style.background = hex;
        dot.title = e.star.type;
      } else if (e.remnant) {
        dot.style.background = '#fbbf24';
      } else {
        dot.style.background = '#94a3b8';
      }
      row.append(dot, el('span', undefined, `t=${e.t < 1e4 ? e.t.toFixed(2) : e.t.toExponential(2)} Myr · #${e.bodyId} ${e.text}`));
      this.eventsEl.append(row);
    }
  }

  private renderStarCard(e: StellarEvent): void {
    const s = e.star!;
    this.starCardEl.innerHTML = '';
    const head = el('div', 'field-hint');
    const dot = el('span', 'ev-dot');
    dot.style.background = STELLAR_COLORS[s.type as keyof typeof STELLAR_COLORS] ?? '#8a8f98';
    dot.style.width = '10px';
    dot.style.height = '10px';
    head.append(dot, el('b', undefined, `#${e.bodyId} ${starLabel(s.type as never)}`));
    this.starCardEl.append(head);
    const info = el('div', 'field-hint');
    info.textContent = `${s.massPhys.toFixed(2)} M☉ · 年龄 ${fmtMyr(s.ageMyr)} · 相位：${s.phase}`;
    this.starCardEl.append(info);
    const barWrap = el('div', 'life-bar');
    const frac = s.phaseEndMyr > 0 ? Math.min(1, Math.max(0, s.ageMyr / s.phaseEndMyr)) : 1;
    const bar = el('div', 'life-bar-fill');
    bar.style.width = `${(frac * 100).toFixed(1)}%`;
    barWrap.append(bar);
    this.starCardEl.append(barWrap);
    const cap = el('div', 'field-hint');
    cap.textContent = s.phaseEndMyr > 0
      ? `相位进度 ${s.ageMyr.toFixed(1)} / ${fmtMyr(s.phaseEndMyr)} Myr（${(frac * 100).toFixed(0)}%）`
      : '相位时长不限（遗骸/永驻）';
    cap.style.opacity = '0.75';
    this.starCardEl.append(cap);
  }

  private buildAnalysisSection(): void {
    const { root, body } = section('分析诊断与性能');
    root.dataset.collapsed = 'true';
    this.metricsPanel = new MetricsPanel(body);
    this.perfPanel = new PerformancePanel(body);
    // I1：最近演化天体信息卡
    const cardTitle = el('div', 'field-hint');
    cardTitle.textContent = '最近演化天体（I1）：';
    cardTitle.style.fontWeight = '600';
    this.starCardEl = el('div', 'stellar-card');
    this.starCardEl.id = 'stellar-card';
    body.append(cardTitle, this.starCardEl);
    // I2：演化事件日志
    const logTitle = el('div', 'chips');
    const logLabel = el('span', 'field-hint');
    logLabel.textContent = '演化日志（最近 50 / 缓冲 200）：';
    logLabel.style.fontWeight = '600';
    const copyBtn = el('button', 'chip', '复制全部');
    copyBtn.type = 'button';
    copyBtn.id = 'btn-copy-events';
    copyBtn.addEventListener('click', () => {
      const text = this.events.map((e) => `t=${e.t.toFixed(2)} Myr #${e.bodyId} ${e.text}`).join('\n');
      void navigator.clipboard?.writeText(text).then(
        () => this.cb.onToast?.('已复制演化日志'),
        () => this.cb.onToast?.('复制失败：浏览器不支持剪贴板'),
      );
    });
    logTitle.append(logLabel, copyBtn);
    this.eventsEl = el('div', 'stellar-events');
    this.eventsEl.id = 'stellar-events';
    body.append(logTitle, this.eventsEl);

    const row = el('div', 'chips');
    const drift = el('button', 'chip', '消除质心漂移');
    drift.type = 'button';
    drift.id = 'btn-remove-drift';
    drift.addEventListener('click', () => this.cb.onRemoveDrift(false));
    const recenter = el('button', 'chip', '质心归零');
    recenter.type = 'button';
    recenter.addEventListener('click', () => this.cb.onRemoveDrift(true));
    const trailCsv = el('button', 'chip', '导出轨迹 CSV');
    trailCsv.type = 'button';
    trailCsv.id = 'btn-export-trail';
    trailCsv.addEventListener('click', () => this.cb.onExportTrail());
    row.append(drift, recenter, trailCsv);
    body.append(row);

    const share = el('div', 'chips');
    const link = el('button', 'chip', '复制分享链接');
    link.type = 'button';
    link.id = 'btn-share';
    link.addEventListener('click', () => this.cb.onShareLink());
    const png = el('button', 'chip', '导出 PNG');
    png.type = 'button';
    png.id = 'btn-export-png';
    png.addEventListener('click', () => this.cb.onExportPng());
    const rec = el('button', 'chip', '录制 WEBM');
    rec.type = 'button';
    rec.id = 'btn-record';
    rec.addEventListener('click', () => this.cb.onRecord());
    share.append(link, png, rec);
    body.append(share);

    const replay = el('div', 'chips');
    const back = el('button', 'chip', '◀ 回放');
    back.type = 'button';
    back.addEventListener('click', () => this.cb.onReplay(-1));
    const fwd = el('button', 'chip', '回放 ▶');
    fwd.type = 'button';
    fwd.addEventListener('click', () => this.cb.onReplay(1));
    replay.append(back, fwd);
    const fieldBtn = el('button', 'chip', '势场热力图');
    fieldBtn.type = 'button';
    fieldBtn.id = 'btn-field-overlay';
    fieldBtn.addEventListener('click', () => this.cb.onToggleField());
    replay.append(fieldBtn);
    body.append(replay);
    this.root.append(root);
  }

  // ------------------------------------------------------------ 逐条数据编辑

  private buildBodyEditorSection(): void {
    const { root, body } = section('逐条设置天体数据');
    root.dataset.collapsed = 'true';
    this.bodyEditor = new BodyEditor(body, {
      onChange: (bodies) => this.cb.onBodiesChange(bodies),
      onApply: (bodies) => this.cb.onBodiesApply(bodies),
      onLoad: () => this.cb.onBodiesLoad(),
      onRequestConfig: () => this.lastConfigForEditor,
    }, this.state.physics.dimensions);
    this.root.append(root);
  }

  /** 供外部（JSON 导入 / 模拟载入）同步逐条编辑器列表。 */
  setBodies(bodies: readonly BodyConfig[] | undefined): void {
    this.bodyEditor?.setBodies(bodies ?? []);
  }

  setEditorStatus(message: string, level: 'info' | 'ok' | 'warn' | 'error'): void {
    this.bodyEditor?.setStatus(message, level);
  }

  // ------------------------------------------------------------ JSON 配置

  private buildConfigSection(): void {
    const { root, body } = section('JSON 配置 / 导入导出');
    root.dataset.collapsed = 'true';

    const hint = el('div', 'field-hint',
      '可导出完整逐体状态（x/y/z、vx/vy/vz、质量、引力参数、半径）；导入后完全替代生成器。');
    body.append(hint);

    this.configText = el('textarea');
    this.configText.id = 'config-text';
    this.configText.rows = 6;
    this.configText.spellcheck = false;
    this.configText.placeholder = '在此粘贴 nbody-studio/v2 JSON，或点击“填入参数模板”…';
    body.append(this.configText);

    const row1 = el('div', 'chips');
    row1.append(
      chip('填入参数模板', () => {
        this.configText.value = JSON.stringify(
          {
            schema: 'nbody-studio/v2',
            version: 2,
            dimensions: this.state.physics.dimensions,
            physics: this.state.physics,
            init: this.state.init,
            view: this.state.view,
            run: { playing: true, speed: 1 },
            bodies: [
              { id: 0, x: -1, y: 0, z: 0, vx: 0, vy: -0.5, vz: 0, mass: 1 },
              { id: 1, x: 1, y: 0, z: 0, vx: 0, vy: 0.5, vz: 0, mass: 1, grav: 2 },
            ],
          },
          null,
          2,
        );
        this.setConfigStatus('已填入双体模板：第二颗星的引力参数为 2（质量仍为 1）');
      }),
      chip('从文本应用', () => this.cb.onConfigText(this.configText.value)),
      chip('清空', () => { this.configText.value = ''; this.setConfigStatus(''); }),
    );
    body.append(row1);

    const fileRow = el('label', 'field');
    fileRow.append(el('span', 'field-label', '导入 .json / .json.gz'));
    const file = el('input');
    file.type = 'file';
    file.id = 'config-file';
    file.accept = '.json,.gz';
    file.addEventListener('change', () => {
      if (file.files?.[0]) this.cb.onConfigFile(file.files[0]);
    });
    fileRow.append(file);
    body.append(fileRow);

    const row2 = el('div', 'chips');
    row2.append(
      chip('导出完整 JSON', () => this.cb.onExport('json')),
      chip('导出 gzip', () => this.cb.onExport('gz')),
      chip('仅参数', () => this.cb.onExport('params')),
    );
    body.append(row2);

    this.configStatus = el('div', 'field-hint');
    body.append(this.configStatus);
    this.root.append(root);
  }

  // ------------------------------------------------------------ 快捷键可调用方法

  /** 快捷键修改物理设置，并同步面板控件状态。 */
  applyPhysicsShortcut(patch: Partial<PhysicsParams>): void {
    const dimChanged =
      patch.dimensions !== undefined && patch.dimensions !== this.state.physics.dimensions;
    if (dimChanged && patch.dimensions) this.bodyEditor?.setDimensions(patch.dimensions);
    this.state.physics = { ...this.state.physics, ...patch };
    this.cb.onPhysicsChange(this.state.physics);
    this.refreshStrategy();
    if (dimChanged) this.markDirty();
    this.syncShortcutControls();
  }

  /** 快捷键修改显示设置，并同步面板控件状态。 */
  applyViewShortcut(patch: Partial<ViewParams>): void {
    this.state.view = { ...this.state.view, ...patch };
    this.cb.onViewChange(this.state.view);
    this.refreshStrategy();
    this.syncShortcutControls();
  }

  cycleDimension(): void {
    this.applyPhysicsShortcut({ dimensions: this.state.physics.dimensions === 2 ? 3 : 2 });
  }

  cycleEngine(): void {
    const values = ENGINES.map((e) => e.value);
    const next = values[(values.indexOf(this.state.physics.engine) + 1) % values.length];
    this.applyPhysicsShortcut({ engine: next });
  }

  cycleSampling(): void {
    const values = SAMPLING.map((s) => s.value);
    const next = values[(values.indexOf(this.state.physics.sampling) + 1) % values.length];
    this.applyPhysicsShortcut({ sampling: next });
  }

  cycleIntegrator(): void {
    this.applyPhysicsShortcut({
      integrator: this.state.physics.integrator === 'verlet' ? 'rk4' : 'verlet',
    });
  }

  cycleCollision(): void {
    const values = COLLISIONS.map((c) => c.value);
    const next = values[(values.indexOf(this.state.physics.collision) + 1) % values.length];
    this.applyPhysicsShortcut({ collision: next });
  }

  adjustTheta(delta: number): void {
    const value = Math.min(1.5, Math.max(0.05, Math.round((this.state.physics.theta + delta) * 100) / 100));
    this.applyPhysicsShortcut({ theta: value });
  }

  toggleGlow(): void {
    this.applyViewShortcut({ glow: !this.state.view.glow });
  }

  toggleGrid(): void {
    this.applyViewShortcut({ showGrid: !this.state.view.showGrid });
  }

  toggleTrails(): void {
    this.applyViewShortcut({ trails: !this.state.view.trails });
  }

  cycleColorMode(): void {
    const values: ViewParams['colorMode'][] = ['speed', 'mass', 'radius', 'stellar'];
    const next = values[(values.indexOf(this.state.view.colorMode) + 1) % values.length];
    this.applyViewShortcut({ colorMode: next });
  }

  /** 展开/折叠指定标题的分区。 */
  toggleSection(title: string): boolean {
    const heads = Array.from(this.root.querySelectorAll('.section-head'));
    const head = heads.find((h) => (h.textContent ?? '').includes(title));
    if (!head) return false;
    const section = head.parentElement as HTMLElement | null;
    if (section) section.dataset.collapsed = section.dataset.collapsed === 'true' ? 'false' : 'true';
    return true;
  }

  private syncShortcutControls(): void {
    if (this.dimensionSelect) this.dimensionSelect.value = String(this.state.physics.dimensions);
    if (this.engineSelect) this.engineSelect.value = this.state.physics.engine;
    if (this.samplingSelect) this.samplingSelect.value = this.state.physics.sampling;
    if (this.integratorSelect) this.integratorSelect.value = this.state.physics.integrator;
    if (this.collisionSelect) this.collisionSelect.value = this.state.physics.collision;
    if (this.colorSelect) this.colorSelect.value = this.state.view.colorMode;
    if (this.glowToggle) this.glowToggle.checked = this.state.view.glow;
    if (this.gridToggle) this.gridToggle.checked = this.state.view.showGrid;
    if (this.trailsToggle) this.trailsToggle.checked = this.state.view.trails;
    if (this.trailSlider) this.trailSlider.root.style.display = this.state.view.trails ? '' : 'none';
    if (this.qualitySelect) this.qualitySelect.value = qualityFromTheta(this.state.physics.theta);
    if (this.thetaSlider) this.thetaSlider.set(this.state.physics.theta);
    if (this.restitutionWrap) {
      this.restitutionWrap.style.display = this.state.physics.collision === 'bounce' ? '' : 'none';
    }
  }

  setConfigStatus(text: string): void {
    this.configStatus.textContent = text;
  }

  setConfigText(text: string): void {
    this.configText.value = text;
  }

  /** 从导入的配置同步面板状态。 */
  applyConfigToState(config: SimulationConfig): void {
    this.state.init = { ...config.init };
    this.state.physics = { ...config.physics };
    this.state.view = { ...config.view };
    this.countValue = config.init.count;
    this.lastConfigForEditor = config;
    this.setBodies(config.bodies ?? []);
    this.bodyEditor?.setDimensions(config.dimensions);
    this.countInput.value = String(config.init.count);
    this.countValueTag.textContent = formatCount(config.init.count);
    this.setDirty(true);
    this.refreshStrategy();
    this.syncControlsFromState();
  }

  private syncControlsFromState(): void {
    // 维度等下拉框由重建面板触发的刷新保证一致：这里更新可访问到的关键项
    const selects = this.root.querySelectorAll('select');
    if (selects[0]) selects[0].value = String(this.state.physics.dimensions);
  }

  // ------------------------------------------------------------ 通用

  private commitPhysics(patch: Partial<PhysicsParams>): void {
    this.state.physics = { ...this.state.physics, ...patch };
    this.cb.onPhysicsChange(this.state.physics);
    this.refreshStrategy();
  }

  private markDirty(): void {
    this.setDirty(true);
    this.cb.onInitChange(this.state.init);
    this.refreshStrategy();
  }

  setDirty(value: boolean): void {
    this.dirty = value;
    this.applyBtn.disabled = value ? !this.countOk : true;
    this.applyBtn.classList.toggle('dirty', value);
    this.applyBtn.textContent = value ? '应用并重置' : '已是最新';
  }

  setCount(n: number): void {
    this.countInput.value = String(n);
    this.onCountEdited();
  }

  refreshStrategy(): void {
    const strategy = resolveStrategy(this.countValue, this.state.physics, this.state.view);
    this.strategy = strategy;
    this.renderStrategy(strategy);
  }

  private renderStrategy(s: Strategy): void {
    this.strategyEl.replaceChildren();
    const card = el('div', 'strategy');
    const top = el('div', 'strategy-top');
    top.append(el('span', 'strategy-name', s.label));
    const tier = el('span', 'tier', `TIER ${s.tier}`);
    tier.dataset.tier = String(s.tier);
    top.append(tier);
    card.append(top);

    const grid = el('div', 'strategy-grid');
    const add = (k: string, v: string): void => {
      const cell = el('div');
      cell.append(el('span', '', k), el('b', '', v));
      grid.append(cell);
    };
    add('实际积分', formatCount(s.simulated));
    add('每体权重', s.weight > 1 ? `${s.weight.toFixed(1)}×` : '1×');
    add('单步预估', `${estimateMs(s.engine, s.simulated, s.gridSize).toFixed(1)} ms`);
    add('内存预估', formatBytes(s.estimatedBytes));
    if (s.engine === 'particle-mesh') add('网格', `${s.gridSize}³`);
    if (s.renderStride > 1) add('渲染抽样', `1 / ${s.renderStride}`);
    card.append(grid);
    for (const notice of s.notices) {
      const node = el('div', 'notice', notice.text);
      node.dataset.level = notice.level;
      card.append(node);
    }
    this.strategyEl.append(card);
  }
}

/** I1/I2：Myr 数值显示（<1 万用定点，否则科学计数）。 */
function fmtMyr(v: number): string {
  return v < 1e4 ? v.toFixed(1) : v.toExponential(2);
}

function estimateMs(engine: Strategy['engine'], n: number, grid: number): number {
  if (engine === 'direct') return n * n * 1.6e-6 + n * 1e-5;
  if (engine === 'barnes-hut') return n * Math.log2(Math.max(2, n)) * 5.5e-5;
  if (engine === 'multipole') return n * Math.log2(Math.max(2, n)) * 3.2e-5;
  return n * 4.2e-4 + grid ** 3 * 3e-6;
}
