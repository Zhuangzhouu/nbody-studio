/**
 * 增强功能混入：A 组交互（拖放/拾取/跟随）、E 组（历史/分享/录制）、F 组（PNG/CSV/回放）。
 * 由 App 持有并转发事件；所有方法都只操作 DOM / App 暴露的受控接口。
 */

import type { BodyConfig, SimulationConfig, StarType } from '../core/types';
import { physMass, starLabel, type ResolvedStarType } from '../core/stellar';
import { guardShareHash, MAX_HASH_LENGTH } from './guard';
import { DEFAULT_STELLAR } from '../core/params';
import { configToJSON, downloadBlob, gzip } from '../core/config/serialize';
import type { Camera } from '../render/camera';

export type Selection = { index: number; body: BodyConfig; screenX: number; screenY: number } | null;

export interface EnhancedHost {
  canvas: HTMLCanvasElement;
  camera: Camera;
  getConfig(): SimulationConfig;
  applyConfig(cfg: SimulationConfig, label: string): void;
  getSnapshot(): {
    vertex: Float32Array;
    count: number;
    dimensions: 2 | 3;
    width: number;
    height: number;
    starTypes?: Uint8Array | null;
    weight?: number;
  } | null;
  addBodies(bodies: BodyConfig[]): boolean;
  removeBody(index: number): void;
  removeDrift(center: boolean): void;
  exportTrail(): void;
  toast(message: string, level?: 'info' | 'ok' | 'warn' | 'critical'): void;
}

/** E3：配置历史栈（纯逻辑，可单测）。 */
export class ConfigHistory {
  private past: Array<{ config: SimulationConfig; label: string }> = [];
  private future: Array<{ config: SimulationConfig; label: string }> = [];

  constructor(private readonly limit = 50) {}

  push(config: SimulationConfig, label: string): void {
    this.past.push({ config: structuredClone(config), label });
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }

  undo(current: SimulationConfig): { config: SimulationConfig; label: string } | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push({ config: structuredClone(current), label: prev.label });
    return { config: structuredClone(prev.config), label: prev.label };
  }

  redo(current: SimulationConfig): { config: SimulationConfig; label: string } | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push({ config: structuredClone(current), label: next.label });
    return { config: structuredClone(next.config), label: next.label };
  }

  get undoLabel(): string | null { return this.past.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.future.at(-1)?.label ?? null; }
}

/** F5：快照回放环形缓冲（纯视图，不改物理）。 */
export class ReplayBuffer<T> {
  private frames: T[] = [];
  private cursor = -1;

  constructor(private readonly limit = 300) {}

  push(frame: T): void {
    this.frames.push(frame);
    if (this.frames.length > this.limit) this.frames.shift();
    if (this.cursor >= 0) this.cursor = Math.min(this.cursor, this.frames.length - 1);
  }

  clear(): void { this.frames.length = 0; this.cursor = -1; }

  step(direction: -1 | 1): T | null {
    if (!this.frames.length) return null;
    if (this.cursor < 0) this.cursor = this.frames.length - 1;
    this.cursor = Math.max(0, Math.min(this.frames.length - 1, this.cursor + direction));
    return this.frames[this.cursor];
  }

  get active(): boolean { return this.cursor >= 0; }
  get size(): number { return this.frames.length; }
  get position(): number { return this.cursor; }
  get latest(): T | null { return this.frames.at(-1) ?? null; }
}

/** A1/A2/A3：画布交互控制器。 */
export class CanvasInteractions {
  selection: Selection = null;
  private createMode = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownT = 0;
  private moved = false;
  private dragEnabled = false;
  private pointerDownFrameActive = false;
  private arrowCanvas: HTMLCanvasElement | null = null;
  private hoverCard: HTMLElement | null = null;
  private hoverTimer = 0;
  private hintShown = false;
  /** 相机拖拽派发回调（由 App 设置）。 */
  onCameraGesture: ((dx: number, dy: number) => void) | null = null;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(private host: EnhancedHost) {
    const { canvas } = host;
    canvas.style.touchAction = 'none';
    this.arrowCanvas = document.createElement('canvas');
    this.arrowCanvas.className = 'interaction-overlay';
    canvas.parentElement?.append(this.arrowCanvas);
    this.hoverCard = document.createElement('div');
    this.hoverCard.className = 'hover-card';
    this.hoverCard.style.display = 'none';
    document.body.append(this.hoverCard);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', () => this.reset());
    canvas.addEventListener('pointerleave', () => this.hideHover());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.host.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    const p = this.local(e);
    this.pointerDownX = p.x;
    this.pointerDownY = p.y;
    this.pointerDownT = performance.now();
    this.moved = false;
    this.dragEnabled = true;
    this.pointerDownFrameActive = true;
    this.lastPanX = p.x;
    this.lastPanY = p.y;
    // Ctrl / 右键拖拽 = 创建天体（A1）
    this.createMode = e.ctrlKey || e.button === 2;
    if (this.createMode) {
      const world = this.host.camera.screenToWorldPlane(p.x, p.y, this.host.canvas.clientWidth, this.host.canvas.clientHeight);
      this.dragStartX = world.x;
      this.dragStartY = world.y;
      this.host.canvas.setPointerCapture(e.pointerId);
      if (!this.hintShown) {
        this.hintShown = true;
        this.host.toast('创建模式：拖出速度矢量后松手；按住 Shift 创建静止天体。', 'info');
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    if (Math.hypot(p.x - this.pointerDownX, p.y - this.pointerDownY) > 5) this.moved = true;
    if (this.createMode && this.dragEnabled) {
      this.drawArrow(this.pointerDownX, this.pointerDownY, p.x, p.y);
      return;
    }
    if (!this.dragEnabled) {
      if (this.pointerDownFrameActive && this.onCameraGesture) {
        const dx = p.x - this.lastPanX;
        const dy = p.y - this.lastPanY;
        this.onCameraGesture(dx, dy);
        this.lastPanX = p.x;
        this.lastPanY = p.y;
      } else {
        this.scheduleHover(e, p);
      }
    }
  }

  private onUp(e: PointerEvent): void {
    const p = this.local(e);
    if (this.createMode) {
      if (this.dragEnabled && this.moved) {
        const w = this.host.camera.screenToWorldPlane(p.x, p.y, this.host.canvas.clientWidth, this.host.canvas.clientHeight);
        const dx = w.x - this.dragStartX;
        const dy = w.y - this.dragStartY;
        const cfg = this.host.getConfig();
        const mass = cfg.init.massMax || 1;
        const body: BodyConfig = {
          x: this.dragStartX,
          y: this.dragStartY,
          z: cfg.dimensions === 3 ? w.z ?? 0 : 0,
          vx: e.shiftKey ? 0 : dx,
          vy: e.shiftKey ? 0 : dy,
          vz: 0,
          mass,
        };
        const queued = this.host.addBodies([body]);
        this.host.toast(
          queued
            ? `已创建 1 个天体（v=${Math.hypot(body.vx, body.vy).toFixed(2)}）`
            : `已排队创建 1 个天体（v=${Math.hypot(body.vx, body.vy).toFixed(2)}）`,
          'ok',
        );
      }
      this.reset();
      return;
    }
    const click = !this.moved && performance.now() - this.pointerDownT < 300;
    if (click) this.pick(p.x, p.y);
    this.reset();
  }

  private reset(): void {
    this.createMode = false;
    this.dragEnabled = false;
    this.pointerDownFrameActive = false;
    this.clearArrow();
  }

  private drawArrow(x0: number, y0: number, x1: number, y1: number): void {
    const c = this.arrowCanvas;
    if (!c) return;
    const r = this.host.canvas.getBoundingClientRect();
    if (c.width !== r.width || c.height !== r.height) {
      c.width = r.width;
      c.height = r.height;
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      c.style.left = `${r.left}px`;
      c.style.top = `${r.top}px`;
      c.style.position = 'fixed';
      c.style.pointerEvents = 'none';
      c.style.zIndex = '15';
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 10 * Math.cos(a - 0.4), y1 - 10 * Math.sin(a - 0.4));
    ctx.lineTo(x1 - 10 * Math.cos(a + 0.4), y1 - 10 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }

  private clearArrow(): void {
    const ctx = this.arrowCanvas?.getContext('2d');
    if (ctx && this.arrowCanvas) ctx.clearRect(0, 0, this.arrowCanvas.width, this.arrowCanvas.height);
  }

  private scheduleHover(e: PointerEvent, p: { x: number; y: number }): void {
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.showHover(p), 150);
    void e;
  }

  private pick(x: number, y: number): void {
    const hit = this.nearest(x, y);
    if (!hit) {
      this.selection = null;
      this.hideHover();
      return;
    }
    this.selection = hit;
    this.host.toast(`已选中 #${hit.body.id ?? hit.index}（Delete 删除 / X 跟随）`, 'info');
  }

  private nearest(x: number, y: number): Selection {
    const snap = this.host.getSnapshot();
    if (!snap) return null;
    const cfg = this.host.getConfig();
    const bodies = cfg.bodies ?? [];
    const { camera } = this.host;
    let best = Infinity;
    let bestIdx = -1;
    const threshold = Math.max(8, (cfg.view?.pointSize ?? 2.6) * 1.5);
    for (let i = 0; i < snap.count; i++) {
      const o = i * 5;
      const p = camera.project(snap.vertex[o], snap.vertex[o + 1], snap.vertex[o + 2], snap.width, snap.height);
      if (p.behind) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < threshold && d < best) { best = d; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    const body = bodies[bestIdx] ?? {
      x: snap.vertex[bestIdx * 5],
      y: snap.vertex[bestIdx * 5 + 1],
      z: snap.vertex[bestIdx * 5 + 2],
      vx: 0, vy: 0, vz: 0,
      mass: snap.vertex[bestIdx * 5 + 4],
    };
    return { index: bestIdx, body, screenX: x, screenY: y };
  }

  private showHover(p: { x: number; y: number }): void {
    const hit = this.nearest(p.x, p.y);
    if (!hit || !this.hoverCard) { this.hideHover(); return; }
    const b = hit.body;
    this.hoverCard.innerHTML = '';
    const cfg = this.host.getConfig();
    const starCode = this.host.getSnapshot()?.starTypes?.[hit.index];
    const starType = starCode !== undefined && starCode !== null
      ? (['planet', 'auto', 'O', 'B', 'A', 'F', 'G', 'K', 'M', 'whiteDwarf', 'neutronStar', 'blackHole'] as (StarType | 'auto')[])[starCode]
      : b.star?.type ?? 'planet';
    const resolved = starType === 'auto' || starType === undefined ? 'planet' : starType;
    const massUnit = cfg.stellar?.massUnit ?? 1;
    const typeText = resolved === 'planet' ? '' : ` · ${starLabel(resolved as ResolvedStarType)}`;
    const snapW = this.host.getSnapshot()?.weight ?? 1;
    const rows = [
      `#${b.id ?? hit.index}${typeText}`,
      ...(snapW > 1 ? [`权重 ${snapW.toFixed(1)} 颗/代表粒子`] : []),
      `m=${b.mass.toFixed(3)} (${physMass(b.mass, cfg.stellar ?? DEFAULT_STELLAR).toFixed(2)} M☉) μ=${(b.grav ?? b.mass).toFixed(3)}`,
      `|v|=${Math.hypot(b.vx, b.vy, b.vz ?? 0).toFixed(3)}`,
      `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${(b.z ?? 0).toFixed(2)})`,
    ];
    for (const row of rows) {
      const d = document.createElement('div');
      d.textContent = row;
      this.hoverCard.append(d);
    }
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = '载入编辑器';
    load.addEventListener('click', () => {
      const input = document.getElementById('be-submit');
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.host.toast('已定位逐条编辑器，请手动填入或点「从模拟载入」。', 'info');
    });
    this.hoverCard.append(load);
    this.hoverCard.style.left = `${p.x + 14}px`;
    this.hoverCard.style.top = `${p.y + 14}px`;
    this.hoverCard.style.display = 'block';
  }

  hideHover(): void {
    if (this.hoverCard) this.hoverCard.style.display = 'none';
  }

  deleteSelected(): boolean {
    if (!this.selection) return false;
    this.host.removeBody(this.selection.index);
    this.host.toast(`已删除 #${this.selection.body.id ?? this.selection.index}`, 'warn');
    this.selection = null;
    return true;
  }

  followSelected(): boolean {
    if (!this.selection) return false;
    this.host.camera.followTarget = this.selection.index;
    this.host.toast(`已跟随 #${this.selection.body.id ?? this.selection.index}`, 'info');
    return true;
  }
}

/** E2：WEBM 录制。 */
export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer = 0;
  private startT = 0;
  private onState: ((active: boolean) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  setOnState(fn: (active: boolean) => void): void { this.onState = fn; }
  get active(): boolean { return this.recorder?.state === 'recording'; }

  toggle(toast: (m: string) => void): void {
    if (this.active) { this.stop(); return; }
    try {
      const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const stream = this.canvas.captureStream(60);
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'video/webm' });
        downloadBlob(`nbody-${Date.now()}.webm`, new Uint8Array(await blob.arrayBuffer()), 'video/webm');
        toast(`已录制 ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      };
      this.recorder.start(100);
      this.startT = performance.now();
      this.onState?.(true);
      toast('开始录制');
      this.timer = window.setInterval(() => {
        const sec = (performance.now() - this.startT) / 1000;
        if (sec > 300) toast('已录制超过 5 分钟，注意内存占用');
      }, 30_000);
    } catch (err) {
      toast(`录制不可用：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  stop(): void {
    window.clearInterval(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.recorder = null;
    this.onState?.(false);
  }
}

/** E1：分享链接。 */
export async function makeShareUrl(config: SimulationConfig): Promise<string> {
  const json = configToJSON(config);
  const packed = await gzip(new TextEncoder().encode(json));
  let binary = '';
  for (const b of packed) binary += String.fromCharCode(b);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#c=${encoded}`;
}

export async function readShareHash(): Promise<string | null> {
  const m = location.hash.match(/^#c=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const check = guardShareHash(m[1]);
  if (!check.ok) {
    console.warn(`[nbody guard] ${check.reason}；已忽略该分享链接。`);
    return null;
  }
  const base = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const { gunzip } = await import('../core/config/serialize');
  const raw = await gunzip(bytes);
  return new TextDecoder().decode(raw);
}


/** F3：触屏手势（单指平移/旋转，双指缩放，长按进入创建）。 */
export class TouchGestures {
  private pointers = new Map<number, { x: number; y: number; t: number }>();
  private pinchDist = 0;
  private longPressTimer = 0;
  private longPressActive = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: import('../render/camera').Camera,
    private onLongPressCreate: (x: number, y: number) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const r = this.canvas.getBoundingClientRect();
    this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
    if (this.pointers.size === 1) {
      this.longPressActive = false;
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = window.setTimeout(() => {
        const p = [...this.pointers.values()][0];
        if (p && this.pointers.size === 1) {
          this.longPressActive = true;
          this.onLongPressCreate(p.x, p.y);
        }
      }, 500);
    } else if (this.pointers.size === 2) {
      window.clearTimeout(this.longPressTimer);
      this.pinchDist = this.distance();
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.pointers.has(e.pointerId)) return;
    const r = this.canvas.getBoundingClientRect();
    const prev = this.pointers.get(e.pointerId)!;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, { x, y, t: prev.t });
      const d = this.distance();
      if (this.pinchDist > 0 && d > 0) {
        this.camera.zoomAt((x + [...this.pointers.values()][0].x) / 2, (y + [...this.pointers.values()][0].y) / 2, d / this.pinchDist, r.width, r.height);
      }
      this.pinchDist = d;
      return;
    }
    if (performance.now() - prev.t < 100) return; // 抖动抑制
    if (!this.longPressActive) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      if (this.camera.dimensions === 3) this.camera.rotate(dx, dy);
      else this.camera.panPixels(dx, dy);
    }
    this.pointers.set(e.pointerId, { x, y, t: performance.now() });
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    window.clearTimeout(this.longPressTimer);
    if (this.pointers.size < 2) this.pinchDist = 0;
    this.longPressActive = false;
  }

  private distance(): number {
    const p = [...this.pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
}
