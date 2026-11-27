/**
 * 逐条天体数据编辑器：一条一条录入 / 修改 / 删除，并即时显示已设置的数据。
 *
 * 职责边界：只维护“待应用的数据列表”与表单状态；真正重建模拟由调用方通过回调完成。
 */

import type { BodyConfig, Dimensions } from '../core/types';
import {
  EMPTY_DRAFT,
  bodyToDraft,
  nextId,
  validateBodyDraft,
  type BodyDraft,
} from '../core/config/body-form';
import { el } from './widgets';
import { orbitAround, type OrbitPlane } from '../core/orbit';
import type { SimulationConfig } from '../core/types';

export interface BodyEditorCallbacks {
  /** 列表内容发生变化（尚未应用到模拟）。 */
  onChange: (bodies: BodyConfig[]) => void;
  /** 点击“应用到模拟”。 */
  onApply: (bodies: BodyConfig[]) => void;
  /** 点击“从当前模拟载入”。 */
  onLoad: () => void;
  /** 请求当前模拟状态（用于环绕中心体选择）。 */
  onRequestConfig: () => SimulationConfig | null;
}

type FieldKey = keyof BodyDraft;

const FIELDS: Array<{ key: FieldKey; label: string; hint: string }> = [
  { key: 'x', label: 'x', hint: '位置 X' },
  { key: 'y', label: 'y', hint: '位置 Y' },
  { key: 'z', label: 'z', hint: '位置 Z（2D 忽略）' },
  { key: 'vx', label: 'vx', hint: '速度 X' },
  { key: 'vy', label: 'vy', hint: '速度 Y' },
  { key: 'vz', label: 'vz', hint: '速度 Z（2D 忽略）' },
  { key: 'mass', label: '质量', hint: '惯性质量 > 0' },
  { key: 'grav', label: '引力参数', hint: 'μ/G，留空 = 质量' },
  { key: 'radius', label: '碰撞半径', hint: '留空 = 自动换算' },
];

export class BodyEditor {
  private callbacks: BodyEditorCallbacks;
  private root: HTMLElement;
  private dimensions: Dimensions;

  private bodies: BodyConfig[] = [];
  private draft: BodyDraft = { ...EMPTY_DRAFT };
  private editingIndex: number | null = null;

  private inputs = new Map<FieldKey, HTMLInputElement>();
  private errors = new Map<FieldKey, HTMLElement>();
  private listEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private countEl!: HTMLElement;
  private submitBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private formTitle!: HTMLElement;
  private applyBtn!: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    callbacks: BodyEditorCallbacks,
    dimensions: Dimensions = 3,
  ) {
    this.root = root;
    this.callbacks = callbacks;
    this.dimensions = dimensions;
    this.build();
    this.renderForm();
    this.renderList();
    this.setStatus('可直接录入第一条数据。', 'info');
  }

  // ------------------------------------------------------------ 构建

  private build(): void {
    const wrap = el('div', 'body-editor');

    this.formTitle = el('div', 'be-form-title', '新增天体 #0');
    wrap.append(this.formTitle);

    const grid = el('div', 'be-grid');
    for (const field of FIELDS) {
      const cell = el('label', 'be-field');
      const label = el('span', 'be-label', field.label);
      label.title = field.hint;
      const input = el('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.dataset.field = field.key;
      input.id = `be-${field.key}`;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.addEventListener('input', () => {
        this.draft[field.key] = input.value;
        this.clearError(field.key);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submit();
        }
      });
      const err = el('span', 'field-error');
      err.dataset.error = field.key;
      cell.append(label, input, err);
      grid.append(cell);
      this.inputs.set(field.key, input);
      this.errors.set(field.key, err);
    }

    // id 单独一行（通常自动生成，可留空）
    const idCell = el('label', 'be-field be-field--wide');
    idCell.append(el('span', 'be-label', 'id（可选，留空自动分配）'));
    const idInput = el('input');
    idInput.type = 'text';
    idInput.inputMode = 'numeric';
    idInput.id = 'be-id';
    idInput.dataset.field = 'id';
    idInput.placeholder = String(nextId(this.bodies));
    idInput.addEventListener('input', () => {
      this.draft.id = idInput.value;
      this.clearError('id');
    });
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
    });
    const idErr = el('span', 'field-error');
    idErr.dataset.error = 'id';
    idCell.append(idInput, idErr);
    grid.append(idCell);
    this.inputs.set('id', idInput);
    this.errors.set('id', idErr);

    wrap.append(grid);

    // B2：环绕计算助手
    const orbitBox = el('div', 'be-orbit');
    orbitBox.id = 'be-orbit-box';
    const orbitHead = el('div', 'be-form-title', '环绕计算（自动填速度）');
    orbitBox.append(orbitHead);
    const orbitGrid = el('div', 'be-grid');
    const centerLabel = el('label', 'be-field be-field--wide');
    centerLabel.append(el('span', 'be-label', '中心天体'));
    const centerSel = el('select');
    centerSel.id = 'be-orbit-center';
    centerLabel.append(centerSel);
    const rLabel = el('label', 'be-field');
    rLabel.append(el('span', 'be-label', '轨道半径 r'));
    const rInput = el('input');
    rInput.type = 'text';
    rInput.id = 'be-orbit-radius';
    rInput.value = '10';
    rLabel.append(rInput);
    const planeLabel = el('label', 'be-field');
    planeLabel.append(el('span', 'be-label', '轨道平面'));
    const planeSel = el('select');
    planeSel.id = 'be-orbit-plane';
    for (const p of ['xy', 'xz', 'yz']) {
      const o = el('option');
      o.value = p;
      o.textContent = p;
      planeSel.append(o);
    }
    planeLabel.append(planeSel);
    orbitGrid.append(centerLabel, rLabel, planeLabel);
    orbitBox.append(orbitGrid);
    const orbitBtn = el('button', 'btn', '计算并填入');
    orbitBtn.type = 'button';
    orbitBtn.id = 'be-orbit-apply';
    orbitBtn.addEventListener('click', () => {
      const cfg = this.callbacks.onRequestConfig();
      const idx = Number(centerSel.value);
      const bodies = cfg?.bodies ?? [];
      const center = bodies[idx];
      const radius = Number(rInput.value);
      if (!center || !(radius > 0)) {
        this.setStatus('请先载入天体并选择中心体，且半径必须为正。', 'error');
        return;
      }
      const plane = planeSel.value as OrbitPlane;
      const mu = cfg!.physics.G * ((center.grav ?? center.mass) + Number(this.draft.mass || 1));
      const pos = orbitAround(
        { x: center.x, y: center.y, z: center.z ?? 0, vx: center.vx, vy: center.vy, vz: center.vz ?? 0 },
        radius, plane, mu, 0, this.dimensions === 3,
      );
      this.draft.x = String(pos.x);
      this.draft.y = String(pos.y);
      this.draft.z = String(pos.z);
      this.draft.vx = String(pos.vx);
      this.draft.vy = String(pos.vy);
      this.draft.vz = String(pos.vz);
      this.syncInputs();
      this.setStatus(`已填入 r=${radius} 的 ${plane} 圆轨道速度（含中心体速度）。`, 'ok');
    });
    orbitBox.append(orbitBtn);
    wrap.append(orbitBox);

    const actions = el('div', 'be-actions');
    this.submitBtn = el('button', 'btn btn--primary', '提交新增');
    this.submitBtn.type = 'button';
    this.submitBtn.id = 'be-submit';
    this.submitBtn.addEventListener('click', () => this.submit());

    this.cancelBtn = el('button', 'btn', '取消编辑');
    this.cancelBtn.type = 'button';
    this.cancelBtn.id = 'be-cancel';
    this.cancelBtn.style.display = 'none';
    this.cancelBtn.addEventListener('click', () => this.cancelEdit());

    const resetBtn = el('button', 'btn', '清空表单');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => this.resetDraft());

    actions.append(this.submitBtn, this.cancelBtn, resetBtn);
    wrap.append(actions);

    this.statusEl = el('div', 'be-status');
    this.statusEl.dataset.level = 'info';
    wrap.append(this.statusEl);

    const listHead = el('div', 'be-list-head');
    this.countEl = el('span', 'be-count', '已设置 0 条');
    const loadBtn = el('button', 'chip', '从模拟载入');
    loadBtn.type = 'button';
    loadBtn.id = 'be-load';
    loadBtn.addEventListener('click', () => this.callbacks.onLoad());
    listHead.append(this.countEl, loadBtn);
    wrap.append(listHead);

    this.listEl = el('div', 'be-list');
    wrap.append(this.listEl);

    const foot = el('div', 'be-actions');
    this.applyBtn = el('button', 'btn btn--apply', '应用到模拟');
    this.applyBtn.type = 'button';
    this.applyBtn.id = 'be-apply';
    this.applyBtn.disabled = true;
    this.applyBtn.addEventListener('click', () => {
      if (this.bodies.length === 0) {
        this.setStatus('没有可应用的天体，请先提交至少一条数据。', 'warn');
        return;
      }
      this.callbacks.onApply(this.bodies.map((b) => ({ ...b })));
      this.setStatus(`已应用 ${this.bodies.length} 条数据到模拟。`, 'ok');
    });

    const clearAllBtn = el('button', 'btn', '清空全部');
    clearAllBtn.type = 'button';
    clearAllBtn.addEventListener('click', () => {
      if (this.bodies.length === 0) return;
      this.bodies = [];
      this.editingIndex = null;
      this.renderList();
      this.resetDraft();
      this.callbacks.onChange([]);
      this.setStatus('已清空全部数据（尚未应用到模拟）。', 'warn');
    });
    foot.append(this.applyBtn, clearAllBtn);
    wrap.append(foot);

    this.root.append(wrap);
  }

  /** 刷新环绕助手的中心体下拉。 */
  private refreshOrbitCenters(): void {
    const sel = this.root.querySelector('#be-orbit-center') as HTMLSelectElement | null;
    if (!sel) return;
    const cfg = this.callbacks.onRequestConfig?.();
    const bodies = cfg?.bodies ?? this.bodies;
    sel.replaceChildren();
    bodies.forEach((b, i) => {
      const o = el('option');
      o.value = String(i);
      o.textContent = `#${b.id ?? i}  m=${b.mass}  μ=${b.grav ?? b.mass}`;
      sel.append(o);
    });
    if (this.dimensions === 2) {
      const plane = this.root.querySelector('#be-orbit-plane') as HTMLSelectElement | null;
      if (plane) { plane.value = 'xy'; plane.disabled = true; }
    }
  }

  // ------------------------------------------------------------ 表单渲染

  /** 把当前 draft 写回输入框（环绕助手用）。 */
  private syncInputs(): void {
    for (const [key, input] of this.inputs) {
      input.value = this.draft[key] ?? '';
    }
  }

  private renderForm(): void {
    for (const [key, input] of this.inputs) {
      input.value = this.draft[key];
      input.disabled = this.dimensions === 2 && (key === 'z' || key === 'vz');
      this.clearError(key);
    }
    const idInput = this.inputs.get('id');
    if (idInput) idInput.placeholder = String(nextId(this.bodies));

    const editing = this.editingIndex !== null;
    this.formTitle.textContent = editing
      ? `修改第 ${this.editingIndex! + 1} 条（id ${this.bodies[this.editingIndex!]?.id ?? '自动'}）`
      : `新增天体 #${nextId(this.bodies)}`;
    this.formTitle.classList.toggle('is-editing', editing);
    this.submitBtn.textContent = editing ? '保存修改' : '提交新增';
    this.cancelBtn.style.display = editing ? '' : 'none';
  }

  private clearError(key: FieldKey): void {
    const node = this.errors.get(key);
    if (node) {
      node.textContent = '';
      node.classList.remove('visible');
    }
    this.inputs.get(key)?.classList.remove('invalid');
  }

  private showErrors(errors: Record<string, string>): void {
    for (const [key, message] of Object.entries(errors)) {
      const node = this.errors.get(key as FieldKey);
      const input = this.inputs.get(key as FieldKey);
      if (node) {
        node.textContent = message;
        node.classList.add('visible');
      }
      input?.classList.add('invalid');
    }
  }

  /** 提交当前表单：校验 → 新增或更新 → 刷新列表。 */
  submit(): void {
    const usedIds = new Set<number>();
    this.bodies.forEach((b, i) => {
      if (i !== this.editingIndex && b.id !== undefined) usedIds.add(b.id);
    });

    const result = validateBodyDraft(this.draft, this.dimensions, usedIds);
    if (!result.ok || !result.body) {
      this.showErrors(result.errors);
      const first = Object.values(result.errors)[0] ?? '输入无效';
      this.setStatus(`校验未通过：${first}`, 'error');
      return;
    }

    if (this.editingIndex !== null) {
      this.bodies[this.editingIndex] = result.body;
      this.setStatus(`已修改第 ${this.editingIndex + 1} 条数据。`, 'ok');
      this.editingIndex = null;
    } else {
      this.bodies.push(result.body);
      this.setStatus(`已添加第 ${this.bodies.length} 条数据。`, 'ok');
    }

    this.resetDraft();
    this.renderList();
    this.callbacks.onChange(this.bodies.map((b) => ({ ...b })));
  }

  private resetDraft(): void {
    this.draft = { ...EMPTY_DRAFT };
    this.editingIndex = null;
    this.renderForm();
  }

  private cancelEdit(): void {
    this.resetDraft();
    this.setStatus('已取消编辑，可继续新增。', 'info');
  }

  // ------------------------------------------------------------ 列表渲染

  private renderList(): void {
    this.listEl.replaceChildren();
    this.countEl.textContent = `已设置 ${this.bodies.length} 条`;
    this.applyBtn.disabled = this.bodies.length === 0;

    if (this.bodies.length === 0) {
      const empty = el('div', 'be-empty', '暂无数据，请在上方录入并提交。');
      this.listEl.append(empty);
      return;
    }

    this.bodies.forEach((b, i) => {
      const row = el('div', 'be-item');
      row.dataset.index = String(i);
      if (i === this.editingIndex) row.classList.add('is-editing');

      const info = el('div', 'be-item-info');
      const title = el('div', 'be-item-title', `#${i + 1}  id=${b.id ?? '自动'}  m=${fmt(b.mass)}`);
      const detail = el(
        'div',
        'be-item-detail',
        `(${fmt(b.x)}, ${fmt(b.y)}, ${fmt(b.z ?? 0)})  v=(${fmt(b.vx)}, ${fmt(b.vy)}, ${fmt(b.vz ?? 0)})` +
          (b.grav !== undefined ? `  μ/G=${fmt(b.grav)}` : '') +
          (b.radius !== undefined ? `  r=${fmt(b.radius)}` : ''),
      );
      info.append(title, detail);

      const ops = el('div', 'be-item-ops');
      const edit = el('button', 'chip', '修改');
      edit.type = 'button';
      edit.addEventListener('click', () => this.startEdit(i));
      const del = el('button', 'chip chip--danger', '删除');
      del.type = 'button';
      del.addEventListener('click', () => this.remove(i));
      ops.append(edit, del);

      row.append(info, ops);
      this.listEl.append(row);
    });
  }

  private startEdit(index: number): void {
    const body = this.bodies[index];
    if (!body) return;
    this.editingIndex = index;
    this.draft = bodyToDraft(body);
    this.renderForm();
    this.renderList();
    this.setStatus(`正在修改第 ${index + 1} 条；完成后点“保存修改”。`, 'warn');
  }

  private remove(index: number): void {
    const removed = this.bodies.splice(index, 1)[0];
    if (this.editingIndex === index) this.editingIndex = null;
    else if (this.editingIndex !== null && index < this.editingIndex) this.editingIndex--;
    this.renderList();
    this.renderForm();
    this.callbacks.onChange(this.bodies.map((b) => ({ ...b })));
    this.setStatus(`已删除第 ${index + 1} 条（id=${removed.id ?? '自动'}）。`, 'warn');
  }

  // ------------------------------------------------------------ 对外 API

  setBodies(bodies: readonly BodyConfig[]): void {
    this.bodies = bodies.map((b) => ({ ...b }));
    this.editingIndex = null;
    this.renderList();
    this.resetDraft();
    this.refreshOrbitCenters();
  }

  getBodies(): BodyConfig[] {
    return this.bodies.map((b) => ({ ...b }));
  }

  setDimensions(dimensions: Dimensions): void {
    if (this.dimensions === dimensions) return;
    this.dimensions = dimensions;
    if (dimensions === 2) {
      for (const b of this.bodies) {
        b.z = 0;
        b.vz = 0;
      }
      this.draft.z = '0';
      this.draft.vz = '0';
      this.callbacks.onChange(this.bodies.map((b) => ({ ...b })));
    }
    this.renderForm();
    this.renderList();
    this.setStatus(dimensions === 2 ? '已切换到 2D：z / vz 置零并锁定。' : '已切换到 3D：可编辑 z / vz。', 'info');
  }

  setStatus(message: string, level: 'info' | 'ok' | 'warn' | 'error'): void {
    this.statusEl.textContent = message;
    this.statusEl.dataset.level = level;
  }
}

function fmt(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(v < 1 ? 4 : 2).replace(/\.?0+$/, '');
}
