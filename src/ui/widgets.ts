/** 轻量 DOM 构建工具：避免在业务代码里堆 innerHTML 字符串。 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export interface NumberFieldOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  integer?: boolean;
  onCommit: (value: number) => void;
}

/** 数字输入 + 标签 + 说明。失焦/回车时提交，越界自动夹紧。 */
export function numberField(opts: NumberFieldOptions): { root: HTMLElement; set: (v: number) => void } {
  const root = el('label', 'field');
  const label = el('span', 'field-label');
  label.append(el('span', '', opts.label));
  const input = el('input');
  input.type = 'number';
  input.value = String(opts.value);
  input.min = String(opts.min);
  input.max = String(opts.max);
  if (opts.step !== undefined) input.step = String(opts.step);
  root.append(label, input);
  if (opts.hint) root.append(el('span', 'field-hint', opts.hint));

  const commit = () => {
    const raw = Number(input.value);
    let v = Number.isFinite(raw) ? raw : opts.value;
    if (opts.integer) v = Math.round(v);
    v = Math.min(opts.max, Math.max(opts.min, v));
    input.value = String(v);
    opts.onCommit(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      input.blur();
    }
  });

  return { root, set: (v) => (input.value = String(v)) };
}

export interface SliderOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  hint?: string;
  onInput: (value: number) => void;
}

export function sliderField(opts: SliderOptions): { root: HTMLElement; set: (v: number) => void } {
  const root = el('label', 'field');
  const label = el('span', 'field-label');
  const name = el('span', '', opts.label);
  const value = el('b', 'field-value', (opts.format ?? String)(opts.value));
  label.append(name, value);
  const input = el('input');
  input.type = 'range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    value.textContent = (opts.format ?? String)(v);
    opts.onInput(v);
  });
  root.append(label, input);
  if (opts.hint) root.append(el('span', 'field-hint', opts.hint));
  return { root, set: (v) => (input.value = String(v)) };
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function selectField<T extends string>(opts: {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  hint?: string;
  onChange: (value: T) => void;
}): { root: HTMLElement; select: HTMLSelectElement } {
  const root = el('label', 'field');
  root.append(el('span', 'field-label', opts.label));
  const select = el('select');
  for (const o of opts.options) {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    select.append(opt);
  }
  select.value = opts.value;
  select.addEventListener('change', () => opts.onChange(select.value as T));
  root.append(select);
  if (opts.hint) root.append(el('span', 'field-hint', opts.hint));
  return { root, select };
}

export function toggleField(opts: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): { root: HTMLElement; input: HTMLInputElement } {
  const root = el('label', 'toggle');
  root.append(el('span', '', opts.label));
  const input = el('input');
  input.type = 'checkbox';
  input.checked = opts.value;
  const track = el('span', 'toggle-track');
  input.addEventListener('change', () => opts.onChange(input.checked));
  root.append(input, track);
  return { root, input };
}

/** 可折叠分区。 */
export function section(title: string, collapsed = false): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'section');
  root.dataset.collapsed = String(collapsed);
  const head = el('button', 'section-head');
  head.type = 'button';
  const t = el('span', 'section-title', title);
  const caret = el('span', 'section-caret', '▾');
  head.append(t, caret);
  const body = el('div', 'section-body');
  head.addEventListener('click', () => {
    root.dataset.collapsed = root.dataset.collapsed === 'true' ? 'false' : 'true';
  });
  root.append(head, body);
  return { root, body };
}

export function chip(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', 'chip', label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}
