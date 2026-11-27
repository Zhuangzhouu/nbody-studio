/**
 * 应用编排层：连接渲染器 / 物理 Worker / 控制面板 / HUD / 相机。
 * 主线程只做两件事：按倍速请求步进、把最新快照画出来。
 * 额外负责 JSON 配置的导入导出与 3D 相机交互。
 */

import {
  bodiesFromSet,
  configFromParams,
  configToJSON,
  downloadBlob,
  gunzip,
  gzip,
  parseConfigText,
} from '../core/config/serialize';
import { parseConfigFile } from '../core/config/stream';
import type { ValidationResult } from '../core/config/validate';
import type { BodyConfig, Diagnostics, SimulationConfig, Snapshot } from '../core/types';
import { Camera } from '../render/camera';
import { Renderer } from '../render/renderer';
import { ControlPanel } from './controls';
import { HelpOverlay } from './help';
import { Hud } from './hud';
import { ShortcutManager, type ShortcutDefinition } from './shortcuts';
import { PhysicsClient } from '../worker/client';
import {
  CanvasInteractions,
  ConfigHistory,
  type EnhancedHost,
  makeShareUrl,
  readShareHash,
  ReplayBuffer,
  Recorder,
  TouchGestures,
  type Selection,
} from './app-enhanced';
import { presetById } from '../core/presets';
import { DEFAULT_PHYSICS } from '../core/params';
import { FieldOverlay } from './field-overlay';
import { guardConfigText, guardImportFile, RateLimiter, WorkerWatchdog } from './guard';
import { CollabClient, defaultRelayUrl, type Member } from '../net/collab';
import { CollabPanel } from './collab-panel';

class App {
  private renderer: Renderer;
  private camera = new Camera();
  private client: PhysicsClient;
  private panel: ControlPanel;
  private hud = new Hud();
  private shortcuts = new ShortcutManager();
  private help!: HelpOverlay;

  private snapshot: Snapshot | null = null;
  private diagnostics: Diagnostics | null = null;
  private playing = true;
  private stepAccumulator = 0;
  private speed = 1;
  private lastTime = performance.now();
  private bootDone = false;
  private bodiesOverride: BodyConfig[] | null = null;
  private lastConfig: SimulationConfig | null = null;
  private pendingBodiesExport: ((bodies: BodyConfig[]) => void) | null = null;
  private loadIntoEditor = false;
  private pendingBodiesLoad = false;
  private interactions!: CanvasInteractions;
  private history = new ConfigHistory();
  private recorder!: Recorder;
  private selection: Selection = null;
  private replayFrames: Array<{ vertex: Float32Array; count: number; step: number }> = [];
  private replayIndex = -1;
  private replayActive = false;
  private fieldOverlay!: FieldOverlay;
  private rebuildLimiter = new RateLimiter();
  private workerWatchdog: WorkerWatchdog | null = null;
  private collab: CollabClient | null = null;
  private collabPanel!: CollabPanel;
  private applyingRemote = false;
  private selfId = -1;
  private lastCameraPublish = 0;

  private playBtn = document.getElementById('btn-play') as HTMLButtonElement;
  private stepBtn = document.getElementById('btn-step') as HTMLButtonElement;
  private resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
  private speedInput = document.getElementById('speed') as HTMLInputElement;
  private speedLabel = document.getElementById('speed-value') as HTMLElement;
  private playLabel = document.getElementById('lbl-play') as HTMLElement;
  private playIcon = document.getElementById('ico-play') as HTMLElement;
  private panelBody = document.getElementById('panel-body') as HTMLElement;
  private boot = document.getElementById('boot') as HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.client = new PhysicsClient();

    this.panel = new ControlPanel(this.panelBody, {
      onApply: () => this.apply(),
      onPhysicsChange: (physics) => {
        this.camera.dimensions = physics.dimensions;
        this.client.setPhysics(physics);
      },
      onViewChange: (view) => this.client.setView(view),
      // 用户改动初始条件/数量即离开「显式逐体配置」模式
      onInitChange: () => { this.bodiesOverride = null; },
      onConfigText: (text) => this.importText(text),
      onConfigFile: (file) => void this.importFile(file),
      onExport: (mode) => this.exportConfig(mode),
      onBodiesChange: (bodies) => {
        this.bodiesOverride = bodies.length ? bodies : null;
      },
      onBodiesApply: (bodies) => {
        this.bodiesOverride = bodies;
        this.lastConfig = null;
        void this.rebuild(true);
      },
      onPreset: (id) => this.applyPreset(id),
      onOrbitHelper: (radius, plane) => {
        const bodies = this.bodiesOverride ?? this.lastConfig?.bodies ?? [];
        if (!bodies.length) { this.panel.setEditorStatus('请先载入至少一个中心天体。', 'warn'); return; }
        this.panel.setEditorStatus(`环绕助手：请在逐条编辑器中选择中心体，半径 ${radius}，平面 ${plane}。`, 'info');
      },
      onRemoveDrift: (center) => {
        if (!this.client.removeDrift(center)) this.toast('物理内核忙碌，请稍后重试。', 'warn');
        else this.toast('已移除质心漂移');
      },
      onExportTrail: () => this.exportTrailCsv(),
      onShareLink: () => void this.shareLink(),
      onRecord: () => this.recorder.toggle((m) => this.toast(m)),
      onExportPng: () => this.exportPng(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onReplay: (dir) => this.replay(dir),
      onFewBodyApply: (config, label) => this.applyExternalConfig(config, label),
      onFewBodyCurrent: () => this.currentConfig(),
      onToggleField: () => {
        const on = this.fieldOverlay.toggle();
        this.toast(`势场热力图：${on ? '开' : '关'}`);
        if (on) this.client.requestField();
      },
      onBodiesLoad: () => {
        this.loadIntoEditor = true;
        if (!this.client.requestBodies()) {
          // Worker 正在计算：排队，等下一帧空闲时补发，不让用户点击落空
          this.pendingBodiesLoad = true;
          this.panel.setEditorStatus('已排队，等待物理内核空闲后载入…', 'warn');
        }
      },
      onToast: (message) => this.toast(message),
    });

    this.client.onFrame = (frame) => {
      this.snapshot = frame.snapshot;
      this.diagnostics = frame.diagnostics;
      if (!this.client.isBusy) {
        if (this.pendingBodiesLoad) {
          this.pendingBodiesLoad = false;
          this.client.requestBodies();
        } else if (this.pendingBodiesExport) {
          this.client.requestBodies();
        }
      }
    };
    this.client.onEvents = (items) => this.panel.pushEvents(items);
    this.client.onMetrics = (sample) => this.panel.metricsPanel.push(sample);
    this.client.onPerf = (sample) => this.panel.perfPanel.update(sample);
    this.client.onTrail = (t) => this.downloadTrailCsv(t);
    this.client.onError = (message) => this.toast(`物理内核异常：${message}`, 'critical');
    this.workerWatchdog = new WorkerWatchdog(30_000, () => {
      this.toast('物理内核 30 秒无响应，可能存在病态配置（如极小软化 + 极大质量），建议重置或降低规模。', 'critical', 9000);
    });
    this.client.onBodies = (bodies) => {
      const pending = this.pendingBodiesExport;
      this.pendingBodiesExport = null;
      pending?.(bodies);
      if (this.loadIntoEditor) {
        this.loadIntoEditor = false;
        this.panel.setBodies(bodies);
        this.panel.setEditorStatus(`已从当前模拟载入 ${bodies.length} 条数据，可逐条修改。`, 'ok');
      }
    };

    // 多人协作：面板 + 客户端
    this.collabPanel = new CollabPanel(this.panel.root, {
      onJoin: (room, name) => this.collabJoin(room, name),
      onLeave: () => this.collabLeave(),
      onClaim: () => this.collab?.claimControl(),
      onRename: (name) => this.collab?.rename(name),
    });
    const roomFromUrl = new URLSearchParams(location.search).get('room');
    if (roomFromUrl) this.collabPanel.prefillRoom(roomFromUrl);
    this.collab = new CollabClient(defaultRelayUrl(), {
      onStatus: (status, text) => this.collabPanel.setStatus(status, text),
      onRoster: (members) => this.onRoster(members),
      onSystem: (text) => this.notify(`协作：${text}`),
      onConfig: (cfg) => this.onRemoteConfig(cfg),
      onRun: (run) => this.onRemoteRun(run),
      onCamera: (cam) => this.onRemoteCamera(cam),
      onCursor: () => undefined, // 光标显示属可选增强，当前不渲染
      onRequestState: () => ({
        config: this.currentConfig(),
        run: { playing: this.playing, speed: this.speed },
        camera: { cx: this.camera.cx, cy: this.camera.cy, zoom: this.camera.zoom },
      }),
      onError: (text) => this.toast(`协作错误：${text}`, 'warn'),
    });
    this.collabPanel.attach(this.collab);

    const host: EnhancedHost = {
      canvas,
      camera: this.camera,
      getConfig: () => this.currentConfig(),
      applyConfig: (cfg, label) => this.applyExternalConfig(cfg, label),
      getSnapshot: () => this.snapshot
        ? {
            vertex: this.snapshot.vertex,
            count: this.snapshot.count,
            dimensions: this.snapshot.dimensions,
            starTypes: this.snapshot.starTypes,
            weight: this.snapshot.weight,
            width: this.renderer.cssWidth || window.innerWidth,
            height: this.renderer.cssHeight || window.innerHeight,
          }
        : null,
      addBodies: (bodies) => this.client.addBodies(bodies),
      removeBody: (index) => {
        if (!this.client.removeBody(index)) this.toast('内核忙碌，稍后重试', 'warn');
      },
      removeDrift: (center) => { void this.client.removeDrift(center); },
      exportTrail: () => this.exportTrailCsv(),
      toast: (m, l) => this.toast(m, l ?? 'info'),
    };
    this.fieldOverlay = new FieldOverlay(document.body);
    this.client.onField = (f) => this.fieldOverlay.set(f.size, f.data);
    this.interactions = new CanvasInteractions(host);
    new TouchGestures(canvas, this.camera, (x, y) => {
      const w = this.camera.screenToWorldPlane(x, y, canvas.clientWidth, canvas.clientHeight);
      const cfg = this.currentConfig();
      this.client.addBodies([{
        x: w.x, y: w.y, z: cfg.dimensions === 3 ? w.z : 0,
        vx: 0, vy: 0, vz: 0, mass: cfg.init.massMax || 1,
      }]);
      this.toast('触屏：已在长按位置创建静止天体');
    });
    this.recorder = new Recorder(canvas);
    this.recorder.setOnState((active) => {
      const btn = document.getElementById('btn-record');
      if (btn) btn.textContent = active ? '停止录制' : '录制 WEBM';
    });
    this.bindUi(canvas);
    this.registerShortcuts();
    this.help = new HelpOverlay(this.shortcuts);
    this.shortcuts.attach();
    this.updateCameraOffset();
    this.panel.refreshStrategy();
    (window as unknown as Record<string, unknown>).__nbody = {
      app: this,
      client: this.client,
      debug: () => ({
        playing: this.playing,
        busy: this.client.isBusy,
        step: this.diagnostics?.step,
        bounds: this.snapshot?.bounds3,
        points: this.snapshot?.count,
        selection: this.selection?.index ?? null,
        follow: this.camera.followTarget,
        undo: this.history.undoLabel,
        redo: this.history.redoLabel,
        simulated: this.diagnostics?.simulated,
        requested: this.diagnostics?.requested,
        hasBodiesOverride: !!this.bodiesOverride,
      }),
    };
    void this.bootstrapFromHash();
  }

  /** E1：从 URL hash 载入分享配置。 */
  private async bootstrapFromHash(): Promise<void> {
    const text = await readShareHash();
    if (text) {
      this.acceptConfig(parseConfigText(text), '分享链接');
      history.replaceState(null, '', location.pathname + location.search);
      this.toast('已从分享链接载入配置', 'ok');
      return;
    }
    void this.rebuild(true);
  }

  private async rebuild(fitCamera: boolean): Promise<void> {
    // 客户端防护：防止连续点击/脚本高频触发导致 Worker 任务堆积
    if (!this.rebuildLimiter.allow()) {
      this.toast('操作过于频繁，请稍后再试', 'warn');
      return;
    }
    this.setBusy(true);
    this.workerWatchdog?.kick();
    try {
      const info = await this.client.init(
        this.panel.state.init,
        this.panel.state.physics,
        this.panel.state.view,
        this.bodiesOverride ?? undefined,
      );
      this.snapshot = info.snapshot;
      this.diagnostics = info.diagnostics;
      this.panel.metricsPanel.clear();
      this.panel.clearEvents();
      this.replayFrames.length = 0;
      this.replayIndex = -1;
      this.replayActive = false;
      this.camera.dimensions = this.panel.state.physics.dimensions;
      this.panel.setDirty(false);
      if (fitCamera) this.fitView();
      if (!this.bootDone) {
        this.bootDone = true;
        this.boot.classList.add('hidden');
      }
      if (info.strategy.tier >= 4) {
        for (const n of info.strategy.notices) this.toast(n.text, 'critical', 9000);
      }
      this.toast(
        `已就绪：${info.strategy.label} · ${info.strategy.simulated.toLocaleString('en-US')} 体 · ${this.bodiesOverride ? '逐体配置' : '生成器'} · 构建 ${info.buildMs.toFixed(0)} ms`,
        'ok',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.toast(`初始化失败：${message}`, 'critical');
      this.showFatal(message);
    } finally {
      this.workerWatchdog?.disarm();
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.playBtn.disabled = busy;
    this.stepBtn.disabled = busy;
    this.resetBtn.disabled = busy;
  }

  private apply(): void {
    void this.rebuild(true);
    this.publishConfig();
  }

  private reset(): void {
    this.bodiesOverride = null;
    void this.rebuild(true);
  }

  private updateCameraOffset(): void {
    const panel = document.getElementById('panel');
    const wide = window.innerWidth > 860;
    this.camera.offsetX = wide && panel ? (16 + panel.offsetWidth) / 2 : 0;
  }

  private fitView(): void {
    if (!this.snapshot) return;
    this.updateCameraOffset();
    const w = this.renderer.cssWidth || window.innerWidth;
    const h = this.renderer.cssHeight || window.innerHeight;
    // 少体：快照用真实包围盒，直接取景；大规模：用分位数包络忽略离群点
    if (this.snapshot.simulated <= 10) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      const v = this.snapshot.vertex;
      const useZ = this.snapshot.dimensions === 3;
      for (let i = 0; i < this.snapshot.count; i++) {
        const o = i * 5;
        minX = Math.min(minX, v[o]); maxX = Math.max(maxX, v[o]);
        minY = Math.min(minY, v[o + 1]); maxY = Math.max(maxY, v[o + 1]);
        if (useZ) { minZ = Math.min(minZ, v[o + 2]); maxZ = Math.max(maxZ, v[o + 2]); }
      }
      if (Number.isFinite(minX)) {
        const pad = Math.max((maxX - minX), (maxY - minY), 2) * 0.25;
        if (useZ) {
          this.camera.fit3([minX - pad, minY - pad, minZ - pad, maxX + pad, maxY + pad, maxZ + pad], w, h);
        } else {
          this.camera.fit([minX - pad, minY - pad, maxX + pad, maxY + pad], w, h);
        }
        return;
      }
    }
    if (this.snapshot.dimensions === 3) this.camera.fit3(this.snapshot.bounds3, w, h);
    else this.camera.fit(this.snapshot.bounds, w, h);
  }

  private setPlaying(playing: boolean): void {
    if (!this.applyingRemote && this.collab?.connected && this.collabPanel.isController()) {
      this.collab.publishRun({ playing, speed: this.speed });
    }
    this.playing = playing;
    this.playLabel.textContent = playing ? '暂停' : '继续';
    this.playIcon.textContent = playing ? '⏸' : '▶';
    this.playBtn.classList.toggle('btn--primary', playing);
  }

  private bindUi(canvas: HTMLCanvasElement): void {
    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));
    this.stepBtn.addEventListener('click', () => {
      this.setPlaying(false);
      this.client.advance(1);
    });
    this.resetBtn.addEventListener('click', () => this.reset());

    this.speedInput.addEventListener('input', () => {
      this.speed = Number(this.speedInput.value);
      this.updateSpeedLabel();
    });
    this.updateSpeedLabel();

    const helpBtn = document.getElementById('btn-help');
    helpBtn?.addEventListener('click', () => this.help.toggle());

    // 相机拖拽由 CanvasInteractions 统一派发（A1/A2/A3 共享手势）；
    // 这里只保留滚轮缩放与双击，避免两个 pointerdown 监听器互相竞争。
    this.interactions!.onCameraGesture = (dx, dy) => {
      if (this.camera.dimensions === 3) this.camera.rotate(dx, dy);
      else this.camera.panPixels(dx, dy);
      this.camera.followTarget = null;
    };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.followTarget = null;
      const rect = canvas.getBoundingClientRect();
      this.camera.zoomAt(
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0015),
        rect.width,
        rect.height,
      );
    }, { passive: false });

    canvas.addEventListener('dblclick', () => this.fitView());

    document.addEventListener('visibilitychange', () => { this.lastTime = performance.now(); });
    window.addEventListener('resize', () => this.updateCameraOffset());
  }

  // ------------------------------------------------------------ 快捷键

  private def(
    id: string,
    combo: string,
    label: string,
    group: string,
    handler: () => void,
    extra: Partial<ShortcutDefinition> = {},
  ): ShortcutDefinition {
    return { id, combo, label, group, handler: () => handler(), ...extra };
  }

  private registerShortcuts(): void {
    const p = this.panel;
    const list: ShortcutDefinition[] = [
      // 模拟控制
      this.def('play-pause', 'Space', '播放 / 暂停', '模拟控制', () => {
        this.setPlaying(!this.playing);
        this.notify(this.playing ? '已继续模拟' : '已暂停模拟');
      }),
      this.def('reset', 'KeyR', '重置初始条件', '模拟控制', () => {
        this.reset();
        this.notify('已重置为初始条件');
      }),
      this.def('step', 'ArrowRight', '单步推进', '模拟控制', () => {
        this.setPlaying(false);
        this.stepBy(1);
        this.notify('已单步推进 1 步');
      }),
      this.def('step10', 'Shift+ArrowRight', '快进 10 步', '模拟控制', () => {
        this.setPlaying(false);
        this.stepBy(10);
        this.notify('已快进 10 步');
      }),
      this.def('speed-up', 'Equal', '速度 +0.25×', '模拟控制', () => {
        this.adjustSpeed(0.25);
        this.notify(`速度 ${this.speed.toFixed(2)}×`);
      }),
      this.def('speed-down', 'Minus', '速度 -0.25×', '模拟控制', () => {
        this.adjustSpeed(-0.25);
        this.notify(`速度 ${this.speed.toFixed(2)}×`);
      }),
      this.def('speed-reset', 'Digit0', '速度恢复 1×', '模拟控制', () => {
        this.setSpeed(1);
        this.notify('速度已恢复为 1×');
      }),
      this.def('apply', 'Ctrl+Enter', '应用面板参数 / JSON', '模拟控制', () => {
        this.apply();
        this.notify('已应用并重建');
      }, { allowInInput: true }),

      // 相机
      this.def('fit', 'KeyF', '自适应取景', '相机', () => {
        this.fitView();
        this.notify('视图已自适应');
      }),
      this.def('reset-rotation', 'Shift+F', '重置 3D 旋转', '相机', () => {
        this.resetRotation();
        this.notify('3D 视角已复位');
      }),
      this.def('pan-up', 'KeyW', '视野上移', '相机', () => this.panBy(0, -45)),
      this.def('pan-left', 'KeyA', '视野左移', '相机', () => this.panBy(45, 0)),
      this.def('pan-down', 'KeyS', '视野下移', '相机', () => this.panBy(0, 45)),
      this.def('pan-right', 'KeyD', '视野右移', '相机', () => this.panBy(-45, 0)),
      this.def('rotate-left', 'KeyQ', '3D 左旋', '相机', () => this.rotateBy(-45, 0)),
      this.def('rotate-right', 'KeyE', '3D 右旋', '相机', () => this.rotateBy(45, 0)),
      this.def('tilt-down', 'KeyZ', '3D 下俯', '相机', () => this.rotateBy(0, -35)),
      this.def('tilt-up', 'KeyC', '3D 上仰', '相机', () => this.rotateBy(0, 35)),
      this.def('zoom-in', 'BracketRight', '放大', '相机', () => this.zoomBy(1.2)),
      this.def('zoom-out', 'BracketLeft', '缩小', '相机', () => this.zoomBy(1 / 1.2)),
      this.def('view-preset-1', 'Digit1', '视角预设：俯视', '相机', () => {
        this.setViewPreset(0);
        this.notify('视角：俯视');
      }),
      this.def('view-preset-2', 'Digit2', '视角预设：侧视', '相机', () => {
        this.setViewPreset(1);
        this.notify('视角：侧视');
      }),
      this.def('view-preset-3', 'Digit3', '视角预设：等轴', '相机', () => {
        this.setViewPreset(2);
        this.notify('视角：等轴');
      }),
      this.def('view-home', 'Home', '回到原点视图', '相机', () => {
        this.fitView();
        this.notify('已回到全景视图');
      }),

      // 显示
      this.def('toggle-glow', 'KeyH', '辉光开关', '显示', () => {
        p.toggleGlow();
        this.notify(`辉光：${p.state.view.glow ? '开' : '关'}`);
      }),
      this.def('toggle-grid', 'KeyG', '网格开关', '显示', () => {
        p.toggleGrid();
        this.notify(`网格：${p.state.view.showGrid ? '开' : '关'}`);
      }),
      this.def('toggle-trails', 'KeyT', '轨迹开关', '显示', () => {
        p.toggleTrails();
        this.notify(`轨迹：${p.state.view.trails ? '开' : '关'}`);
      }),
      this.def('cycle-color', 'KeyV', '切换颜色映射', '显示', () => {
        p.cycleColorMode();
        this.notify(`配色：${p.state.view.colorMode}`);
      }),
      this.def('toggle-hud', 'KeyN', '显示 / 隐藏 HUD', '显示', () => {
        const hudEl = document.getElementById('hud');
        hudEl?.classList.toggle('hud-hidden');
        this.notify('HUD 显示状态已切换');
      }),
      this.def('toggle-editor-section', 'KeyB', '展开 / 折叠逐条编辑器', '显示', () => {
        p.toggleSection('逐条设置天体数据');
      }),
      this.def('toggle-json-section', 'KeyJ', '展开 / 折叠 JSON 配置', '显示', () => {
        p.toggleSection('JSON 配置');
      }),
      this.def('toggle-stellar-log', 'Shift+KeyE', '展开 / 折叠演化日志与分析', '显示', () => {
        p.toggleSection('分析诊断与性能');
        this.notify('演化日志与分析面板已切换');
      }),

      // 物理
      this.def('toggle-dim', 'KeyU', '切换 2D / 3D', '物理', () => {
        p.cycleDimension();
        this.notify(`维度：${p.state.physics.dimensions}D`);
      }),
      this.def('cycle-engine', 'KeyY', '切换求解引擎', '物理', () => {
        p.cycleEngine();
        this.notify(`引擎：${p.state.physics.engine}`);
      }),
      this.def('toggle-integrator', 'KeyI', '切换积分器', '物理', () => {
        p.cycleIntegrator();
        this.notify(`积分器：${p.state.physics.integrator}`);
      }),
      this.def('cycle-collision', 'KeyM', '切换碰撞模式', '物理', () => {
        p.cycleCollision();
        this.notify(`碰撞：${p.state.physics.collision}`);
      }),
      this.def('cycle-sampling', 'KeyO', '切换采样策略', '物理', () => {
        p.cycleSampling();
        this.notify(`采样：${p.state.physics.sampling}`);
      }),
      this.def('theta-down', 'Comma', '精度提高（θ -0.05）', '物理', () => {
        p.adjustTheta(-0.05);
        this.notify(`θ = ${p.state.physics.theta.toFixed(2)}`);
      }),
      this.def('theta-up', 'Period', '精度降低（θ +0.05）', '物理', () => {
        p.adjustTheta(0.05);
        this.notify(`θ = ${p.state.physics.theta.toFixed(2)}`);
      }),

      // 配置与编辑
      this.def('export-json', 'Ctrl+S', '导出完整 JSON', '配置与编辑', () => {
        this.exportConfig('json');
        this.notify('已导出完整 JSON');
      }, { allowInInput: true }),
      this.def('export-gz', 'Ctrl+Shift+S', '导出 gzip 配置', '配置与编辑', () => {
        this.exportConfig('gz');
        this.notify('已导出 gzip 配置');
      }, { allowInInput: true }),
      this.def('export-params', 'Ctrl+Alt+S', '仅导出参数', '配置与编辑', () => {
        this.exportConfig('params');
        this.notify('已生成仅参数配置');
      }, { allowInInput: true }),
      this.def('import-file', 'Ctrl+O', '选择配置文件导入', '配置与编辑', () => {
        document.getElementById('config-file')?.click();
        p.toggleSection('JSON 配置');
      }, { allowInInput: true }),
      this.def('focus-count', 'Ctrl+K', '定位天体数量输入', '配置与编辑', () => {
        document.getElementById('count-input')?.focus();
      }, { allowInInput: true }),
      this.def('focus-editor', 'Ctrl+B', '定位逐条编辑器', '配置与编辑', () => {
        const sectionOpen = p.toggleSection('逐条设置天体数据');
        void sectionOpen;
        document.getElementById('be-x')?.focus();
        this.notify('已定位到逐条编辑器');
      }, { allowInInput: true }),
      this.def('load-bodies', 'Ctrl+L', '从模拟载入逐条数据', '配置与编辑', () => {
        document.getElementById('be-load')?.click();
      }, { allowInInput: true }),

      // 新增功能
      this.def('delete-body', 'Delete', '删除选中天体', '配置与编辑', () => {
        if (!this.interactions.deleteSelected()) this.notify('尚未选中天体');
      }),
      this.def('follow-body', 'KeyX', '跟随选中天体', '相机', () => {
        if (!this.interactions.followSelected()) this.notify('尚未选中天体');
      }),
      this.def('undo', 'Ctrl+Z', '撤销配置变更', '配置与编辑', () => this.undo(), { allowInInput: true }),
      this.def('redo', 'Ctrl+Y', '重做配置变更', '配置与编辑', () => this.redo(), { allowInInput: true }),
      this.def('share-link', 'Ctrl+Shift+C', '复制分享链接', '配置与编辑', () => void this.shareLink(), { allowInInput: true }),
      this.def('export-png', 'Ctrl+P', '导出 PNG 快照', '配置与编辑', () => this.exportPng(), { allowInInput: true }),
      this.def('replay-back', 'Shift+BracketLeft', '回放上一帧', '显示', () => this.replay(-1)),
      this.def('replay-fwd', 'Shift+BracketRight', '回放下一帧', '显示', () => this.replay(1)),
      this.def('field-overlay', 'KeyL', '势场热力图开关', '显示', () => {
        const on = this.fieldOverlay.toggle();
        if (on) this.client.requestField();
        this.notify(`势场热力图：${on ? '开' : '关'}`);
      }),

      // 帮助
      // R31–R35 自主批次
      this.def('remove-drift', 'Shift+Home', '消除质心漂移', '配置与编辑', () => {
        if (!this.client.removeDrift(false)) this.toast('内核忙碌，请稍后重试', 'warn');
        else this.toast('已消除质心漂移');
      }),
      this.def('reset-physics', 'Ctrl+Shift+R', '重置物理参数到默认', '配置与编辑', () => {
        this.panel.applyConfigToState({
          ...this.currentConfig(),
          physics: { ...DEFAULT_PHYSICS },
        });
        this.apply();
        this.notify('已重置物理参数');
      }, { allowInInput: true }),
      this.def('export-trail', 'KeyP', '导出轨迹 CSV', '配置与编辑', () => this.exportTrailCsv()),
      this.def('toggle-record', 'Shift+P', '切换 WEBM 录制', '配置与编辑', () => this.recorder.toggle((m) => this.toast(m))),
      this.def('share-link-alias', 'Ctrl+D', '复制分享链接（别名）', '配置与编辑', () => void this.shareLink(), { allowInInput: true }),

      this.def('help', '?', '打开 / 关闭快捷键帮助', '帮助', () => this.help.toggle()),
      this.def('help-f1', 'F1', '打开 / 关闭快捷键帮助', '帮助', () => this.help.toggle(), {
        allowInInput: true,
      }),
      this.def('escape', 'Escape', '关闭帮助 / 取消编辑', '帮助', () => {
        if (this.help.visible) {
          this.help.hide();
          return;
        }
        const cancel = document.getElementById('be-cancel') as HTMLButtonElement | null;
        if (cancel && cancel.style.display !== 'none') cancel.click();
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }, { allowInInput: true, preventDefault: false }),
    ];

    this.shortcuts.register(list);
    const conflicts = this.shortcuts.conflicts();
    if (conflicts.length) console.warn('[shortcuts] 冲突：', conflicts);
  }

  private updateSpeedLabel(): void {
    this.speedLabel.textContent = `${this.speed.toFixed(2).replace(/\.00$/, '.0')}×`;
  }

  private setSpeed(value: number): void {
    this.speed = Math.min(16, Math.max(0.05, value));
    this.speedInput.value = String(this.speed);
    this.updateSpeedLabel();
  }

  private adjustSpeed(delta: number): void {
    this.setSpeed(Math.round((this.speed + delta) * 100) / 100);
  }

  private stepBy(steps: number): void {
    for (let i = 0; i < steps; i++) this.client.advance(1);
  }

  private zoomBy(factor: number): void {
    this.camera.zoom = Math.min(1e5, Math.max(1e-4, this.camera.zoom * factor));
  }

  private panBy(dx: number, dy: number): void {
    this.camera.panPixels(dx, dy);
  }

  private rotateBy(dx: number, dy: number): void {
    this.camera.rotate(dx, dy);
  }

  private resetRotation(): void {
    this.camera.yaw = -0.65;
    this.camera.pitch = 0.55;
    this.fitView();
  }

  private setViewPreset(index: number): void {
    const presets: Array<[number, number]> = [
      [0, 1.45],
      [Math.PI / 2, 0],
      [-Math.PI / 4, 0.6],
    ];
    const preset = presets[index] ?? presets[0];
    this.camera.yaw = preset[0];
    this.camera.pitch = preset[1];
    this.fitView();
  }

  private notify(message: string): void {
    this.toast(message, 'info', 1600);
  }

  // ------------------------------------------------------------ 增强功能

  /** 当前完整配置（供分享/撤销/环绕助手使用）。 */
  private currentConfig(): SimulationConfig {
    const base = this.lastConfig ?? configFromParams(
      this.panel.state.physics,
      this.panel.state.init,
      this.panel.state.view,
      { playing: this.playing, speed: this.speed },
    );
    return {
      ...base,
      schema: 'nbody-studio/v2',
      version: 2,
      dimensions: this.panel.state.physics.dimensions,
      physics: { ...this.panel.state.physics },
      init: { ...this.panel.state.init },
      view: { ...this.panel.state.view },
      run: { playing: this.playing, speed: this.speed },
      bodies: this.bodiesOverride ?? this.lastConfig?.bodies,
    };
  }

  /** 应用外部配置（预设 / 撤销 / 分享链接），统一走校验与重建。 */
  private applyExternalConfig(cfg: SimulationConfig, label: string): void {
    this.history.push(this.currentConfig(), label);
    this.acceptConfig({ ok: true, config: cfg, errors: [], warnings: [] }, label);
  }

  // ------------------------------------------------------------ 多人协作

  private collabJoin(room: string, name: string): void {
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    history.replaceState(null, '', url);
    this.collab?.join(room, name);
    this.toast(`正在加入协作房间「${room}」…`, 'info');
  }

  private collabLeave(): void {
    this.collab?.leave();
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    this.notify('已退出协作房间');
  }

  private onRoster(members: Member[]): void {
    this.collabPanel.setMembers(members);
    const me = members.find((m) => m.name === this.nameInputValue()) ?? members.find((m) => m.id === this.selfId);
    const idInput = document.getElementById('collab-room') as HTMLInputElement | null;
    if (idInput && me) this.selfId = me.id;
    this.collabPanel.setSelfId(this.selfId);
  }

  private nameInputValue(): string {
    return (document.getElementById('collab-name') as HTMLInputElement | null)?.value ?? '';
  }

  private onRemoteConfig(cfg: unknown): void {
    const parsed = this.currentConfig();
    const merged = { ...parsed, ...(cfg as Partial<SimulationConfig>) };
    this.applyingRemote = true;
    try {
      this.acceptConfig({ ok: true, config: merged, errors: [], warnings: [] }, '协作同步');
      this.notify('已同步主控的配置');
    } finally {
      this.applyingRemote = false;
    }
  }

  private onRemoteRun(run: { playing: boolean; speed: number }): void {
    this.applyingRemote = true;
    try {
      this.setPlaying(!!run.playing);
      if (typeof run.speed === 'number') {
        this.speed = run.speed;
        if (this.speedInput) this.speedInput.value = String(run.speed);
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  private onRemoteCamera(cam: { cx: number; cy: number; zoom: number }): void {
    if (!cam) return;
    if (typeof cam.cx === 'number') this.camera.cx = cam.cx;
    if (typeof cam.cy === 'number') this.camera.cy = cam.cy;
    if (typeof cam.zoom === 'number') this.camera.zoom = cam.zoom;
  }

  /** 配置变更后由 UI 调用，Broadcast 给房间。 */
  private publishConfig(): void {
    if (this.applyingRemote || !this.collab?.connected || !this.collabPanel.isController()) return;
    this.collab.publishConfig(this.currentConfig());
  }

  private applyPreset(id: string): void {
    const preset = presetById(id);
    if (!preset) return;
    this.applyExternalConfig(preset.build(), `预设：${preset.name}`);
    this.toast(`已载入预设「${preset.name}」`, 'ok');
  }

  private undo(): void {
    const item = this.history.undo(this.currentConfig());
    if (!item) { this.notify('没有可撤销的操作'); return; }
    this.acceptConfig({ ok: true, config: item.config, errors: [], warnings: [] }, '撤销');
    this.notify(`已撤销：${item.label}`);
  }

  private redo(): void {
    const item = this.history.redo(this.currentConfig());
    if (!item) { this.notify('没有可重做的操作'); return; }
    this.acceptConfig({ ok: true, config: item.config, errors: [], warnings: [] }, '重做');
    this.notify(`已重做：${item.label}`);
  }

  private async shareLink(): Promise<void> {
    try {
      const url = await makeShareUrl(this.currentConfig());
      await navigator.clipboard.writeText(url);
      this.toast('分享链接已复制到剪贴板', 'ok');
    } catch (err) {
      this.toast(`复制失败：${err instanceof Error ? err.message : String(err)}`, 'critical');
    }
  }

  private exportPng(): void {
    const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) { this.toast('PNG 导出失败', 'critical'); return; }
      void blob.arrayBuffer().then((buf) => {
        downloadBlob(`nbody-${Date.now()}.png`, new Uint8Array(buf), 'image/png');
        this.toast('已导出 PNG 快照', 'ok');
      });
    }, 'image/png');
  }

  private exportTrailCsv(): void {
    const cfg = this.currentConfig();
    const bodies = cfg.bodies ?? [];
    const indices = bodies.slice(0, 64).map((_, i) => i);
    if (!indices.length || !this.client.requestTrail(indices)) {
      this.toast('没有可导出的轨迹（请先载入逐体配置）', 'warn');
    }
  }

  private downloadTrailCsv(t: { filled: number; points: number; indices: number[]; data: Float32Array }): void {
    const lines = ['body_id,point_index,t,x,y,z'];
    const dt = this.panel.state.physics.dt;
    for (let b = 0; b < t.indices.length; b++) {
      for (let k = 0; k < t.filled; k++) {
        const o = (b * t.filled + k) * 3;
        lines.push(`${t.indices[b]},${k},${(k * dt).toFixed(6)},${t.data[o].toFixed(6)},${t.data[o + 1].toFixed(6)},${t.data[o + 2].toFixed(6)}`);
      }
    }
    downloadBlob(`nbody-trail-${Date.now()}.csv`, lines.join('\n'));
    this.toast(`已导出 ${t.filled * t.indices.length} 行轨迹`, 'ok');
  }

  private replay(direction: -1 | 1): void {
    if (!this.replayActive && direction < 0) {
      // 首次回放：把当前帧作为起点
      if (this.snapshot) {
        this.replayFrames.push({
          vertex: Float32Array.from(this.snapshot.vertex.subarray(0, this.snapshot.count * 5)),
          count: this.snapshot.count,
          step: this.diagnostics?.step ?? 0,
        });
      }
    }
    if (!this.replayFrames.length) { this.notify('暂无可回放的帧'); return; }
    this.replayActive = true;
    this.setPlaying(false);
    if (this.replayIndex < 0) this.replayIndex = this.replayFrames.length - 1;
    this.replayIndex = Math.max(0, Math.min(this.replayFrames.length - 1, this.replayIndex + direction));
    const frame = this.replayFrames[this.replayIndex];
    const snap = this.snapshot;
    if (snap && frame) {
      snap.vertex.set(frame.vertex.subarray(0, frame.count * 5));
      // 注意：真实物理状态未回滚，仅回放视图数据
    }
    this.notify(`回放 ${this.replayIndex + 1}/${this.replayFrames.length}（仅视图，物理未回滚）`);
  }

  // ------------------------------------------------------------ JSON 配置

  private acceptConfig(result: ValidationResult, source: string): boolean {
    if (!result.ok || !result.config) {
      this.panel.setConfigStatus(`导入失败：${result.errors.slice(0, 4).join('；')}`);
      this.toast(`JSON 配置无效：${result.errors[0] ?? '未知错误'}`, 'critical', 8000);
      return false;
    }
    const cfg = result.config;
    this.lastConfig = cfg;
    this.bodiesOverride = cfg.bodies ?? null;
    this.panel.applyConfigToState(cfg);
    this.panel.setConfigStatus(
      `已导入 ${source}：${cfg.dimensions}D · ${this.bodiesOverride ? `${this.bodiesOverride.length} 个显式天体` : '程序化初始条件'}${result.warnings.length ? ` · 警告 ${result.warnings[0]}` : ''}`,
    );
    void this.rebuild(true);
    this.publishConfig();
    return true;
  }

  private importText(text: string): void {
    const check = guardConfigText(text);
    if (!check.ok) {
      this.panel.setConfigStatus(check.reason!);
      this.toast(check.reason!, 'critical');
      return;
    }
    this.acceptConfig(parseConfigText(text), '文本配置');
  }

  private async importFile(file: File): Promise<void> {
    const check = guardImportFile(file.size);
    if (!check.ok) {
      this.panel.setConfigStatus(check.reason!);
      this.toast(check.reason!, 'critical');
      return;
    }
    try {
      let data: Uint8Array = new Uint8Array(await file.arrayBuffer());
      if (file.name.endsWith('.gz') || data[0] === 0x1f) data = await gunzip(data);
      const text = new TextDecoder().decode(data);
      const bodies: BodyConfig[] = [];
      const parsed = await parseConfigFile(
        new Blob([text]),
        (body) => bodies.push(body),
      );
      const result = parsed.result;
      if (result.ok && result.config) {
        result.config.bodies = bodies.length ? bodies : undefined;
        if (parsed.errors.length) result.warnings.push(...parsed.errors.slice(0, 5));
      }
      this.acceptConfig(result, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.panel.setConfigStatus(`文件读取失败：${message}`);
      this.toast(`文件读取失败：${message}`, 'critical');
    }
  }

  private exportConfig(mode: 'json' | 'gz' | 'params'): void {
    try {
      const base =
        this.lastConfig ??
        configFromParams(
          this.panel.state.physics,
          this.panel.state.init,
          this.panel.state.view,
          { playing: this.playing, speed: this.speed },
        );
      const cfg: SimulationConfig = {
        ...base,
        schema: 'nbody-studio/v2',
        version: 2,
        dimensions: this.panel.state.physics.dimensions,
        physics: { ...this.panel.state.physics },
        init: { ...this.panel.state.init },
        view: { ...this.panel.state.view },
        run: { playing: this.playing, speed: this.speed },
        meta: { ...base.meta, createdAt: new Date().toISOString() },
      };

      if (mode === 'params') {
        delete cfg.bodies;
        this.panel.setConfigText(configToJSON(cfg));
        this.panel.setConfigStatus('已生成仅参数配置（不含天体列表），可在文本框中查看/复制。');
        return;
      }

      // 完整导出：请求 Worker 返回当前世界全部天体（初始或当前状态）
      const finish = (bodies: BodyConfig[]): void => {
        cfg.bodies = bodies;
        const full = configToJSON(cfg);
        if (mode === 'gz') {
          void gzip(new TextEncoder().encode(full)).then((packed) => {
            downloadBlob('nbody-config.json.gz', packed, 'application/gzip');
            this.panel.setConfigStatus(`已导出完整逐体 gzip 配置：${bodies.length.toLocaleString('en-US')} 体，${(packed.length / 1024 / 1024).toFixed(2)} MB。`);
          });
        } else {
          downloadBlob('nbody-config.json', full);
          this.panel.setConfigStatus(`已导出完整逐体 JSON：${bodies.length.toLocaleString('en-US')} 体，${(full.length / 1024 / 1024).toFixed(2)} MB。`);
        }
      };

      if (this.bodiesOverride) {
        finish(this.bodiesOverride);
      } else {
        this.pendingBodiesExport = finish;
        if (!this.client.requestBodies()) {
          this.panel.setConfigStatus('正在等待物理内核空闲以导出逐体数据…');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.toast(`导出失败：${message}`, 'critical');
    }
  }

  /** 供后续 UI 调用：展开当前生成器场景为逐体配置。 */
  async expandBodiesToConfig(): Promise<BodyConfig[] | null> {
    // Worker 不持有 DOM 引用，这里通过一次性请求取得逐体数据（扩展点）
    void this;
    return this.bodiesOverride ?? null;
  }

  private showFatal(message: string): void {
    this.boot.classList.remove('hidden');
    this.boot.replaceChildren();
    const title = document.createElement('div');
    title.textContent = '无法启动模拟内核';
    const detail = document.createElement('div');
    detail.className = 'boot-error';
    detail.textContent = message;
    this.boot.append(title, detail);
  }

  private toast(message: string, level: 'info' | 'warn' | 'critical' | 'ok' = 'info', ttl = 4200): void {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.level = level;
    node.textContent = message;
    host.append(node);
    window.setTimeout(() => {
      node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      window.setTimeout(() => node.remove(), 320);
    }, ttl);
    while (host.childElementCount > 3) host.firstElementChild?.remove();
  }

  start(): void {
    const frame = (): void => {
      const now = performance.now();
      this.lastTime = Math.min(0.1, (now - this.lastTime) / 1000) || now;

      if (this.playing && this.snapshot && !this.client.isBusy) {
        this.stepAccumulator += this.speed;
        const steps = Math.min(8, Math.floor(this.stepAccumulator));
        if (steps > 0) {
          this.stepAccumulator -= steps;
          this.client.advance(steps);
        }
      } else if (!this.playing || this.client.isBusy) {
        this.stepAccumulator = Math.min(this.stepAccumulator, 1);
      }

      if (this.snapshot) {
        // F5：按步采集视图帧（限 300）
        if (!this.replayActive && this.diagnostics && this.replayFrames.length < 300) {
          const last = this.replayFrames.at(-1);
          if (!last || last.step !== this.diagnostics.step) {
            this.replayFrames.push({
              vertex: Float32Array.from(this.snapshot.vertex.subarray(0, this.snapshot.count * 5)),
              count: this.snapshot.count,
              step: this.diagnostics.step,
            });
          }
        }
        // A3：跟随目标（仅视图）
        if (this.camera.followTarget !== null) {
          const o = Math.min(this.camera.followTarget, this.snapshot.count - 1) * 5;
          if (o >= 0) {
            const px = this.snapshot.vertex[o];
            const py = this.snapshot.vertex[o + 1];
            const pz = this.snapshot.vertex[o + 2];
            if (this.camera.dimensions === 3) {
              this.camera.targetX = px; this.camera.targetY = py; this.camera.targetZ = pz;
            } else {
              this.camera.cx = px; this.camera.cy = py;
            }
          }
        }
        // C3：质心参考系（仅视图）
        if (this.camera.comReference && this.diagnostics) {
          if (this.camera.dimensions === 3) {
            this.camera.targetX = this.diagnostics.comX;
            this.camera.targetY = this.diagnostics.comY;
            this.camera.targetZ = this.diagnostics.comZ;
          } else {
            this.camera.cx = this.diagnostics.comX;
            this.camera.cy = this.diagnostics.comY;
          }
        }
        this.renderer.render(this.snapshot, this.camera, this.panel.state.view);
        this.fieldOverlay.resize(this.renderer.cssWidth || window.innerWidth, this.renderer.cssHeight || window.innerHeight);
        if (this.fieldOverlay.active && !this.client.isBusy && this.diagnostics && this.diagnostics.step % 20 === 0) {
          this.client.requestField();
        }
        if (this.diagnostics) {
          this.hud.update(this.diagnostics, this.snapshot, this.diagnostics.stepMs, this.currentConfig().stellar, this.playing);
        }
        if (this.snapshot.simulated <= 10) this.panel.fewBodyPanel.update(this.snapshot, this.diagnostics);
      } else {
        this.renderer.render(emptySnapshot(), this.camera, this.panel.state.view);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

function emptySnapshot(): Snapshot {
  return {
    count: 0,
    requested: 0,
    simulated: 0,
    weight: 1,
    dimensions: 2,
    vertex: new Float32Array(5),
    velocities: null,
    starTypes: null,
    flashes: null,
    step: 0,
    scalarMin: 0,
    scalarMax: 1,
    bounds: [-1, -1, 1, 1],
    bounds3: [-1, -1, -1, 1, 1, 1],
    trajectories: null,
    trajectoryCount: 0,
    trajectoryPoints: 0,
    trajectoryHead: 0,
    trajectoryFilled: 0,
  };
}

export async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
  const bootNode = document.getElementById('boot') as HTMLElement | null;
  if (!canvas) throw new Error('缺少画布节点 #stage');
  try {
    const app = new App(canvas);
    app.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (bootNode) {
      bootNode.classList.remove('hidden');
      bootNode.replaceChildren();
      const title = document.createElement('div');
      title.textContent = '初始化失败';
      const detail = document.createElement('div');
      detail.className = 'boot-error';
      detail.textContent = message;
      bootNode.append(title, detail);
    }
    console.error(err);
  }
}
