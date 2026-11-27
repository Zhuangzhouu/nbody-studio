import { describe, expect, it } from 'vitest';
import { MAX_BODY_INPUT } from '../src/core/constants';
import { parseBodyCount, parseNumberField, parseSeed } from '../src/core/validation';

describe('天体数量输入校验', () => {
  it('接受 1 与 INT_MAX', () => {
    const one = parseBodyCount('1');
    expect(one.ok && one.value).toBe(1);

    const max = parseBodyCount(String(MAX_BODY_INPUT));
    expect(max.ok && max.value).toBe(MAX_BODY_INPUT);
  });

  it('拒绝 0、负数与超上限', () => {
    const zero = parseBodyCount('0');
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.code).toBe('too-small');

    const bigger = parseBodyCount('2147483648');
    expect(bigger.ok).toBe(false);
    if (!bigger.ok) expect(bigger.code).toBe('too-large');
  });

  it('拒绝空串与非数字', () => {
    const empty = parseBodyCount('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('empty');

    const junk = parseBodyCount('abc');
    expect(junk.ok).toBe(false);
    if (!junk.ok) expect(junk.code).toBe('not-a-number');
  });

  it('支持科学计数法与千分位', () => {
    const sci = parseBodyCount('1e6');
    expect(sci.ok && sci.value).toBe(1_000_000);

    const comma = parseBodyCount('1,200,000');
    expect(comma.ok && comma.value).toBe(1_200_000);

    const spaced = parseBodyCount(' 2 000 ');
    expect(spaced.ok && spaced.value).toBe(2000);
  });

  it('小数向下取整并给出提示', () => {
    const frac = parseBodyCount('1234.9');
    expect(frac.ok).toBe(true);
    if (frac.ok) {
      expect(frac.value).toBe(1234);
      expect(frac.note).toBeTruthy();
    }
  });
});

describe('通用数值字段', () => {
  it('越界夹紧并标记', () => {
    const r = parseNumberField('-3', { min: 0, max: 10, fallback: 1 });
    expect(r.value).toBe(0);
    expect(r.clamped).toBe(true);

    const bad = parseNumberField('x', { min: 0, max: 10, fallback: 2 });
    expect(bad.value).toBe(2);
    expect(bad.invalid).toBe(true);
  });

  it('种子支持十六进制', () => {
    expect(parseSeed('0xff', 1)).toBe(255);
    expect(parseSeed('', 7)).toBe(7);
  });
});
