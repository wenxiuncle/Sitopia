// 线上后台从仓库 main 的 audio 目录认曲子。本机后台不走这里。
import { audioDuration, isAudioFile, knownMs, leadingSkip, sortCatalog } from "./audio-catalog.mjs";

const REPO = "wenxiuncle/Sitopia";
const REF = "main";
const heard = new Map();

function githubHeaders(token) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "sitopia-admin",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = "Bearer " + token;
  return headers;
}

async function durationOf(item) {
  const known = knownMs(item.name);
  if (known) return known;
  const size = Number(item.size) || 0;
  if (!item.download_url || size > 8 * 1024 * 1024) return 0;
  const key = size + ":" + item.name;
  if (heard.has(key)) return heard.get(key);
  try {
    const res = await fetch(item.download_url, {
      headers: {
        range: "bytes=0-262143",
        "user-agent": "sitopia-admin",
      },
    });
    if (!res.ok && res.status !== 206) return 0;
    let bytes = new Uint8Array(await res.arrayBuffer());
    let audioSize = size;
    const skip = leadingSkip(bytes);
    if (skip >= bytes.length && skip < size) {
      const again = await fetch(item.download_url, {
        headers: {
          range: "bytes=" + skip + "-" + (skip + 262143),
          "user-agent": "sitopia-admin",
        },
      });
      if (again.ok || again.status === 206) {
        bytes = new Uint8Array(await again.arrayBuffer());
        audioSize = size - skip;
      }
    }
    const ms = audioDuration(bytes, audioSize) || 0;
    if (ms) heard.set(key, ms);
    return ms;
  } catch {
    return 0;
  }
}

export async function listRepoAudio(token) {
  let res;
  try {
    res = await fetch(
      "https://api.github.com/repos/" + REPO + "/contents/audio?ref=" + REF,
      { headers: githubHeaders(token) },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const files = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || item.type !== "file" || !isAudioFile(item.name)) continue;
    const ms = await durationOf(item);
    files.push({ file: item.name, ms: ms || 0 });
  }
  return sortCatalog(files);
}
