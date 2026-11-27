/**
 * 快捷键解析的纯函数层：组合键字符串 ↔ 键盘事件。
 * 不依赖 DOM，便于单元测试；ShortcutManager 只负责注册与派发。
 */

export interface ShortcutCombo {
  /** 主键盘事件的 KeyboardEvent.code，例如 KeyA / Digit1 / Slash。 */
  code: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MOD_ALIASES: Record<string, keyof Omit<ShortcutCombo, 'code'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  meta: 'meta',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
};

const CODE_ALIASES: Record<string, string> = {
  space: 'Space',
  enter: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
  plus: 'Equal',
  equal: 'Equal',
  minus: 'Minus',
  question: 'Slash',
  slash: 'Slash',
  comma: 'Comma',
  period: 'Period',
  bracketleft: 'BracketLeft',
  bracketright: 'BracketRight',
};

/**
 * 解析组合键字符串。
 * 例子：`Space`、`Ctrl+S`、`Ctrl+Shift+S`、`?`、`F1`、`Shift+Slash`、`KeyA`。
 */
export function parseCombo(input: string): ShortcutCombo | null {
  const parts = input
    .trim()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let code = '';
  const combo: ShortcutCombo = {
    code: '',
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };

  // `?` 是 Shift+/ 的常见简写
  if (input.trim() === '?') {
    return { code: 'Slash', ctrl: false, meta: false, alt: false, shift: true };
  }

  for (const part of parts) {
    const lower = part.toLowerCase();
    const mod = MOD_ALIASES[lower];
    if (mod) {
      combo[mod] = true;
      continue;
    }
    if (code) return null; // 多个主键
    code = CODE_ALIASES[lower] ?? normalizeCode(part);
  }

  if (!code) return null;
  combo.code = code;
  // 字母类型键默认隐含 Shift=false；组合串里没写 Shift 就必须是 false
  return combo;
}

function normalizeCode(part: string): string {
  const trimmed = part.trim();
  if (/^key[a-z]$/i.test(trimmed)) return `Key${trimmed[3].toUpperCase()}`;
  if (/^digit[0-9]$/i.test(trimmed)) return trimmed;
  if (/^[0-9]$/.test(trimmed)) return `Digit${trimmed}`;
  if (/^numpad[a-z0-9]+$/i.test(trimmed)) return trimmed;
  // 单字母（用 code 表达，避免键盘布局差异）
  if (/^[a-z]$/i.test(trimmed)) return `Key${trimmed.toUpperCase()}`;
  return trimmed;
}

/** 事件是否精确匹配组合键（修饰键必须完全一致，避免误触）。 */
export function matchesCombo(event: KeyEventLike, combo: ShortcutCombo): boolean {
  return (
    event.code === combo.code &&
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift
  );
}

/** 事件是否应按原样交给输入控件（输入时不触发全局单键快捷键）。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON' ||
    target.isContentEditable
  );
}

/** 展示用格式化：`Ctrl+Shift+S`、`?`、`Space`。 */
export function formatCombo(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.meta) parts.push('⌘');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  parts.push(displayCode(combo.code));
  return parts.join('+');
}

function displayCode(code: string): string {
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Equal: '+',
    Minus: '-',
    Slash: '?',
    BracketLeft: '[',
    BracketRight: ']',
  };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}
