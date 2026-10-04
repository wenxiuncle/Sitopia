// lobby.youquhome.com 把 /lobby 转到 Adhesive Quarter 上的房间。
// /admin 留在这台反代上：先对口令，再把名单、人数和踢人转给房间。

import { adminHtml } from "../tools/admin-page.mjs";
import { COOKIE, adminMac, cookieHeader, readCookie, safeEqual } from "../tools/admin-auth.mjs";
import { frameDispatch, frameStatus } from "../tools/frames.mjs";

const UPSTREAM = "sitopia-lobby.adhesive-quarter.workers.dev";

function json(body, status, extra) {
  const headers = Object.assign({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  }, extra || {});
  return new Response(JSON.stringify(body), { status, headers });
}

function upstream(request) {
  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = UPSTREAM;
  return url;
}

async function forward(request, env) {
  const forwarded = new Request(upstream(request), request);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) forwarded.headers.set("X-Sitopia-IP", ip.slice(0, 64));
  if (env && env.ADMIN_TOKEN) forwarded.headers.set("X-Sitopia-Proxy", env.ADMIN_TOKEN);
  return fetch(forwarded);
}

async function forwardAdmin(request, env) {
  const headers = new Headers(request.headers);
  headers.set("X-Sitopia-Admin", env.ADMIN_TOKEN || "");
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Sitopia-IP", ip.slice(0, 64));
  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return fetch(new Request(upstream(request), init));
}

async function adminOk(request, env) {
  const token = env.ADMIN_TOKEN || "";
  if (!token) return false;
  const got = readCookie(request.headers.get("cookie"), COOKIE);
  if (!got) return false;
  return safeEqual(got, await adminMac(token));
}

function adminPage() {
  return new Response(adminHtml, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

async function adminLogin(request, env) {
  const token = env.ADMIN_TOKEN || "";
  if (!token) return json({ error: "unset" }, 503);
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const given = body && typeof body.token === "string" ? body.token : "";
  if (!given || !safeEqual(given, token)) return json({ error: "login" }, 401);
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, {
    "set-cookie": cookieHeader(await adminMac(token), { secure, maxAge: 43200 }),
  });
}

function adminLogout(request) {
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, {
    "set-cookie": cookieHeader("", { secure, maxAge: 0 }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname === "/admin/") return adminPage();
    if (url.pathname === "/admin/api/login" && request.method === "POST") return adminLogin(request, env);
    if (url.pathname === "/admin/api/logout" && request.method === "POST") return adminLogout(request);
    if (url.pathname === "/admin/api/frames") {
      if (!(await adminOk(request, env))) return json({ error: "login" }, 401);
      if (request.method === "GET") return json(await frameStatus(env.GITHUB_DISPATCH_TOKEN || ""));
      if (request.method === "POST") {
        let full = false;
        try {
          const body = await request.json();
          full = !!(body && body.full);
        } catch {
          full = false;
        }
        return json(await frameDispatch(env.GITHUB_DISPATCH_TOKEN || "", full));
      }
      return new Response("method", { status: 405 });
    }
    if (url.pathname.startsWith("/admin/api/")) {
      if (!(await adminOk(request, env))) return json({ error: "login" }, 401);
      return forwardAdmin(request, env);
    }
    if (
      url.pathname === "/lobby" ||
      url.pathname === "/lobby/beat" ||
      url.pathname === "/lobby/leave" ||
      url.pathname === "/lobby/arrange"
    ) {
      return forward(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};
