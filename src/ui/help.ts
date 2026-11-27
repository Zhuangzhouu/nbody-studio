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

    this.body = el('div', 'help-body');
    const foot = el('div', 'help-foot', '输入框聚焦时单键快捷键自动让位；Ctrl / ⌘ 组合键始终可用。');

    panel.append(head, this.body, foot);
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

  private render(): void {
    this.body.replaceChildren();
    for (const { group, items } of this.manager.groups()) {
      const section = el('div', 'help-group');
      section.append(el('div', 'help-group-title', group));
      const grid = el('div', 'help-grid');
      for (const item of items) {
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
