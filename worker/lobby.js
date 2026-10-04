import { DurableObject } from "cloudflare:workers";
import {
  MAX_PEOPLE,
  PEOPLE_CAP,
  VISIT_KEEP_MS,
  VISIT_LIMIT,
  adminPeople,
  beginVisit,
  cleanArrange,
  blankPerson,
  cleanDay,
  cleanHeight,
  cleanIp,
  cleanMax,
  cleanName,
  cleanSeat,
  createVisitBook,
  dayBounds,
  finishVisit,
  forgetSolo,
  kickSpan,
  kickUntil,
  namedCount,
  onClientMessage,
  onLeave,
  pruneKicks,
  pruneSolo,
  rememberSolo,
  shanghaiDay,
  visitLeftAt,
  visitView,
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
    this.arrange = cleanArrange(null);
    this.kicks = {};
    this.solo = new Map();
    this.visits = createVisitBook();
    this.visitPruned = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.log = (await ctx.storage.get("log")) || [];
      const max = cleanMax(await ctx.storage.get("maxPeople"));
      if (max) this.maxPeople = max;
      this.arrange = cleanArrange(await ctx.storage.get("arrange"));
      this.kicks = pruneKicks((await ctx.storage.get("kicks")) || {}, Date.now());
      const saved = (await ctx.storage.get("solo")) || {};
      const seats = Object.keys(saved);
      const now = Date.now();
      for (let i = 0; i < seats.length; i++) {
        const row = saved[seats[i]];
        const seat = cleanSeat(seats[i]);
        if (!seat || !row) continue;
        const stored = {
          seat,
          name: cleanName(row.name),
          ip: cleanIp(row.ip),
          entered: Number(row.entered) || now,
          seen: Number(row.seen) || 0,
          away: !!row.away,
        };
        const y = cleanHeight(row.y);
        if (y != null) stored.y = y;
        this.solo.set(seat, stored);
      }
      this.ensureVisits();
      this.loadOpenVisits();
      const swept = this.sweepSolo(now);
      if (swept) await this.persistSolo();
    });
  }

  sql(query, ...args) {
    return this.ctx.storage.sql.exec(query, ...args);
  }

  ensureVisits() {
    this.sql(
      "CREATE TABLE IF NOT EXISTS visits (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "seat TEXT NOT NULL," +
      "mode TEXT NOT NULL," +
      "name_in TEXT NOT NULL," +
      "name_last TEXT NOT NULL," +
      "ip TEXT NOT NULL DEFAULT ''," +
      "entered INTEGER NOT NULL," +
      "seen INTEGER NOT NULL," +
      "left_at INTEGER NOT NULL DEFAULT 0" +
      ")",
    );
    this.sql("CREATE INDEX IF NOT EXISTS visits_entered ON visits(entered)");
    this.sql("CREATE INDEX IF NOT EXISTS visits_open_seat ON visits(seat, left_at)");
  }

  loadOpenVisits() {
    const rows = this.sql(
      "SELECT id, seat, mode, name_in, name_last, ip, entered, seen FROM visits WHERE left_at = 0 ORDER BY id",
    ).toArray();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const seat = cleanSeat(row.seat);
      if (!seat) continue;
      const prev = this.visits.open.get(seat);
      if (prev && prev.id) {
        this.sql("UPDATE visits SET left_at = ? WHERE id = ?", Number(prev.seen) || Number(prev.entered) || Date.now(), prev.id);
      }
      const visit = {
        id: Number(row.id) || 0,
        seat,
        mode: row.mode === "solo" ? "solo" : "online",
        nameIn: cleanName(row.name_in),
        nameLast: cleanName(row.name_last),
        ip: cleanIp(row.ip),
        entered: Number(row.entered) || Date.now(),
        seen: Number(row.seen) || Number(row.entered) || 0,
        leftAt: 0,
      };
      this.visits.open.set(seat, visit);
      if (visit.id >= this.visits.seq) this.visits.seq = visit.id + 1;
    }
  }

  pruneVisitStore(now) {
    if (this.visitPruned && now - this.visitPruned < 3600000) return;
    try {
      this.sql("DELETE FROM visits WHERE left_at > 0 AND left_at < ?", now - VISIT_KEEP_MS);
      this.visitPruned = now;
    } catch {
      /* 过期记录下次再删。 */
    }
  }

  noteArrival(row) {
    try {
      const result = beginVisit(this.visits, row);
      if (!result || !result.changed) return;
      const visit = result.visit;
      if (result.created) {
        try {
          const inserted = this.sql(
            "INSERT INTO visits (seat, mode, name_in, name_last, ip, entered, seen, left_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0) RETURNING id",
            visit.seat,
            visit.mode,
            visit.nameIn,
            visit.nameLast,
            visit.ip,
            visit.entered,
            visit.seen,
          ).toArray();
          visit.id = Number(inserted[0] && inserted[0].id) || 0;
          if (!visit.id) {
            const got = this.sql("SELECT last_insert_rowid() AS id").toArray();
            visit.id = Number(got[0] && got[0].id) || 0;
          }
        } catch (err) {
          this.visits.open.delete(visit.seat);
          throw err;
        }
        return;
      }
      if (!visit.id) return;
      this.sql(
        "UPDATE visits SET name_last = ?, ip = ?, mode = ?, seen = ? WHERE id = ?",
        visit.nameLast,
        visit.ip,
        visit.mode,
        visit.seen,
        visit.id,
      );
    } catch {
      /* 来访没记上，馆里的人照旧。 */
    }
  }

  noteDeparture(seat, leftAt) {
    try {
      const visit = finishVisit(this.visits, seat, leftAt, false);
      if (!visit || !visit.id) return;
      this.sql("UPDATE visits SET left_at = ? WHERE id = ?", visit.leftAt, visit.id);
    } catch {
      /* 离开时间没补上，人已经不在这间。 */
    }
  }

  sweepSolo(now) {
    const expired = [];
    pruneSolo(this.solo, now, expired);
    for (let i = 0; i < expired.length; i++) {
      const row = expired[i];
      this.noteDeparture(row.seat, visitLeftAt(row.seen, now));
    }
    return expired.length;
  }

  // 房间重启后，套接字已经不在、又超过静默时限的来访补上离开。刚醒的连接先留着。
  reconcileVisits(now) {
    const live = new Set();
    for (const seat of this.solo.keys()) live.add(seat);
    const sockets = this.ctx.getWebSockets();
    for (let i = 0; i < sockets.length; i++) {
      const person = sockets[i].deserializeAttachment();
      if (person && !person.gone && person.seat) live.add(person.seat);
    }
    const stale = [];
    for (const [seat, visit] of this.visits.open) {
      if (live.has(seat)) continue;
      const seen = visit.seen || visit.entered || 0;
      if (now - seen < 90000) continue;
      stale.push(seat);
    }
    for (let i = 0; i < stale.length; i++) {
      const visit = this.visits.open.get(stale[i]);
      this.noteDeparture(stale[i], visit && visit.seen ? visit.seen : now);
    }
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
    this.sweepSolo(Date.now());
    const saved = {};
    for (const [seat, row] of this.solo) {
      saved[seat] = {
        name: row.name,
        ip: row.ip || "",
        entered: row.entered,
        seen: row.seen,
        away: !!row.away,
      };
      const y = cleanHeight(row.y);
      if (y != null) saved[seat].y = y;
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
    this.noteArrival({
      seat: result.row.seat,
      mode: "solo",
      name: result.row.name,
      ip: result.row.ip,
      now,
    });
    await this.persistSolo();
    return json({ ok: true }, 200, request);
  }

  async leave(request) {
    const msg = await readJson(request);
    if (!msg) return json({ error: "body" }, 400, request);
    const seat = cleanSeat(msg.seat);
    this.noteDeparture(seat, Date.now());
    forgetSolo(this.solo, seat);
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
      const swept = this.sweepSolo(now);
      this.reconcileVisits(now);
      if (swept) await this.persistSolo();
      return json({
        max: this.maxPeople,
        cap: PEOPLE_CAP,
        inHall: namedCount(this.roster()),
        now,
        people: adminPeople(this.roster(), this.solo, now),
      }, 200);
    }
    if (url.pathname === "/admin/api/visits" && request.method === "GET") {
      const now = Date.now();
      const swept = this.sweepSolo(now);
      this.reconcileVisits(now);
      this.pruneVisitStore(now);
      if (swept) await this.persistSolo();
      const day = cleanDay(url.searchParams.get("day")) || shanghaiDay(now);
      const bounds = dayBounds(day);
      const rows = this.sql(
        "SELECT mode, name_in, name_last, ip, entered, left_at FROM visits WHERE entered >= ? AND entered < ? ORDER BY entered DESC LIMIT " + (VISIT_LIMIT + 1),
        bounds.start,
        bounds.end,
      ).toArray();
      const truncated = rows.length > VISIT_LIMIT;
      const shown = truncated ? rows.slice(0, VISIT_LIMIT) : rows;
      const visits = [];
      for (let i = 0; i < shown.length; i++) visits.push(visitView(shown[i]));
      return json({
        day,
        keepDays: 90,
        now,
        truncated,
        visits,
      }, 200);
    }
    if (url.pathname === "/admin/api/arrange" && request.method === "GET") {
      return json(this.arrange, 200);
    }
    if (url.pathname === "/admin/api/arrange" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ error: "body" }, 400);
      this.arrange = cleanArrange(body);
      await this.ctx.storage.put("arrange", this.arrange);
      return json(this.arrange, 200);
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
        this.noteDeparture(seat, now);
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
    if (url.pathname === "/lobby/arrange" && request.method === "GET") {
      return json(this.arrange, 200, request);
    }
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
    const now = Date.now();
    const result = onClientMessage(people, this.log, person, msg, now, this.room());
    ws.serializeAttachment(person);
    if (person.seat) this.retireSameSeat(ws, person.seat);
    this.fanout(ws, result.out);
    if (!result.close && person.named && person.seat && (msg.t === "hi" || msg.t === "name")) {
      this.noteArrival({
        seat: person.seat,
        mode: "online",
        name: person.name,
        ip: person.ip,
        now,
      });
    }
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
      if (person.named && person.seat) {
        this.noteArrival({
          seat: person.seat,
          mode: "online",
          name: person.name,
          ip: person.ip,
          now: person.seen || now,
        });
      }
      live += 1;
      try {
        ws.send(JSON.stringify({ t: "ping" }));
      } catch {
        this.forget(ws);
        try { ws.close(1001, "stale"); } catch { /* 已经在关。 */ }
      }
    }
    this.reconcileVisits(now);
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
    if (person.named && person.seat) this.noteDeparture(person.seat, visitLeftAt(person.seen, Date.now()));
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
    if (url.pathname === "/lobby/arrange") {
      if (request.method !== "GET") return new Response("method", { status: 405 });
      if (!allow(request.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
      const stub = env.LOBBY.get(env.LOBBY.idFromName("hall"));
      return stub.fetch(request);
    }
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
