// 浏览器直接问 B 站会被来源页拦住。这里带上站内 Referer 代问播放地址。
// 只认单段 durl：多段要自己接下去，留给官方播放器；拿不到就回空地址，前端退回嵌播器。

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

async function readJson(url) {
  try {
    const upstream = await fetch(url, { headers: PLAY_HEADERS });
    if (!upstream.ok) return null;
    return parseJson(await upstream.text());
  } catch {
    return null;
  }
}

export async function biliPlayUrl(bvid, aid, page) {
  const which = Math.max(1, Number(page) || 1);
  const q = bvid ? "bvid=" + encodeURIComponent(bvid) : "aid=" + encodeURIComponent(aid);
  if (!bvid && !aid) return { url: "", duration: 0, quality: 0 };
  try {
    const list = await readJson("https://api.bilibili.com/x/player/pagelist?" + q + "&jsonp=jsonp");
    const rows = list && list.data;
    if (!Array.isArray(rows) || !rows.length) return { url: "", duration: 0, quality: 0 };
    const row = rows[which - 1] || rows[0];
    const cid = Number(row && row.cid) || 0;
    const duration = Number(row && row.duration) || 0;
    if (!cid) return { url: "", duration, quality: 0 };
    const play = await readJson("https://api.bilibili.com/x/player/playurl?" + q +
      "&cid=" + cid + "&qn=64&fnval=1&fnver=0&fourk=0&platform=html5&high_quality=1");
    const data = play && play.data;
    const clips = data && data.durl;
    // 多段只拿到第一段，文件会在正片中途结束。这种留给官方播放器播完整段。
    const clip = Array.isArray(clips) && clips.length === 1 ? clips[0] : null;
    const url = clip && clip.url ? String(clip.url) : "";
    return { url, duration, quality: Number(data && data.quality) || 0 };
  } catch {
    return { url: "", duration: 0, quality: 0 };
  }
}
