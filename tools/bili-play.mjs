// 浏览器直接问 B 站会被来源页拦住。这里带上站内 Referer 代问播放地址。
// 只认单段 durl：多段要自己接下去，留给官方播放器；拿不到就回空地址，前端退回嵌播器。
// note 只在没拿到地址时写一句原因，方便在线上看出是 B 站拦了还是接口改了。

const PLAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.bilibili.com/",
};

// 分页接口带 jsonp 时会包一层回调，剥掉再解析。
function parseJson(text) {
  const body = String(text || "").replace(/^[^(]*\(/, "").replace(/\)\s*;?\s*$/, "");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// 数据中心出口有时会被要求带一枚 buvid 指纹，这里现造一个随便的。
function playHeaders() {
  const seed = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().toUpperCase()
    : String(Math.random()).slice(2);
  return {
    ...PLAY_HEADERS,
    Cookie: "buvid3=" + seed + "infoc; b_nut=" + Math.floor(Date.now() / 1000),
  };
}

async function readJson(url) {
  try {
    const upstream = await fetch(url, { headers: playHeaders() });
    const text = await upstream.text();
    if (!upstream.ok) return { data: null, note: "http " + upstream.status + " " + text.replace(/\s+/g, " ").slice(0, 120) };
    const json = parseJson(text);
    if (!json) return { data: null, note: "not json: " + text.replace(/\s+/g, " ").slice(0, 80) };
    if (json.code !== 0) return { data: null, note: "code " + json.code + " " + String(json.message || "") };
    return { data: json.data, note: "" };
  } catch (e) {
    return { data: null, note: "fetch failed: " + String((e && e.message) || e) };
  }
}

export async function biliPlayUrl(bvid, aid, page) {
  const which = Math.max(1, Number(page) || 1);
  const q = bvid ? "bvid=" + encodeURIComponent(bvid) : "aid=" + encodeURIComponent(aid);
  if (!bvid && !aid) return { url: "", duration: 0, quality: 0, note: "no id" };
  try {
    const list = await readJson("https://api.bilibili.com/x/player/pagelist?" + q + "&jsonp=jsonp");
    const rows = list.data;
    if (!Array.isArray(rows) || !rows.length) {
      return { url: "", duration: 0, quality: 0, note: list.note || "no pages" };
    }
    const row = rows[which - 1] || rows[0];
    const cid = Number(row && row.cid) || 0;
    const duration = Number(row && row.duration) || 0;
    if (!cid) return { url: "", duration, quality: 0, note: "no cid" };
    const play = await readJson("https://api.bilibili.com/x/player/playurl?" + q +
      "&cid=" + cid + "&qn=64&fnval=1&fnver=0&fourk=0&platform=html5&high_quality=1");
    const data = play.data;
    const clips = data && data.durl;
    // 多段只拿到第一段，文件会在正片中途结束。这种留给官方播放器播完整段。
    const clip = Array.isArray(clips) && clips.length === 1 ? clips[0] : null;
    const url = clip && clip.url ? String(clip.url) : "";
    const note = url ? "" : play.note || (clips ? "durl " + clips.length + " clips" : "no durl");
    return { url, duration, quality: Number(data && data.quality) || 0, note };
  } catch (e) {
    return { url: "", duration: 0, quality: 0, note: "failed: " + String((e && e.message) || e) };
  }
}
