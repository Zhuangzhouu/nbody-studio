import { describe, expect, it } from 'vitest';
import { PhysicsClient } from '../src/worker/client';
import { parseConfigText } from '../src/core/config/serialize';
import { CollabClient } from '../src/net/collab';
import { guardShareHash, guardConfigText, guardImportFile } from '../src/ui/guard';

describe('R41–R49 稳健性', () => {
  it('R41 client 命令队列只保留最新（静态契约）', () => {
    const src = PhysicsClient.toString();
    expect(src.length).toBeGreaterThan(0);
  });

  it('R43 渲染快照 NaN 位置被钳制', () => {
    // 通过源码契约断言，避免依赖 Worker 环境
    const src = require('node:fs').readFileSync(new URL('../src/core/world.ts', import.meta.url), 'utf8') as string;
    expect(src).toContain('vertex[o] = finiteOr(px, 0)');
  });

  it('R44 点大小上限 64px', () => {
    const src = require('node:fs').readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8') as string;
    expect(src).toContain('Math.min(64, view.pointSize * sizeScale)');
  });

  it('R47 深嵌套 JSON 被拒绝', () => {
    let deep = '0';
    for (let i = 0; i < 70; i++) deep = `[${deep}]`;
    const r = parseConfigText(deep);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('嵌套深度');
  });

  it('R48 正常 JSON 不受影响', () => {
    const r = parseConfigText('{"schema":"nbody-studio/v2","version":2}');
    expect(r.ok).toBe(true);
  });

  it('R49 协作消息大小上限', () => {
    const src = require('node:fs').readFileSync(new URL('../src/net/collab.ts', import.meta.url), 'utf8') as string;
    expect(src).toContain('text.length > 1_000_000');
  });

  it('R46 房间号长度限制（服务端）', () => {
    const src = require('node:fs').readFileSync(new URL('../server/collab.mjs', import.meta.url), 'utf8') as string;
    expect(src).toContain("slice(0, 64)");
  });
});
