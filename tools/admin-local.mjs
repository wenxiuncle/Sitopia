import { adminHtml } from "./admin-page.mjs";
import { COOKIE, adminMac, cookieHeader, readCookie, safeEqual } from "./admin-auth.mjs";
import { frameDispatch, frameStatus } from "./frames.mjs";

const token = process.env.MUSEUM_ADMIN_TOKEN || "local-museum";

function send(res, status, body, extra) {
  const headers = Object.assign({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  }, extra || {});
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2048) {
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
  const got = readCookie(req.headers.cookie, COOKIE);
  if (!got) return false;
  const mac = await adminMac(token);
  return safeEqual(got, mac);
}

async function route(req, res, lobby, path, url) {
  if (path === "/admin/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const given = body && typeof body.token === "string" ? body.token : "";
    if (!given || !safeEqual(given, token)) {
      send(res, 401, { error: "login" });
      return;
    }
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
