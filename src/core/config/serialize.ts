/**
 * 配置序列化：导出完整全局参数与逐体状态，支持 gzip 压缩（浏览器原生 API）。
 * 导出对齐到 v2 schema，bodies 数组放在最后，便于流式解析。
 */

import type { BodySet } from '../bodies';
import type { BodyConfig, SimulationConfig, StarType } from '../types';
import { DEFAULT_STELLAR } from '../params';
import { STAR_TYPE_CODES } from '../bodies';
import { validateConfig, type ValidationResult } from './validate';

export function configFromParams(
  physics: SimulationConfig['physics'],
  init: SimulationConfig['init'],
  view: SimulationConfig['view'],
  run: SimulationConfig['run'],
): SimulationConfig {
  return {
    schema: 'nbody-studio/v2',
    version: 2,
    meta: { name: 'N-Body Studio 模拟配置', createdAt: new Date().toISOString() },
    dimensions: physics.dimensions,
    physics: { ...physics },
    init: { ...init },
    view: { ...view },
    run: { ...run },
    stellar: { ...DEFAULT_STELLAR },
  };
}

/** 从天体集合导出逐体配置（初始或当前状态）。 */
export function bodiesFromSet(b: BodySet, limit = Infinity): BodyConfig[] {
  const count = Math.min(b.n, limit);
  const out: BodyConfig[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      id: i,
      x: b.x[i],
      y: b.y[i],
      z: b.dimensions === 3 ? b.z[i] : 0,
      vx: b.vx[i],
      vy: b.vy[i],
      vz: b.dimensions === 3 ? b.vz[i] : 0,
      mass: b.mass[i],
      ...(b.grav[i] !== b.mass[i] ? { grav: b.grav[i] } : {}),
      ...(b.explicitRadius[i] ? { radius: b.radius[i] } : {}),
      ...(b.starType[i] > 0 || b.evolvesFlag[i]
        ? { star: { type: exportStarType(b, i), age: 0 } }
        : {}),
    };
  }
  return out;
}

/**
 * H2/H3：相位类型（红巨星/红超巨星/沃尔夫-拉叶）不进配置层，导出时退化为
 * `auto` + age 0（导入后按质量重新推导、从零龄主序重新演化——相位不持久化，
 * 已在 README「已知限制」注明）；其余类型原样导出。
 */
function exportStarType(b: BodySet, i: number): StarType {
  const t = STAR_TYPE_CODES[b.starType[i]] ?? 'planet';
  if (t === 'giant' || t === 'supergiant' || t === 'wolfRayet') return 'auto';
  return t;
}

export function configToJSON(config: SimulationConfig, pretty = true): string {
  // T21：导出体数上限保护，防止超大配置生成 GB 级 JSON
  if (config.bodies && config.bodies.length > 1_000_000) {
    throw new Error(`导出天体数 ${config.bodies.length} 超过 100 万上限`);
  }
  return JSON.stringify(config, null, pretty ? 2 : 0);
}

export function parseConfigText(text: string): ValidationResult {
  try {
    // R48：括号深度预检，防止极深嵌套 JSON 触发解析器爆栈
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') {
        if (++depth > 64) {
          return { ok: false, config: null, errors: ['JSON 嵌套深度超过 64 层'], warnings: [] };
        }
      } else if (ch === '}' || ch === ']') depth--;
    }
    return validateConfig(JSON.parse(text));
  } catch (err) {
    return {
      ok: false,
      config: null,
      errors: [`JSON 语法错误：${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

/** gzip 压缩（Uint8Array → Uint8Array）。不支持时回退为原样。 */
export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as Record<string, unknown>).CompressionStream;
  if (typeof Ctor !== 'function') return data;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** gzip 解压。 */
export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as Record<string, unknown>).DecompressionStream;
  if (typeof Ctor !== 'function') return data;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  // R47：zip bomb 防护——解压后超过 12 MB 直接拒绝
  if (out.length > 12_000_000) throw new Error('解压后配置超过 12 MB 上限');
  return out;
}

/** 触发浏览器下载。 */
export function downloadBlob(filename: string, data: Uint8Array | string, mime = 'application/json'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
