// lobby.youquhome.com 只负责把请求转到 Adhesive Quarter 上的房间。
// 浏览器不再直连 workers.dev。房间规则仍在 worker/lobby.js。

const UPSTREAM = "sitopia-lobby.adhesive-quarter.workers.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/lobby") return new Response("not found", { status: 404 });
    url.protocol = "https:";
    url.hostname = UPSTREAM;
    return fetch(url, request);
  },
};
