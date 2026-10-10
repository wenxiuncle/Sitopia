// 广场的风、鸟、空场，人的脚步，展厅大门，电梯的门、机械、按键和到层。
// 全部在进馆后合成，不另放录音。总开关在 ambience：关掉声音或切到后台时一起淡掉。

const BED = 0.05;
const LEAF = 0.05;
const BIRD = 0.09;
const STEP = { plaza: 0.078, indoor: 0.05, stair: 0.066 };
const DOOR_OPEN = 0.065;
const DOOR_CLOSE = 0.045;
const HUM = 0.045;
const RUMBLE = 0.05;
const CHIME = 0.04;
const CLICK = 0.08;
// 轿厢巡航大约 2 米/秒。机械声按这个收满。
const CRUISE = 2.02;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function center(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  if (mean === 0) return;
  for (let i = 0; i < data.length; i++) data[i] -= mean;
}

function normalize(data, peak) {
  center(data);
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > max) max = a;
  }
  if (max < 1e-8) return;
  const scale = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}

function looped(data, fade) {
  const n = data.length;
  const edge = Math.max(1, Math.min(fade, (n / 4) | 0));
  const out = new Float32Array(n - edge);
  for (let i = 0; i < out.length; i++) out[i] = data[i];
  for (let i = 0; i < edge; i++) {
    const w = i / edge;
    out[i] = data[i] * w + data[n - edge + i] * (1 - w);
  }
  return out;
}

function onePole(x, state, coeff) {
  state.v += coeff * (x - state.v);
  return state.v;
}

function pink(n, seed) {
  const rnd = mulberry(seed);
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const white = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return out;
}

// 空场：把粉噪再滤低，留下一片很轻的空气，不跟树叶抢中频。
function bedChannel(n, rate, seed) {
  const src = pink(n, seed);
  const out = new Float32Array(n);
  const coeff = 1 - Math.exp((-2 * Math.PI * 320) / rate);
  const state = { v: 0 };
  for (let i = 0; i < n; i++) out[i] = onePole(src[i], state, coeff);
  return looped(out, (rate * 0.03) | 0);
}

// 树叶：风一阵一阵，叶子是干的短擦声。包络用噪声走，不用正弦来回抖，否则像在刮水。
function leafChannel(n, rate, seed) {
  const rnd = mulberry(seed);
  const out = new Float32Array(n);
  const ctrl = Math.max(1, (rate / 100) | 0);
  const perSec = rate / ctrl;
  let gust = 0.1;
  let gustAim = 0.1;
  let gustHold = 0;
  let rub = 0.2;
  let rubAim = 0.2;
  let rubHold = 0;
  let grain = 0;
  let hp = 0;
  let split = 0;
  const hpC = 1 - Math.exp((-2 * Math.PI * 1500) / rate);
  const splitC = 1 - Math.exp((-2 * Math.PI * 4200) / rate);
  const gustFollow = 1 - Math.exp(-1 / (rate * 0.22));
  const rubFollow = 1 - Math.exp(-1 / (rate * 0.045));
  const grainDecay = Math.exp(-1 / (rate * 0.02));
  for (let i = 0; i < n; i++) {
    if (i % ctrl === 0) {
      if (gustHold <= 0) {
        const blowing = rnd() < 0.36;
        gustAim = blowing ? 0.48 + rnd() * 0.52 : 0.05 + rnd() * 0.08;
        const holdSec = blowing ? 0.6 + rnd() * 1.5 : 0.45 + rnd() * 1.15;
        gustHold = (holdSec * perSec) | 0;
      }
      gustHold -= 1;
      if (rubHold <= 0) {
        rubAim = rnd() * rnd();
        rubHold = (1 + rnd() * 6) | 0;
      }
      rubHold -= 1;
      if (rnd() < 0.08 + gustAim * 0.22) grain = Math.max(grain, 0.35 + rnd() * 0.65);
    }
    gust += (gustAim - gust) * gustFollow;
    rub += (rubAim - rub) * rubFollow;
    grain *= grainDecay;
    // 风小的时候直接落到很轻，不要铺一层一直响的沙沙。
    const env = gust * (0.25 + 0.75 * rub * gust);
    const shaped = env * env;
    const white = rnd() * 2 - 1;
    hp += hpC * (white - hp);
    const high = white - hp;
    split += splitC * (high - split);
    const dry = high - split;
    out[i] = (high * 0.62 + dry * 0.38) * shaped + dry * grain * gust * 0.8;
  }
  return looped(out, (rate * 0.08) | 0);
}

function brownLoop(n, rate, seed) {
  const rnd = mulberry(seed);
  const out = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = v * 0.98 + (rnd() * 2 - 1) * 0.035;
    out[i] = v;
  }
  return looped(out, (rate * 0.02) | 0);
}

function tone(out, rate, t0, freq, decay, amp) {
  const i0 = Math.max(0, (t0 * rate) | 0);
  const span = Math.min(out.length - i0, (rate * Math.min(1.2, 6 / decay)) | 0);
  for (let i = 0; i < span; i++) {
    const t = i / rate;
    const env = Math.exp(-t * decay) * (1 - Math.exp(-t * 90));
    out[i0 + i] += Math.sin(2 * Math.PI * freq * t) * env * amp;
  }
}

// 鞋落地仍是短触地。体重在低频，但很快收回，再拖就闷，听不成脚步。
function stepWave(rate, kind, seed) {
  const rnd = mulberry(seed);
  const dur = kind === "stair" ? 0.14 : 0.11;
  const n = Math.max(8, (dur * rate) | 0);
  const out = new Float32Array(n);
  const spread = 0.94 + rnd() * 0.12;
  const band = (i0, hpHz, lpHz, decay, amp) => {
    if (i0 >= n || amp <= 0) return;
    let hp = 0;
    let lp = 0;
    const hpC = 1 - Math.exp((-2 * Math.PI * hpHz * spread) / rate);
    const lpC = 1 - Math.exp((-2 * Math.PI * lpHz * spread) / rate);
    for (let i = 0; i0 + i < n; i++) {
      const t = i / rate;
      const white = rnd() * 2 - 1;
      hp += hpC * (white - hp);
      const high = white - hp;
      lp += lpC * (high - lp);
      out[i0 + i] += lp * Math.exp(-t * decay) * amp;
    }
  };
  const weight = (freq, decay, amp) => {
    const f = freq * spread;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      out[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * amp;
    }
  };
  if (kind === "indoor") {
    band(0, 2400, 6400, 240, 0.62);
    band(0, 260, 780, 40, 0.46);
    band((0.008 * rate) | 0, 1200, 2800, 46, 0.18);
    band(0, 70, 190, 26, 0.38);
    weight(82, 20, 0.5);
  } else if (kind === "stair") {
    band(0, 1400, 4200, 200, 0.42);
    band(0, 360, 1200, 36, 0.58);
    band((0.028 * rate) | 0, 1700, 4400, 240, 0.24);
    band((0.028 * rate) | 0, 420, 1300, 48, 0.26);
    weight(110, 24, 0.42);
    weight(74, 16, 0.36);
    const f = 420 * spread;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      out[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 80) * 0.12;
    }
  } else {
    band(0, 1800, 5400, 190, 0.5);
    band(0, 160, 520, 32, 0.48);
    band((0.006 * rate) | 0, 550, 1800, 36, 0.32);
    band(0, 55, 150, 22, 0.4);
    weight(68, 18, 0.58);
  }
  normalize(out, 0.9);
  return out;
}

function doorWave(rate, open) {
  const dur = open ? 0.9 : 0.78;
  const n = (dur * rate) | 0;
  const out = new Float32Array(n);
  const rnd = mulberry(open ? 0x0d00 : 0xc105e);
  let v = 0;
  const clunkAt = open ? 0.06 : dur - 0.12;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const white = rnd() * 2 - 1;
    v = v * 0.86 + white * 0.14;
    const rise = Math.min(1, t / (open ? 0.05 : 0.09));
    const end = t > dur - 0.22 ? Math.exp(-(t - (dur - 0.22)) * 7) : 1;
    out[i] = v * rise * end * 0.55;
    const ct = t - clunkAt;
    if (ct > 0 && ct < 0.09) {
      out[i] += Math.sin(2 * Math.PI * (open ? 140 : 110) * ct) * Math.exp(-ct * 32) * 0.85;
      out[i] += white * Math.exp(-ct * 50) * 0.25;
    }
  }
  normalize(out, 0.9);
  return out;
}

function chimeWave(rate) {
  const n = (1.15 * rate) | 0;
  const out = new Float32Array(n);
  const notes = [
    [0, 659.25],
    [0.24, 880],
  ];
  for (let k = 0; k < notes.length; k++) {
    const t0 = notes[k][0];
    const freq = notes[k][1];
    tone(out, rate, t0, freq, 3.1, 0.55);
    tone(out, rate, t0, freq * 2.01, 6.5, 0.12);
    tone(out, rate, t0, freq * 0.5, 2.4, 0.16);
  }
  const rnd = mulberry(0xc41e);
  const strike = (0.012 * rate) | 0;
  for (let i = 0; i < strike; i++) out[i] += (rnd() * 2 - 1) * (1 - i / strike) * 0.15;
  normalize(out, 0.85);
  return out;
}

function clickWave(rate) {
  const n = (0.05 * rate) | 0;
  const out = new Float32Array(n);
  const rnd = mulberry(0xb177);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const white = rnd() * 2 - 1;
    out[i] = white * Math.exp(-t * 160) * 0.7 + Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t * 55) * 0.45;
  }
  normalize(out, 0.85);
  return out;
}

function take(ctx, data) {
  const audio = ctx.createBuffer(1, data.length, ctx.sampleRate);
  audio.getChannelData(0).set(data);
  return audio;
}

function takeStereo(ctx, left, right) {
  const n = Math.min(left.length, right.length);
  const audio = ctx.createBuffer(2, n, ctx.sampleRate);
  audio.getChannelData(0).set(left.subarray(0, n));
  audio.getChannelData(1).set(right.subarray(0, n));
  return audio;
}

function synthBank(rate) {
  const sec = (2.2 * rate) | 0;
  const leafN = (6.4 * rate) | 0;
  const bedL = bedChannel(sec, rate, 3);
  const bedR = bedChannel(sec, rate, 19);
  normalize(bedL, 0.75);
  normalize(bedR, 0.75);
  const leafL = leafChannel(leafN, rate, 7);
  const leafR = leafChannel(leafN, rate, 41);
  normalize(leafL, 0.7);
  normalize(leafR, 0.7);
  const rumble = brownLoop(sec, rate, 13);
  normalize(rumble, 0.8);
  const steps = { plaza: [], indoor: [], stair: [] };
  const seeds = [11, 29, 47, 71];
  for (let i = 0; i < seeds.length; i++) {
    steps.plaza.push(stepWave(rate, "plaza", seeds[i]));
    steps.indoor.push(stepWave(rate, "indoor", seeds[i] + 100));
    steps.stair.push(stepWave(rate, "stair", seeds[i] + 200));
  }
  return {
    bedL,
    bedR,
    leafL,
    leafR,
    rumble,
    steps,
    doorOpen: doorWave(rate, true),
    doorClose: doorWave(rate, false),
    chime: chimeWave(rate),
    click: clickWave(rate),
    chip: birdWave(rate, "chip", 4),
    pair: birdWave(rate, "pair", 8),
    coo: birdWave(rate, "coo", 12),
  };
}

function voice(ctx, buffer, dest, loop) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = !!loop;
  src.connect(dest);
  return src;
}

export function createSounds(ctx) {
  const made = synthBank(ctx.sampleRate);
  const world = ctx.createGain();
  world.gain.value = 0;
  const shot = ctx.createGain();
  shot.gain.value = 0;
  const outdoor = ctx.createGain();
  outdoor.gain.value = 0;
  world.connect(ctx.destination);
  shot.connect(ctx.destination);
  outdoor.connect(world);

  const bedLevel = ctx.createGain();
  bedLevel.gain.value = BED;
  const breath = ctx.createGain();
  breath.gain.value = 1;
  const breathLfo = ctx.createOscillator();
  breathLfo.frequency.value = 0.07;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 0.12;
  breathLfo.connect(breathDepth);
  breathDepth.connect(breath.gain);
  bedLevel.connect(breath);
  breath.connect(outdoor);

  const leafLevel = ctx.createGain();
  leafLevel.gain.value = LEAF;
  const gust = ctx.createGain();
  gust.gain.value = 0.8;
  leafLevel.connect(gust);
  gust.connect(outdoor);

  const birdFilter = ctx.createBiquadFilter();
  birdFilter.type = "lowpass";
  birdFilter.frequency.value = 5400;
  birdFilter.Q.value = 0.6;
  let birdPan = null;
  if (typeof ctx.createStereoPanner === "function") {
    birdPan = ctx.createStereoPanner();
    birdFilter.connect(birdPan);
    birdPan.connect(outdoor);
  } else {
    birdFilter.connect(outdoor);
  }

  const liftFilter = ctx.createBiquadFilter();
  liftFilter.type = "lowpass";
  liftFilter.frequency.value = 4800;
  liftFilter.Q.value = 0.7;
  liftFilter.connect(world);

  const hum = ctx.createGain();
  hum.gain.value = 0;
  const humA = ctx.createOscillator();
  humA.type = "sine";
  humA.frequency.value = 68;
  const humB = ctx.createOscillator();
  humB.type = "sine";
  humB.frequency.value = 71.5;
  const humBGain = ctx.createGain();
  humBGain.gain.value = 0.55;
  humA.connect(hum);
  humB.connect(humBGain);
  humBGain.connect(hum);
  hum.connect(liftFilter);

  const rumbleLevel = ctx.createGain();
  rumbleLevel.gain.value = 0;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.frequency.value = 180;
  rumbleLevel.connect(rumbleFilter);
  rumbleFilter.connect(liftFilter);

  const bedBuf = takeStereo(ctx, made.bedL, made.bedR);
  const leafBuf = takeStereo(ctx, made.leafL, made.leafR);
  const rumbleBuf = take(ctx, made.rumble);
  const doorOpenBuf = take(ctx, made.doorOpen);
  const doorCloseBuf = take(ctx, made.doorClose);
  const chimeBuf = take(ctx, made.chime);
  const clickBuf = take(ctx, made.click);
  const stepBuf = { plaza: [], indoor: [], stair: [] };
  for (let i = 0; i < made.steps.plaza.length; i++) {
    stepBuf.plaza.push(take(ctx, made.steps.plaza[i]));
    stepBuf.indoor.push(take(ctx, made.steps.indoor[i]));
    stepBuf.stair.push(take(ctx, made.steps.stair[i]));
  }
  const birds = {
    chip: take(ctx, made.chip),
    pair: take(ctx, made.pair),
    coo: take(ctx, made.coo),
  };

  const bedSrc = voice(ctx, bedBuf, bedLevel, true);
  const leafSrc = voice(ctx, leafBuf, leafLevel, true);
  const rumbleSrc = voice(ctx, rumbleBuf, rumbleLevel, true);

  let running = false;
  let open = false;
  let allowed = null;
  let nextBird = 0;
  let nextGust = 0;
  let prevPhase = "idle";
  let prevY = null;
  let stepping = false;
  let nextStep = 0;
  let stepN = 0;
  let outdoorNow = 0;
  let sky = "";
  let mechKey = -1;
  let prevHall = [];

  function glide(param, value, sec) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, sec);
  }

  function play(buffer, gain, when, dest, rate) {
    if (!buffer || gain < 0.004) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate || 1;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest);
    src.start(when);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* 页面卸了就算了。 */
      }
    };
  }

  function allow(on) {
    const next = !!on;
    if (next === allowed) return;
    allowed = next;
    open = next;
    const now = ctx.currentTime;
    shot.gain.cancelScheduledValues(now);
    shot.gain.setValueAtTime(open ? 1 : 0, now);
    glide(world.gain, open ? 1 : 0, open ? 0.18 : 0.28);
  }

  function start() {
    if (running) return;
    running = true;
    const now = ctx.currentTime;
    bedSrc.start(now);
    leafSrc.start(now);
    rumbleSrc.start(now);
    humA.start(now);
    humB.start(now);
    breathLfo.start(now);
    nextBird = now + 3 + Math.random() * 4;
    nextGust = now + 1.6;
  }

  function gap(day) {
    if (day === "night") return 1.4;
    if (day === "dusk") return 16 + Math.random() * 18;
    if (day === "dawn" || day === "morning") return 6 + Math.random() * 9;
    if (day === "noon") return 12 + Math.random() * 14;
    return 8 + Math.random() * 12;
  }

  function playBird(day) {
    const roll = Math.random();
    const kind = roll < 0.58 ? "chip" : roll < 0.84 ? "pair" : "coo";
    const buf = birds[kind];
    let gain = BIRD;
    if (day === "dusk") gain *= 0.62;
    else if (day === "dawn") gain *= 1.05;
    if (kind === "coo") gain *= 0.85;
    if (birdPan) {
      const pan = (Math.random() * 2 - 1) * 0.55;
      birdPan.pan.setValueAtTime(pan, ctx.currentTime);
    }
    const rate = kind === "coo" ? 0.96 + Math.random() * 0.08 : 0.9 + Math.random() * 0.22;
    play(buf, gain, ctx.currentTime, birdFilter, rate);
  }

  function playStep(surface, speed) {
    const list = stepBuf[surface];
    if (!list) return;
    const index = stepN % list.length;
    stepN += 1;
    if (Math.random() < 0.22) stepN += 1;
    const rate = (0.86 + Math.random() * 0.08) * (stepN % 2 ? 1.02 : 0.97);
    const loud = STEP[surface] * (0.82 + Math.min(0.28, speed / 40));
    play(list[index % list.length], loud, ctx.currentTime, world, rate);
  }

  function onHall(held, nearList) {
    if (!held) return;
    const n = held.length;
    if (prevHall.length !== n) {
      prevHall = new Array(n);
      for (let i = 0; i < n; i++) prevHall[i] = held[i] ? 1 : 0;
      return;
    }
    const now = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const next = held[i] ? 1 : 0;
      if (next === prevHall[i]) continue;
      prevHall[i] = next;
      if (!open) continue;
      const near = nearList && nearList[i] > 0 ? nearList[i] : 0;
      if (near < 0.08) continue;
      if (next) play(doorOpenBuf, DOOR_OPEN * near, now, world, 1);
      else play(doorCloseBuf, DOOR_CLOSE * near, now, world, 0.96);
    }
  }

  function onPhase(from, to, near) {
    if (!open || near < 0.08) return;
    const now = ctx.currentTime;
    if (to === "opening" && from === "moving") {
      play(chimeBuf, CHIME * near, now, liftFilter, 1);
      play(doorOpenBuf, DOOR_OPEN * near, now + 0.16, liftFilter, 1);
      return;
    }
    if (to === "opening") play(doorOpenBuf, DOOR_OPEN * near, now, liftFilter, 1);
    else if (to === "closing") play(doorCloseBuf, DOOR_CLOSE * near, now, liftFilter, 0.96);
  }

  function place(info) {
    if (!running) return;
    const now = ctx.currentTime;
    const out = Math.min(1, Math.max(0, info.outdoor || 0));
    if (Math.abs(out - outdoorNow) > 0.025) {
      outdoorNow = out;
      glide(outdoor.gain, out, 0.4);
    }
    const day = info.day || "noon";
    if (day !== sky) {
      sky = day;
      const air = day === "night" ? 0.7 : day === "dusk" ? 0.88 : 1;
      const leaves = day === "night" ? 0.92 : 1;
      glide(bedLevel.gain, BED * air, 0.6);
      glide(leafLevel.gain, LEAF * leaves, 0.6);
    }
    if (now >= nextGust) {
      const dur = 1.5 + Math.random() * 1.6;
      gust.gain.cancelScheduledValues(now);
      gust.gain.setValueAtTime(gust.gain.value, now);
      gust.gain.linearRampToValueAtTime(0.95, now + 0.7);
      gust.gain.linearRampToValueAtTime(0.72, now + dur);
      nextGust = now + dur + 2.2 + Math.random() * 4;
    }
    if (now >= nextBird) {
      if (open && out > 0.62 && day !== "night") {
        playBird(day);
        nextBird = now + gap(day);
      } else {
        nextBird = now + (day === "night" ? 1.4 : 2.5);
      }
    }

    const surface = info.surface || "air";
    const speed = info.speed || 0;
    if (!open || surface === "air" || speed < 0.45) {
      stepping = false;
      nextStep = 0;
    } else if (!stepping) {
      if (speed >= 0.85) {
        stepping = true;
        nextStep = now + 0.1;
      }
    } else if (now >= nextStep) {
      playStep(surface, speed);
      const base = surface === "stair" ? 0.34 : 0.44;
      const tempo = Math.max(0.62, Math.min(1, 6.2 / Math.max(speed, 0.1)));
      nextStep = now + base * tempo;
    }

    let vy = 0;
    const dt = info.dt || 0;
    if (prevY != null && dt > 0.001 && dt < 0.08) vy = (info.liftY - prevY) / dt;
    prevY = info.liftY || 0;
    if (vy > 3) vy = 3;
    if (vy < -3) vy = -3;
    onHall(info.hallHeld, info.hallNear);
    const phase = info.liftPhase || "idle";
    const near = Math.min(1, Math.max(0, info.liftNear || 0));
    if (phase !== prevPhase) {
      onPhase(prevPhase, phase, near);
      prevPhase = phase;
    }
    const span = Math.min(1, Math.abs(vy) / CRUISE);
    const moving = phase === "moving" && span > 0.05;
    const hear = near < 0.05 ? 0 : near;
    const key = (moving ? 1000 : 0) + Math.round(span * 16) + Math.round(hear * 16) * 32;
    if (key !== mechKey) {
      mechKey = key;
      const drive = moving ? span * hear : 0;
      // 行进只留轿厢低频。中频短音连着响会变成嘟嘟嘟。
      glide(hum.gain, drive * HUM, 0.1);
      glide(rumbleLevel.gain, drive * RUMBLE, 0.1);
      glide(liftFilter.frequency, 700 + hear * 4100, 0.15);
    }
  }

  function press() {
    if (!open) return;
    play(clickBuf, CLICK, ctx.currentTime, shot, 0.94 + Math.random() * 0.1);
  }

  return { start, allow, place, press };
}

function birdWave(rate, kind, seed) {
  const dur = kind === "coo" ? 0.7 : kind === "pair" ? 0.34 : 0.14;
  const n = (dur * rate) | 0;
  const out = new Float32Array(n);
  const rnd = mulberry(seed);
  const chirp = (t0, len, f0, f1) => {
    const i0 = (t0 * rate) | 0;
    const span = (len * rate) | 0;
    let phase = 0;
    for (let i = 0; i < span && i0 + i < n; i++) {
      const t = i / rate;
      const k = len <= 0 ? 0 : t / len;
      const freq = f0 + (f1 - f0) * k;
      phase += freq / rate;
      const env = Math.sin(Math.min(1, t / 0.012) * Math.PI * 0.5) * Math.exp(-t * (kind === "coo" ? 4.5 : 16));
      const trem = kind === "coo" ? 0.62 + 0.38 * Math.sin(2 * Math.PI * 5.5 * t) : 1;
      const air = i < span * 0.15 ? (rnd() * 2 - 1) * (1 - i / (span * 0.15)) * 0.18 : 0;
      out[i0 + i] += (Math.sin(phase * Math.PI * 2) * 0.85 + Math.sin(phase * Math.PI * 4) * 0.12 + air) * env * trem;
    }
  };
  if (kind === "coo") {
    chirp(0, 0.28, 640, 610);
    chirp(0.32, 0.3, 700, 660);
  } else if (kind === "pair") {
    chirp(0, 0.1, 3400, 2300);
    chirp(0.16, 0.11, 3600, 2500);
  } else {
    chirp(0, 0.11, 3200 + rnd() * 400, 2100);
  }
  normalize(out, 0.85);
  return out;
}
