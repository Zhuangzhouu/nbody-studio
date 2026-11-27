import { describe, expect, it } from 'vitest';
import {
  formatCombo,
  isTypingTarget,
  matchesCombo,
  parseCombo,
} from '../src/ui/shortcut-keys';
import { ShortcutManager } from '../src/ui/shortcuts';

describe('组合键解析', () => {
  it('解析单键、字母与数字', () => {
    expect(parseCombo('Space')).toEqual({ code: 'Space', ctrl: false, meta: false, alt: false, shift: false });
    expect(parseCombo('KeyA')?.code).toBe('KeyA');
    expect(parseCombo('a')?.code).toBe('KeyA');
    expect(parseCombo('Digit1')?.code).toBe('Digit1');
    expect(parseCombo('1')?.code).toBe('Digit1');
  });

  it('解析修饰键组合与别名', () => {
    expect(parseCombo('Ctrl+Shift+S')).toEqual({
      code: 'KeyS', ctrl: true, meta: false, alt: false, shift: true,
    });
    expect(parseCombo('cmd+K')?.meta).toBe(true);
    expect(parseCombo('Alt+ArrowRight')?.code).toBe('ArrowRight');
  });

  it('? 等价于 Shift+Slash', () => {
    expect(parseCombo('?')).toEqual({ code: 'Slash', ctrl: false, meta: false, alt: false, shift: true });
    expect(parseCombo('Shift+Slash')).toEqual(parseCombo('?'));
  });

  it('拒绝空串与多个主键', () => {
    expect(parseCombo('')).toBeNull();
    expect(parseCombo('Ctrl+A+B')).toBeNull();
  });

  it('匹配时修饰键必须完全一致', () => {
    const combo = parseCombo('Ctrl+S')!;
    expect(matchesCombo({ code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, combo)).toBe(true);
    expect(matchesCombo({ code: 'KeyS', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, combo)).toBe(false);
    expect(matchesCombo({ code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }, combo)).toBe(false);
  });

  it('格式化为可读文本', () => {
    expect(formatCombo(parseCombo('Ctrl+Shift+S')!)).toBe('Ctrl+Shift+S');
    expect(formatCombo(parseCombo('?')!)).toBe('Shift+?');
    expect(formatCombo(parseCombo('ArrowRight')!)).toBe('→');
  });

  it('非 DOM 环境下输入焦点判定安全返回 false', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('快捷键注册器', () => {
  it('按分组提供帮助数据并检测冲突', () => {
    const manager = new ShortcutManager();
    const calls: string[] = [];
    manager.register([
      { id: 'a', combo: 'Space', label: '播放', group: '模拟控制', handler: () => calls.push('a') },
      { id: 'b', combo: 'Ctrl+S', label: '导出', group: '配置', handler: () => calls.push('b') },
      { id: 'c', combo: '?', label: '帮助', group: '帮助', handler: () => calls.push('c') },
    ]);
    expect(manager.count).toBe(3);
    expect(manager.groups().map((g) => g.group)).toEqual(['模拟控制', '配置', '帮助']);
    expect(manager.conflicts()).toEqual([]);
    expect(calls).toEqual([]);

    manager.register([
      { id: 'd', combo: 'Space', label: '重复', group: '测试', handler: () => undefined },
    ]);
    expect(manager.conflicts().length).toBe(1);
  });
});
