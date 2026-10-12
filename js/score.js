// 默认曲目。时长是 ffprobe 读到的毫秒，房间和每台浏览器共用这一份，进度才对得上。
// 房间没另存顺序时，下面的顺序就是循环顺序。
// audio 里多出来的曲子由扫描读时长，写进房间，不写回这里。
// 换掉这里已有的文件或改时长时，server/youqu-lobby/index.php 里的 SCORE_MS 要一起改。

export const SCORE = [
  { file: "gymnopedie-1.mp3", ms: 183589 },
  { file: "Claude Debussy - Clair de lune (From Twilight).mp3", ms: 311981 },
  { file: "Nocturne in E flat major, Op. 9 no. 2.mp3", ms: 271500 },
  { file: "Ludwig_Van_Beethoven_-_Moonlight_Sonata_Adagio_Sostenuto_(get-tune.net).mp3", ms: 328000 },
  { file: "Robert Schumann, Kinderszenen, Op.15-7  Träumerei.mp3", ms: 198987 },
  { file: "Frederic Chopin - Nocturne Op. 9, no. 1 in B flat minor.mp3", ms: 328005 },
];

export const SCORE_MS = 1622062;

const KNOWN = new Map(SCORE.map((row) => [row.file, row.ms]));

export function knownMs(file) {
  return KNOWN.get(file) || 0;
}

// 只收 audio 文件夹里的一层文件名，挡住路径。
export function isAudioFile(name) {
  if (typeof name !== "string") return false;
  if (name.length < 5 || name.length > 180) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  if (name.startsWith(".")) return false;
  const dot = name.lastIndexOf(".");
  if (dot < 1) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "m4a" || ext === "aac" || ext === "flac";
}

// 已知文件的时长以 SCORE 为准，避免和共享进度错开。
export function asPlaylist(list) {
  if (!Array.isArray(list) || !list.length || list.length > 40) return null;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const file = item && typeof item.file === "string" ? item.file : "";
    if (!isAudioFile(file) || seen.has(file)) continue;
    const known = knownMs(file);
    const ms = known || Math.round(Number(item && item.ms));
    if (!Number.isFinite(ms) || ms < 1000 || ms > 60 * 60 * 1000) continue;
    seen.add(file);
    out.push({ file, ms });
  }
  return out.length ? out : null;
}

export function scoreTotal(tracks) {
  if (!tracks || !tracks.length) return SCORE_MS;
  let n = 0;
  for (let i = 0; i < tracks.length; i++) {
    const ms = Number(tracks[i] && tracks[i].ms);
    if (Number.isFinite(ms) && ms > 0) n += ms;
  }
  return n > 0 ? n : SCORE_MS;
}

export function wrapScore(ms, total) {
  const span = Number(total) > 0 ? Number(total) : SCORE_MS;
  let n = Number(ms) || 0;
  n %= span;
  if (n < 0) n += span;
  return n;
}

export function scoreAt(ms, tracks) {
  const list = tracks && tracks.length ? tracks : SCORE;
  const t = wrapScore(ms, scoreTotal(list));
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const len = list[i].ms;
    if (t < acc + len || i === list.length - 1) {
      const into = Math.min(Math.max(0, t - acc), Math.max(0, len - 1));
      return { index: i, ms: t, into };
    }
    acc += len;
  }
  return { index: 0, ms: 0, into: 0 };
}
