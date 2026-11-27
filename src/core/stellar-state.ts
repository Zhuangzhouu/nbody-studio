/**
 * G1/G2：恒星状态与 BodySet 旁路数组的同步工具。
 * 所有写入 starType / birthMyr / lifespanMyr / evolvesFlag 的地方都走这里，
 * 保证 buildFromConfigs / addBodies / 演化状态机 / 并合 的口径一致。
 */

import { starTypeCode, type BodySet } from './bodies';
import {
  evolves,
  mainSequenceLifespan,
  neverEvolves,
  physMass,
  resolveStarType,
} from './stellar';
import type { BodyConfig, StarType, StellarConfig } from './types';

/** 把 BodyConfig 的恒星字段写入 SoA 旁路数组。 */
export function applyStarConfig(
  b: BodySet,
  i: number,
  cfg: BodyConfig,
  stellar: StellarConfig,
  worldTimeMyr: number,
): void {
  const massUnit = Math.max(1e-12, stellar.massUnit);
  const mPhys = physMass(cfg.mass, stellar);
  const canEvolve = evolves(cfg, massUnit);
  const type: StarType | 'auto' = cfg.star?.type && cfg.star.type !== 'auto'
    ? cfg.star.type
    : 'auto';
  b.starType[i] = starTypeCode(type);
  b.evolvesFlag[i] = canEvolve ? 1 : 0;
  const age = Math.max(0, cfg.star?.age ?? 0);
  // birthMyr = 当前世界时间 − 初始年龄，使 age = worldTimeMyr − birthMyr
  b.birthMyr[i] = worldTimeMyr - age;
  // H2/H3：相位事件/星风批量应用时刻初始化为当前世界时间
  b.phaseAppliedMyr[i] = worldTimeMyr;
  b.lifespanMyr[i] = canEvolve && !neverEvolves(mPhys)
    ? mainSequenceLifespan(mPhys)
    : 0;
  // 运行时渲染/徽标用具体光谱型：auto 体立即推导并缓存
  if (type === 'auto') {
    b.starType[i] = starTypeCode(resolveStarType(cfg, massUnit));
  }
}

/** 天体年龄（物理 Myr）。 */
export function starAge(b: BodySet, i: number, worldTimeMyr: number): number {
  return Math.max(0, worldTimeMyr - b.birthMyr[i]);
}

/** 质量变更后刷新类型/寿命（并合后调用）。 */
export function refreshStarAfterMassChange(
  b: BodySet,
  i: number,
  stellar: StellarConfig,
  worldTimeMyr: number,
): void {
  const mPhys = physMass(b.mass[i], stellar);
  // 遗骸不重分类
  const current = b.starAt(i);
  if (current === 'whiteDwarf' || current === 'neutronStar' || current === 'blackHole') {
    b.evolvesFlag[i] = 0;
    b.lifespanMyr[i] = 0;
    return;
  }
  // H2/H3：演化相位（红巨星/红超巨星/沃尔夫-拉叶）不因质量变化重推导——
  // WR 星风流失期间必须保持相位与已固定的相时长（lifespanMyr），否则相边界漂移
  if (current === 'giant' || current === 'supergiant' || current === 'wolfRayet') {
    return;
  }
  if (!b.evolvesFlag[i]) return;
  b.starType[i] = starTypeCode(resolveStarType(
    { x: 0, y: 0, vx: 0, vy: 0, mass: b.mass[i] },
    stellar.massUnit,
  ));
  b.lifespanMyr[i] = neverEvolves(mPhys) ? 0 : mainSequenceLifespan(mPhys);
  b.birthMyr[i] = Math.min(b.birthMyr[i], worldTimeMyr);
}
