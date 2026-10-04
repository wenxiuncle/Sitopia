import { DurableObject } from "cloudflare:workers";
import {
  MAX_PEOPLE,
  PEOPLE_CAP,
  adminPeople,
  blankPerson,
  cleanIp,
  cleanMax,
  cleanName,
  cleanSeat,
  forgetSolo,
  kickSpan,
  kickUntil,
  namedCount,
  onClientMessage,
  onLeave,
  pruneKicks,
  pruneSolo,
  rememberSolo,
} from "../tools/room.mjs";
import { safeEqual } from "../tools/admin-auth.mjs";

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

function clientIp(request, token) {
  const claimed = cleanIp(request.headers.get("X-Sitopia-IP"));
  const mark = request.headers.get("X-Sitopia-Proxy") || "";
  if (token && claimed && safeEqual(mark, token)) return claimed;
  return cleanIp(request.headers.get("CF-Connecting-IP"));
}

function json(body, status, request) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (request) {
    const origin = request.headers.get("Origin") || "";
    if (allow(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers.vary = "Origin";
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 2048) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export class SitopiaLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.log = [];
    this.token = env.ADMIN_TOKEN || "";
    this.maxPeople = MAX_PEOPLE;
    this.kicks = {};
    this.solo = new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.log = (await ctx.storage.get("log")) || [];
      const max = cleanMax(await ctx.storage.get("maxPeople"));
      if (max) this.maxPeople = max;
      this.kicks = pruneKicks((await ctx.storage.get("kicks")) || {}, Date.now());
      const saved = (await ctx.storage.get("solo")) || {};
      const seats = Object.keys(saved);
      const now = Date.now();
      for (let i = 0; i < seats.length; i++) {
        const row = saved[seats[i]];
        const seat = cleanSeat(seats[i]);
        if (!seat || !row) continue;
        this.solo.set(seat, {
          seat,
          name: cleanName(row.name),
          ip: cleanIp(row.ip),
          entered: Number(row.entered) || now,
          seen: Number(row.seen) || 0,
          away: !!row.away,
        });
      }
      pruneSolo(this.solo, now);
    });
  }

  room() {
    return { maxPeople: this.maxPeople, kicks: this.kicks };
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

  async persistSolo() {
    pruneSolo(this.solo, Date.now());
    const saved = {};
    for (const [seat, row] of this.solo) {
      saved[seat] = {
        name: row.name,
        ip: row.ip || "",
        entered: row.entered,
        seen: row.seen,
        away: !!row.away,
      };
    }
    await this.ctx.storage.put("solo", saved);
  }

  async beat(request) {
    const msg = await readJson(request);
    if (!msg) return json({ error: "body" }, 400, request);
    const now = Date.now();
    const until = kickUntil(this.kicks, cleanSeat(msg.seat), now);
    if (until) return json({ t: "kick", until }, 403, request);
    const result = rememberSolo(this.solo, msg, now, clientIp(request, this.token));
    if (result.error) return json({ error: result.error }, 400, request);
    await this.persistSolo();
    return json({ ok: true }, 200, request);
  }

  async leave(request) {
    const msg = await readJson(request);
    if (!msg) return json({ error: "body" }, 400, request);
    forgetSolo(this.solo, msg.seat);
    await this.persistSolo();
    return json({ ok: true }, 200, request);
  }

  seatById(id) {
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      const person = sockets[i].deserializeAttachment();
      if (person && !person.gone && person.id === id && person.seat) return person.seat;
    }
    return "";
  }

  kickSockets(seat, id, until) {
    const note = JSON.stringify({ t: "kick", until });
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      const ws = sockets[i];
      const person = ws.deserializeAttachment();
      if (!person || person.gone) continue;
      const match = (seat && person.seat === seat) || (id && person.id === id);
      if (!match) continue;
      try {
        ws.send(note);
      } catch {
        /* 连接已经断了。 */
      }
      try {
        ws.close(4001, "kicked");
      } catch {
        /* 已经在关。 */
      }
    }
  }

  async admin(request) {
    if (request.headers.get("X-Sitopia-Admin") !== "1") {
      return new Response("forbidden", { status: 403 });
    }
    const url = new URL(request.url);
    if (url.pathname === "/admin/api/state" && request.method === "GET") {
      const now = Date.now();
      this.kicks = pruneKicks(this.kicks, now);
      return json({
        max: this.maxPeople,
        cap: PEOPLE_CAP,
        inHall: namedCount(this.roster()),
        now,
        people: adminPeople(this.roster(), this.solo, now),
      }, 200);
    }
    if (url.pathname === "/admin/api/max" && request.method === "POST") {
      const body = await readJson(request);
      const n = cleanMax(body && body.n);
      if (!n) return json({ error: "range" }, 400);
      this.maxPeople = n;
      await this.ctx.storage.put("maxPeople", n);
      return json({ max: n, cap: PEOPLE_CAP }, 200);
    }
    if (url.pathname === "/admin/api/kick" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ error: "body" }, 400);
      const now = Date.now();
      let seat = cleanSeat(body.seat);
      const id = typeof body.id === "string" ? body.id.slice(0, 16) : "";
      if (!seat && id) seat = this.seatById(id);
      if (!seat && !id) return json({ error: "who" }, 400);
      const until = now + kickSpan(body.minutes);
      if (seat) {
        this.kicks[seat] = until;
        this.kicks = pruneKicks(this.kicks, now);
        await this.ctx.storage.put("kicks", this.kicks);
        forgetSolo(this.solo, seat);
        await this.persistSolo();
      }
      this.kickSockets(seat, id, until);
      return json({ ok: true, until }, 200);
    }
    return new Response("not found", { status: 404 });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/lobby/beat") {
      if (request.method !== "POST") return new Response("method", { status: 405 });
      return this.beat(request);
    }
    if (url.pathname === "/lobby/leave") {
      if (request.method !== "POST") return new Response("method", { status: 405 });
      return this.leave(request);
    }
    if (url.pathname.startsWith("/admin/api/")) return this.admin(request);
    if (!allow(request.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("sitopia lobby", { status: 200 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const person = blankPerson(newId(), Date.now());
    person.ip = clientIp(request, this.token);
    server.serializeAttachment(person);
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
    const result = onClientMessage(people, this.log, person, msg, Date.now(), this.room());
    ws.serializeAttachment(person);
    if (person.seat) this.retireSameSeat(ws, person.seat);
    this.fanout(ws, result.out);
    if (msg.t === "hi" && !result.close && person.seat && this.solo.delete(person.seat)) {
      await this.persistSolo();
    }
    if (msg.t === "say" && result.out.length) await this.ctx.storage.put("log", this.log);
    if (result.close) {
      const kick = result.out.some((ev) => ev.obj && ev.obj.t === "kick");
      ws.close(kick ? 4001 : 1000, kick ? "kicked" : "full");
    }
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

function preflight(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = { allow: "POST, OPTIONS" };
  if (!allow(origin)) return new Response("forbidden", { status: 403, headers });
  headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-methods"] = "POST, OPTIONS";
  headers["access-control-allow-headers"] = "content-type";
  headers["access-control-max-age"] = "86400";
  headers.vary = "Origin";
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");
    const websocket = upgrade && upgrade.toLowerCase() === "websocket";
    if (url.pathname === "/lobby/beat" || url.pathname === "/lobby/leave") {
      if (request.method === "OPTIONS") return preflight(request);
      if (request.method !== "POST") return new Response("method", { status: 405 });
      if (!allow(request.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
      const stub = env.LOBBY.get(env.LOBBY.idFromName("hall"));
      return stub.fetch(request);
    }
    if (url.pathname.startsWith("/admin/api/")) {
      const token = env.ADMIN_TOKEN || "";
      const given = request.headers.get("X-Sitopia-Admin") || "";
      if (!token || !safeEqual(given, token)) return new Response("forbidden", { status: 403 });
      const headers = new Headers(request.headers);
      headers.set("X-Sitopia-Admin", "1");
      const init = { method: request.method, headers };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
        init.duplex = "half";
      }
      const stub = env.LOBBY.get(env.LOBBY.idFromName("hall"));
      return stub.fetch(new Request(request.url, init));
    }
    if (url.pathname !== "/lobby") return new Response("not found", { status: 404 });
    if (!websocket) {
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
