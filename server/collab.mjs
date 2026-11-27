/**
 * N-Body Studio 多人协作中继服务器（零运行时依赖）。
 *
 * 用 Node 内置 http/crypto 手写 WebSocket（RFC 6455），不引入 ws/socket.io。
 * 服务端只做消息中继，不算物理：每个客户端各自在浏览器跑 Web Worker。
 *
 * 启动：node server/collab.mjs
 * 默认监听 0.0.0.0:3001，允许局域网访问。
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.COLLAB_PORT || 3001);
const HOST = process.env.COLLAB_HOST || '0.0.0.0';
const MAX_MESSAGE_BYTES = 2_000_000;
const MAX_MESSAGES_PER_SEC = 40;
const MAX_ROOMS = 200;
const MAX_CLIENTS_PER_ROOM = 20;
const HEARTBEAT_MS = 30_000;

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** 房间：roomId -> Set<Client> */
const rooms = new Map();

let nextId = 1;

function sendText(ws, text) {
  if (ws.destroyed) return;
  const payload = Buffer.from(text);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { ws.write(Buffer.concat([header, payload])); } catch { /* 连接已关闭 */ }
}

function broadcast(roomId, from, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  const text = JSON.stringify(obj);
  for (const c of room) {
    if (c !== from) sendText(c.ws, text);
  }
}

function roster(room) {
  return [...room].map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    isController: c.isController,
  }));
}

function sendRoster(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify({ t: 'roster', members: roster(room), at: Date.now() });
  for (const c of room) sendText(c.ws, msg);
}

function leaveRoom(client) {
  const room = rooms.get(client.room);
  if (!room) return;
  room.delete(client);
  if (room.size === 0) {
    rooms.delete(client.room);
  } else {
    // 主控离开则把主控权交给最早加入的剩余成员
    if (client.isController) {
      const next = room.values().next().value;
      if (next) next.isController = true;
    }
    sendRoster(client.room);
    broadcast(client.room, null, { t: 'system', text: `${client.name} 已离开`, at: Date.now() });
  }
  client.room = null;
}

function handleMessage(client, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.t !== 'string') return;

  // 限流：每客户端每秒最多 N 条，防止脚本刷屏
  const now = Date.now();
  if (now - client.windowStart >= 1000) {
    client.windowStart = now;
    client.messageCount = 0;
  }
  if (++client.messageCount > MAX_MESSAGES_PER_SEC) {
    sendText(client.ws, JSON.stringify({ t: 'error', text: '消息频率过高，已暂时丢弃' }));
    return;
  }

  if (msg.t === 'join') {
    if (client.room) leaveRoom(client);
    const roomId = String(msg.room || 'default').slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '');
    if (!roomId) return;
    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) {
        sendText(client.ws, JSON.stringify({ t: 'error', text: '房间数已达上限' }));
        return;
      }
      room = new Set();
      rooms.set(roomId, room);
    }
    if (room.size >= MAX_CLIENTS_PER_ROOM) {
      sendText(client.ws, JSON.stringify({ t: 'error', text: '房间已满（上限 20 人）' }));
      return;
    }
    client.room = roomId;
    client.name = String(msg.name || `访客${client.id}`).slice(0, 24);
    client.color = COLORS[client.id % COLORS.length];
    // 第一个加入者自动成为主控
    client.isController = room.size === 0;
    room.add(client);
    sendText(client.ws, JSON.stringify({ t: 'joined', room: roomId, id: client.id, color: client.color }));
    sendRoster(roomId);
    broadcast(roomId, client, { t: 'system', text: `${client.name} 已加入`, at: now });
    // 把当前配置/播放状态发给新加入者（由房间内第一个成员响应）
    broadcast(roomId, client, { t: 'request-state', to: client.id });
    return;
  }

  if (!client.room) return;
  const roomId = client.room;

  switch (msg.t) {
    case 'request-state': {
      // 只让主控回应，避免多人同时发
      if (client.isController) {
        const target = [...rooms.get(roomId) || []].find((c) => c.id === msg.to);
        if (target) {
          if (msg.config) sendText(target.ws, JSON.stringify({ t: 'config', config: msg.config, from: client.id }));
          if (msg.run) sendText(target.ws, JSON.stringify({ t: 'run', run: msg.run, from: client.id }));
          if (msg.camera) sendText(target.ws, JSON.stringify({ t: 'camera', camera: msg.camera, from: client.id }));
        }
      }
      break;
    }
    case 'config':
    case 'run':
    case 'camera':
    case 'cursor':
    case 'chat':
      // 只有主控能改配置/播放；相机与光标所有人可发
      if ((msg.t === 'config' || msg.t === 'run') && !client.isController) {
        sendText(client.ws, JSON.stringify({ t: 'error', text: '只有主控可以修改配置或播放状态' }));
        return;
      }
      broadcast(roomId, client, { ...msg, from: client.id, at: now });
      break;
    case 'claim': {
      // 请求主控权：当前主控同意或离线时转让
      const room = rooms.get(roomId);
      if (room && !client.isController) {
        for (const c of room) if (c.isController) c.isController = false;
        client.isController = true;
        sendRoster(roomId);
        broadcast(roomId, null, { t: 'system', text: `${client.name} 已成为主控`, at: now });
      }
      break;
    }
    case 'rename':
      client.name = String(msg.name || client.name).slice(0, 24);
      sendRoster(roomId);
      break;
    default:
      break;
  }
}

const COLORS = ['#5eead4', '#7dd3fc', '#fbbf24', '#f472b6', '#a78bfa', '#4ade80', '#fb923c', '#f87171'];

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: [...rooms.values()].reduce((a, r) => a + r.size, 0) }));
    return;
  }
  if (req.url === '/' || req.url?.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('N-Body Studio collaboration relay. Open the app and join a room.\n');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  const client = {
    id: nextId++,
    ws: socket,
    room: null,
    name: '',
    color: '',
    isController: false,
    destroyed: false,
    windowStart: Date.now(),
    messageCount: 0,
    buffer: Buffer.alloc(0),
    alive: true,
  };
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    parseFrames(client);
  });
  socket.on('close', () => {
    client.destroyed = true;
    leaveRoom(client);
  });
  socket.on('error', () => {
    client.destroyed = true;
    leaveRoom(client);
  });
});

function parseFrames(client) {
  let buf = client.buffer;
  let pos = 0;
  // 用游标推进，绝不回头处理已消费的字节（否则同一帧被无限重放，导致 OOM）
  while (buf.length - pos >= 2) {
    const b0 = buf[pos];
    const b1 = buf[pos + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length - pos < 4) break;
      len = buf.readUInt16BE(pos + 2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length - pos < 10) break;
      const big = buf.readBigUInt64BE(pos + 2);
      if (big > BigInt(MAX_MESSAGE_BYTES)) { client.ws.destroy(); return; }
      len = Number(big);
      offset = 10;
    }
    if (len > MAX_MESSAGE_BYTES) { client.ws.destroy(); return; }
    let mask;
    if (masked) {
      if (buf.length - pos < offset + 4) break;
      mask = buf.subarray(pos + offset, pos + offset + 4);
      offset += 4;
    }
    if (buf.length - pos < offset + len) break;
    let payload = buf.subarray(pos + offset, pos + offset + len);
    if (masked) {
      const unmasked = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i & 3];
      payload = unmasked;
    }
    pos += offset + len;

    switch (opcode) {
      case 0x1:
        handleMessage(client, payload.toString('utf8'));
        break;
      case 0x8:
        client.ws.end();
        return;
      case 0x9: {
        const header = Buffer.from([0x8a, len]);
        try { client.ws.write(Buffer.concat([header, payload])); } catch { /* ignore */ }
        break;
      }
      case 0xa:
        client.alive = true;
        break;
      default:
        break;
    }
  }
  // 只保留未消费的字节
  client.buffer = pos > 0 ? buf.subarray(pos) : buf;
}

// 心跳：每 30 秒 ping，两轮无响应则剔除
const heartbeat = setInterval(() => {
  for (const room of rooms.values()) {
    for (const c of room) {
      if (!c.alive) { c.ws.destroy(); continue; }
      c.alive = false;
      try { c.ws.write(Buffer.from([0x89, 0x00])); } catch { /* ignore */ }
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref();

server.listen(PORT, HOST, () => {
  console.log(`N-Body Studio 协作中继已启动：http://${HOST}:${PORT}/`);
  console.log(`健康检查：http://localhost:${PORT}/health`);
});
