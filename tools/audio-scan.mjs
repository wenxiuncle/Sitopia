// 本机后台读 audio 文件夹。线上后台不走这里。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audioDuration, isAudioFile, knownMs, leadingSkip, sortCatalog } from "./audio-catalog.mjs";

const AUDIO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../audio");

function inside(root, name) {
  const full = path.resolve(root, name);
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  return full;
}

export function scanAudioDir(dir) {
  const root = dir || AUDIO_DIR;
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return null;
  }
  const files = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!isAudioFile(name)) continue;
    const full = inside(root, name);
    if (!full) continue;
    let size = 0;
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      size = stat.size;
    } catch {
      continue;
    }
    const known = knownMs(name);
    let ms = known;
    if (!ms) {
      let bytes = null;
      let audioSize = size;
      let fh = null;
      try {
        fh = fs.openSync(full, "r");
        const buf = Buffer.alloc(262144);
        const read = fs.readSync(fh, buf, 0, buf.length, 0);
        bytes = buf.subarray(0, read);
        const skip = leadingSkip(bytes);
        if (skip >= bytes.length && skip < size) {
          const again = Buffer.alloc(262144);
          const more = fs.readSync(fh, again, 0, again.length, skip);
          bytes = again.subarray(0, more);
          audioSize = size - skip;
        }
      } catch {
        bytes = null;
      } finally {
        if (fh != null) {
          try {
            fs.closeSync(fh);
          } catch {
            /* 关不上就让这一首显示为读不出时长。 */
          }
        }
      }
      ms = bytes ? audioDuration(bytes, audioSize) : 0;
    }
    files.push({ file: name, ms: ms || 0 });
  }
  return sortCatalog(files);
}
