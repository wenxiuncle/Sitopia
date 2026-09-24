import { DurableObject } from "cloudflare:workers";
import { blankPerson, onClientMessage, onLeave } from "../tools/room.mjs";

const ALLOW = new Set([
  "https://wenxiuncle.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function allow(origin) {
  return ALLOW.has(origin);
}

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
    return new Response(null, { status: 101, webSocket: client });
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
    this.fanout(ws, result.out);
    if (msg.t === "say" && result.out.length) await this.ctx.storage.put("log", this.log);
    if (result.close) ws.close(1000, "full");
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
