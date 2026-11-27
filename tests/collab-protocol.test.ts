import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** 协作服务器的静态约束（防止回归到 OOM 的帧解析 bug）。 */
const serverSrc = readFileSync(new URL('../server/collab.mjs', import.meta.url), 'utf8');

describe('协作中继协议约束', () => {
  it('帧解析使用游标推进，不回头处理已消费字节', () => {
    expect(serverSrc).toContain('let pos = 0');
    expect(serverSrc).toContain('pos += offset + len');
    expect(serverSrc).toContain('client.buffer = pos > 0 ? buf.subarray(pos) : buf');
  });

  it('有消息限流与房间人数上限', () => {
    expect(serverSrc).toContain('MAX_MESSAGES_PER_SEC');
    expect(serverSrc).toContain('MAX_CLIENTS_PER_ROOM');
    expect(serverSrc).toContain('消息频率过高');
  });

  it('主控离开时转让控制权', () => {
    expect(serverSrc).toContain('client.isController');
    expect(serverSrc).toContain('next.isController = true');
  });

  it('非主控不能改配置或播放状态', () => {
    expect(serverSrc).toContain('只有主控可以修改配置或播放状态');
  });

  it('客户端支持自动重连与指数退避', () => {
    const clientSrc = readFileSync(new URL('../src/net/collab.ts', import.meta.url), 'utf8');
    expect(clientSrc).toContain('scheduleRetry');
    expect(clientSrc).toContain('2 ** Math.min(this.retry');
    // Worker 心跳在服务端实现
    expect(serverSrc).toContain('HEARTBEAT_MS');
  });
});
