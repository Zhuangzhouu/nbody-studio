import { describe, expect, it } from 'vitest';
import { ConfigHistory, ReplayBuffer } from '../src/ui/app-enhanced';
import { DEFAULT_INIT, DEFAULT_PHYSICS, DEFAULT_RUN, DEFAULT_VIEW } from '../src/core/params';
import type { SimulationConfig } from '../src/core/types';

function cfg(n = 1): SimulationConfig {
  return {
    schema: 'nbody-studio/v2',
    version: 2,
    dimensions: 2,
    physics: { ...DEFAULT_PHYSICS, dimensions: 2 },
    init: { ...DEFAULT_INIT, count: n },
    view: { ...DEFAULT_VIEW },
    run: { ...DEFAULT_RUN },
  };
}

describe('E3 配置历史', () => {
  it('push / undo / redo 保序且深拷贝', () => {
    const h = new ConfigHistory();
    const c0 = cfg(1);
    const c1 = cfg(2);
    // 真实用法：apply 前 push 当前配置
    h.push(c0, '初始');
    h.push(c0, '改数量'); // 改数量前的状态是 c0
    const undone = h.undo(c1)!;
    expect(undone.label).toBe('改数量');
    expect(undone.config.init.count).toBe(1);
    undone.config.init.count = 99;
    expect(c0.init.count).toBe(1); // 深拷贝
    const redone = h.redo(undone.config)!;
    expect(redone.config.init.count).toBe(2);
  });

  it('上限 50', () => {
    const h = new ConfigHistory(3);
    for (let i = 0; i < 5; i++) h.push(cfg(i + 1), `c${i}`);
    expect(h.undoLabel).toBe('c4');
    h.undo(cfg(5));
    h.undo(cfg(4));
    h.undo(cfg(3));
    expect(h.undoLabel).toBeNull();
  });

  it('新操作清空 redo 栈', () => {
    const h = new ConfigHistory();
    h.push(cfg(1), 'a');
    h.push(cfg(2), 'b');
    h.undo(cfg(2));
    h.push(cfg(3), 'c');
    expect(h.redoLabel).toBeNull();
  });
});

describe('F5 回放缓冲', () => {
  it('环形容量与游标', () => {
    const r = new ReplayBuffer<number>(3);
    for (let i = 0; i < 5; i++) r.push(i);
    expect(r.size).toBe(3);
    expect(r.latest).toBe(4);
    expect(r.step(-1)).toBe(3); // 首次进入回放，从最新帧往前一帧
    expect(r.step(-1)).toBe(2);
    expect(r.step(1)).toBe(3);
    expect(r.step(1)).toBe(4); // 到达末端后钳制在末帧
    expect(r.position).toBe(2);
  });

  it('clear 后不活跃', () => {
    const r = new ReplayBuffer<number>();
    r.push(1);
    r.clear();
    expect(r.active).toBe(false);
    expect(r.step(-1)).toBeNull();
  });
});
