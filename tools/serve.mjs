import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachLobby } from "./lobby.mjs";
import { adminTokenState, handleLocalAdmin } from "./admin-local.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};
const port = Number(process.env.PORT) || 4173;

let lobby;
const server = http.createServer((req, res) => {
  if (lobby && handleLocalAdmin(req, res, lobby)) return;
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
});

lobby = attachLobby(server);

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/`);
  const state = adminTokenState();
  if (!state.ready) {
    console.log("后台口令没设置：放一个 .admin-token，或设 MUSEUM_ADMIN_TOKEN，再重启。");
    return;
  }
  console.log(state.source === "env" ? "后台口令来自 MUSEUM_ADMIN_TOKEN。" : "后台口令来自 .admin-token。");
});
