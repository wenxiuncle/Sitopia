// 后台曲目单。已知曲子的时长以 js/score.js 为准。新文件才从文件头读时长。
import { SCORE, asPlaylist, isAudioFile, knownMs } from "../js/score.js";

export { isAudioFile, knownMs };

const MPEG1_RATE = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_RATE = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATE = [
  [11025, 12000, 8000],
  null,
  [22050, 24000, 16000],
  [44100, 48000, 32000],
];

export function readVolume(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d{1,3}$/.test(text)) return -1;
    value = Number(text);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100) return value;
  return -1;
}

function ascii(bytes, offset, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function u32(view, offset) {
  return view.getUint32(offset);
}

function u32le(view, offset) {
  return view.getUint32(offset, true);
}

export function leadingSkip(bytes) {
  if (!bytes || bytes.length < 10) return 0;
  const end = id3v2End(bytes);
  if (end > 10 && end < 40 * 1024 * 1024) return end;
  return 0;
}

function id3v2End(bytes) {
  if (bytes.length < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

function headerAt(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const word = (bytes[offset] * 16777216 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  if ((word >>> 21) !== 0x7ff) return null;
  const version = (word >>> 19) & 3;
  const layer = (word >>> 17) & 3;
  const bitrateIndex = (word >>> 12) & 0xf;
  const sampleIndex = (word >>> 10) & 3;
  if (version === 1 || layer !== 1 || sampleIndex === 3) return null;
  const table = SAMPLE_RATE[version];
  const sampleRate = table ? table[sampleIndex] : 0;
  const kbps = (version === 3 ? MPEG1_RATE : MPEG2_RATE)[bitrateIndex] || 0;
  if (!sampleRate || !kbps) return null;
  const channel = (word >>> 6) & 3;
  const crc = ((word >>> 16) & 1) === 0 ? 2 : 0;
  let side = 32;
  if (version === 3 && channel === 3) side = 17;
  else if (version !== 3 && channel !== 3) side = 17;
  else if (version !== 3 && channel === 3) side = 9;
  return { word, version, sampleRate, kbps, crc, side };
}

function tagFrames(bytes, at) {
  if (at < 0 || at + 16 > bytes.length) return 0;
  const tag = ascii(bytes, at, 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag === "Xing" || tag === "Info") {
    if (!(u32(view, at + 4) & 1) || at + 12 > bytes.length) return 0;
    return u32(view, at + 8);
  }
  if (tag === "VBRI" && at + 18 <= bytes.length) return u32(view, at + 14);
  return 0;
}

function xingFrames(bytes, frame, header) {
  const placed = tagFrames(bytes, frame + 4 + header.crc + header.side);
  if (placed > 0) return placed;
  return tagFrames(bytes, frame + 36);
}

function wavDuration(bytes) {
  if (bytes.length < 12) return 0;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate = 0;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = u32le(view, offset + 4);
    const start = offset + 8;
    if (id === "fmt " && start + 16 <= bytes.length) byteRate = u32le(view, start + 8);
    else if (id === "data") {
      dataSize = size;
      break;
    }
    if (!Number.isFinite(size) || size < 0) break;
    offset = start + size + (size & 1);
  }
  if (!byteRate || !dataSize) return 0;
  const ms = Math.round((dataSize / byteRate) * 1000);
  return ms >= 1000 ? ms : 0;
}

// 只看文件头和总字节数。Xing 的帧数优先，否则按第一帧的码率估算。
export function audioDuration(bytes, fileSize) {
  if (!bytes || bytes.length < 12) return 0;
  const wav = wavDuration(bytes);
  if (wav) return wav;
  const tagEnd = id3v2End(bytes);
  // 封面还在这块缓冲里时，不把标签里的字节当成音频帧。
  if (tagEnd > bytes.length) return 0;
  let start = tagEnd;
  const limit = Math.min(bytes.length - 4, start + 65536);
  for (let i = start; i <= limit; i++) {
    if (bytes[i] !== 0xff) continue;
    const header = headerAt(bytes, i);
    if (!header) continue;
    const samples = header.version === 3 ? 1152 : 576;
    const size = Number(fileSize) || 0;
    const audioBytes = size > start ? size - start : 0;
    const cbr = audioBytes > 0 && header.kbps > 0 ? (audioBytes * 8) / header.kbps : 0;
    const frames = xingFrames(bytes, i, header);
    if (frames > 0) {
      const ms = Math.round((frames * samples * 1000) / header.sampleRate);
      const plausible = !cbr || (ms > cbr / 4 && ms < cbr * 4);
      if (ms >= 1000 && ms <= 60 * 60 * 1000 && plausible) return ms;
    }
    if (cbr >= 1000 && cbr <= 60 * 60 * 1000) return Math.round(cbr);
    return 0;
  }
  return 0;
}

export function sortCatalog(files) {
  const rank = new Map();
  for (let i = 0; i < SCORE.length; i++) rank.set(SCORE[i].file, i);
  const known = [];
  const extra = [];
  for (let i = 0; i < files.length; i++) {
    if (rank.has(files[i].file)) known.push(files[i]);
    else extra.push(files[i]);
  }
  known.sort((a, b) => rank.get(a.file) - rank.get(b.file));
  extra.sort((a, b) => a.file.localeCompare(b.file, "zh"));
  return known.concat(extra);
}

export function musicForm(catalog, saved) {
  const list = Array.isArray(catalog) ? catalog : [];
  const savedTracks = saved && Array.isArray(saved.tracks) ? saved.tracks : [];
  const byName = new Map();
  const pending = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || !item.file) continue;
    if (!item.ms) {
      if (pending.indexOf(item.file) < 0) pending.push(item.file);
      continue;
    }
    byName.set(item.file, { file: item.file, ms: item.ms });
  }
  const savedOn = new Map();
  for (let i = 0; i < savedTracks.length; i++) {
    const row = savedTracks[i];
    if (!row || !row.file || savedOn.has(row.file)) continue;
    savedOn.set(row.file, row.on !== false);
  }
  const files = [];
  const seen = new Set();
  for (let i = 0; i < savedTracks.length; i++) {
    const name = savedTracks[i] && savedTracks[i].file;
    const item = byName.get(name);
    if (!item || seen.has(item.file)) continue;
    seen.add(item.file);
    files.push({ file: item.file, ms: item.ms, on: savedOn.get(item.file) !== false });
  }
  for (const item of byName.values()) {
    if (seen.has(item.file)) continue;
    files.push({ file: item.file, ms: item.ms, on: true });
  }
  const dropped = [];
  for (let i = 0; i < savedTracks.length; i++) {
    const name = savedTracks[i] && savedTracks[i].file;
    if (!name || byName.has(name) || pending.indexOf(name) >= 0 || dropped.indexOf(name) >= 0) continue;
    dropped.push(name);
  }
  const volume = readVolume(saved && saved.volume);
  return { files, pending, dropped, volume: volume < 0 ? 100 : volume };
}

export function resolveOrder(catalog, order, volume) {
  const level = readVolume(volume);
  if (level < 0) return { error: "volume" };
  const form = musicForm(catalog, null);
  const byName = new Map();
  for (let i = 0; i < form.files.length; i++) byName.set(form.files[i].file, form.files[i]);
  if (!byName.size) return { error: "empty" };
  const tracks = [];
  const seen = new Set();
  const names = Array.isArray(order) ? order : [];
  for (let i = 0; i < names.length; i++) {
    const spec = names[i];
    const file = typeof spec === "string" ? spec : (spec && spec.file);
    const item = byName.get(file);
    if (!item || seen.has(item.file)) continue;
    seen.add(item.file);
    const on = typeof spec === "string" ? true : !(spec && spec.on === false);
    tracks.push({ file: item.file, ms: item.ms, on });
  }
  for (const item of byName.values()) {
    if (seen.has(item.file)) continue;
    tracks.push({ file: item.file, ms: item.ms, on: true });
  }
  const clean = asPlaylist(tracks);
  if (!clean) return { error: "empty" };
  return { tracks: clean, volume: level };
}
