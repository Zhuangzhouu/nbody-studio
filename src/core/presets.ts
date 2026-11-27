/**
 * 预设场景库：每个预设编译为标准 SimulationConfig，走与 JSON 导入完全相同的管线。
 */

import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_RUN, DEFAULT_VIEW } from './params';
import { orbitAround } from './orbit';
import { DEFAULT_STELLAR } from './params';
import { Rng } from './rng';
import type { BodyConfig, SimulationConfig } from './types';

export interface PresetDef {
  id: string;
  name: string;
  description: string;
  dimensions: 2 | 3;
  build(): SimulationConfig;
}

function config(bodies: BodyConfig[], dimensions: 2 | 3, patch: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    schema: 'nbody-studio/v2',
    version: 2,
    dimensions,
    physics: { ...DEFAULT_PHYSICS, dimensions, collision: 'none' },
    init: { ...DEFAULT_INIT, count: bodies.length, distribution: 'disc' },
    view: { ...DEFAULT_VIEW, trailBodies: Math.min(400, bodies.length) },
    run: { ...DEFAULT_RUN },
    bodies,
    ...patch,
  };
}

/** figure-8 三体：Chenciner–Montgomery 解，周期约 6.3259。 */
function figure8(): SimulationConfig {
  const r1 = { x: 0.97000436, y: -0.24308753, z: 0 };
  const v3 = { x: -0.93240737, y: -0.86473146, z: 0 };
  const bodies: BodyConfig[] = [
    { id: 1, x: r1.x, y: r1.y, z: 0, vx: -v3.x / 2, vy: -v3.y / 2, vz: 0, mass: 1 },
    { id: 2, x: -r1.x, y: -r1.y, z: 0, vx: -v3.x / 2, vy: -v3.y / 2, vz: 0, mass: 1 },
    { id: 3, x: 0, y: 0, z: 0, vx: v3.x, vy: v3.y, vz: 0, mass: 1 },
  ];
  return config(bodies, 2, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, G: 1, dt: 0.02, softening: 0, collision: 'none', integrator: 'verlet' },
  });
}

/** 拉格朗日等边三角旋转解。 */
function lagrange(): SimulationConfig {
  const d = 10;
  const m = 10;
  const G = 1;
  const v = Math.sqrt((G * m) / d);
  const R = d / Math.sqrt(3);
  const bodies: BodyConfig[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    bodies.push({
      id: i + 1,
      x: R * Math.cos(a),
      y: R * Math.sin(a),
      z: 0,
      vx: -v * Math.sin(a),
      vy: v * Math.cos(a),
      vz: 0,
      mass: m,
    });
  }
  return config(bodies, 2, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, G, dt: 0.005, softening: 0, collision: 'none' },
  });
}

/** 中心恒星 + 5 颗圆轨道行星 + 1 颗 e=0.6 彗星。 */
function starPlanets(): SimulationConfig {
  const G = 1;
  const M = 1000;
  const bodies: BodyConfig[] = [{ id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: M }];
  for (let i = 0; i < 5; i++) {
    const r = 4 + i * 4;
    const orbit = orbitAround({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, r, 'xy', G * M);
    bodies.push({ id: i + 1, ...orbit, mass: 0.1 });
  }
  // 彗星：e=0.6，取近心点 q=3，v_p = sqrt(μ(1+e)/q)
  const q = 3;
  const e = 0.6;
  const vp = Math.sqrt((G * M * (1 + e)) / q);
  bodies.push({ id: 6, x: q, y: 0, z: 0, vx: 0, vy: vp, vz: 0, mass: 0.01 });
  return config(bodies, 3, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 3, G, dt: 0.005, collision: 'none' },
  });
}

/** 双星 + 环星。 */
function binaryRing(): SimulationConfig {
  const G = 1;
  const m = 100;
  const d = 8;
  const v = Math.sqrt((G * m) / (2 * d));
  const bodies: BodyConfig[] = [
    { id: 1, x: -d / 2, y: 0, z: 0, vx: 0, vy: -v, vz: 0, mass: m },
    { id: 2, x: d / 2, y: 0, z: 0, vx: 0, vy: v, vz: 0, mass: m },
  ];
  const R = 30;
  const orbit = orbitAround({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, R, 'xy', G * 2 * m);
  bodies.push({ id: 3, ...orbit, mass: 0.1 });
  return config(bodies, 2, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, G, dt: 0.01, collision: 'none' },
  });
}

/** 星系对撞：两份偏置的盘相向运动。 */
function galaxyCollision(): SimulationConfig {
  const nEach = 2000;
  const bodies: BodyConfig[] = [];
  const R = 18;
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? -1 : 1;
    const cx = sign * 30;
    const vx = sign * 1.5;
    const core: BodyConfig = {
      id: side * (nEach + 1),
      x: cx,
      y: 0,
      z: 0,
      vx,
      vy: 0,
      vz: 0,
      mass: 500,
    };
    bodies.push(core);
    const mu = 500;
    for (let i = 0; i < nEach; i++) {
      const t = (i + 0.5) / nEach;
      const r = R * Math.sqrt(t);
      const a = i * 2.399963;
      const vc = Math.sqrt((mu * t) / Math.max(r, 1e-6));
      bodies.push({
        id: side * (nEach + 1) + i + 1,
        x: cx + r * Math.cos(a),
        y: r * Math.sin(a),
        z: (i % 7 - 3) * 0.05,
        vx: vx - vc * Math.sin(a),
        vy: vc * Math.cos(a),
        vz: 0,
        mass: 0.05,
      });
    }
  }
  return config(bodies, 3, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 3, G: 1, dt: 0.01, collision: 'none' },
  });
}

/** 正负混合（D4）：两正一负引力参数。 */
function mixedGravity(): SimulationConfig {
  const bodies: BodyConfig[] = [
    { id: 1, x: -8, y: 0, z: 0, vx: 0, vy: -0.45, vz: 0, mass: 2, grav: 2 },
    { id: 2, x: 8, y: 0, z: 0, vx: 0, vy: 0.45, vz: 0, mass: 2, grav: 2 },
    { id: 3, x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, mass: 1, grav: -1 },
  ];
  return config(bodies, 2, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, collision: 'none' },
  });
}


/** 预设一：太阳系（光谱标定）。中心 G 型 1 M☉ + 5 圆轨道行星 + 显式行星彗星。 */
function solarSystem(): SimulationConfig {
  const bodies: BodyConfig[] = [{
    id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 1,
    star: { type: 'G', age: 4600 }, // 太阳当前年龄 ≈4.6 Gyr
  }];
  for (let i = 0; i < 5; i++) {
    const r = 4 + i * 5;
    const o = orbitAround({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, r, 'xy', 1, (i * Math.PI) / 3);
    bodies.push({ id: i + 1, ...o, mass: 0.01, star: { type: 'planet' } });
  }
  const comet = orbitAround({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 35, 'xy', 1, 0.4);
  bodies.push({ id: 6, ...comet, mass: 0.001, star: { type: 'planet' } });
  // H1：外圈褐矮星（0.05 M☉，介于行星与 M 矮星之间的氘燃烧天体，永驻不演化）
  const bd = orbitAround({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 44, 'xy', 1, 2.2);
  bodies.push({ id: 7, ...bd, mass: 0.05, star: { type: 'brownDwarf' } });
  return config(bodies, 3, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 3, G: 1, dt: 0.01, collision: 'none' },
    stellar: { ...DEFAULT_STELLAR, massUnit: 1, timeUnit: 1 },
  });
}

/** 预设二：大质量星团（超新星雨）。40 颗 8–40 M☉ 星，seed 固定可复现。 */
function supernovaRain(): SimulationConfig {
  const rng = new Rng(20261126);
  const bodies: BodyConfig[] = [];
  for (let i = 0; i < 40; i++) {
    const m = 8 + (i / 39) * 32; // 8 → 40 M☉，寿命按公式依次缩短
    const r = 6 + rng.next() * 24;
    const a = rng.next() * Math.PI * 2;
    const vc = Math.sqrt((40 * 0.25) / Math.max(1, r));
    bodies.push({
      id: i,
      x: r * Math.cos(a),
      y: r * Math.sin(a),
      z: (rng.next() - 0.5) * 2,
      vx: -vc * Math.sin(a) * 0.35,
      vy: vc * Math.cos(a) * 0.35,
      vz: (rng.next() - 0.5) * 0.02,
      mass: m,
      star: { type: 'auto' },
    });
  }
  return config(bodies, 3, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 3, G: 1, dt: 0.05, collision: 'none', softening: 0.6 },
    stellar: { ...DEFAULT_STELLAR, massUnit: 1, timeUnit: 1, kickGain: 1, kickRadius: 10 },
  });
}

/** 预设三：白矮星双星。两颗 0.8 M☉ 星，age 预置接近 t_MS。 */
function whiteDwarfBinary(): SimulationConfig {
  const m = 0.8;
  const tMs = 10000 * Math.pow(m, -2.5); // ≈17469 Myr
  const d = 6;
  const v = Math.sqrt((1 * m) / (2 * d));
  const bodies: BodyConfig[] = [
    { id: 1, x: -d / 2, y: 0, z: 0, vx: 0, vy: -v, vz: 0, mass: m, star: { type: 'auto', age: tMs - 20 } },
    { id: 2, x: d / 2, y: 0, z: 0, vx: 0, vy: v, vz: 0, mass: m, star: { type: 'auto', age: tMs - 20 } },
  ];
  return config(bodies, 2, {
    physics: { ...DEFAULT_PHYSICS, dimensions: 2, G: 1, dt: 0.05, collision: 'none', softening: 0.1 },
    stellar: { ...DEFAULT_STELLAR, massUnit: 1, timeUnit: 1 },
  });
}

export const PRESETS: PresetDef[] = [
  { id: 'figure8', name: 'figure-8 三体', description: '经典蝴蝶 orbit，周期约 6.33', dimensions: 2, build: figure8 },
  { id: 'lagrange', name: '拉格朗日等边三角', description: '三体等边三角旋转解', dimensions: 2, build: lagrange },
  { id: 'star-planets', name: '恒星与行星', description: '5 颗圆轨道行星 + 1 颗偏心彗星', dimensions: 3, build: starPlanets },
  { id: 'binary-ring', name: '双星与环星', description: '两颗互绕恒星 + 外围小天体', dimensions: 2, build: binaryRing },
  { id: 'galaxy-collision', name: '星系对撞', description: '两份 2000 体盘相向并合', dimensions: 3, build: galaxyCollision },
  { id: 'mixed-grav', name: '正负引力混合', description: '两正一负 grav 的排斥演示', dimensions: 2, build: mixedGravity },
  { id: 'solar-system', name: '太阳系（光谱标定）', description: 'G 型太阳 + 5 行星 + 彗星', dimensions: 3, build: solarSystem },
  { id: 'supernova-rain', name: '大质量星团（超新星雨）', description: '40 颗 8–40 M☉ 星依次爆发', dimensions: 3, build: supernovaRain },
  { id: 'wd-binary', name: '白矮星双星', description: '0.8 M☉ 双星到期变 WD 继续绕转', dimensions: 2, build: whiteDwarfBinary },
];

export function presetById(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}
