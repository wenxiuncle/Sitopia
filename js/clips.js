// 大屏幕认哪些链接。房间只存这里收干净的地址。

export const CLIP_CAP = 20;
const CLIP_LEN = 400;

function firstUrl(raw) {
  const text = String(raw || "").trim();
  const found = text.match(/https?:\/\/[^\s]+/i);
  return (found ? found[0] : text).replace(/[，。,.]+$/g, "");
}

function youtubeSeconds(text) {
  const start = text.match(/[?&]start=(\d+)/);
  if (start) return Number(start[1]) || 0;
  const stamp = text.match(/[?&#]t=(\d+)(?![0-9hms])/i);
  if (stamp) return Number(stamp[1]) || 0;
  const clock = text.match(/[?&#]t=((?:\d+h)?(?:\d+m)?(?:\d+s)?)/i);
  if (!clock || !clock[1]) return 0;
  const raw = clock[1];
  const h = raw.match(/(\d+)h/i);
  const m = raw.match(/(\d+)m/i);
  const s = raw.match(/(\d+)s/i);
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

function reject(error) {
  return { error };
}

// 收成一条可再解析的地址。短链接和认不出的行整单退回。
export function parseClip(raw) {
  const url = firstUrl(raw);
  if (!url || !/^https?:\/\//i.test(url) || url.length > CLIP_LEN) {
    return reject("这不是 B 站或 YouTube 的视频链接。");
  }
  if (/b23\.tv/i.test(url)) return reject("B 站短链接在这里打不开，请贴完整的 BV 地址。");
  if (/bilibili\.com/i.test(url) || /BV[0-9A-Za-z]{6,}/.test(url)) {
    const bv = url.match(/BV[0-9A-Za-z]+/);
    const av = url.match(/(?:av|aid=)(\d+)/i);
    const pageMatch = url.match(/[?&]p=(\d+)/);
    const page = pageMatch ? Math.max(1, Number(pageMatch[1]) || 1) : 1;
    if (bv) return { url, platform: "bili", bvid: bv[0], page, start: 0 };
    if (av) return { url, platform: "bili", aid: av[1], page, start: 0 };
    return reject("这不是 B 站或 YouTube 的视频链接。");
  }
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const found = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    if (!found) return reject("这不是 B 站或 YouTube 的视频链接。");
    return { url, platform: "youtube", id: found[1], start: youtubeSeconds(url) };
  }
  return reject("这不是 B 站或 YouTube 的视频链接。");
}

// 一行一条。空行跳过。有一条不认，或超出条数，整单不改。
export function cleanClipList(input) {
  const lines = Array.isArray(input)
    ? input
    : String(input == null ? "" : input).split(/\r?\n/);
  const urls = [];
  for (let i = 0; i < lines.length; i++) {
    const text = String(lines[i] == null ? "" : lines[i]).trim();
    if (!text) continue;
    if (urls.length >= CLIP_CAP) return reject("最多 20 条视频链接。");
    const parsed = parseClip(text);
    if (parsed.error) return reject(parsed.error);
    urls.push(parsed.url);
  }
  return { urls };
}
