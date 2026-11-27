/** 配色：颜色映射模式共用渐变结构；恒星色从 stellar.ts 唯一真源转换。 */

import type { ColorMode, RuntimeStarType } from '../core/types';
import { STELLAR_COLORS } from '../core/stellar';
import { STAR_TYPE_CODES } from '../core/bodies';

export interface Palette {
  c0: [number, number, number];
  c1: [number, number, number];
  c2: [number, number, number];
  /** 轨迹线的基础色。 */
  trail: [number, number, number];
}

export const PALETTES: Record<ColorMode, Palette> = {
  speed: {
    c0: [0.13, 0.32, 0.85],
    c1: [0.25, 0.85, 0.96],
    c2: [1.0, 0.96, 0.78],
    trail: [0.35, 0.72, 0.95],
  },
  mass: {
    c0: [0.32, 0.3, 0.92],
    c1: [0.82, 0.32, 0.78],
    c2: [1.0, 0.82, 0.42],
    trail: [0.62, 0.5, 0.95],
  },
  radius: {
    c0: [0.1, 0.62, 0.7],
    c1: [0.55, 0.9, 0.58],
    c2: [1.0, 0.98, 0.86],
    trail: [0.45, 0.85, 0.7],
  },
  stellar: {
    c0: [0.6, 0.7, 0.95],
    c1: [0.9, 0.92, 0.85],
    c2: [1.0, 0.85, 0.6],
    trail: [0.5, 0.55, 0.7],
  },
};

export const COLOR_MODE_LABEL: Record<ColorMode, string> = {
  speed: '速度',
  mass: '质量',
  radius: '距心距离',
  stellar: '恒星光谱',
};

/** hex → RGB 0..1。 */
export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ];
}

/**
 * 恒星色查表（H1/H2/H3：长度跟随 STAR_TYPE_CODES 动态生成，含褐矮星与三相相位色）。
 * 索引即 starTypeCode；'auto' 运行时不会出现，映射到 planet 灰兜底。
 */
export const STAR_COLOR_COUNT = STAR_TYPE_CODES.length;

export const STELLAR_COLOR_LUT: Float32Array = (() => {
  const lut = new Float32Array(STAR_COLOR_COUNT * 3);
  for (let code = 0; code < STAR_COLOR_COUNT; code++) {
    const t = STAR_TYPE_CODES[code];
    const hex = t !== 'auto' && STELLAR_COLORS[t as RuntimeStarType]
      ? STELLAR_COLORS[t as RuntimeStarType]
      : '#8a8f98';
    const [r, g, b] = hexToRgb(hex);
    lut[code * 3] = r;
    lut[code * 3 + 1] = g;
    lut[code * 3 + 2] = b;
  }
  return lut;
})();

/** 按类型取恒星色（供信息卡/测试用）。 */
export function stellarColor(type: RuntimeStarType): [number, number, number] {
  return hexToRgb(STELLAR_COLORS[type]);
}
