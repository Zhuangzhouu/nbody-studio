/**
 * 客户端资源防护（不是服务端 DDoS 防护）。
 *
 * 本应用为纯静态前端，无后端、无 API、无 WebSocket：不存在攻击者打垮服务器的面。
 * 真实风险是「恶意配置让某个浏览器自身卡死」，等价于针对客户端的 DoS。
 * 本模块用三道闸限制：
 *   1. 输入体积（分享链接 / 配置文本 / 导入文件）
 *   2. 调用频率（防止连续重建堆积 Worker 任务）
 *   3. 单步计算超时（防止病态配置把 Worker 卡死）
 */

/** 分享链接 hash 最大长度（gzip+base64 后，正常完整配置约 400–800 字符）。 */
export const MAX_HASH_LENGTH = 16_000;
/** 配置文本最大字符数（逐体 10 万条约 8 MB，留足余量）。 */
export const MAX_CONFIG_TEXT = 12_000_000;
/** 导入文件最大字节数。 */
export const MAX_IMPORT_BYTES = 24_000_000;
/** 两次重建之间的最小间隔（毫秒）。 */
export const MIN_REBUILD_INTERVAL = 250;
/** 单次 Worker 计算超时（毫秒）。 */
export const WORKER_TIMEOUT = 30_000;

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/** 检查分享链接 hash 长度，超限拒绝（防止超大 hash 触发 gunzip 内存爆炸）。 */
export function guardShareHash(hash: string): GuardResult {
  if (hash.length > MAX_HASH_LENGTH) {
    return {
      ok: false,
      reason: `分享链接过长（${hash.length} 字符，上限 ${MAX_HASH_LENGTH}）`,
    };
  }
  return { ok: true };
}

/** 检查配置文本大小。 */
export function guardConfigText(text: string): GuardResult {
  if (text.length > MAX_CONFIG_TEXT) {
    return {
      ok: false,
      reason: `配置文本过大（${(text.length / 1e6).toFixed(1)} MB，上限 ${MAX_CONFIG_TEXT / 1e6} MB）`,
    };
  }
  return { ok: true };
}

/** 检查导入文件大小。 */
export function guardImportFile(size: number): GuardResult {
  if (size > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      reason: `导入文件过大（${(size / 1e6).toFixed(1)} MB，上限 ${MAX_IMPORT_BYTES / 1e6} MB）`,
    };
  }
  return { ok: true };
}

/** 频率限制器：固定窗口内的最小间隔。 */
export class RateLimiter {
  private last = 0;

  constructor(private readonly intervalMs: number = MIN_REBUILD_INTERVAL) {}

  /** 返回是否允许本次调用；拒绝时不重置计时，避免连续点击持续通过。 */
  allow(now = performance.now()): boolean {
    // last=0 表示首次调用，直接放行（避免启动卡死）
    if (this.last > 0 && now - this.last < this.intervalMs) return false;
    this.last = now;
    return true;
  }

  reset(): void {
    this.last = 0;
  }
}

/**
 * Worker 看门狗：超时触发回调（由上层提示用户并检查是否病态配置）。
 * 收到任意消息即视为存活，重置计时。
 */
export class WorkerWatchdog {
  private timer: ReturnType<typeof setTimeout> | number | null = null;
  private armed = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {}

  /** 启动/重置计时。 */
  kick(): void {
    this.clear();
    this.armed = true;
    this.timer = setTimeout(() => {
      if (this.armed) {
        this.armed = false;
        this.onTimeout();
      }
    }, this.timeoutMs);
  }

  /** 收到 Worker 消息时调用，重置计时。 */
  heartbeat(): void {
    if (this.armed) this.kick();
  }

  /** 计算完成，解除计时。 */
  disarm(): void {
    this.armed = false;
    this.clear();
  }

  private clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
