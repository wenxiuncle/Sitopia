import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminHtml } from "./admin-page.mjs";
import { COOKIE, adminMac, cookieHeader, readCookie, safeEqual } from "./admin-auth.mjs";
import { musicForm, resolveOrder } from "./audio-catalog.mjs";
import { scanAudioDir } from "./audio-scan.mjs";
import { frameDispatch, frameStatus } from "./frames.mjs";
import { createLoginGuard, pause } from "./login-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function envToken() {
  const raw = process.env.MUSEUM_ADMIN_TOKEN;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

// 口令只从环境变量或 .admin-token（已在 .gitignore 里）读。
// 代码里不留默认值，没有口令就不开后台，免得默认口令变成谁都能算出的 cookie。
function fileToken() {
  try {
    return fs.readFileSync(path.join(root, ".admin-token"), "utf8").trim();
  } catch {
    return "";
  }
}

const token = envToken() || fileToken();
const guard = createLoginGuard();

export function adminTokenState() {
  if (!token) return { ready: false, source: "none" };
  return { ready: true, source: envToken() ? "env" : "file" };
}

function send(res, status, body, extra) {
  const headers = Object.assign({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  }, extra || {});
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req, max) {
  const limit = max || 2048;
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function clientIp(req) {
  const raw = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
  return String(raw).replace(/^::ffff:/, "");
}

export function handleLocalAdmin(req, res, lobby) {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  if (path === "/lobby/arrange" && req.method === "GET") {
    send(res, 200, lobby.arrange());
    return true;
  }
  if (path === "/lobby/music" && req.method === "GET") {
    send(res, 200, lobby.music());
    return true;
  }
  if (path === "/lobby/beat" || path === "/lobby/leave") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      if (!body) {
        send(res, 400, { error: "body" });
        return;
      }
      const result = path === "/lobby/beat" ? lobby.beat(body, clientIp(req)) : lobby.leave(body);
      send(res, result.status, result.body);
    });
    return true;
  }
  if (path !== "/admin" && path !== "/admin/" && !path.startsWith("/admin/api/")) return false;
  if (path === "/admin" || path === "/admin/") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    });
    res.end(adminHtml);
    return true;
  }
  route(req, res, lobby, path, url);
  return true;
}

async function allowed(req) {
  if (!token) return false;
  const got = readCookie(req.headers.cookie, COOKIE);
  if (!got) return false;
  const mac = await adminMac(token);
  return safeEqual(got, mac);
}

async function route(req, res, lobby, path, url) {
  if (path === "/admin/api/login" && req.method === "POST") {
    if (!token) {
      send(res, 503, { error: "unset" });
      return;
    }
    const who = clientIp(req);
    const gate = guard.blocked(who);
    if (gate.blocked) {
      send(res, 429, { error: "slow" }, { "retry-after": String(gate.retryAfter) });
      return;
    }
    const body = await readBody(req);
    const given = body && typeof body.token === "string" ? body.token : "";
    if (!given || !safeEqual(given, token)) {
      const state = guard.recordFailure(who);
      await pause();
      if (state.blocked) {
        send(res, 429, { error: "slow" }, { "retry-after": String(state.retryAfter) });
        return;
      }
      send(res, 401, { error: "login" });
      return;
    }
    guard.clear(who);
    const mac = await adminMac(token);
    send(res, 200, { ok: true }, { "set-cookie": cookieHeader(mac, { secure: false, maxAge: 43200 }) });
    return;
  }
  if (path === "/admin/api/logout" && req.method === "POST") {
    send(res, 200, { ok: true }, { "set-cookie": cookieHeader("", { secure: false, maxAge: 0 }) });
    return;
  }
  if (!(await allowed(req))) {
    send(res, 401, { error: "login" });
    return;
  }
  if (path === "/admin/api/frames" && req.method === "GET") {
    send(res, 200, await frameStatus(process.env.GITHUB_DISPATCH_TOKEN || ""));
    return;
  }
  if (path === "/admin/api/frames" && req.method === "POST") {
    const body = await readBody(req);
    send(res, 200, await frameDispatch(process.env.GITHUB_DISPATCH_TOKEN || "", !!(body && body.full)));
    return;
  }
  if (path === "/admin/api/music" && req.method === "GET") {
    const catalog = scanAudioDir();
    if (!catalog) {
      send(res, 502, { error: "catalog" });
      return;
    }
    send(res, 200, musicForm(catalog, lobby.musicSettings()));
    return;
  }
  if (path === "/admin/api/music" && req.method === "POST") {
    const body = await readBody(req, 16384);
    if (!body) {
      send(res, 400, { error: "body" });
      return;
    }
    const catalog = scanAudioDir();
    if (!catalog) {
      send(res, 502, { error: "catalog" });
      return;
    }
    const resolved = resolveOrder(catalog, body && body.order, body && body.volume);
    if (resolved.error) {
      send(res, 400, { error: resolved.error });
      return;
    }
    const saved = lobby.setMusic(resolved);
    if (!saved) {
      send(res, 400, { error: "range" });
      return;
    }
    send(res, 200, musicForm(catalog, saved));
    return;
  }
  if (path === "/admin/api/arrange" && req.method === "GET") {
    send(res, 200, lobby.arrange());
    return;
  }
  if (path === "/admin/api/arrange" && req.method === "POST") {
    const body = await readBody(req);
    if (!body) {
      send(res, 400, { error: "body" });
      return;
    }
    send(res, 200, lobby.setArrange(body));
    return;
  }
  if (path === "/admin/api/state" && req.method === "GET") {
    send(res, 200, lobby.state());
    return;
  }
  if (path === "/admin/api/visits" && req.method === "GET") {
    send(res, 200, lobby.visits(url.searchParams.get("day")));
    return;
  }
  if (path === "/admin/api/max" && req.method === "POST") {
    const body = await readBody(req);
    const n = lobby.setMax(body && body.n);
    if (!n) {
      send(res, 400, { error: "range" });
      return;
    }
    send(res, 200, { max: n, cap: lobby.state().cap });
    return;
  }
  if (path === "/admin/api/board" && req.method === "GET") {
    send(res, 200, lobby.desk());
    return;
  }
  if (path === "/admin/api/board" && req.method === "POST") {
    const body = await readBody(req);
    if (!body) {
      send(res, 400, { error: "body" });
      return;
    }
    if (body.kind !== "chat" && body.kind !== "note") {
      send(res, 400, { error: "kind" });
      return;
    }
    const gone = lobby.dropDesk(body);
    if (!gone) {
      send(res, 404, { error: "missing" });
      return;
    }
    send(res, 200, { ok: true });
    return;
  }
  if (path === "/admin/api/kick" && req.method === "POST") {
    const body = await readBody(req);
    const until = lobby.kick(body || {});
    if (!until) {
      send(res, 400, { error: "who" });
      return;
    }
    send(res, 200, { ok: true, until });
    return;
  }
  res.writeHead(404);
  res.end("not found");
}
