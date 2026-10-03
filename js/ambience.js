// 馆内背景：Erik Satie《Gymnopédie》第一首。曲子已过版权期。
// 录音是 Robin Alciatore 的公有领域演奏（Musopen，经 Wikimedia Commons）。

const irCache = new Map();

function cachedImpulse(rate) {
  let ir = irCache.get(rate);
  if (!ir) {
    ir = museumImpulse(rate);
    irCache.set(rate, ir);
  }
  return ir;
}

const MUSIC_URL = new URL("../audio/gymnopedie-1.mp3", import.meta.url);
const MUSIC_KEY = "quzhan-museum-music";
const LEVEL = 0.31;
const DRY = 0.62;
// 厅堂尾音叠在一起会抬上来，湿声收很多，空间听得见，琴还在前面。
const WET = 0.04;
const FADE_SEC = 5.5;

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

// 每帧只铺这么多样本，避免进门那一帧把整首曲子铺完。
const BAKE_CHUNK = 200000;

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
  let master = null;
  let voice = null;
  let bytes = null;
  let decoded = null;
  let decoding = false;
  let started = false;
  let blend = 0;
  let applied = -1;
  let baked = null;
  let playBuffer = null;
  let baking = false;
  let copying = false;
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
    return LEVEL * blend;
  }

  function applyGain() {
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

  function beginVoice() {
    if (voice || !playBuffer || !ctx || ctx.state !== "running") return;
    voice = ctx.createBufferSource();
    voice.buffer = playBuffer;
    voice.loop = true;
    voice.connect(input);
    voice.start();
  }

  function later(fn) {
    window.requestAnimationFrame(fn);
  }

  function kickCopy() {
    if (copying || playBuffer || !baked || !ctx || !decoded) return;
    copying = true;
    const channels = baked;
    const rate = decoded.sampleRate;
    let audio = null;
    try {
      audio = ctx.createBuffer(channels.length, channels[0].length, rate);
    } catch {
      copying = false;
      return;
    }
    let channel = 0;
    let offset = 0;
    const step = () => {
      const src = channels[channel];
      const dst = audio.getChannelData(channel);
      const end = Math.min(src.length, offset + BAKE_CHUNK);
      dst.set(src.subarray(offset, end), offset);
      offset = end;
      if (offset < src.length) {
        later(step);
        return;
      }
      channel += 1;
      offset = 0;
      if (channel < channels.length) {
        later(step);
        return;
      }
      playBuffer = audio;
      baked = null;
      decoded = null;
      copying = false;
      if (started) beginVoice();
    };
    later(step);
  }

  // 解码一完就分帧铺循环。走到门口时缓冲区已经在，进门只改音量。
  function kickBake() {
    if (baking || baked || playBuffer || !decoded) return;
    const channels = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const fade = Math.min((decoded.sampleRate * FADE_SEC) | 0, (decoded.length / 3) | 0);
    const outN = channels[0].length - fade;
    if (fade <= 32 || outN < 1) {
      baked = channels;
      kickCopy();
      return;
    }
    baking = true;
    const out = [];
    for (let c = 0; c < channels.length; c++) out.push(new Float32Array(outN));
    let cursor = 0;
    const step = () => {
      const end = Math.min(outN, cursor + BAKE_CHUNK);
      writeLoop(channels, fade, out, cursor, end);
      cursor = end;
      if (cursor < outN) {
        later(step);
        return;
      }
      baked = out;
      baking = false;
      kickCopy();
    };
    later(step);
  }

  function decode() {
    if (decoded || decoding || !bytes || !ctx) return;
    decoding = true;
    ctx.decodeAudioData(bytes.slice(0)).then((audio) => {
      decoded = audio;
      bytes = null;
      kickBake();
    }).catch(() => {
      decoding = false;
    });
  }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    input = graph();
    if (bytes) decode();
  }

  fetch(MUSIC_URL).then((res) => {
    if (!res.ok) throw new Error("music " + res.status);
    return res.arrayBuffer();
  }).then((buf) => {
    bytes = buf;
    if (ctx) decode();
  }).catch(() => {});

  function setEnabled(on) {
    enabled = !!on;
    if (box) box.checked = enabled;
    remember(enabled);
    applyGain();
  }

  if (box) {
    box.addEventListener("change", () => {
      setEnabled(box.checked);
      unlock();
    });
  }
  document.addEventListener("visibilitychange", applyGain);

  function unlock() {
    started = true;
    ensure();
    if (!ctx) return;
    const pending = ctx.resume();
    if (pending && pending.then) pending.then(beginVoice);
    else beginVoice();
  }

  return {
    unlock,
    hear(amount) {
      blend = Math.min(1, Math.max(0, amount || 0));
      applyGain();
      if (started) beginVoice();
    },
    toggle() {
      setEnabled(!enabled);
    },
  };
}
