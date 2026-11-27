import { describe, expect, it, vi } from 'vitest';
import {
  MAX_HASH_LENGTH,
  MAX_CONFIG_TEXT,
  MAX_IMPORT_BYTES,
  guardShareHash,
  guardConfigText,
  guardImportFile,
  RateLimiter,
  WorkerWatchdog,
} from '../src/ui/guard';

describe('客户端资源防护', () => {
  it('分享链接长度超限被拒', () => {
    expect(guardShareHash('abc').ok).toBe(true);
    const r = guardShareHash('x'.repeat(MAX_HASH_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('分享链接过长');
  });

  it('配置文本与导入文件超限被拒', () => {
    expect(guardConfigText('{}').ok).toBe(true);
    expect(guardConfigText('x'.repeat(MAX_CONFIG_TEXT + 1)).ok).toBe(false);
    expect(guardImportFile(100).ok).toBe(true);
    expect(guardImportFile(MAX_IMPORT_BYTES + 1).ok).toBe(false);
  });

  it('频率限制：首次放行、窗口内拒绝、窗口后放行', () => {
    const r = new RateLimiter(250);
    expect(r.allow(1000)).toBe(true);
    expect(r.allow(1100)).toBe(false);
    expect(r.allow(1300)).toBe(true);
  });

  it('重置后首次调用仍放行', () => {
    const r = new RateLimiter(250);
    expect(r.allow(1000)).toBe(true);
    r.reset();
    expect(r.allow(1010)).toBe(true);
  });

  it('看门狗超时触发一次，disarm 后不再触发', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const w = new WorkerWatchdog(1000, cb);
    w.kick();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
    w.disarm();
    vi.useRealTimers();
  });

  it('看门狗 heartbeat 重置计时', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const w = new WorkerWatchdog(1000, cb);
    w.kick();
    vi.advanceTimersByTime(800);
    w.heartbeat();
    vi.advanceTimersByTime(800);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
