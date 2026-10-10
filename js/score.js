// 展厅曲目。时长是 ffprobe 读到的毫秒，房间和每台浏览器共用这一份，进度才对得上。
// 顺序就是循环顺序。换文件或改时长时，server/youqu-lobby/index.php 里的 SCORE_MS 要一起改。

export const SCORE = [
  { file: "gymnopedie-1.mp3", ms: 183589 },
  { file: "Claude Debussy - Clair de lune (From Twilight).mp3", ms: 311981 },
  { file: "Nocturne in E flat major, Op. 9 no. 2.mp3", ms: 271500 },
  { file: "Ludwig_Van_Beethoven_-_Moonlight_Sonata_Adagio_Sostenuto_(get-tune.net).mp3", ms: 328000 },
  { file: "Robert Schumann, Kinderszenen, Op.15-7  Träumerei.mp3", ms: 198987 },
  { file: "Frederic Chopin - Nocturne Op. 9, no. 1 in B flat minor.mp3", ms: 328005 },
];

export const SCORE_MS = 1622062;

export function wrapScore(ms) {
  const total = SCORE_MS;
  let n = Number(ms) || 0;
  n %= total;
  if (n < 0) n += total;
  return n;
}

export function scoreAt(ms) {
  const t = wrapScore(ms);
  let acc = 0;
  for (let i = 0; i < SCORE.length; i++) {
    const len = SCORE[i].ms;
    if (t < acc + len || i === SCORE.length - 1) {
      const into = Math.min(Math.max(0, t - acc), Math.max(0, len - 1));
      return { index: i, ms: t, into };
    }
    acc += len;
  }
  return { index: 0, ms: 0, into: 0 };
}
