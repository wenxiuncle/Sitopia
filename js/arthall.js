// 数字艺术厅的屏幕、曲目和地面反光。
// 能拿到视频文件时，画面用这一路。地面倒影是同一帧画到布上，不再另播一路。
// 只有接口真的给出可跨域读取的音轨时，才改走环绕总线，并且先拆掉 iframe，避免两路一起响。
// B 站、YouTube 播不了文件时用官方播放器，地面再放一路静音的同一地址。

import * as THREE from "../vendor/three.module.js";
import { STORY } from "./layout.js";
import { assignClips, clipEmbed, clipPoster, parseClip } from "./clips.js";

function epsilon(value) {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

function getCameraCSSMatrix(matrix) {
  const e = matrix.elements;
  return "matrix3d(" +
    epsilon(e[0]) + "," + epsilon(-e[1]) + "," + epsilon(e[2]) + "," + epsilon(e[3]) + "," +
    epsilon(e[4]) + "," + epsilon(-e[5]) + "," + epsilon(e[6]) + "," + epsilon(e[7]) + "," +
    epsilon(e[8]) + "," + epsilon(-e[9]) + "," + epsilon(e[10]) + "," + epsilon(e[11]) + "," +
    epsilon(e[12]) + "," + epsilon(-e[13]) + "," + epsilon(e[14]) + "," + epsilon(e[15]) +
    ")";
}

function getObjectCSSMatrix(matrix) {
  const e = matrix.elements;
  return "translate(-50%,-50%)matrix3d(" +
    epsilon(e[0]) + "," + epsilon(e[1]) + "," + epsilon(e[2]) + "," + epsilon(e[3]) + "," +
    epsilon(-e[4]) + "," + epsilon(-e[5]) + "," + epsilon(-e[6]) + "," + epsilon(-e[7]) + "," +
    epsilon(e[8]) + "," + epsilon(e[9]) + "," + epsilon(e[10]) + "," + epsilon(e[11]) + "," +
    epsilon(e[12]) + "," + epsilon(e[13]) + "," + epsilon(e[14]) + "," + epsilon(e[15]) +
    ")";
}

function firstUrl(raw) {
  const text = (raw || "").trim();
  const found = text.match(/https?:\/\/[^\s]+/i);
  return (found ? found[0] : text).replace(/[，。,.]+$/g, "");
}

function parseBili(raw) {
  const text = firstUrl(raw);
  if (!text) return { error: "先贴一个视频链接。" };
  if (/b23\.tv/i.test(text)) return { error: "B 站短链接在这里打不开，请贴完整的 BV 地址。" };
  const bv = text.match(/BV[0-9A-Za-z]+/);
  const av = text.match(/(?:av|aid=)(\d+)/i);
  const pageMatch = text.match(/[?&]p=(\d+)/);
  const page = pageMatch ? Math.max(1, Number(pageMatch[1]) || 1) : 1;
  if (bv) return { platform: "bili", bvid: bv[0], page };
  if (av) return { platform: "bili", aid: av[1], page };
  return { error: "这不是 B 站视频链接。请贴带 BV 号的地址。" };
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

function parseYouTube(raw) {
  const text = firstUrl(raw);
  if (!text) return { error: "先贴一个视频链接。" };
  const found = text.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (!found) return { error: "这不是 YouTube 视频链接。请贴 watch、youtu.be 或 shorts 地址。" };
  return { platform: "youtube", id: found[1], start: youtubeSeconds(text) };
}

function parseLine(raw) {
  const text = firstUrl(raw);
  if (!text) return null;
  if (/bilibili\.com|b23\.tv/i.test(text) || /BV[0-9A-Za-z]{6,}/.test(text) || /(?:^|[/])av\d+/i.test(text) || /aid=\d+/i.test(text)) {
    return parseBili(text);
  }
  if (/youtube\.com|youtu\.be/i.test(text)) return parseYouTube(text);
  return { error: "认不出这条链接。请贴 B 站或 YouTube 的视频地址。" };
}

function trackKey(item) {
  if (!item) return "";
  if (item.platform === "bili") return "bili|" + (item.bvid || item.aid || "") + "|" + (item.page || 1);
  if (item.platform === "youtube") return "youtube|" + item.id;
  return "";
}

function biliSrc(parsed, seconds, muted) {
  const t = Math.max(0, Math.floor(seconds || 0));
  const id = parsed.bvid ? "bvid=" + encodeURIComponent(parsed.bvid) : "aid=" + encodeURIComponent(parsed.aid);
  return "https://player.bilibili.com/player.html?" + id +
    "&page=" + (parsed.page || 1) +
    "&t=" + t +
    "&autoplay=1&danmaku=0&high_quality=1" +
    (muted ? "&muted=1" : "");
}

function youtubeSrc(parsed, seconds, muted) {
  const t = Math.max(0, Math.floor(seconds || parsed.start || 0));
  return "https://www.youtube.com/embed/" + encodeURIComponent(parsed.id) +
    "?autoplay=1&rel=0&playsinline=1&start=" + t +
    (muted ? "&mute=1" : "");
}

function frameSrc(item, seconds, muted) {
  if (!item) return "";
  if (item.platform === "bili") return biliSrc(item, seconds, muted);
  if (item.platform === "youtube") return youtubeSrc(item, seconds, muted);
  return "";
}

function platformName(item) {
  if (!item) return "";
  if (item.platform === "bili") return "B站";
  if (item.platform === "youtube") return "YouTube";
  return "";
}

function embedReflect(item) {
  return !!(item && (item.platform === "bili" || item.platform === "youtube"));
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}

function hallImpulse(rate) {
  const length = Math.max(8, Math.floor(rate * 0.38));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  left[0] = 0.4;
  right[0] = 0.4;
  const taps = [
    [0.011, 0.22],
    [0.019, 0.16],
    [0.034, 0.1],
    [0.058, 0.06],
    [0.09, 0.035],
  ];
  for (let i = 0; i < taps.length; i++) {
    const at = Math.min(length - 2, Math.floor(taps[i][0] * rate));
    left[at] += taps[i][1];
    right[at + 1] += taps[i][1] * 0.9;
  }
  let seed = 17;
  for (let i = 1; i < length; i++) {
    seed = (seed * 16807) % 2147483647;
    const n = seed / 2147483647 * 2 - 1;
    const decay = Math.exp(-i / (rate * 0.085));
    left[i] += n * 0.035 * decay;
    right[i] += n * 0.028 * decay;
  }
  return { left, right };
}

function setVec(node, name, x, y, z) {
  const axis = node[name + "X"];
  if (axis) {
    axis.value = x;
    node[name + "Y"].value = y;
    node[name + "Z"].value = z;
    return;
  }
  if (name === "position" && node.setPosition) node.setPosition(x, y, z);
  else if (node.setOrientation) node.setOrientation(x, y, z);
}

function setListener(listener, pos, fwd) {
  if (listener.positionX) {
    listener.positionX.value = pos.x;
    listener.positionY.value = pos.y;
    listener.positionZ.value = pos.z;
    listener.forwardX.value = fwd.x;
    listener.forwardY.value = fwd.y;
    listener.forwardZ.value = fwd.z;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
    return;
  }
  listener.setPosition(pos.x, pos.y, pos.z);
  listener.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
}

function makeFeeds(ctx, splitter) {
  const diff = ctx.createGain();
  const inv = ctx.createGain();
  inv.gain.value = -1;
  splitter.connect(diff, 0);
  splitter.connect(inv, 1);
  inv.connect(diff);
  const diffR = ctx.createGain();
  diffR.gain.value = -1;
  diff.connect(diffR);

  const left = ctx.createGain();
  const right = ctx.createGain();
  splitter.connect(left, 0);
  splitter.connect(right, 1);

  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  splitter.connect(mid, 0);
  splitter.connect(mid, 1);

  const lfeIn = ctx.createGain();
  lfeIn.gain.value = 0.5;
  splitter.connect(lfeIn, 0);
  splitter.connect(lfeIn, 1);
  const lfe = ctx.createBiquadFilter();
  lfe.type = "lowpass";
  lfe.frequency.value = 115;
  lfe.Q.value = 0.7;
  lfeIn.connect(lfe);

  return { L: left, R: right, C: mid, LFE: lfe, SL: diff, SR: diffR, RL: diff, RR: diffR };
}

function buildBus(ctx, speakers) {
  const master = ctx.createGain();
  master.gain.value = 0;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 18000;
  lowpass.Q.value = 0.5;
  lowpass.connect(master);

  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  dry.connect(lowpass);

  const wetFilter = ctx.createBiquadFilter();
  wetFilter.type = "lowpass";
  wetFilter.frequency.value = 4200;
  wetFilter.Q.value = 0.6;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  wetFilter.connect(wet);
  wet.connect(lowpass);

  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  const ir = hallImpulse(ctx.sampleRate);
  const buffer = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
  buffer.getChannelData(0).set(ir.left);
  buffer.getChannelData(1).set(ir.right);
  convolver.buffer = buffer;
  convolver.connect(wetFilter);

  const splitter = ctx.createChannelSplitter(2);
  const feeds = makeFeeds(ctx, splitter);
  const aim = new THREE.Object3D();
  for (let i = 0; i < speakers.length; i++) {
    const sp = speakers[i];
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = sp.lfe ? 3.5 : 1.8;
    panner.rolloffFactor = sp.lfe ? 0.35 : 0.9;
    panner.maxDistance = 48;
    panner.coneInnerAngle = sp.lfe ? 360 : 110;
    panner.coneOuterAngle = sp.lfe ? 360 : 200;
    panner.coneOuterGain = sp.lfe ? 1 : 0.28;
    setVec(panner, "position", sp.x, sp.y, sp.z);
    if (Number.isFinite(sp.ox)) {
      setVec(panner, "orientation", sp.ox, sp.oy, sp.oz);
    } else {
      aim.rotation.set(0, sp.yaw || 0, 0);
      aim.updateMatrix();
      const e = aim.matrix.elements;
      setVec(panner, "orientation", e[8], e[9], e[10]);
    }
    let node = feeds[sp.feed];
    if (!node) continue;
    if (sp.delay > 0) {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = sp.delay;
      node.connect(delay);
      node = delay;
    }
    const gain = ctx.createGain();
    gain.gain.value = sp.gain == null ? 1 : sp.gain;
    node.connect(gain);
    gain.connect(panner);
    panner.connect(dry);
    if (!sp.lfe) panner.connect(convolver);
  }
  master.connect(ctx.destination);
  return { master, lowpass, input: splitter };
}

async function lookupBili(parsed) {
  const q = parsed.bvid ? "bvid=" + encodeURIComponent(parsed.bvid) : "aid=" + encodeURIComponent(parsed.aid);
  const viewRes = await fetch("https://api.bilibili.com/x/web-interface/view?" + q);
  if (!viewRes.ok) return null;
  const view = await viewRes.json();
  const pages = view && view.data && view.data.pages;
  if (!pages || !pages.length) return null;
  const page = pages[(parsed.page || 1) - 1] || pages[0];
  if (!page || !page.cid) return null;
  const duration = Number(page.duration) || 0;
  const playRes = await fetch("https://api.bilibili.com/x/player/playurl?" + q + "&cid=" + page.cid + "&qn=64&fnval=1");
  if (!playRes.ok) return { url: "", duration };
  const play = await playRes.json();
  const url = play && play.data && play.data.durl && play.data.durl[0] && play.data.durl[0].url;
  return { url: url || "", duration };
}

async function corsOk(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await fetch(url, {
      mode: "cors",
      headers: { Range: "bytes=0-1" },
      signal: ctrl.signal,
    });
    return !!(res && (res.ok || res.status === 206));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createArtHall(art, screenMesh, hooks) {
  const mount = document.getElementById("screen-mount");
  const view = document.getElementById("screen-view");
  const plane = document.getElementById("screen-plane");
  const frame = document.getElementById("screen-frame");
  const video = document.getElementById("screen-video");
  const reflect = document.getElementById("screen-reflect");
  const reflectFrame = document.getElementById("screen-reflect-frame");
  const reflectCanvas = document.getElementById("screen-reflect-canvas");
  const reflectCtx = reflectCanvas ? reflectCanvas.getContext("2d", { alpha: true }) : null;
  const reflectGlow = document.getElementById("screen-reflect-glow");
  const gate = document.getElementById("screen-gate");
  const form = document.getElementById("screen-form");
  const input = document.getElementById("screen-url");
  const error = document.getElementById("screen-error");
  const nowEl = document.getElementById("screen-now");
  const timeEl = document.getElementById("screen-time");
  const durEl = document.getElementById("screen-dur");
  const seek = document.getElementById("screen-seek");
  const anchor = new THREE.Object3D();
  const reflectAnchor = new THREE.Object3D();
  const screen = art.screen;
  const pxPerM = 100;
  const reflectDepth = 3.4;
  anchor.position.set(screen.x, screen.y, screen.z);
  anchor.scale.set(0.01, 0.01, 0.01);
  // 元素底边朝屏幕。中心再往厅内让出半个进深，近边就落在屏幕正下方。
  reflectAnchor.position.set(screen.x, (art.baseY || 0) + 0.062, screen.z + reflectDepth / 2);
  reflectAnchor.rotation.x = -Math.PI / 2;
  reflectAnchor.scale.set(0.01, -0.01, 0.01);
  if (plane) {
    plane.style.width = (screen.w * pxPerM) + "px";
    plane.style.height = (screen.h * pxPerM) + "px";
  }
  if (reflect) {
    reflect.style.width = (screen.w * pxPerM) + "px";
    reflect.style.height = (reflectDepth * pxPerM) + "px";
  }
  if (screenMesh && screenMesh.material && screenMesh.material.color) {
    screenMesh.material.color.setHex(0x101218);
  }
  const fwd = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const panelSpecs = art.panels || [];
  const panelEls = [];
  const panelAnchors = [];
  const panelItems = new Array(panelSpecs.length).fill(null);
  const panelResume = new Array(panelSpecs.length).fill(0);
  const panelPosterOk = new Array(panelSpecs.length).fill(false);
  const panelPosterFail = new Array(panelSpecs.length).fill(false);
  const panelPosterToken = new Array(panelSpecs.length).fill(0);
  const posterCache = new Map();
  let panelPlaying = -1;
  let panelStarted = 0;
  let pickedPanel = -1;
  let pickedNear = false;
  let clipKey = "";
  // 页面层只放正面画面。厚 10 厘米的箱体在网格里，侧面和背面不再靠 CSS 折出来。
  if (view) {
    for (let i = 0; i < panelSpecs.length; i++) {
      const spec = panelSpecs[i];
      const lipX = spec.lipX;
      const lipTop = spec.lipTop;
      const el = document.createElement("div");
      el.className = "art-panel";
      el.style.width = ((spec.w + lipX * 2) * pxPerM) + "px";
      el.style.height = ((spec.h + lipTop) * pxPerM) + "px";
      const face = document.createElement("div");
      face.className = "art-panel-face";
      face.style.top = (lipTop * pxPerM) + "px";
      face.style.left = (lipX * pxPerM) + "px";
      face.style.right = (lipX * pxPerM) + "px";
      face.style.bottom = "0";
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      face.appendChild(img);
      el.appendChild(face);
      view.appendChild(el);
      panelEls.push(el);
      const panelAnchor = new THREE.Object3D();
      panelAnchor.position.set(spec.x, spec.y + lipTop / 2, spec.z);
      panelAnchor.rotation.y = spec.yaw;
      panelAnchor.scale.set(0.01, 0.01, 0.01);
      panelAnchors.push(panelAnchor);
    }
  }

  let width = window.innerWidth || 1;
  let height = window.innerHeight || 1;
  let token = 0;
  let mode = "idle";
  let paused = false;
  let playlist = [];
  let index = 0;
  let duration = 0;
  let resumeSec = 0;
  let stamp = 0;
  let scrubbing = false;
  let insideFlag = false;
  let insideNow = false;
  let liveAmbience = null;
  let bus = null;
  let sourceNode = null;
  // B 站文件还在探测时，画面地址可能是空的。这时不要把视频元素拆掉重装播放器。
  let tryingVideo = false;
  let loadGen = 0;
  // 出厅时画面先收起，视频音量在这一段里收到 0，再暂停。
  const LEAVE_FADE = 1.15;
  let leaveAt = 0;
  let leaveFrom = 1;

  function fail(msg) {
    if (!error) return;
    error.textContent = msg || "";
    error.hidden = !msg;
  }

  function resize(w, h) {
    width = Math.max(1, w || width);
    height = Math.max(1, h || height);
    if (!view) return;
    view.style.width = width + "px";
    view.style.height = height + "px";
  }

  function clearBodyHole() {
    if (!mount) return;
    mount.style.clipPath = "";
    mount.style.webkitClipPath = "";
  }

  function hideMount() {
    clearBodyHole();
    if (mount) mount.hidden = true;
  }

  function dimPicture() {
    if (plane) plane.style.opacity = "0";
    if (reflect) reflect.style.opacity = "0";
    if (mount) mount.hidden = false;
  }

  function clearPictureDim() {
    if (plane) plane.style.opacity = "";
    if (reflect) reflect.style.opacity = "";
  }

  function finishLeaveAudio() {
    if (mode === "video" && video && video.getAttribute("src") && !video.paused) {
      resumeSec = video.currentTime || resumeSec;
      video.pause();
    }
    if (video) video.volume = 1;
    leaveAt = 0;
    clearPictureDim();
    hideMount();
    silenceBus();
  }

  function showMount() {
    if (mount) mount.hidden = false;
    if (plane) plane.hidden = false;
    if (reflect) reflect.hidden = false;
  }

  // 大屏幕没在播时，只收起它自己的画面。安装层留着，小屏幕才跟它一起按远近遮挡。
  function hidePicture() {
    clearBodyHole();
    if (plane) plane.hidden = true;
    if (reflect) reflect.hidden = true;
  }

  function clearIframe() {
    if (frame && frame.getAttribute("src")) frame.removeAttribute("src");
    if (frame) frame.hidden = true;
  }

  function clearReflectFrame() {
    if (reflectFrame && reflectFrame.getAttribute("src")) reflectFrame.removeAttribute("src");
    if (reflectFrame) reflectFrame.hidden = true;
  }

  function hideReflectCanvas() {
    if (!reflectCanvas) return;
    reflectCanvas.hidden = true;
    if (reflectCtx && reflectCanvas.width) {
      reflectCtx.clearRect(0, 0, reflectCanvas.width, reflectCanvas.height);
    }
  }

  function showReflectCanvas() {
    if (!reflectCanvas) return;
    if (reflectCanvas.width !== 640) reflectCanvas.width = 640;
    if (reflectCanvas.height !== 360) reflectCanvas.height = 360;
    reflectCanvas.hidden = false;
  }

  // 倒影不另播。主画面当前这一帧画到布上，暂停时也停在同一帧。
  function paintReflect() {
    if (!reflectCtx || !reflectCanvas || reflectCanvas.hidden || !video) return;
    if (video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const cw = reflectCanvas.width;
    const ch = reflectCanvas.height;
    const scale = Math.min(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    reflectCtx.clearRect(0, 0, cw, ch);
    try {
      reflectCtx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    } catch { /* 这一帧还不能画。 */ }
  }

  function clearVideo() {
    loadGen += 1;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("crossorigin");
      try { video.load(); } catch { /* 已经拆掉。 */ }
      video.hidden = true;
    }
    hideReflectCanvas();
  }

  function silenceBus() {
    if (!bus || !liveAmbience || !liveAmbience.context) return;
    const ctx = liveAmbience.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setTargetAtTime(0, now, 0.03);
  }

  function context() {
    if (!liveAmbience || !liveAmbience.context) return null;
    const ctx = liveAmbience.context();
    if (ctx && ctx.state === "suspended") {
      const pending = ctx.resume();
      if (pending && pending.catch) pending.catch(() => {});
    }
    return ctx;
  }

  function ensureBus(ctx) {
    if (bus || !ctx) return bus;
    bus = buildBus(ctx, art.speakers || []);
    return bus;
  }

  function connectVideo(ctx) {
    if (sourceNode || !ctx || !video) return;
    const graph = ensureBus(ctx);
    const node = ctx.createMediaElementSource(video);
    node.connect(graph.input);
    sourceNode = node;
  }

  function aimEars(camera) {
    const ctx = context();
    if (!ctx || !camera) return;
    camera.getWorldDirection(fwd);
    setListener(ctx.listener, camera.position, fwd);
  }

  function hear(camera, live) {
    const ctx = context();
    if (!ctx || !bus) return;
    aimEars(camera);
    const now = ctx.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setTargetAtTime(live ? 1 : 0, now, 0.08);
    bus.lowpass.frequency.cancelScheduledValues(now);
    bus.lowpass.frequency.setTargetAtTime(live ? 18000 : 280, now, 0.08);
  }

  function placedInside(player) {
    if (!player) {
      insideFlag = false;
      return false;
    }
    const floor = Math.round(player.y / STORY);
    if (floor !== art.floor) {
      insideFlag = false;
      return false;
    }
    if (insideFlag) {
      if (player.z > art.curtainZ + 0.4) insideFlag = false;
    } else if (player.z < art.curtainZ - 0.15) {
      insideFlag = true;
    }
    return insideFlag;
  }

  function present(camera) {
    if (!mount || mount.hidden || !view || !plane) return;
    anchor.updateMatrixWorld(true);
    reflectAnchor.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const fov = camera.projectionMatrix.elements[5] * (height / 2);
    view.style.transform = "perspective(" + fov + "px) translateZ(" + fov + "px)" +
      getCameraCSSMatrix(camera.matrixWorldInverse) +
      "translate(" + (width / 2) + "px," + (height / 2) + "px)";
    plane.style.transform = getObjectCSSMatrix(anchor.matrixWorld);
    if (reflect) reflect.style.transform = getObjectCSSMatrix(reflectAnchor.matrixWorld);
  }

  function bodyBeforeScreen(camera, player) {
    const dz = player.z - camera.position.z;
    if (Math.abs(dz) < 1e-4) return false;
    const t = (screen.z - camera.position.z) / dz;
    return t > 1.02;
  }

  function occludeBody(camera, player) {
    if (!mount || mount.hidden || !player || !player.third || !bodyBeforeScreen(camera, player)) {
      clearBodyHole();
      return;
    }
    camera.getWorldDirection(fwd);
    const xs = [player.x - 0.5, player.x + 0.5];
    const ys = [player.y + 0.02, player.y + 1.92];
    const zs = [player.z - 0.46, player.z + 0.46];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let n = 0;
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          const x = xs[ix];
          const y = ys[iy];
          const z = zs[iz];
          const dx = x - camera.position.x;
          const dy = y - camera.position.y;
          const dz = z - camera.position.z;
          if (dx * fwd.x + dy * fwd.y + dz * fwd.z < 0.25) continue;
          ndc.set(x, y, z).project(camera);
          const sx = (ndc.x * 0.5 + 0.5) * width;
          const sy = (-ndc.y * 0.5 + 0.5) * height;
          if (sx < minX) minX = sx;
          if (sy < minY) minY = sy;
          if (sx > maxX) maxX = sx;
          if (sy > maxY) maxY = sy;
          n += 1;
        }
      }
    }
    if (n < 1 || maxX < 0 || maxY < 0 || minX > width || minY > height) {
      clearBodyHole();
      return;
    }
    const pad = 14;
    const x0 = Math.max(0, Math.floor(minX) - pad);
    const y0 = Math.max(0, Math.floor(minY) - pad);
    const x1 = Math.min(width, Math.ceil(maxX) + pad);
    const y1 = Math.min(height, Math.ceil(maxY) + pad);
    if (x1 - x0 < 4 || y1 - y0 < 4) {
      clearBodyHole();
      return;
    }
    const d = "M0 0H" + width + "V" + height + "H0Z M" + x0 + " " + y0 + "H" + x1 + "V" + y1 + "H" + x0 + "Z";
    const value = "path(evenodd,\"" + d + "\")";
    mount.style.clipPath = value;
    mount.style.webkitClipPath = value;
  }

  function currentItem() {
    return playlist[index] || null;
  }

  function currentTimeSec() {
    if (mode === "video" && video && video.getAttribute("src")) return video.currentTime || 0;
    if (stamp) return Math.max(0, (performance.now() - stamp) / 1000);
    return resumeSec;
  }

  function paintProgress() {
    const now = currentTimeSec();
    if (timeEl && !scrubbing) timeEl.textContent = formatTime(now);
    if (durEl) durEl.textContent = duration > 0 ? formatTime(duration) : "—";
    if (seek && !scrubbing) {
      seek.disabled = !(duration > 0);
      seek.value = duration > 0 ? String(Math.max(0, Math.min(1000, Math.round(now / duration * 1000)))) : "0";
    }
    if (!nowEl) return;
    const item = currentItem();
    if (mode === "idle" || !item) {
      nowEl.textContent = "";
      return;
    }
    let text = platformName(item) + " · 第 " + (index + 1) + " / " + playlist.length + " 首";
    text += paused ? " · 已暂停" : " · 播放中";
    if (item.platform !== "bili" && mode === "iframe") text += " · 进度用画面里的控件";
    nowEl.textContent = text;
  }

  function captureIframeTime() {
    if (!stamp) return;
    resumeSec = Math.max(0, (performance.now() - stamp) / 1000);
    if (duration && resumeSec > duration) resumeSec = duration;
    stamp = 0;
  }

  function mountIframe(seconds) {
    const item = currentItem();
    if (!frame || !item) return;
    const t = Math.max(0, seconds || 0);
    clearVideo();
    frame.hidden = false;
    frame.src = frameSrc(item, t, false);
    stamp = performance.now() - t * 1000;
    if (reflect) reflect.hidden = false;
    if (reflectGlow) reflectGlow.hidden = false;
    hideReflectCanvas();
    if (embedReflect(item) && reflectFrame) {
      reflectFrame.hidden = false;
      reflectFrame.src = frameSrc(item, t, true);
    } else {
      clearReflectFrame();
    }
    showMount();
  }

  function seekTo(sec) {
    const t = Math.max(0, Number(sec) || 0);
    resumeSec = duration > 0 ? Math.min(duration, t) : t;
    if (mode === "video" && video && video.getAttribute("src")) {
      try { video.currentTime = resumeSec; } catch { /* 元数据还没到。 */ }
      stamp = performance.now() - resumeSec * 1000;
      paintProgress();
      return;
    }
    if (mode === "iframe" && !paused && insideNow) mountIframe(resumeSec);
    else stamp = 0;
    paintProgress();
  }

  function startVideo(url, mine) {
    return new Promise((resolve) => {
      if (!video || mine !== token) {
        resolve(false);
        return;
      }
      const gen = loadGen;
      tryingVideo = true;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onErr);
        // 已经换曲时，视频元素归新曲目，这里不能拆，也不能改探测标记。
        if (mine !== token) {
          resolve(false);
          return;
        }
        tryingVideo = false;
        if (gen !== loadGen) {
          resolve(false);
          return;
        }
        if (!ok && mode !== "video") clearVideo();
        resolve(ok);
      };
      const onErr = () => finish(false);
      const onMeta = () => {
        if (mine !== token || gen !== loadGen) {
          finish(false);
          return;
        }
        let at = currentTimeSec();
        if (duration > 0 && at > duration) at = duration;
        clearIframe();
        clearReflectFrame();
        mode = "video";
        if (Number.isFinite(video.duration) && video.duration > 0) duration = video.duration;
        if (at > 0.35) {
          try { video.currentTime = at; } catch { /* 还不能拖。 */ }
          resumeSec = at;
        }
        video.hidden = false;
        if (reflect) reflect.hidden = false;
        if (reflectGlow) reflectGlow.hidden = false;
        showReflectCanvas();
        paintReflect();
        if (video.crossOrigin) {
          try { connectVideo(context()); } catch { /* 跨域音轨接不上时，元素自己出声。 */ }
        }
        if (insideNow && !paused) {
          const pending = video.play();
          if (pending && pending.catch) pending.catch(() => {});
        }
        paintProgress();
        finish(true);
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onErr);
      setTimeout(() => finish(false), 7000);
      corsOk(url).then((ok) => {
        if (done || mine !== token || gen !== loadGen) return;
        if (ok) video.crossOrigin = "anonymous";
        else video.removeAttribute("crossorigin");
        video.src = url;
      }).catch(() => finish(false));
    });
  }

  function playIndex(i) {
    if (!playlist.length) return;
    index = (i % playlist.length + playlist.length) % playlist.length;
    const item = playlist[index];
    token += 1;
    const mine = token;
    paused = false;
    tryingVideo = false;
    resumeSec = 0;
    stamp = 0;
    duration = 0;
    clearVideo();
    clearIframe();
    clearReflectFrame();
    silenceBus();
    mode = "iframe";
    if (insideNow) mountIframe(0);
    paintProgress();
    if (item.platform !== "bili") return;
    lookupBili(item).then(async (info) => {
      if (mine !== token) return;
      if (info && info.duration) {
        duration = info.duration;
        paintProgress();
      }
      if (!info || !info.url) return;
      const ok = await startVideo(info.url, mine);
      if (mine !== token) return;
      if (!ok && mode !== "video") {
        mode = "iframe";
        if (insideNow && !paused && !(frame && frame.getAttribute("src"))) mountIframe(resumeSec);
      }
    }).catch(() => {});
  }

  function readPlaylist() {
    const raw = input ? input.value : "";
    const lines = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const next = [];
    for (let i = 0; i < lines.length; i++) {
      const item = parseLine(lines[i]);
      if (!item) continue;
      if (item.error) {
        fail(item.error);
        return null;
      }
      next.push(item);
    }
    if (!next.length) {
      fail("先贴一个视频链接。");
      return null;
    }
    fail("");
    return next;
  }

  function sameList(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (trackKey(a[i]) !== trackKey(b[i])) return false;
    }
    return true;
  }

  function onPlay() {
    const lines = input ? input.value.trim() : "";
    if (!lines) {
      if (mode !== "idle" && paused) {
        fail("");
        resumePlayback();
        return;
      }
      if (mode !== "idle") return;
      fail("先贴一个视频链接。");
      return;
    }
    const next = readPlaylist();
    if (!next) return;
    if (sameList(next, playlist) && mode !== "idle") {
      if (paused) resumePlayback();
      return;
    }
    playlist = next;
    playIndex(0);
  }

  function pausePlayback() {
    if (mode === "idle" || paused) return;
    if (mode === "video") {
      resumeSec = video ? (video.currentTime || 0) : resumeSec;
      if (video) video.pause();
      paused = true;
    } else if (mode === "iframe") {
      captureIframeTime();
      clearIframe();
      clearReflectFrame();
      paused = true;
      hideMount();
    }
    silenceBus();
    paintProgress();
  }

  function resumePlayback() {
    if (!playlist.length) {
      onPlay();
      return;
    }
    if (mode === "idle") {
      playIndex(index || 0);
      return;
    }
    paused = false;
    if (mode === "video") {
      if (insideNow && video && video.getAttribute("src")) {
        showMount();
        const pending = video.play();
        if (pending && pending.catch) pending.catch(() => {});
      }
    } else if (insideNow) {
      mountIframe(resumeSec);
    }
    paintProgress();
  }

  function step(dir) {
    if (!playlist.length) {
      const next = readPlaylist();
      if (!next) {
        if (!(input && input.value.trim())) fail("先贴一个视频链接。");
        return;
      }
      playlist = next;
      playIndex(dir < 0 ? next.length - 1 : 0);
      return;
    }
    playIndex(index + dir);
  }

  function stop() {
    token += 1;
    mode = "idle";
    paused = false;
    tryingVideo = false;
    resumeSec = 0;
    stamp = 0;
    duration = 0;
    clearVideo();
    clearIframe();
    clearReflectFrame();
    hideMount();
    silenceBus();
    if (liveAmbience && liveAmbience.duck) liveAmbience.duck(1);
    fail("");
    paintProgress();
  }

  function open() {
    if (pickedPanel >= 0) {
      if (pickedNear) playPanel(pickedPanel);
      return;
    }
    if (!gate) return;
    if (hooks && hooks.onOpen) hooks.onOpen();
    gate.hidden = false;
    fail("");
    paintProgress();
    if (hooks && hooks.releaseLook) hooks.releaseLook();
    if (input) {
      try { input.focus({ preventScroll: true }); }
      catch { input.focus(); }
      if (mode === "idle") input.select();
    }
  }

  function closeDialog() {
    if (gate) gate.hidden = true;
  }

  function placeGate(camera) {
    if (!gate || gate.hidden) return;
    ndc.set(screen.x, screen.y - screen.h / 2, screen.z);
    ndc.project(camera);
    const behind = ndc.z < -1 || ndc.z > 1;
    if (behind) {
      gate.style.left = "50%";
      gate.style.top = "auto";
      gate.style.bottom = "22px";
      gate.style.transform = "translateX(-50%)";
      return;
    }
    const sx = (ndc.x * 0.5 + 0.5) * width;
    const sy = (-ndc.y * 0.5 + 0.5) * height;
    const cardW = gate.offsetWidth || 420;
    const cardH = gate.offsetHeight || 280;
    let left = sx - cardW / 2;
    let top = sy + 14;
    if (left < 12) left = 12;
    if (left + cardW > width - 12) left = Math.max(12, width - 12 - cardW);
    if (top + cardH > height - 12) top = Math.max(12, height - 12 - cardH);
    if (top < 12) top = 12;
    gate.style.left = left + "px";
    gate.style.top = top + "px";
    gate.style.bottom = "auto";
    gate.style.transform = "none";
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      onPlay();
    });
  }
  const playBtn = document.getElementById("screen-play");
  const pauseBtn = document.getElementById("screen-pause");
  const prevBtn = document.getElementById("screen-prev");
  const nextBtn = document.getElementById("screen-next");
  const stopBtn = document.getElementById("screen-stop");
  const closeBtn = document.getElementById("screen-close");
  if (playBtn) playBtn.addEventListener("click", onPlay);
  if (pauseBtn) pauseBtn.addEventListener("click", pausePlayback);
  if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => step(1));
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stop();
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeDialog();
      if (hooks && hooks.requestWalk) hooks.requestWalk();
    });
  }
  if (seek) {
    seek.addEventListener("input", () => {
      scrubbing = true;
      if (!(duration > 0) || !timeEl) return;
      timeEl.textContent = formatTime(duration * (Number(seek.value) / 1000));
    });
    seek.addEventListener("change", () => {
      scrubbing = false;
      if (!(duration > 0)) return;
      seekTo(duration * (Number(seek.value) / 1000));
    });
  }
  if (video) {
    video.addEventListener("ended", () => {
      if (mode !== "video") return;
      if (index < playlist.length - 1) playIndex(index + 1);
      else {
        paused = true;
        resumeSec = duration || video.currentTime || 0;
        paintProgress();
      }
    });
  }

  // 人在画面法线前方 0.4 到 5.2 米，左右不超出半宽再加 0.8 米。亮度只认这个范围。
  function zoneHas(player, spec) {
    if (!player || !spec) return false;
    const dx = player.x - spec.x;
    const dz = player.z - spec.z;
    const nx = Math.sin(spec.yaw);
    const nz = Math.cos(spec.yaw);
    const along = dx * nx + dz * nz;
    if (along < 0.4 || along > 5.2) return false;
    const lat = dx * Math.cos(spec.yaw) - dz * Math.sin(spec.yaw);
    if (Math.abs(lat) > spec.w / 2 + 0.8) return false;
    const bottom = spec.y - spec.h / 2;
    const top = spec.y + spec.h / 2;
    if (player.y > top + 0.2) return false;
    if (player.y + 1.85 < bottom) return false;
    return true;
  }

  // 射线对着画面正面。denom 是视线和法线的点积，必须朝画面看。
  function rayPanel(camera, dir, minT, spec) {
    const nx = Math.sin(spec.yaw);
    const nz = Math.cos(spec.yaw);
    const denom = dir.x * nx + dir.z * nz;
    if (denom > -1e-4) return -1;
    const vx = camera.position.x - spec.x;
    const vz = camera.position.z - spec.z;
    const t = -(vx * nx + vz * nz) / denom;
    if (t < (minT || 0) || t > 16) return -1;
    const hx = camera.position.x + dir.x * t;
    const hy = camera.position.y + dir.y * t;
    const hz = camera.position.z + dir.z * t;
    const dx = hx - spec.x;
    const dz = hz - spec.z;
    const lat = dx * Math.cos(spec.yaw) - dz * Math.sin(spec.yaw);
    if (Math.abs(lat) > spec.w / 2 + spec.lipX) return -1;
    const faceBottom = spec.y - spec.h / 2;
    const faceTop = spec.y + spec.h / 2 + spec.lipTop;
    if (hy < faceBottom || hy > faceTop) return -1;
    return t;
  }

  function panelFrame(i) {
    const el = panelEls[i];
    if (!el) return null;
    return el.querySelector("iframe");
  }

  function clearPanelFrame(i) {
    const el = panelEls[i];
    const frame = panelFrame(i);
    if (frame) frame.remove();
    if (el) el.classList.remove("is-playing", "has-frame");
    const img = el && el.querySelector("img");
    if (img) img.hidden = false;
  }

  function mountPanelFrame(i, seconds, autoplay) {
    const el = panelEls[i];
    const item = panelItems[i];
    if (!el || !item || item.error) return;
    const src = clipEmbed(item, seconds, autoplay);
    if (!src) return;
    const face = el.querySelector(".art-panel-face") || el;
    let frame = panelFrame(i);
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = "小屏幕";
      frame.referrerPolicy = "unsafe-url";
      frame.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
      face.appendChild(frame);
    }
    if (frame.dataset.src !== src) {
      frame.dataset.src = src;
      frame.src = src;
    }
    el.classList.add("has-frame");
    el.classList.toggle("is-playing", !!autoplay);
    const img = el.querySelector("img");
    if (img) img.hidden = true;
  }

  function pausePanel(i) {
    if (panelPlaying !== i) return;
    const elapsed = (panelResume[i] || 0) + (performance.now() - panelStarted) / 1000;
    panelResume[i] = elapsed;
    panelPlaying = -1;
    panelStarted = 0;
    clearPanelFrame(i);
  }

  function playPanel(i) {
    const item = panelItems[i];
    if (!item || item.error) return;
    if (panelPlaying === i) return;
    if (panelPlaying >= 0) pausePanel(panelPlaying);
    const seconds = panelResume[i] > 0 ? panelResume[i] : (item.start || 0);
    panelPlaying = i;
    panelStarted = performance.now();
    mountPanelFrame(i, seconds, true);
  }

  function biliPoster(item) {
    const key = item.bvid || ("av" + item.aid);
    if (posterCache.has(key)) return posterCache.get(key);
    const pending = (async () => {
      try {
        const q = item.bvid ? "bvid=" + encodeURIComponent(item.bvid) : "aid=" + encodeURIComponent(item.aid);
        const res = await fetch("https://api.bilibili.com/x/web-interface/view?" + q);
        if (!res.ok) return "";
        const data = await res.json();
        const pic = data && data.data && data.data.pic;
        return typeof pic === "string" ? pic : "";
      } catch {
        return "";
      }
    })();
    posterCache.set(key, pending);
    return pending;
  }

  function paintPosters() {
    for (let i = 0; i < panelEls.length; i++) {
      const img = panelEls[i].querySelector("img");
      const item = panelItems[i];
      panelPosterOk[i] = false;
      panelPosterFail[i] = false;
      if (!img) continue;
      img.hidden = false;
      img.onload = null;
      img.onerror = null;
      if (!item || item.error) {
        img.removeAttribute("src");
        continue;
      }
      const token = panelPosterToken[i] + 1;
      panelPosterToken[i] = token;
      const failed = () => {
        if (panelPosterToken[i] !== token || panelPosterOk[i]) return;
        panelPosterOk[i] = false;
        panelPosterFail[i] = true;
      };
      const poster = clipPoster(item);
      if (poster) {
        img.onload = () => {
          if (panelPosterToken[i] !== token) return;
          panelPosterOk[i] = true;
          panelPosterFail[i] = false;
        };
        img.onerror = failed;
        img.src = poster;
        continue;
      }
      img.removeAttribute("src");
      biliPoster(item).then((pic) => {
        if (panelPosterToken[i] !== token || !img.isConnected) return;
        if (!pic) {
          failed();
          return;
        }
        img.onload = () => {
          if (panelPosterToken[i] !== token) return;
          panelPosterOk[i] = true;
          panelPosterFail[i] = false;
        };
        img.onerror = failed;
        img.src = pic;
      });
      setTimeout(failed, 1200);
    }
  }

  function setClips(urls, seed) {
    const list = Array.isArray(urls) ? urls : [];
    const key = String(seed) + "\n" + list.join("\n");
    if (key === clipKey) return;
    clipKey = key;
    if (panelPlaying >= 0) {
      panelPlaying = -1;
      panelStarted = 0;
    }
    const assigned = assignClips(list, seed, panelSpecs.length);
    for (let i = 0; i < panelSpecs.length; i++) {
      panelResume[i] = 0;
      clearPanelFrame(i);
      const parsed = assigned[i] ? parseClip(assigned[i]) : null;
      panelItems[i] = parsed && !parsed.error ? parsed : null;
    }
    paintPosters();
  }

  // 页面层不写深度。近处箱体投到这块画面上的影子要挖掉，否则对面的视频会贴在箱体背面。
  function roundPx(n) {
    return Math.round(n * 10) / 10;
  }

  function convexHull(points) {
    const pts = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let dup = false;
      for (let j = 0; j < pts.length; j++) {
        if (Math.abs(pts[j][0] - p[0]) < 0.4 && Math.abs(pts[j][1] - p[1]) < 0.4) {
          dup = true;
          break;
        }
      }
      if (!dup) pts.push(p);
    }
    if (pts.length < 3) return pts;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function separated(poly, other) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ax = b[1] - a[1];
      const ay = a[0] - b[0];
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k][0] * ax + poly[k][1] * ay;
        if (p < minA) minA = p;
        if (p > maxA) maxA = p;
      }
      for (let k = 0; k < other.length; k++) {
        const p = other[k][0] * ax + other[k][1] * ay;
        if (p < minB) minB = p;
        if (p > maxB) maxB = p;
      }
      if (maxA < minB || maxB < minA) return true;
    }
    return false;
  }

  function polysOverlap(a, b) {
    return a.length >= 3 && b.length >= 3 && !separated(a, b) && !separated(b, a);
  }

  function mergeHoles(holes) {
    const list = holes.slice();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (!polysOverlap(list[i], list[j])) continue;
          const hull = convexHull(list[i].concat(list[j]));
          list.splice(j, 1);
          list.splice(i, 1, hull);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return list;
  }

  function panelBoxCorners(spec) {
    const yaw = spec.yaw;
    const pad = 0.02;
    const hx = (spec.w + spec.lipX * 2) / 2 + pad;
    const hy = (spec.h + spec.lipTop) / 2 + pad;
    const hz = spec.d / 2 + pad;
    const cx = spec.x - Math.sin(yaw) * (spec.d / 2);
    const cy = spec.y + spec.lipTop / 2;
    const cz = spec.z - Math.cos(yaw) * (spec.d / 2);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const corners = [];
    for (let ix = -1; ix <= 1; ix += 2) {
      for (let iy = -1; iy <= 1; iy += 2) {
        for (let iz = -1; iz <= 1; iz += 2) {
          corners.push([
            cx + rx * hx * ix + nx * hz * iz,
            cy + hy * iy,
            cz + rz * hx * ix + nz * hz * iz,
          ]);
        }
      }
    }
    return corners;
  }

  function shadowOnPanel(cam, spec, corners) {
    const yaw = spec.yaw;
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const px = spec.x;
    const py = spec.y + spec.lipTop / 2;
    const pz = spec.z;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const widthPx = (spec.w + spec.lipX * 2) * pxPerM;
    const heightPx = (spec.h + spec.lipTop) * pxPerM;
    const hits = [];
    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const dx = corner[0] - cam.x;
      const dy = corner[1] - cam.y;
      const dz = corner[2] - cam.z;
      const denom = dx * nx + dz * nz;
      if (Math.abs(denom) < 1e-5) continue;
      const t = ((px - cam.x) * nx + (pz - cam.z) * nz) / denom;
      if (t <= 1.02) continue;
      const hx = cam.x + dx * t;
      const hy = cam.y + dy * t;
      const hz = cam.z + dz * t;
      const lx = (hx - px) * rx + (hz - pz) * rz;
      const ly = hy - py;
      hits.push([widthPx / 2 + lx * pxPerM, heightPx / 2 - ly * pxPerM]);
    }
    return convexHull(hits);
  }

  function panelHoles(camera, index) {
    const spec = panelSpecs[index];
    const w = (spec.w + spec.lipX * 2) * pxPerM;
    const h = (spec.h + spec.lipTop) * pxPerM;
    const rect = [[0, 0], [w, 0], [w, h], [0, h]];
    const holes = [];
    const cam = camera.position;
    for (let j = 0; j < panelSpecs.length; j++) {
      if (j === index) continue;
      const hole = shadowOnPanel(cam, spec, panelBoxCorners(panelSpecs[j]));
      if (hole.length >= 3 && polysOverlap(hole, rect)) holes.push(hole);
    }
    return mergeHoles(holes);
  }

  function panelClipPath(spec, holes) {
    const w = roundPx((spec.w + spec.lipX * 2) * pxPerM);
    const h = roundPx((spec.h + spec.lipTop) * pxPerM);
    let d = "M0 0H" + w + "V" + h + "H0Z";
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      d += "M" + roundPx(hole[0][0]) + " " + roundPx(hole[0][1]);
      for (let k = 1; k < hole.length; k++) d += "L" + roundPx(hole[k][0]) + " " + roundPx(hole[k][1]);
      d += "Z";
    }
    return "path(evenodd,\"" + d + "\")";
  }

  function setPanelClip(el, value) {
    if (el.dataset.occlude === value) return;
    el.dataset.occlude = value;
    el.style.clipPath = value;
    el.style.webkitClipPath = value;
  }

  function occludePanel(el, camera, index) {
    const holes = panelHoles(camera, index);
    const frame = el.querySelector("iframe");
    // 跨域画面不吃父级裁剪，一旦和近处箱体重叠就整块收起。
    if (frame && holes.length) {
      frame.style.visibility = "hidden";
      setPanelClip(el, "");
      el.style.visibility = "hidden";
      return;
    }
    if (frame) frame.style.visibility = "";
    setPanelClip(el, holes.length ? panelClipPath(panelSpecs[index], holes) : "");
    el.style.visibility = "visible";
  }

  // 人在画面正面才叠视频。侧面和背面留给箱体，不把画面穿过去。
  function seesFront(camera, spec) {
    const nx = Math.sin(spec.yaw);
    const nz = Math.cos(spec.yaw);
    return (camera.position.x - spec.x) * nx + (camera.position.z - spec.z) * nz > 0.05;
  }

  function syncPanelContent(i, onScreen) {
    if (panelPlaying === i) return;
    const item = panelItems[i];
    if (!item || item.error || !panelPosterFail[i]) {
      if (panelFrame(i)) clearPanelFrame(i);
      return;
    }
    if (!onScreen) return;
    const seconds = panelResume[i] > 0 ? panelResume[i] : (item.start || 0);
    mountPanelFrame(i, seconds, false);
  }

  function presentPanels(camera) {
    if (!mount || mount.hidden || !view) return;
    camera.getWorldDirection(fwd);
    for (let i = 0; i < panelEls.length; i++) {
      const anchor = panelAnchors[i];
      const el = panelEls[i];
      const spec = panelSpecs[i];
      anchor.updateMatrixWorld(true);
      const dx = anchor.position.x - camera.position.x;
      const dy = anchor.position.y - camera.position.y;
      const dz = anchor.position.z - camera.position.z;
      const onScreen = fwd.x * dx + fwd.y * dy + fwd.z * dz >= 0.3 && seesFront(camera, spec);
      syncPanelContent(i, onScreen);
      if (!onScreen) {
        el.style.visibility = "hidden";
        setPanelClip(el, "");
        const frame = el.querySelector("iframe");
        if (frame) frame.style.visibility = "";
        continue;
      }
      el.style.transform = getObjectCSSMatrix(anchor.matrixWorld);
      occludePanel(el, camera, i);
    }
  }

  function tickPanels(camera, player, inside) {
    if (!inside) {
      if (panelPlaying >= 0) pausePanel(panelPlaying);
      for (let i = 0; i < panelEls.length; i++) {
        if (panelFrame(i)) clearPanelFrame(i);
      }
      return;
    }
    for (let i = 0; i < panelEls.length; i++) {
      const near = zoneHas(player, panelSpecs[i]);
      if (panelPlaying === i && !near) pausePanel(i);
    }
    presentPanels(camera);
  }

  resize(width, height);
  hideMount();
  paintProgress();

  return {
    resize,
    open,
    closeDialog,
    dialogOpen() {
      return !!(gate && !gate.hidden);
    },
    hoverLabel() {
      if (pickedPanel >= 0) {
        if (!pickedNear) return "走近播放";
        if (panelPlaying === pickedPanel) return "播放中";
        return "点击播放";
      }
      if (mode === "idle") return "输入视频链接";
      return paused ? "点击继续播放" : "点击控制播放";
    },
    contains(player) {
      return placedInside(player);
    },
    isInside() {
      return insideFlag;
    },
    pick(camera, dir, minT, player) {
      pickedPanel = -1;
      pickedNear = false;
      if (!player || !dir) return -1;
      if (Math.round(player.y / STORY) !== art.floor) return -1;
      if (player.z > art.curtainZ - 0.05) return -1;
      let best = -1;
      for (let i = 0; i < panelSpecs.length; i++) {
        const t = rayPanel(camera, dir, minT, panelSpecs[i]);
        if (t < 0) continue;
        if (best < 0 || t < best) {
          best = t;
          pickedPanel = i;
        }
      }
      let screenT = -1;
      if (dir.z <= -1e-4) {
        const t = (screen.z - camera.position.z) / dir.z;
        if (t >= (minT || 0) && t <= 22) {
          const hx = camera.position.x + dir.x * t;
          const hy = camera.position.y + dir.y * t;
          if (Math.abs(hx - screen.x) <= screen.w / 2 && Math.abs(hy - screen.y) <= screen.h / 2) screenT = t;
        }
      }
      if (screenT >= 0 && (best < 0 || screenT < best)) {
        pickedPanel = -1;
        return screenT;
      }
      if (pickedPanel >= 0) {
        pickedNear = zoneHas(player, panelSpecs[pickedPanel]);
        return best;
      }
      return -1;
    },
    tick(camera, player, ambience) {
      liveAmbience = ambience || liveAmbience;
      insideNow = placedInside(player);
      if (!insideNow) {
        const clip = mode === "video" && video && video.getAttribute("src") && !paused;
        if (clip && (!video.paused || leaveAt)) {
          if (!leaveAt) {
            leaveAt = performance.now();
            leaveFrom = Math.max(0.001, Number.isFinite(video.volume) ? video.volume : 1);
            dimPicture();
          }
          const along = Math.min(1, (performance.now() - leaveAt) / (LEAVE_FADE * 1000));
          video.volume = leaveFrom * (1 - along);
          aimEars(camera);
          if (along >= 1) finishLeaveAudio();
        } else if (mode === "iframe" && frame && frame.getAttribute("src")) {
          // 内嵌页的声音不经过厅内音量，离开时只能停。
          captureIframeTime();
          clearIframe();
          clearReflectFrame();
          if (leaveAt) finishLeaveAudio();
          else {
            hideMount();
            silenceBus();
          }
        } else {
          if (leaveAt) finishLeaveAudio();
          else {
            hideMount();
            silenceBus();
          }
        }
      } else {
        if (leaveAt) {
          leaveAt = 0;
          if (video) video.volume = 1;
          clearPictureDim();
        }
        if (mode === "idle" || (mode === "iframe" && paused)) {
          if (mount) mount.hidden = false;
          hidePicture();
          present(camera);
        } else {
          if (mode === "iframe" && !tryingVideo && frame && !frame.getAttribute("src")) mountIframe(resumeSec);
          if (mode === "video" && !paused && video && video.getAttribute("src") && video.paused) {
            const pending = video.play();
            if (pending && pending.catch) pending.catch(() => {});
          }
          showMount();
          present(camera);
          occludeBody(camera, player);
          if (mode === "video") paintReflect();
          if (bus) hear(camera, mode === "video" && !paused);
        }
      }
      if (gate && !gate.hidden) {
        placeGate(camera);
        paintProgress();
      }
      if (liveAmbience && liveAmbience.duck) {
        const screenLive = insideNow && mode !== "idle" && !paused;
        const panelLive = insideNow && panelPlaying >= 0;
        liveAmbience.duck(screenLive || panelLive ? 0.22 : 1);
      }
      tickPanels(camera, player, insideNow);
    },
    setClips,
  };
}

