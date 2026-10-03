import { DurableObject } from "cloudflare:workers";
import { blankPerson, onClientMessage, onLeave } from "../tools/room.mjs";

const ALLOW = new Set([
  "https://wenxiuncle.github.io",
  "https://sitopia.youquhome.com",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function allow(origin) {
  return ALLOW.has(origin);
}

const PING_MS = 20000;
const STALE_MS = 90000;

function newId() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < bytes.length; i++) id += bytes[i].toString(16).padStart(2, "0");
  return id;
}

export class SitopiaLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.log = [];
    ctx.blockConcurrencyWhile(async () => {
      this.log = (await ctx.storage.get("log")) || [];
    });
  }

  roster() {
    const people = new Map();
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      const person = sockets[i].deserializeAttachment();
      if (person && person.id && !person.gone) people.set(person.id, person);
    }
    return people;
  }

  fanout(current, events) {
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const text = JSON.stringify(ev.obj);
      for (let k = 0; k < sockets.length; k++) {
        const ws = sockets[k];
        if (ev.who === "self" && ws !== current) continue;
        if (ev.who === "others" && ws === current) continue;
        const person = ws.deserializeAttachment();
        if (!person || person.gone) continue;
        try {
          ws.send(text);
        } catch {
          /* 这条连接已经断了，等关闭回调把它清掉。 */
        }
      }
    }
  }

  async fetch(request) {
    if (!allow(request.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("sitopia lobby", { status: 200 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(blankPerson(newId(), Date.now()));
    const pending = await this.ctx.storage.getAlarm();
    if (pending == null) await this.ctx.storage.setAlarm(Date.now() + PING_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  retireSameSeat(ws, seat) {
    if (!seat) return;
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      const other = sockets[i];
      if (other === ws) continue;
      const prev = other.deserializeAttachment();
      if (!prev || prev.gone || prev.seat !== seat) continue;
      prev.gone = true;
      other.serializeAttachment(prev);
      try {
        other.close(4000, "replaced");
      } catch {
        /* 旧连接已经在关。 */
      }
    }
  }

  async webSocketMessage(ws, message) {
    const person = ws.deserializeAttachment();
    if (!person || person.gone) return;
    let msg;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== "string") return;
    const people = this.roster();
    people.set(person.id, person);
    const result = onClientMessage(people, this.log, person, msg, Date.now());
    ws.serializeAttachment(person);
    if (person.seat) this.retireSameSeat(ws, person.seat);
    this.fanout(ws, result.out);
    if (msg.t === "say" && result.out.length) await this.ctx.storage.put("log", this.log);
    if (result.close) ws.close(1000, "full");
  }

  async alarm() {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    let live = 0;
    for (let i = 0; i < sockets.length; i++) {
      const ws = sockets[i];
      const person = ws.deserializeAttachment();
      if (!person || person.gone) {
        try { ws.close(1000, "gone"); } catch { /* 已经在关。 */ }
        continue;
      }
      // 只有会回 ping 的页面才按静默掐线，免得旧页面在后台被当成掉线。
      if (person.pings && now - (person.seen || 0) > STALE_MS) {
        this.forget(ws);
        try { ws.close(1001, "stale"); } catch { /* 已经在关。 */ }
        continue;
      }
      live += 1;
      try {
        ws.send(JSON.stringify({ t: "ping" }));
      } catch {
        this.forget(ws);
        try { ws.close(1001, "stale"); } catch { /* 已经在关。 */ }
      }
    }
    if (live) await this.ctx.storage.setAlarm(now + PING_MS);
  }

  async webSocketClose(ws) {
    this.forget(ws);
  }

  async webSocketError(ws) {
    this.forget(ws);
  }

  forget(ws) {
    const person = ws.deserializeAttachment();
    if (!person || person.gone) return;
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      if (sockets[i] === ws) continue;
      const other = sockets[i].deserializeAttachment();
      if (!other || other.gone || other.id !== person.id) continue;
      person.gone = true;
      ws.serializeAttachment(person);
      return;
    }
    const people = this.roster();
    people.set(person.id, person);
    const out = onLeave(people, person);
    ws.serializeAttachment(person);
    this.fanout(ws, out);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/lobby") return new Response("not found", { status: 404 });
    const upgrade = request.headers.get("Upgrade");
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("sitopia lobby", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (!allow(request.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
    const stub = env.LOBBY.get(env.LOBBY.idFromName("hall"));
    return stub.fetch(request);
  },
};
