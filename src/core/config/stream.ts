/**
 * 流式配置解析：处理「bodies 可能有数百万项」的 JSON 文件。
 *
 * 头部（全局参数）与尾部被保留，bodies 数组逐对象解析后立即通过回调交给调用方，
 * 不构造完整的 BodyConfig[] —— 因此导入大配置时内存占用与天体数无关。
 *
 * 约定：bodies 是最后一个顶层字段（导出器已保证）；其它顺序亦可解析，
 * 只要 bodies 对象本身是独立 JSON 对象。
 */

import type { BodyConfig, SimulationConfig } from '../types';
import { validateConfig, type ValidationResult } from './validate';

export interface StreamingResult {
  result: ValidationResult;
  /** 实际解析到的天体数量。 */
  bodyCount: number;
  /** 流式回调过程中收集的错误。 */
  errors: string[];
}

export class StreamingConfigParser {
  private head = '';
  private tail = '';
  private prefix = '';
  private phase: 'head' | 'arrayStart' | 'array' | 'tail' = 'head';
  private inString = false;
  private escaped = false;
  private depth = 0;
  private objectText = '';
  private bodyCount = 0;
  private errors: string[] = [];
  private onBody?: (body: BodyConfig, index: number) => void;

  constructor(onBody?: (body: BodyConfig, index: number) => void) {
    this.onBody = onBody;
  }

  push(chunk: string): void {
    for (let idx = 0; idx < chunk.length; idx++) {
      const ch = chunk[idx];
      this.consume(ch);
    }
  }

  private consume(ch: string): void {
    switch (this.phase) {
      case 'head': {
        this.prefix += ch;
        if (/"bodies"\s*:\s*$/.test(this.prefix)) {
          this.head = this.prefix.replace(/"bodies"\s*:\s*$/, '');
          this.prefix = '';
          this.phase = 'arrayStart';
        }
        break;
      }
      case 'arrayStart': {
        if (/\s/.test(ch)) break;
        if (ch !== '[') {
          this.errors.push(`bodies 后面应为 '['，实际为 '${ch}'`);
          this.phase = 'tail';
          this.tail = ch;
        } else {
          this.phase = 'array';
        }
        break;
      }
      case 'array': {
        if (this.inString) {
          this.objectText += ch;
          if (this.escaped) this.escaped = false;
          else if (ch === '\\') this.escaped = true;
          else if (ch === '"') this.inString = false;
          return;
        }
        if (this.depth === 0) {
          if (ch === '{') {
            this.depth = 1;
            this.objectText = '{';
          } else if (ch === ']') {
            this.phase = 'tail';
          } else if (ch === ',') {
            // 数组分隔符，忽略
          } else if (!/\s/.test(ch)) {
            this.errors.push(`bodies 数组包含非法字符 '${ch}'`);
          }
          return;
        }
        this.objectText += ch;
        if (ch === '"') this.inString = true;
        else if (ch === '{') this.depth++;
        else if (ch === '}') {
          this.depth--;
          if (this.depth === 0) {
            this.emitObject();
          }
        }
        break;
      }
      case 'tail':
        this.tail += ch;
        break;
    }
  }

  private emitObject(): void {
    const text = this.objectText;
    this.objectText = '';
    const index = this.bodyCount++;
    try {
      const parsed = JSON.parse(text) as unknown;
      // 复用完整校验器中的逐体规则：包一层临时配置
      const check = validateConfig({ bodies: [parsed] });
      if (!check.ok) {
        this.errors.push(...check.errors.map((e) => e.replace('bodies[0]', `bodies[${index}]`)));
        return;
      }
      const body = check.config?.bodies?.[0];
      if (body) this.onBody?.(body, index);
    } catch (err) {
      this.errors.push(`bodies[${index}] JSON 解析失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  finish(): StreamingResult {
    if (this.phase === 'head') {
      // 没有 bodies 字段：直接解析整段文本
      const all = this.prefix;
      let result: ValidationResult;
      try {
        result = validateConfig(JSON.parse(all));
      } catch (err) {
        result = {
          ok: false,
          config: null,
          errors: [`JSON 语法错误：${err instanceof Error ? err.message : String(err)}`],
          warnings: [],
        };
      }
      return { result, bodyCount: 0, errors: this.errors };
    }

    // 用空 bodies 替换原数组，重建合法头部 JSON
    const assembled = `${this.head}"bodies":[]${this.tail}`;
    let result: ValidationResult;
    try {
      result = validateConfig(JSON.parse(assembled));
    } catch (err) {
      result = {
        ok: false,
        config: null,
        errors: [`JSON 头部/尾部语法错误：${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      };
    }
    return { result, bodyCount: this.bodyCount, errors: this.errors };
  }
}

/** 一次性解析文本并逐体回调（便捷入口）。 */
export function parseConfigStreaming(
  text: string,
  onBody?: (body: BodyConfig, index: number) => void,
): StreamingResult {
  const parser = new StreamingConfigParser(onBody);
  parser.push(text);
  return parser.finish();
}

/** 从 Blob/File 分块读取，边读边解析。 */
export async function parseConfigFile(
  file: Blob,
  onBody?: (body: BodyConfig, index: number) => void,
  onProgress?: (fraction: number) => void,
): Promise<StreamingResult> {
  const parser = new StreamingConfigParser(onBody);
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let processed = 0;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      const text = decoder.decode(chunk.value, { stream: !done });
      parser.push(text);
      processed += chunk.value.byteLength;
      onProgress?.(file.size > 0 ? processed / file.size : 1);
    }
  }
  return parser.finish();
}

/** 类型占位：确保 SimulationConfig 被引用（流式结果的类型契约）。 */
export type StreamingConfig = SimulationConfig;
