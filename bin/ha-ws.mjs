#!/usr/bin/env node
// Home Assistant WebSocket client. Protocol notes: docs/devices/home-assistant.md
// Usage: node bin/ha-ws.mjs [--origin URL ...] [--cmd TYPE[:JSON] ...] [--events] [--query]
// Token from HA_TOKEN env or .ha_tok at repo root; never printed, never in argv.
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const BASE = process.env.HA_URL || 'http://192.168.66.20:8123';
const WS_PATH = process.env.HA_WS_PATH || '/api/websocket';  // /websocket is 404 on 2026.9.1
const TIMEOUT = Number(process.env.HA_WS_TIMEOUT || 9000);

// Token: export HA_TOKEN from SOPS' ha_token (see docs/control-machine/commands.md). A local
// .ha_tok also works, but the repo does not keep one and must never print either.
const token = process.env.HA_TOKEN || (() => {
  for (const p of ['.ha_tok', '../.ha_tok', 'infra/.ha_tok']) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch (e) {}
  }
  throw new Error('set HA_TOKEN (SOPS ha_token) or keep a local .ha_tok');
})();

const origins = [];
const cmds = [];
let sendEvents = false, queryFlag = false, authWithId = false, binaryAuth = false, probe = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--origin') origins.push(process.argv[++i]);
  else if (a === '--cmd') cmds.push(process.argv[++i]);
  else if (a === '--events') sendEvents = true;
  else if (a === '--query') queryFlag = true;
  else if (a === '--auth-id') authWithId = true;
  else if (a === '--binary-auth') binaryAuth = true;
  else if (a === '--probe') probe = true;
  else throw new Error(`unknown arg ${a}`);
}
if (!origins.length) origins.push(BASE, `${BASE}/`, 'null');

const host = (BASE.match(/^(?:https?:\/\/)?([^:\/]+)/) || [, 'x'])[1];
const port = Number((BASE.match(/:(\d+)/) || [, '80'])[1]);
const useTls = BASE.startsWith('https');

function encode(str, key) {            // client frame: masked, FIN set (0x81)
  const b = Buffer.from(str, 'utf8'), n = b.length;
  const head = n < 126 ? [0x81, 0x80 | n]
    : n < 0x10000 ? [0x81, 0x80 | 126, (n >> 8) & 0xff, n & 0xff]
    : [0x81, 0x80 | 127, ...Array(8).map((i) => (n >>> (8 * (7 - i))) & 0xff)];
  const body = Buffer.alloc(n);
  for (let i = 0; i < n; i++) body[i] = b[i] ^ key[i & 3];
  return Buffer.concat([Buffer.from(head), body]);
}

function encodeBinary(type, msgId, obj, key) {  // binary protocol frame: FIN|5, u32 msgid, JSON body
  const body = Buffer.from(JSON.stringify(obj), 'utf8'), n = body.length + 5;
  if (n >= 126) throw new Error('binary form only handles short payloads');
  const raw = [type, (msgId >>> 24) & 0xff, (msgId >>> 16) & 0xff, (msgId >>> 8) & 0xff, msgId & 0xff];
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = (i < 5 ? raw[i] : body[i - 5]) ^ key[i & 3];
  return Buffer.concat([Buffer.from([0x85, 0x80 | n]), out]);
}

function decode(buf) {                 // replies come unmasked: low 7 bits only
  if (buf.length < 2) return [buf, null];
  const low = buf[1] & 0x7f;
  let off = 2, len = low;
  if (low === 126) { if (buf.length < 4) return [buf, null]; len = (buf[2] << 8) | buf[3]; off = 4; }
  else if (low === 127) { if (buf.length < 10) return [buf, null]; len = Number(buf.readBigInt64BE(2)); off = 10; }
  if (buf.length < off + len) return [buf, null];
  const body = buf.slice(off, off + len), next = buf.slice(off + len);
  switch (buf[0] & 0x0f) {
    case 0x01: return [next, body.toString('utf8')];
    case 0x08: return [next, { close: body.length >= 2 ? body.readUInt16BE(0) : 1000 }];
    default:   return [next, { binary: body.length }];
  }
}

async function attempt(origin, inQuery) {
  const upgrade = await new Promise((res) => {
    const sock = useTls ? tls.connect({ host, port }) : net.connect({ host, port });
    const key = crypto.randomBytes(16).toString('base64');
    const lines = [
      `GET ${WS_PATH}${inQuery ? `?access_token=${token}` : ''} HTTP/1.1`,
      `Host: ${host}:${port}`,
      `Connection: Upgrade`,
      `Upgrade: websocket`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      `Sec-WebSocket-Protocol: 2003`,
      ...(origin === 'none' ? [] : [`Origin: ${origin}`]),
      `User-Agent: home-assistant/frontend`,
    ];
    let head = Buffer.alloc(0), upgraded = false;
    sock.write(lines.join('\r\n') + '\r\n\r\n');
    sock.setTimeout(TIMEOUT);
    sock.on('data', (d) => {
      if (upgraded) return;
      head = Buffer.concat([head, d]);
      const sep = head.indexOf(Buffer.from('\r\n\r\n'));
      if (sep < 0) return;
      const status = head.slice(0, sep).toString().split('\r\n')[0];
      const code = Number((status.match(/\d{3}/) || ['000'])[0]);
      const pending = head.slice(sep + 4);        // frames already in the first packet
      if (code === 101) { upgraded = true; res({ socket: sock, pending }); }
      else { try { sock.destroy(); } catch (e) {} res({ http: code, status: head.slice(0, Math.min(sep, 400)).toString() }); }
    });
    sock.on('error', () => { if (!upgraded) res({ http: 0 }); });
  });
  const pending = upgrade.pending;
  if (!upgrade.socket) return { origin, inQuery, http: upgrade.http };
  const socket = upgrade.socket;
  return await new Promise((resolve) => {
    const key = crypto.randomBytes(4);
    let buf = upgrade.pending ?? Buffer.alloc(0), id = 0, phase = 'auth', sent = 0, closed = false, finished = false;
    const log = [];
    const send = (type, data) => {
      const m = { type };
      if (phase !== 'auth') m.id = ++id;
      if (data !== undefined) m.data = data;
      socket.write(encode(JSON.stringify(m), key));
      if (type !== 'auth') sent++;
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch (e) {}
      const authOk = log.some((s) => s.startsWith('{') && JSON.parse(s)?.type === 'auth_ok');
      resolve({ origin, inQuery, http: 101, authOk, replies: log.length, sent, log: log.slice(0, 30) });
    };
    const pump = () => {
      while (true) {
        const [rest, msg] = decode(buf);
        if (!msg) break;
        buf = rest;
        if (typeof msg === 'string') log.push(msg);
        else if (msg && msg.close) { log.push(JSON.stringify({ close: msg.close })); closed = true; }
        else log.push(JSON.stringify(msg));
        try {
          const j = typeof msg === 'string' ? JSON.parse(msg) : null;
          if (j && j.type === 'auth_required' && phase === 'auth') {
            if (probe) {                                   // is the command parser alive at all?
              socket.write(encode(JSON.stringify({ id: 99, type: 'definitely_not_a_command' }), key));
              probe = false;
            }
            if (binaryAuth) socket.write(encodeBinary(5, 1, { type: 'auth', access_token: token }, key));
            else {
              const a = { type: 'auth', access_token: token };
              if (authWithId) a.id = ++id;
              socket.write(encode(JSON.stringify(a), key));
            }
          }
          if (j && j.type === 'auth_ok') {
            phase = 'cmd';
            send('ping');
            for (const spec of cmds) {
              const t = spec.split(':', 1)[0];
              const raw = spec.slice(t.length + 1);
              send(t, raw ? JSON.parse(raw) : undefined);
            }
            if (sendEvents) send('subscribe_events', { end_in: 4, attempts: ['event_updated', 'queue_changed'] });
          }
        } catch (e) {}
      }
      if (closed) finish();
    };
    if (buf.length) pump();
    socket.on('data', (d) => { buf = Buffer.concat([buf, d]); pump(); });
    socket.on('error', finish);
    socket.on('close', finish);
    setTimeout(finish, TIMEOUT);
  });
}

for (const o of origins) {
  for (const q of (queryFlag ? [true] : [false])) {
    const r = await attempt(o, q);
    const body = (r.status ? `<< ${String(r.status).replace(/\r\n/g, ' | ')}` : '') +
      (r.log || []).map((s) => (typeof s === 'string' ? s : JSON.stringify(s)).slice(0, 200)).join(' | ');
    console.log(`origin=${r.origin} query=${r.inQuery} http=${r.http} auth_ok=${r.authOk ?? false} replies=${r.replies ?? 0} ${body}`.replace(token, '<token>'));
  }
}
