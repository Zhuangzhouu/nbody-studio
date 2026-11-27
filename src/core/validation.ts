/**
 * 输入校验层：把“用户手打的字符串”变成可信的数字。
 * 与 UI 解耦，便于单元测试覆盖边界（0 / 负数 / 超 INT_MAX / 科学计数法 / 千分位）。
 */

import { MAX_BODY_INPUT } from './constants';

export type CountErrorCode = 'empty' | 'not-a-number' | 'too-small' | 'too-large' | 'not-integer';

export interface CountParseOk {
  ok: true;
  value: number;
  /** 归一化后的规范写法，回填输入框用。 */
  normalized: string;
  /** 非阻断性提示（例如小数被向下取整）。 */
  note?: string;
}

export interface CountParseFail {
  ok: false;
  code: CountErrorCode;
  message: string;
}

export type CountParseResult = CountParseOk | CountParseFail;

const ALLOWED_PATTERN = /^[+]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * 解析天体数量输入。
 * 允许：千分位逗号、下划线、首尾空格、科学计数法（1e6）、前后正号。
 * 拒绝：空、非数字、< 1、> INT_MAX。
 */
export function parseBodyCount(raw: string): CountParseResult {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[,_\s]/g, '')
    .toLowerCase();

  if (cleaned === '') {
    return { ok: false, code: 'empty', message: '请输入天体数量（1 ~ 2,147,483,647）' };
  }

  if (!ALLOWED_PATTERN.test(cleaned)) {
    return {
      ok: false,
      code: 'not-a-number',
      message: '不是合法数字：只允许整数或科学计数法（如 1e6）',
    };
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { ok: false, code: 'too-large', message: '数值超出可解析范围' };
  }
  if (parsed < 1) {
    return { ok: false, code: 'too-small', message: '天体数量至少为 1' };
  }
  if (parsed > MAX_BODY_INPUT) {
    return {
      ok: false,
      code: 'too-large',
      message: `超出上限 ${MAX_BODY_INPUT.toLocaleString('en-US')}（INT_MAX）`,
    };
  }

  if (!Number.isInteger(parsed)) {
    const floored = Math.floor(parsed);
    return {
      ok: true,
      value: Math.max(1, floored),
      normalized: String(Math.max(1, floored)),
      note: '小数已向下取整为整数',
    };
  }

  return { ok: true, value: parsed, normalized: String(parsed) };
}

export interface NumberFieldSpec {
  min: number;
  max: number;
  integer?: boolean;
  fallback: number;
}

/** 解析普通数值字段（G、dt、半径…），越界即夹紧并给出提示。 */
export function parseNumberField(
  raw: string,
  spec: NumberFieldSpec,
): { value: number; clamped: boolean; invalid: boolean } {
  const cleaned = String(raw ?? '').trim().replace(/,/g, '');
  const parsed = Number(cleaned);
  if (cleaned === '' || !Number.isFinite(parsed)) {
    return { value: spec.fallback, clamped: false, invalid: true };
  }
  let value = spec.integer ? Math.round(parsed) : parsed;
  let clamped = false;
  if (value < spec.min) {
    value = spec.min;
    clamped = true;
  } else if (value > spec.max) {
    value = spec.max;
    clamped = true;
  }
  return { value, clamped, invalid: false };
}

/** 解析十六进制或十进制种子。 */
export function parseSeed(raw: string, fallback: number): number {
  const text = String(raw ?? '').trim();
  if (text === '') return fallback;
  const value = /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text, 16) : Number(text);
  if (!Number.isFinite(value)) return fallback;
  return Math.abs(Math.floor(value)) >>> 0;
}
