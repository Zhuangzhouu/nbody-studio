/**
 * 快捷键注册器：集中定义动作、派发键盘事件、检测冲突并提供帮助数据。
 */

import {
  formatCombo,
  isTypingTarget,
  matchesCombo,
  parseCombo,
  type ShortcutCombo,
} from './shortcut-keys';

export interface ShortcutDefinition {
  id: string;
  /** 组合键写法，例如 `Space` / `Ctrl+S` / `?`。 */
  combo: string;
  label: string;
  /** 帮助面板中的分组名。 */
  group: string;
  hint?: string;
  /** 输入框聚焦时仍触发（Esc / 帮助 / Ctrl 组合键通常需要）。 */
  allowInInput?: boolean;
  /** 是否调用 preventDefault，默认 true。 */
  preventDefault?: boolean;
  handler: (event: KeyboardEvent) => void;
}

export interface ParsedShortcut {
  definition: ShortcutDefinition;
  combo: ShortcutCombo;
  display: string;
}

export class ShortcutManager {
  private shortcuts: ParsedShortcut[] = [];
  private byCode = new Map<string, ParsedShortcut[]>();
  private attached = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const candidates = this.byCode.get(event.code);
    if (!candidates) return;

    for (const item of candidates) {
      if (!matchesCombo(event, item.combo)) continue;
      if (!item.definition.allowInInput && isTypingTarget(event.target)) continue;
      if (item.definition.preventDefault !== false) event.preventDefault();
      item.definition.handler(event);
      return;
    }
  };

  register(definitions: ShortcutDefinition[]): void {
    for (const definition of definitions) {
      const combo = parseCombo(definition.combo);
      if (!combo) {
        console.warn(`[shortcuts] 无法解析组合键：${definition.combo}`);
        continue;
      }
      const item: ParsedShortcut = {
        definition,
        combo,
        display: formatCombo(combo),
      };
      this.shortcuts.push(item);
      const list = this.byCode.get(combo.code) ?? [];
      list.push(item);
      this.byCode.set(combo.code, list);
    }
  }

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onKeyDown);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener('keydown', this.onKeyDown);
    this.attached = false;
  }

  /** 帮助面板数据：按注册顺序保留分组。 */
  groups(): Array<{ group: string; items: ParsedShortcut[] }> {
    const map = new Map<string, ParsedShortcut[]>();
    for (const item of this.shortcuts) {
      const list = map.get(item.definition.group) ?? [];
      list.push(item);
      map.set(item.definition.group, list);
    }
    return Array.from(map, ([group, items]) => ({ group, items }));
  }

  get count(): number {
    return this.shortcuts.length;
  }

  /** 同一 code + 修饰键组合被不同动作占用时返回冲突描述。 */
  conflicts(): string[] {
    const seen = new Map<string, string>();
    const out: string[] = [];
    for (const item of this.shortcuts) {
      const key = `${item.combo.code}|${item.combo.ctrl}|${item.combo.meta}|${item.combo.alt}|${item.combo.shift}`;
      const previous = seen.get(key);
      if (previous && previous !== item.definition.id) {
        out.push(`${item.display} 同时绑定 ${previous} 与 ${item.definition.id}`);
      } else {
        seen.set(key, item.definition.id);
      }
    }
    return out;
  }
}
