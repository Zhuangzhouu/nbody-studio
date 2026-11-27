/** F4：引力势场热力图覆盖层（Canvas 2D，零依赖，不参与 HDR 累加）。 */

export class FieldOverlay {
  private canvas: HTMLCanvasElement;
  private enabled = false;
  private data: Float32Array | null = null;
  private size = 64;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'field-overlay';
    this.canvas.style.position = 'fixed';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '6';
    this.canvas.style.opacity = '0.38';
    this.canvas.style.mixBlendMode = 'screen';
    this.canvas.style.display = 'none';
    parent.append(this.canvas);
  }

  toggle(on?: boolean): boolean {
    this.enabled = on ?? !this.enabled;
    this.canvas.style.display = this.enabled ? 'block' : 'none';
    return this.enabled;
  }

  get active(): boolean { return this.enabled; }

  set(size: number, data: Float32Array): void {
    this.size = size;
    this.data = data;
    if (this.enabled) this.draw();
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.draw();
    }
  }

  private draw(): void {
    if (!this.data) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const cellW = w / this.size;
    const cellH = h / this.size;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = Math.min(1, Math.max(0, this.data[y * this.size + x]));
        // 低密度青 → 高密度紫红
        const r = Math.round(30 + 225 * v * v);
        const g = Math.round(120 - 90 * v);
        const b = Math.round(200 + 40 * v);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.18 + v * 0.55})`;
        ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
      }
    }
  }
}
