import { describe, expect, it } from 'vitest';
import {
  truncate, padZero, formatSI, formatSigned, formatClock, splitLines,
  escapeHtml, unescapeHtml, camelToLabel, truncateMiddle,
} from '../src/core/mathx';

describe('U1–U10 字符串格式化', () => {
  it('U1 truncate', () => { expect(truncate('abcdef', 4)).toBe('abc…'); expect(truncate('ab', 4)).toBe('ab'); });
  it('U2 padZero', () => expect(padZero(7, 3)).toBe('007'));
  it('U3 formatSI', () => { expect(formatSI(1500, 'B')).toBe('1.50kB'); expect(formatSI(2e6)).toBe('2.00M'); });
  it('U4 formatSigned', () => { expect(formatSigned(1)).toBe('+1.00'); expect(formatSigned(-1)).toBe('-1.00'); });
  it('U5 formatClock', () => expect(formatClock(125)).toBe('02:05'));
  it('U6 splitLines', () => {
    expect(splitLines('abcdef', 3)).toEqual(['abcdef']); // ASCII 半宽：6 字符=3 宽度
    expect(splitLines('中文测试', 2)).toEqual(['中文', '测试']);
  });
  it('U7/U8 HTML 往返', () => {
    const s = '<a href="x">&\'y\'</a>';
    expect(unescapeHtml(escapeHtml(s))).toBe(s);
  });
  it('U9 camelToLabel', () => expect(camelToLabel('maxSimulated')).toBe('Max Simulated'));
  it('U10 truncateMiddle', () => expect(truncateMiddle('abcdefghij', 3, 3)).toBe('abc…hij'));
});
