// 浏览器直接问 B 站会被来源页拦住。这里带上站内 Referer 再问分页时长。
// 分页接口在 Cloudflare 上会被 412，拿不到时改读视频页里的 pages。

const PAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.bilibili.com/",
};

function durationFromBody(text, page) {
  const which = Math.max(1, Number(page) || 1);
  const json = String(text || "").replace(/^[^(]*\(/, "").replace(/\)\s*;?\s*$/, "");
  try {
    const data = JSON.parse(json);
    const pages = data && (data.data || data.pages);
    const list = Array.isArray(pages) ? pages : (data && data.data && data.data.pages);
    if (Array.isArray(list) && list.length) {
      const row = list[which - 1];
      const duration = Number(row && row.duration) || 0;
      if (duration > 0) return duration;
    }
  } catch {
    // 不是分页 JSON。
  }
  return 0;
}

async function readPage(url) {
  const upstream = await fetch(url, { headers: PAGE_HEADERS });
  const text = await upstream.text();
  return { status: upstream.status, text };
}

function durationFromVideoHtml(text, page) {
  const which = Math.max(1, Number(page) || 1);
  const marked = String(text || "").match(/"pages":(\[[\s\S]*?\])\s*,\s*"subtitle"/);
  if (!marked) return 0;
  try {
    const list = JSON.parse(marked[1]);
    if (!Array.isArray(list) || !list.length) return 0;
    const row = list[which - 1];
    return Number(row && row.duration) || 0;
  } catch {
    return 0;
  }
}

export async function biliPageDuration(bvid, aid, page) {
  const q = bvid ? "bvid=" + encodeURIComponent(bvid) : "aid=" + encodeURIComponent(aid);
  try {
    const list = await readPage("https://api.bilibili.com/x/player/pagelist?" + q + "&jsonp=jsonp");
    const fromList = durationFromBody(list.text, page);
    if (fromList > 0) return fromList;
    const slug = bvid || (aid ? "av" + aid : "");
    if (!slug) return 0;
    const html = await readPage("https://www.bilibili.com/video/" + encodeURIComponent(slug));
    return durationFromVideoHtml(html.text, page);
  } catch {
    return 0;
  }
}
