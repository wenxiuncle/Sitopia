// 馆内背景：audio 里的曲目按联机房间的进度循环。厅里没人就停，有人进来接着放。
// 广场、脚步和电梯在 sounds.js，跟这里共用一个音频上下文和同一个开关。

import { createSounds } from "./sounds.js";
import { SCORE, asPlaylist, scoreAt, scoreTotal, wrapScore } from "./score.js";

const irCache = new Map();

function cachedImpulse(rate) {
  let ir = irCache.get(rate);
  if (!ir) {
    ir = museumImpulse(rate);
    irCache.set(rate, ir);
  }
  return ir;
}

const MUSIC_KEY = "quzhan-museum-music";
// 房间音量是 0 到 100，100 乘上 LEVEL，和原来一样响。没收到房间的数字时按 100。
const LEVEL = 0.31;
const DRY = 0.62;
// 厅堂尾音叠在一起会抬上来，湿声收很多，空间听得见，琴还在前面。
const WET = 0.04;
// 进度不逐帧对。seek 一次要一两百毫秒（手机走网络更慢），拿音轨时钟硬比房间
// 时钟会变成「差 0.4 秒→跳一下→跳完又差 0.4 秒」，一路都在断，听起来就是
// 卡顿。只在进厅、换曲、离开回来这些事上对一次，中间让它自己走。
const CHECK_MS = 900;
const RESYNC_MS = 9000;
const RESYNC_GAP_MS = 30000;
const TAIL_MS = 5000;
const START_TIMEOUT_MS = 10000;

// 房间此刻放哪一首、播放器要不要动。纯函数，selftest 直接跑这份判断。
// room: { playing, pos }，pos 是这一轮播放表里的毫秒进度。
// el:   播放器的样子 { index, playing, starting, seeking, ended, readyState, timeMs, durationMs }。
export function syncStep(room, el, tracks, nowMs, lastFixMs) {
  if (!room || !room.playing || !Array.isArray(tracks) || !tracks.length) return { act: "quiet" };
  const place = scoreAt(room.pos, tracks);
  if (place.index < 0) return { act: "quiet" };
  // 正在装载或跳转，等它自己出声。
  if (el.starting) return { act: "hold" };
  if (el.index !== place.index) {
    // 房间已经翻到下一首，我们这首还剩个尾巴：让它自然收完，别掐。
    const tail = Number.isFinite(el.durationMs) ? el.durationMs - el.timeMs : 0;
    if (el.playing && !el.seeking && !el.ended && tail > 0 && tail <= TAIL_MS) return { act: "hold" };
    return { act: "start", index: place.index, into: place.into };
  }
  if (el.seeking) return { act: "hold" };
  if (el.ended) {
    // 同一首放完了：房间还在这一首尾巴上就等它翻面；房间已经绕回开头
    // （清单里只有一首时）就从头接上。
    const len = Number(tracks[place.index] && tracks[place.index].ms) || 0;
    if (len > 0 && len - place.into > TAIL_MS) return { act: "start", index: place.index, into: place.into };
    return { act: "hold" };
  }
  // 同一首却停着（被系统打断、或者从厅外回来）：接上房间的进度。
  if (!el.playing) return { act: "start", index: place.index, into: place.into };
  const off = Math.abs(el.timeMs - place.into);
  // 差得不多就别碰，手机上一次跳转就是一个空档。
  if (off > RESYNC_MS && nowMs - lastFixMs > RESYNC_GAP_MS && el.readyState >= 3) {
    return { act: "start", index: place.index, into: place.into };
  }
  return { act: "hold" };
}

function rand(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 低而宽的展厅：先空一拍，再是近处墙面，然后大约两秒淡掉的尾音。高频比低频走得快。
export function museumImpulse(rate) {
  const rt = 1.9;
  const n = Math.floor(rate * (rt + 0.7));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const decay = Math.log(1000) / rt;
  const taps = [
    [0.029, 0.46, -0.15],
    [0.037, 0.28, 0.42],
    [0.048, 0.22, -0.55],
    [0.063, 0.16, 0.22],
    [0.081, 0.11, -0.38],
    [0.104, 0.07, 0.62],
    [0.132, 0.05, -0.08],
  ];
  for (let t = 0; t < taps.length; t++) {
    const time = taps[t][0];
    const gain = taps[t][1];
    const pan = taps[t][2];
    const ang = ((pan + 1) * 0.5) * Math.PI * 0.5;
    const gl = Math.cos(ang) * gain;
    const gr = Math.sin(ang) * gain;
    const i0 = Math.round(time * rate);
    const spread = [0.65, 1, 0.65, 0.25];
    for (let k = 0; k < spread.length; k++) {
      const idx = i0 + k - 1;
      if (idx < 0 || idx >= n) continue;
      left[idx] += gl * spread[k];
      right[idx] += gr * spread[k];
    }
  }

  let nextL = Math.floor(0.025 * rate);
  let nextR = Math.floor(0.031 * rate);
  let seq = 17;
  while (nextL < n || nextR < n) {
    if (nextL < n) {
      const t = nextL / rate;
      const env = Math.exp(-decay * t);
      const sign = rand(seq++) < 0.5 ? -1 : 1;
      const dark = Math.exp(-t * 1.35);
      left[nextL] += sign * env * (0.34 + 0.2 * dark);
      const gap = rate / (2600 * Math.exp(-t * 0.55) + 380);
      nextL += Math.max(1, Math.round(gap * (0.55 + rand(seq++))));
    }
    if (nextR < n) {
      const t = nextR / rate;
      const env = Math.exp(-decay * t);
      const sign = rand(seq++) < 0.5 ? -1 : 1;
      const dark = Math.exp(-t * 1.35);
      right[nextR] += sign * env * (0.34 + 0.2 * dark);
      const gap = rate / (2600 * Math.exp(-t * 0.55) + 380);
      nextR += Math.max(1, Math.round(gap * (0.55 + rand(seq++))));
    }
  }

  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const c = 0.12 + 0.5 * Math.exp(-t * 1.6);
    lpL += (left[i] - lpL) * c;
    lpR += (right[i] - lpR) * c;
    left[i] = lpL;
    right[i] = lpR;
  }

  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  if (peak > 0) {
    const s = 0.62 / peak;
    for (let i = 0; i < n; i++) {
      left[i] *= s;
      right[i] *= s;
    }
  }
  return { rate, left, right };
}

function writeLoop(channels, fade, out, from, to) {
  const n = channels[0].length;
  const end = Math.min(to, out[0].length);
  for (let c = 0; c < channels.length; c++) {
    const src = channels[c];
    const dst = out[c];
    for (let i = from; i < end; i++) {
      if (i < fade) {
        const x = i / fade;
        const fin = Math.sin(x * Math.PI * 0.5);
        const fout = Math.cos(x * Math.PI * 0.5);
        dst[i] = src[i] * fin + src[n - fade + i] * fout;
      } else {
        dst[i] = src[i];
      }
    }
  }
}

// 把曲子尾巴叠进开头，循环时不再猛地跳回去。
export function bakeLoop(channels, fade) {
  const n = channels[0].length;
  const outN = n - fade;
  const out = [];
  for (let c = 0; c < channels.length; c++) out.push(new Float32Array(outN));
  writeLoop(channels, fade, out, 0, outN);
  return out;
}

export function createAmbience() {
  const box = document.getElementById("music-on");
  let enabled = true;
  try {
    enabled = localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    enabled = true;
  }
  if (box) box.checked = enabled;

  let ctx = null;
  let sounds = null;
  let master = null;
  let started = false;
  let blend = 0;
  let audible = false;
  let applied = -1;
  let media = null;
  let clipIndex = -1;
  let gen = 0;
  let lastView = null;
  let playlist = SCORE;
  let playlistKey = "";
  let volumePct = 100;
  let duckAmt = 1;
  let hushAt = 0;
  const audio = new Audio();
  audio.preload = "auto";
  audio.loop = false;
  cachedImpulse(48000);
  cachedImpulse(44100);

  function remember(on) {
    try {
      localStorage.setItem(MUSIC_KEY, on ? "1" : "0");
    } catch {
      /* 记不住就按这一次的开关。 */
    }
  }

  function target() {
    if (!enabled || document.hidden) return 0;
    return LEVEL * (volumePct / 100) * blend * duckAmt;
  }

  function applyGain() {
    if (sounds) sounds.allow(enabled && !document.hidden);
    if (!master || !ctx) return;
    const next = target();
    if (Math.abs(next - applied) < 0.004) return;
    applied = next;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(next, now, 0.72);
  }

  function graph() {
    master = ctx.createGain();
    master.gain.value = 0;
    applied = 0;
    master.connect(ctx.destination);

    const hip = ctx.createBiquadFilter();
    hip.type = "highpass";
    hip.frequency.value = 80;
    hip.Q.value = 0.7;

    const dry = ctx.createGain();
    dry.gain.value = DRY;
    dry.connect(master);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 6400;
    tone.Q.value = 0.45;
    const wet = ctx.createGain();
    wet.gain.value = WET;
    tone.connect(wet);
    wet.connect(master);

    const room = ctx.createConvolver();
    room.normalize = false;
    const ir = cachedImpulse(ctx.sampleRate);
    const buffer = ctx.createBuffer(2, ir.left.length, ir.rate);
    buffer.getChannelData(0).set(ir.left);
    buffer.getChannelData(1).set(ir.right);
    room.buffer = buffer;
    room.connect(tone);

    hip.connect(dry);
    hip.connect(room);
    return hip;
  }

  let input = null;

  function livePos() {
    if (!lastView) return 0;
    let pos = Number(lastView.pos) || 0;
    if (lastView.playing && lastView.receivedAt) pos += Date.now() - lastView.receivedAt;
    return wrapScore(pos, playlist.length ? scoreTotal(playlist) : 0);
  }

  function usePlaylist(list) {
    let key = list && list.length ? "" : "off";
    if (list) {
      for (let i = 0; i < list.length; i++) key += list[i].file + "\n" + list[i].ms + "\n" + (list[i].on === false ? "0" : "1") + "\n";
    }
    if (key === playlistKey) return;
    playlistKey = key;
    playlist = list && list.length ? list : [];
    clipIndex = -1;
    // 上一份播放表还没接上就别管了。
    gen += 1;
    starting = false;
    stopStartTimer();
    audio.dataset.track = "";
  }

  function ensureMedia() {
    if (media || !ctx || !input) return;
    try {
      media = ctx.createMediaElementSource(audio);
      media.connect(input);
    } catch {
      media = null;
    }
  }

  let held = false;
  // 叫了 play 还没出声。这期间别再叫一次，否则手机上来回打断。
  let starting = false;
  let startTimer = 0;
  // 上次把播放器挪到房间位置的时间（performance.now），重开靠它冷却。
  let lastFix = 0;
  let lastCheck = 0;

  function stopStartTimer() {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = 0;
    }
  }

  function quiet() {
    if (held && audio.paused) return;
    held = true;
    gen += 1;
    starting = false;
    stopStartTimer();
    if (!audio.paused) audio.pause();
  }

  function beginAt(index, into, nowMs) {
    const row = playlist[index];
    if (!row) return;
    ensureMedia();
    if (!media) return;
    held = false;
    const mine = ++gen;
    const seconds = Math.max(0, into / 1000);
    const now = Number.isFinite(nowMs) ? nowMs : performance.now();
    lastFix = now;
    starting = true;
    stopStartTimer();
    // play 一直不出声（网断了之类）也别把后面的对齐卡死。
    startTimer = setTimeout(() => {
      starting = false;
      startTimer = 0;
    }, START_TIMEOUT_MS);
    const seekAndPlay = () => {
      if (mine !== gen) return;
      let at = seconds;
      if (Number.isFinite(audio.duration) && audio.duration > 0.2) {
        at = Math.min(seconds, Math.max(0, audio.duration - 0.08));
      }
      try {
        if (Math.abs(audio.currentTime - at) > 0.12) audio.currentTime = at;
      } catch {
        /* 元数据还没到，等 loadedmetadata。 */
      }
      const pending = audio.play();
      if (pending && pending.catch) {
        pending.catch(() => {
          if (mine === gen) starting = false;
        });
      }
    };
    clipIndex = index;
    audio.dataset.track = String(index);
    const url = new URL("../audio/" + row.file, import.meta.url).href;
    if (audio.src !== url) {
      // 换曲只设 src，等元数据到了再跳一次再放：src 刚换就 play，手机会先
      // 从 0 放一下再被打断，多一次解码器 flush。
      audio.src = url;
      audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      return;
    }
    if (audio.readyState < 1) {
      audio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      return;
    }
    seekAndPlay();
  }

  function align(force) {
    if (!started || !lastView || !ctx || ctx.state !== "running") return;
    const now = performance.now();
    // 主循环每帧都来问，这里限一下频率；真正的判断交给 syncStep。
    if (!force && now - lastCheck < CHECK_MS) return;
    lastCheck = now;
    if (!audible || !lastView.playing || !enabled || !playlist.length) {
      const fading = !audible && enabled && lastView && lastView.playing && playlist.length && hushAt && now - hushAt < 2400;
      if (fading) return;
      quiet();
      return;
    }
    const move = syncStep(
      { playing: true, pos: livePos() },
      {
        index: clipIndex,
        playing: !audio.paused && !audio.ended,
        starting,
        seeking: audio.seeking,
        ended: audio.ended,
        readyState: audio.readyState,
        timeMs: (Number(audio.currentTime) || 0) * 1000,
        durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : NaN,
      },
      playlist,
      now,
      lastFix,
    );
    if (move.act === "quiet") {
      quiet();
      return;
    }
    if (move.act === "start") beginAt(move.index, move.into, now);
  }

  audio.addEventListener("playing", () => {
    starting = false;
    stopStartTimer();
  });

  audio.addEventListener("error", () => {
    starting = false;
    stopStartTimer();
  });

  audio.addEventListener("ended", () => {
    if (!lastView || !lastView.playing) return;
    align(true);
  });

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    input = graph();
    try {
      sounds = createSounds(ctx);
    } catch {
      sounds = null;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (box) box.checked = enabled;
    remember(enabled);
    applyGain();
    align(true);
  }

  if (box) {
    box.addEventListener("change", () => {
      setEnabled(box.checked);
      unlock();
    });
  }
  document.addEventListener("visibilitychange", () => {
    applyGain();
    if (!document.hidden) align(true);
  });

  function unlock() {
    started = true;
    ensure();
    if (!ctx) return;
    if (sounds) {
      try {
        sounds.allow(enabled && !document.hidden);
        sounds.start();
      } catch {
        sounds = null;
      }
    }
    ctx.resume();
    ensureMedia();
    // 第一次手势得真的放一下，iOS 才认这个元素能出声。以后每个手势都 play
    // 一次会把正在放的曲子反复叫一遍，没必要。
    if (!audio.src && playlist.length) {
      audio.dataset.track = "0";
      audio.src = new URL("../audio/" + playlist[0].file, import.meta.url).href;
      const pending = audio.play();
      if (pending && pending.catch) pending.catch(() => {});
    }
    align(true);
  }

  return {
    unlock,
    follow(view) {
      if (!view || !Number.isFinite(Number(view.pos))) return;
      if (Array.isArray(view.tracks)) {
        if (!view.tracks.length) usePlaylist([]);
        else {
          const next = asPlaylist(view.tracks);
          if (next) usePlaylist(next);
        }
      }
      const level = Math.round(Number(view.volume));
      if (Number.isInteger(level) && level >= 0 && level <= 100 && level !== volumePct) {
        volumePct = level;
        applied = -1;
        applyGain();
      }
      lastView = {
        pos: Number(view.pos) || 0,
        playing: view.playing === true,
        at: Number(view.at) || Date.now(),
        receivedAt: Date.now(),
      };
      if (started) align(true);
    },
    hear(amount) {
      blend = Math.min(1, Math.max(0, amount || 0));
      const live = blend > 0.02;
      if (live) hushAt = 0;
      else if (!hushAt) hushAt = performance.now();
      audible = live;
      applyGain();
      if (started) align();
    },
    toggle() {
      setEnabled(!enabled);
    },
    place(info) {
      if (!started || !sounds) return;
      sounds.place(info);
    },
    press() {
      unlock();
      if (sounds) sounds.press();
    },
    context() {
      ensure();
      return ctx;
    },
    duck(amount) {
      const next = amount == null ? 1 : amount;
      if (Math.abs(next - duckAmt) < 0.001) return;
      duckAmt = next;
      applied = -1;
      applyGain();
    },
  };
}
