/**
 * 多人协作客户端：WebSocket 连接、自动重连、事件分发。
 *
 * 服务端只中继消息，不算物理；每个客户端各自跑本地 Worker。
 * 同步内容：配置（主控）、播放状态（主控）、相机、光标、成员列表。
 */

export interface Member {
  id: number;
  name: string;
  color: string;
  isController: boolean;
}

export interface CollabCallbacks {
  onStatus: (status: 'offline' | 'connecting' | 'online' | 'error', text?: string) => void;
  onRoster: (members: Member[]) => void;
  onSystem: (text: string) => void;
  onConfig: (config: unknown) => void;
  onRun: (run: { playing: boolean; speed: number }) => void;
  onCamera: (camera: { cx: number; cy: number; zoom: number }) => void;
  onCursor: (cursor: { x: number; y: number; name: string; color: string }) => void;
  onRequestState: () => { config?: unknown; run?: unknown; camera?: unknown };
  onError: (text: string) => void;
}

/** 默认中继地址：与页面同源时优先用 ws(s)，否则用本机 3001。 */
export function defaultRelayUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const custom = new URLSearchParams(location.search).get('relay');
  if (custom) return custom;
  // 静态站点部署时若协作服务器同机不同端口，可通过 ?relay= 指定
  return `${proto}//${location.hostname}:3001`;
}

export class CollabClient {
  private ws: WebSocket | null = null;
  private room: string | null = null;
  private name = '';
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private lastCursorSent = 0;

  constructor(
    private readonly url: string,
    private readonly cb: CollabCallbacks,
  ) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get roomId(): string | null {
    return this.room;
  }

  join(room: string, name: string): void {
    this.room = room;
    this.name = name;
    this.closedByUser = false;
    this.retry = 0;
    this.connect();
  }

  leave(): void {
    this.closedByUser = true;
    this.room = null;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.cb.onStatus('offline');
    this.cb.onRoster([]);
  }

  private connect(): void {
    if (this.closedByUser || !this.room) return;
    this.cb.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.cb.onStatus('online');
      this.send({ t: 'join', room: this.room, name: this.name });
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      this.dispatch(msg);
    };

    ws.onerror = () => {
      this.cb.onStatus('error', '协作服务器连接失败');
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUser) {
        this.cb.onStatus('offline');
        this.scheduleRetry();
      }
    };
  }

  private scheduleRetry(): void {
    if (this.closedByUser || this.retryTimer) return;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.retry++, 6));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'joined':
        this.cb.onStatus('online', `已加入房间 ${String(msg.room)}`);
        break;
      case 'roster':
        this.cb.onRoster((msg.members as Member[]) ?? []);
        break;
      case 'system':
        this.cb.onSystem(String(msg.text ?? ''));
        break;
      case 'error':
        this.cb.onError(String(msg.text ?? ''));
        break;
      case 'config':
        this.cb.onConfig(msg.config);
        break;
      case 'run':
        this.cb.onRun(msg.run as { playing: boolean; speed: number });
        break;
      case 'camera':
        this.cb.onCamera(msg.camera as { cx: number; cy: number; zoom: number });
        break;
      case 'cursor':
        this.cb.onCursor(msg.cursor as { x: number; y: number; name: string; color: string });
        break;
      case 'request-state': {
        const state = this.cb.onRequestState();
        this.send({ t: 'request-state', to: msg.to, ...state });
        break;
      }
      default:
        break;
    }
  }

  // ------------- 对外发送 API -------------

  publishConfig(config: unknown): void {
    this.send({ t: 'config', config });
  }

  publishRun(run: { playing: boolean; speed: number }): void {
    this.send({ t: 'run', run });
  }

  publishCamera(camera: { cx: number; cy: number; zoom: number }): void {
    this.send({ t: 'camera', camera });
  }

  /** 光标限频 20Hz，避免刷屏。 */
  publishCursor(x: number, y: number, name: string, color: string): void {
    const now = performance.now();
    if (now - this.lastCursorSent < 50) return;
    this.lastCursorSent = now;
    this.send({ t: 'cursor', cursor: { x, y, name, color } });
  }

  claimControl(): void {
    this.send({ t: 'claim' });
  }

  rename(name: string): void {
    this.name = name;
    this.send({ t: 'rename', name });
  }
}
