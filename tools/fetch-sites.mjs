import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSIGN_IDS, HALLS, buildMuseum } from "../js/layout.js";
import { usableFrameImage } from "../js/meshes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "data", "sites.json");
const logFile = path.join(root, "data", "fetch-log.txt");
const endpoint = "https://youquhome.com/wp-json/wp/v2/posts";
const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const BAD_HOST = /(^|\.)youquhome\.com$|gravatar\.com$|wordpress\.(org|com)$|wp\.com$|w\.org$|schema\.org$|gmpg\.org$|googleapis\.com$|gstatic\.com$|doubleclick\.net$/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeText(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const c = parseInt(n, 16);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function tidyUrl(href) {
  return href.replace(/&amp;/gi, "&").replace(/[),.;，。]+$/g, "").trim();
}

function hrefs(html) {
  const out = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = tidyUrl(m[1] || m[2] || m[3] || "");
    if (/^https?:\/\//i.test(href)) out.push(href);
  }
  return out;
}

function struckUrls(html) {
  const out = [];
  const re = /<del>\s*(https?:\/\/[^<\s]+)\s*<\/del>/gi;
  let m;
  while ((m = re.exec(html))) out.push(tidyUrl(m[1]));
  return out;
}

function bareUrls(html) {
  const out = [];
  const re = /https?:\/\/[^\s<"'，。]+/gi;
  let m;
  while ((m = re.exec(html))) out.push(tidyUrl(m[0]));
  return out;
}

function hostOk(href) {
  try {
    return !BAD_HOST.test(new URL(href).hostname);
  } catch {
    return false;
  }
}

function opening(html) {
  const more = html.search(/<!--\s*more\s*-->/i);
  const head = more >= 0 ? html.slice(0, more) : html.slice(0, 12000);
  const idx = head.indexOf("传送门");
  const windows = [];
  if (idx >= 0) {
    windows.push(head.slice(idx, idx + 2500));
    windows.push(head.slice(Math.max(0, idx - 600), idx));
  }
  windows.push(head);
  return { head, idx, windows };
}

function firstOk(urls) {
  for (let i = 0; i < urls.length; i++) if (hostOk(urls[i])) return urls[i];
  return "";
}

export function extractPortal(html) {
  const { windows } = opening(html);
  for (let i = 0; i < windows.length; i++) {
    const chunk = windows[i];
    const hit = firstOk(hrefs(chunk)) || firstOk(struckUrls(chunk)) || firstOk(bareUrls(chunk));
    if (hit) return hit;
  }
  return "";
}

export function markedDown(html) {
  const { head, idx } = opening(html);
  const chunk = idx >= 0 ? head.slice(idx, idx + 500) : "";
  return /已挂/.test(chunk);
}

const SKIP_IMG = /gravatar\.com|wp-includes|s\.w\.org|\/emoji\/|smilies|pixel\.gif|spacer|data:image|doubleclick|googlesyndication/i;

function attr(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const found = re.exec(tag);
  if (!found) return "";
  return (found[1] || found[2] || found[3] || "").replace(/&amp;/gi, "&").trim();
}

function srcOf(tag) {
  const direct = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src");
  if (/^https?:\/\//i.test(direct)) return direct;
  const set = attr(tag, "srcset");
  const first = (set.split(",")[0] || "").trim().split(/\s+/)[0] || "";
  return /^https?:\/\//i.test(first) ? first : "";
}

export function extractImage(html) {
  const re = /<img\b[^>]*>/gi;
  let found;
  while ((found = re.exec(html))) {
    const tag = found[0];
    const src = srcOf(tag);
    if (!src || SKIP_IMG.test(src)) continue;
    const w = Number(attr(tag, "width") || 0);
    const h = Number(attr(tag, "height") || 0);
    if (w > 0 && h > 0 && w < 48 && h < 48) continue;
    return src;
  }
  return "";
}

export function extractBlurb(html) {
  const more = html.search(/<!--\s*more\s*-->/i);
  let head = more >= 0 ? html.slice(0, more) : html.slice(0, 4000);
  head = head.replace(/<figure[\s\S]*?<\/figure>/gi, " ").replace(/<img\b[^>]*>/gi, " ");
  let text = decodeText(head);
  text = text.replace(/传送门\s*https?:\/\/\S+/g, " ").replace(/传送门/g, " ");
  text = text.replace(/已挂/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 150) {
    const cut = text.slice(0, 150);
    const p = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    text = p >= 40 ? cut.slice(0, p + 1) : cut.replace(/\s+\S*$/, "") + "…";
  }
  return text;
}

async function getJson(url) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90000) });
      if (res.status === 400) return { items: [], pages: 0 };
      if (res.status === 429 || res.status >= 500) {
        last = new Error("HTTP " + res.status);
        await sleep(700 * attempt);
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
      const pages = Number(res.headers.get("x-wp-totalpages") || 0);
      const items = await res.json();
      return { items, pages };
    } catch (err) {
      last = err;
      await sleep(700 * attempt);
    }
  }
  throw last;
}

async function fetchCategory(cat) {
  const posts = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 80; page++) {
    const url = `${endpoint}?categories=${cat}&per_page=40&page=${page}&orderby=date&order=desc&_fields=id,link,title,content,categories`;
    const { items, pages: reported } = await getJson(url);
    if (reported) pages = reported;
    if (!items.length) break;
    for (let i = 0; i < items.length; i++) posts.push(items[i]);
    await appendLog(`${cat} page ${page}/${pages} +${items.length}\n`);
    if (items.length < 40) break;
    await sleep(60);
  }
  return posts;
}

async function appendLog(line) {
  await mkdir(path.dirname(logFile), { recursive: true });
  const { appendFile } = await import("node:fs/promises");
  await appendFile(logFile, line);
}

function toSite(post, cat) {
  const html = post.content && post.content.rendered ? post.content.rendered : "";
  const title = decodeText(post.title && post.title.rendered ? post.title.rendered : "");
  const site = {
    id: post.id,
    title,
    blurb: extractBlurb(html),
    portal: extractPortal(html),
    article: post.link,
    cat,
  };
  if (markedDown(html)) site.down = true;
  return site;
}

async function fillFrameImages(sites) {
  const built = buildMuseum(sites);
  const wanted = [];
  const seen = new Set();
  for (let i = 0; i < built.frames.length; i++) {
    const site = sites[built.frames[i].siteIndex];
    if (!site || seen.has(site.id)) continue;
    seen.add(site.id);
    wanted.push(site);
  }
  let got = 0;
  let missing = 0;
  for (let i = 0; i < wanted.length; i += 20) {
    const slice = wanted.slice(i, i + 20);
    const ids = slice.map((site) => site.id).join(",");
    const url = `${endpoint}?include=${ids}&per_page=${slice.length}&_fields=id,content`;
    const { items } = await getJson(url);
    const list = Array.isArray(items) ? items : [];
    const byId = new Map();
    for (let n = 0; n < list.length; n++) byId.set(list[n].id, list[n]);
    for (let n = 0; n < slice.length; n++) {
      const site = slice[n];
      const post = byId.get(site.id);
      const html = post && post.content && post.content.rendered ? post.content.rendered : "";
      const remote = usableFrameImage(extractImage(html));
      if (!remote) {
        delete site.image;
        missing++;
        continue;
      }
      site.image = remote;
      got++;
    }
    console.log(`images ${Math.min(i + 20, wanted.length)}/${wanted.length}`);
    await sleep(80);
  }
  return { got, missing };
}

async function keepImages(sites) {
  let old;
  try {
    old = JSON.parse(await readFile(outFile, "utf8"));
  } catch {
    return;
  }
  const map = new Map();
  const list = old.sites || [];
  for (let i = 0; i < list.length; i++) {
    const image = usableFrameImage(list[i] && list[i].image);
    if (!image) continue;
    if (/^https:\/\//i.test(image)) {
      map.set(list[i].id, image);
      continue;
    }
    try {
      await access(path.join(root, image));
      map.set(list[i].id, image);
    } catch {
      // 本地文件已经不在。
    }
  }
  for (let i = 0; i < sites.length; i++) {
    const image = map.get(sites[i].id);
    if (image) sites[i].image = image;
  }
}

async function refreshFrameImages() {
  const data = JSON.parse(await readFile(outFile, "utf8"));
  const result = await fillFrameImages(data.sites);
  data.frameImages = result.got;
  const tmp = outFile + ".tmp";
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, outFile);
  console.log(`frame images ${result.got} missing ${result.missing}`);
  console.log(outFile);
}

async function main() {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(logFile, `start ${new Date().toISOString()}\n`);
  const byCat = new Map();
  for (let i = 0; i < HALLS.length; i++) {
    const hall = HALLS[i];
    const posts = await fetchCategory(hall.cat);
    byCat.set(hall.cat, posts);
    console.log(`${hall.name} ${posts.length}`);
  }

  const sites = [];
  const seen = new Set();
  for (let i = 0; i < ASSIGN_IDS.length; i++) {
    const hall = HALLS.find((item) => item.id === ASSIGN_IDS[i]);
    const posts = byCat.get(hall.cat) || [];
    for (let p = 0; p < posts.length; p++) {
      if (seen.has(posts[p].id)) continue;
      const site = toSite(posts[p], hall.cat);
      if (!site.title || !site.article) continue;
      seen.add(posts[p].id);
      sites.push(site);
    }
  }

  await keepImages(sites);
  let missingPortal = 0;
  for (let i = 0; i < sites.length; i++) if (!sites[i].portal) missingPortal++;
  const data = {
    source: "https://youquhome.com/",
    fetched: new Date().toISOString().slice(0, 10),
    count: sites.length,
    missingPortal,
    sites,
  };
  await writeFile(outFile, JSON.stringify(data));
  console.log(`sites ${sites.length} missingPortal ${missingPortal}`);
  console.log(outFile);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && path.resolve(fileURLToPath(import.meta.url)) === entry) {
  const run = process.argv.includes("--images") ? refreshFrameImages : main;
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
