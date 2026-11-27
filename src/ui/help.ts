/** 快捷键帮助面板：按分组展示所有注册动作与对应按键。 */

import { el } from './widgets';
import type { ShortcutManager } from './shortcuts';

export class HelpOverlay {
  private overlay: HTMLElement;
  private body: HTMLElement;
  private manager: ShortcutManager;
  private visibleFlag = false;

  constructor(manager: ShortcutManager) {
    this.manager = manager;
    this.overlay = el('div', 'help-overlay');
    this.overlay.id = 'shortcut-help';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', '快捷键帮助');
    this.overlay.style.display = 'none';

    const panel = el('div', 'help-panel');
    const head = el('div', 'help-head');
    const titleWrap = el('div');
    titleWrap.append(
      el('div', 'help-title', '快捷键'),
      el('div', 'help-subtitle', `${manager.count} 项操作 · ? 打开/关闭 · Esc 关闭`),
    );
    const close = el('button', 'btn help-close', '✕');
    close.type = 'button';
    close.id = 'help-close';
    close.addEventListener('click', () => this.hide());
    head.append(titleWrap, close);

    // R40：快捷键搜索过滤
    const search = el('input') as HTMLInputElement;
    search.type = 'text';
    search.id = 'help-search';
    search.placeholder = '搜索快捷键（如 undo / Ctrl）';
    search.addEventListener('input', () => this.render(search.value.trim().toLowerCase()));

    this.body = el('div', 'help-body');
    const foot = el('div', 'help-foot', '输入框聚焦时单键快捷键自动让位；Ctrl / ⌘ 组合键始终可用。');

    panel.append(head, search, this.body, foot);
    this.overlay.append(panel);
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
    document.body.append(this.overlay);
  }

  get visible(): boolean {
    return this.visibleFlag;
  }

  show(): void {
    this.render();
    this.overlay.style.display = '';
    this.visibleFlag = true;
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.visibleFlag = false;
  }

  toggle(): void {
    if (this.visibleFlag) this.hide();
    else this.show();
  }

  private render(filter = ''): void {
    this.body.replaceChildren();
    for (const { group, items } of this.manager.groups()) {
      const matched = filter
        ? items.filter((it) =>
            `${it.definition.label} ${it.display} ${it.definition.hint ?? ''}`.toLowerCase().includes(filter))
        : items;
      if (!matched.length) continue;
      const section = el('div', 'help-group');
      const title = el('div', 'help-group-title', `${group} · ${matched.length}`);
      title.title = '点击折叠 / 展开';
      title.style.cursor = 'pointer';
      section.append(title);
      const grid = el('div', 'help-grid');
      title.addEventListener('click', () => {
        const collapsed = section.dataset.collapsed === 'true';
        section.dataset.collapsed = collapsed ? 'false' : 'true';
        grid.style.display = collapsed ? '' : 'none';
      });
      for (const item of matched) {
        const row = el('div', 'help-row');
        const label = el('div', 'help-label');
        label.append(el('span', '', item.definition.label));
        if (item.definition.hint) label.append(el('span', 'help-hint', item.definition.hint));
        const kbd = el('kbd', 'help-kbd', item.display);
        row.append(label, kbd);
        grid.append(row);
      }
      section.append(grid);
      this.body.append(section);
    }
  }
}
