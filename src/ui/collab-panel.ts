/** 多人协作面板：房间加入/退出、成员列表、主控切换、状态提示。 */

import { el } from './widgets';
import type { CollabClient, Member } from '../net/collab';

export interface CollabPanelCallbacks {
  onJoin: (room: string, name: string) => void;
  onLeave: () => void;
  onClaim: () => void;
  onRename: (name: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  offline: '未连接',
  connecting: '连接中…',
  online: '在线',
  error: '连接失败',
};

export class CollabPanel {
  readonly root: HTMLElement;
  private statusEl: HTMLElement;
  private membersEl: HTMLElement;
  private roomInput: HTMLInputElement;
  private nameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private leaveBtn: HTMLButtonElement;
  private claimBtn: HTMLButtonElement;
  private client: CollabClient | null = null;
  private members: Member[] = [];

  constructor(parent: HTMLElement, private readonly cb: CollabPanelCallbacks) {
    this.root = el('section', 'section');
    this.root.id = 'collab-section';
    const head = el('div', 'section-head');
    head.append(el('span', '', '多人协作'));
    const body = el('div', 'section-body');

    const row = el('div', 'chips');
    this.roomInput = el('input') as HTMLInputElement;
    this.roomInput.type = 'text';
    this.roomInput.id = 'collab-room';
    this.roomInput.placeholder = '房间号（如 star-1）';
    this.nameInput = el('input') as HTMLInputElement;
    this.nameInput.type = 'text';
    this.nameInput.id = 'collab-name';
    this.nameInput.placeholder = '你的昵称';
    this.nameInput.value = `访客${Math.floor(Math.random() * 900 + 100)}`;
    row.append(this.roomInput, this.nameInput);

    const actions = el('div', 'chips');
    this.joinBtn = el('button', 'btn btn--apply', '加入房间') as HTMLButtonElement;
    this.joinBtn.id = 'collab-join';
    this.joinBtn.type = 'button';
    this.joinBtn.addEventListener('click', () => {
      const room = this.roomInput.value.trim();
      const name = this.nameInput.value.trim();
      if (!room) { this.setStatus('offline', '请输入房间号'); return; }
      this.cb.onJoin(room, name || '匿名');
    });
    this.leaveBtn = el('button', 'chip', '退出房间') as HTMLButtonElement;
    this.leaveBtn.id = 'collab-leave';
    this.leaveBtn.type = 'button';
    this.leaveBtn.disabled = true;
    this.leaveBtn.addEventListener('click', () => this.cb.onLeave());
    this.claimBtn = el('button', 'chip', '获取主控权') as HTMLButtonElement;
    this.claimBtn.id = 'collab-claim';
    this.claimBtn.type = 'button';
    this.claimBtn.disabled = true;
    this.claimBtn.addEventListener('click', () => this.cb.onClaim());
    actions.append(this.joinBtn, this.leaveBtn, this.claimBtn);

    this.statusEl = el('div', 'field-hint', STATUS_TEXT.offline);
    this.statusEl.id = 'collab-status';
    this.membersEl = el('div', 'collab-members');
    this.membersEl.id = 'collab-members';
    const hint = el('div', 'field-hint', '协作服务器默认 ws://本机:3001；部署到公网时可在网址加 ?relay=wss://你的域名 指定。');
    hint.style.fontSize = '10px';

    body.append(row, actions, this.statusEl, this.membersEl, hint);
    this.root.append(head, body);
    parent.append(this.root);
  }

  attach(client: CollabClient): void {
    this.client = client;
  }

  /** 从 URL 预填房间号（?room=xxx）。 */
  prefillRoom(room: string): void {
    this.roomInput.value = room;
  }

  setStatus(status: 'offline' | 'connecting' | 'online' | 'error', text?: string): void {
    this.statusEl.textContent = `状态：${STATUS_TEXT[status] ?? status}${text ? ` · ${text}` : ''}`;
    this.statusEl.style.color = status === 'online' ? '#5eead4' : status === 'error' ? '#f87171' : '';
    const connected = status === 'online';
    this.joinBtn.disabled = connected || status === 'connecting';
    this.leaveBtn.disabled = !connected;
    this.claimBtn.disabled = !connected;
  }

  setMembers(members: Member[]): void {
    this.members = members;
    this.membersEl.textContent = '';
    if (!members.length) return;
    const title = el('div', 'collab-members-title', `在线成员（${members.length}）`);
    this.membersEl.append(title);
    for (const m of members) {
      const row = el('div', 'collab-member');
      const dot = el('span', 'collab-dot');
      dot.style.background = m.color;
      const name = el('span', '', m.name || `访客${m.id}`);
      row.append(dot, name);
      if (m.isController) {
        const badge = el('span', 'collab-badge', '主控');
        row.append(badge);
      }
      this.membersEl.append(row);
    }
  }

  isController(): boolean {
    return this.members.some((m) => m.isController && m.id === this.selfId);
  }

  private selfId = -1;

  setSelfId(id: number): void {
    this.selfId = id;
  }
}
