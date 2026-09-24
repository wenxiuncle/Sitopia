import * as THREE from "../vendor/three.module.js";
import { planarBasis, yawFacing } from "./basis.js";
import { DAYS, dayIndex, openingQuads, plantShadowShift, sunVector } from "./day.js";
import {
  EYE,
  HALLS,
  PLAYER_RADIUS,
  buildMuseum,
  movePlayer,
  zoneAt,
} from "./layout.js";
import { mountPresence } from "./presence.js";
import {
  attachFramePicture,
  attachSun,
  atlasGrid,
  boxMesh,
  cellUv,
  colliderLines,
  coverRect,
  usableFrameImage,
  floorAndCeiling,
  floorDiscMesh,
  frameMeshes,
  lightConeMesh,
  placePlantShadows,
  plantMeshes,
  plantShadowMesh,
  sunPatchMesh,
  wallMesh,
} from "./meshes.js";

const WALK = 6.2;
const SPRINT = 11.2;
const MAX_STEP = 0.05;
const CENTER = new THREE.Vector2(0, 0);
const params = new URLSearchParams(location.search);

const view = document.getElementById("view");
const loading = document.getElementById("loading");
const boot = document.getElementById("boot");
const where = document.getElementById("where");
const place = document.getElementById("place");
const legendEl = document.getElementById("legend");
const hint = document.getElementById("hint");
const hoverEl = document.getElementById("hover");
const crosshair = document.getElementById("crosshair");
const panel = document.getElementById("panel");
const panelHall = document.getElementById("panel-hall");
const panelTitle = document.getElementById("panel-title");
const panelBlurb = document.getElementById("panel-blurb");
const panelDown = document.getElementById("panel-down");
const panelPortal = document.getElementById("panel-portal");
const panelArticle = document.getElementById("panel-article");
const panelClose = document.getElementById("panel-close");
const dayNav = document.getElementById("day");

const down = new Set();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
let sites = [];
let built = null;
let mats = null;
let baseColors = [];
let hoverColors = [];
let hoverIndex = -1;
let ignoreUntil = 0;
let vx = 0;
let vz = 0;
let px = 0;
let pz = 0;
let dayCursor = dayIndex(params.get("time"));
let sunShared = null;
let sunRoles = null;
let skyMesh = null;
let sunMesh = null;
let patchMesh = null;
let shadowMesh = null;
let coneMat = null;
let discMat = null;
let shadowMat = null;
let presence = null;

const SKY_R = 520;
const SUN_FAR = 280;

const renderer = new THREE.WebGLRenderer({
  canvas: view,
  antialias: true,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setClearColor(0x8ec8f2);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec8f2);
scene.fog = new THREE.Fog(0xb7d6ea, 48, 130);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
camera.rotation.order = "YXZ";

const raycaster = new THREE.Raycaster();
raycaster.far = 7;



function showFatal(message) {
  loading.hidden = false;
  loading.textContent = message;
}

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function setHover(index) {
  if (!mats || index === hoverIndex) return;
  if (hoverIndex >= 0) mats.setColorAt(hoverIndex, baseColors[hoverIndex]);
  hoverIndex = index;
  if (index >= 0) {
    mats.setColorAt(index, hoverColors[index]);
    hoverEl.textContent = sites[built.frames[index].siteIndex].title;
    hoverEl.hidden = false;
  } else {
    hoverEl.hidden = true;
  }
  mats.instanceColor.needsUpdate = true;
}

function closePanel() {
  panel.hidden = true;
}

function openFrame(index) {
  const site = sites[built.frames[index].siteIndex];
  const hall = HALLS.find((item) => item.cat === site.cat);
  panelHall.textContent = hall ? hall.name : "";
  panelTitle.textContent = site.title;
  panelBlurb.hidden = !site.blurb;
  panelBlurb.textContent = site.blurb || "";
  panelDown.hidden = !site.down;
  if (site.portal) {
    panelPortal.hidden = false;
    panelPortal.href = site.portal;
  } else {
    panelPortal.hidden = true;
    panelPortal.removeAttribute("href");
  }
  panelArticle.href = site.article;
  panel.hidden = false;
  panel.style.pointerEvents = "none";
  ignoreUntil = performance.now() + 420;
  window.setTimeout(() => {
    panel.style.pointerEvents = "auto";
  }, 420);
  if (document.pointerLockElement) document.exitPointerLock();
}

function pickFrame() {
  if (!mats) return -1;
  raycaster.setFromCamera(CENTER, camera);
  const hits = raycaster.intersectObject(mats, false);
  return hits.length ? hits[0].instanceId : -1;
}

function resetPose() {
  px = built.spawn.x;
  pz = built.spawn.z;
  vx = 0;
  vz = 0;
  camera.rotation.set(0, 0, 0);
  camera.position.set(px, EYE, pz);
  closePanel();
}

function paintLegend(name) {
  const items = legendEl.children;
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle("on", items[i].dataset.name === name);
  }
}

function updatePlace() {
  const zone = zoneAt(px, pz, built.zones);
  const name = zone ? zone.name : "馆内";
  if (place.textContent !== name) {
    place.textContent = name;
    paintLegend(name);
  }
}

let hoverClock = 0;
function step(dt, now) {
  const locked = document.pointerLockElement === view;
  document.body.classList.toggle("walking", locked);
  if (!locked) {
    vx = 0;
    vz = 0;
    if (hoverIndex >= 0) setHover(-1);
  } else {
    planarBasis(camera, fwd, right);
    let ix = 0;
    let iz = 0;
    if (down.has("KeyW") || down.has("ArrowUp")) { ix += fwd.x; iz += fwd.z; }
    if (down.has("KeyS") || down.has("ArrowDown")) { ix -= fwd.x; iz -= fwd.z; }
    if (down.has("KeyD") || down.has("ArrowRight")) { ix += right.x; iz += right.z; }
    if (down.has("KeyA") || down.has("ArrowLeft")) { ix -= right.x; iz -= right.z; }
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    const speed = down.has("ShiftLeft") || down.has("ShiftRight") ? SPRINT : WALK;
    const rate = 1 - Math.exp(-dt * 12);
    vx += (ix * speed - vx) * rate;
    vz += (iz * speed - vz) * rate;
    const moved = movePlayer(px, pz, vx * dt, vz * dt, PLAYER_RADIUS, built.walls);
    px = moved.x;
    pz = moved.z;
    if (now >= hoverClock) {
      hoverClock = now + 120;
      setHover(pickFrame());
    }
  }
  camera.position.set(px, EYE, pz);
  updatePlace();
  if (presence) presence.update(dt, now);
}

function animate(now) {
  const dt = Math.min(MAX_STEP, seconds(now));
  step(dt, now);
  renderer.render(scene, camera);
  if (params.has("selftest") && !animate.done) {
    const ready = document.documentElement.dataset.frames === "ready";
    const waited = now - (animate.started || (animate.started = now));
    if (ready || waited > 8000) {
      animate.done = true;
      publishSelfTest();
    }
  }
  requestAnimationFrame(animate);
}

let lastNow = 0;
function seconds(now) {
  if (!lastNow) lastNow = now;
  const dt = (now - lastNow) / 1000;
  lastNow = now;
  return dt;
}

function publishSelfTest() {
  planarBasis(camera, fwd, right);
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  gl.readPixels((w / 2) | 0, (h / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const info = renderer.info.render;
  const pre = document.createElement("pre");
  pre.id = "selftest";
  pre.textContent = JSON.stringify({
    calls: info.calls,
    triangles: info.triangles,
    frames: built.frames.length,
    pictures: Number(document.documentElement.dataset.pictures || 0),
    day: DAYS[dayCursor].id,
    pixel: [pixel[0], pixel[1], pixel[2], pixel[3]],
    fwd: [fwd.x, fwd.y, fwd.z],
  });
  document.body.appendChild(pre);
}

function bind() {
  view.addEventListener("click", () => {
    if (performance.now() < ignoreUntil) return;
    if (document.pointerLockElement !== view) {
      view.requestPointerLock();
      return;
    }
    const index = pickFrame();
    if (index >= 0) openFrame(index);
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== view) return;
    camera.rotation.y -= event.movementX * 0.0022;
    camera.rotation.x -= event.movementY * 0.0022;
    if (camera.rotation.x > 1.15) camera.rotation.x = 1.15;
    if (camera.rotation.x < -1.15) camera.rotation.x = -1.15;
  });
  document.addEventListener("keydown", (event) => {
    const typing = event.target;
    if (typing && typing.closest && typing.closest("input, textarea, button, select, #drawer, #name-gate, #day, #panel")) return;
    if (event.code === "KeyR") {
      resetPose();
      return;
    }
    if (event.code === "BracketLeft" || event.code === "BracketRight") {
      if (event.repeat) return;
      event.preventDefault();
      selectDay(dayCursor + (event.code === "BracketRight" ? 1 : -1));
      return;
    }
    if (event.code === "Escape" && !panel.hidden) closePanel();
    if (event.repeat) return;
    down.add(event.code);
  });
  document.addEventListener("keyup", (event) => down.delete(event.code));
  window.addEventListener("blur", () => down.clear());
  panelClose.addEventListener("click", closePanel);
  window.addEventListener("resize", resize);
}

function markDay(index) {
  const buttons = dayNav.children;
  for (let i = 0; i < buttons.length; i++) buttons[i].classList.toggle("on", i === index);
}

function selectDay(index) {
  dayCursor = (index + DAYS.length) % DAYS.length;
  markDay(dayCursor);
  if (built) applyDay(DAYS[dayCursor]);
}

function lit(color, which, extra) {
  const mat = new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {}));
  attachSun(mat, sunShared, sunRoles[which]);
  return mat;
}

function paintSky(day) {
  const pos = skyMesh.geometry.attributes.position;
  const col = skyMesh.geometry.attributes.color;
  const horizon = new THREE.Color(day.horizon);
  const zenith = new THREE.Color(day.zenith);
  const mix = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / SKY_R;
    const k = Math.pow(Math.min(1, Math.max(0, (ny - 0.02) / 0.98)), 0.85);
    mix.copy(horizon).lerp(zenith, k);
    col.setXYZ(i, mix.r, mix.g, mix.b);
  }
  col.needsUpdate = true;
}

function writePatches(day, sun) {
  const limits = {
    minX: built.interior.minX + 0.15,
    maxX: built.interior.maxX - 0.15,
    minZ: built.interior.minZ + 0.15,
    maxZ: built.interior.maxZ - 0.15,
  };
  const quads = openingQuads(built.openings, sun, limits, day.streakGain);
  const pos = patchMesh.geometry.attributes.position;
  const col = patchMesh.geometry.attributes.color;
  const color = new THREE.Color(day.streak);
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    for (let k = 0; k < 4; k++) {
      const vi = i * 4 + k;
      if (!quad) {
        pos.setXYZ(vi, 0, 0, 0);
        col.setXYZW(vi, 0, 0, 0, 0);
        continue;
      }
      pos.setXYZ(vi, quad.pts[k][0], 0.045, quad.pts[k][1]);
      col.setXYZW(vi, color.r, color.g, color.b, k < 2 ? quad.near : quad.far);
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

function applyDay(day) {
  const sun = sunVector(day);
  sunShared.dir.value.set(sun.x, sun.y, sun.z);
  sunShared.tint.value.set(day.tint);
  sunShared.shade.value = day.shade;
  sunRoles.ground.fill.value = day.fillGround;
  sunRoles.ground.gain.value = day.gainGround;
  sunRoles.open.fill.value = day.fillOpen;
  sunRoles.open.gain.value = day.gainOpen;
  sunRoles.room.fill.value = day.fillRoom;
  sunRoles.room.gain.value = day.gainRoom;
  sunRoles.glass.fill.value = day.fillGlass;
  sunRoles.glass.gain.value = day.gainGlass;
  const horizon = new THREE.Color(day.horizon);
  scene.background.copy(horizon);
  scene.fog.color.copy(horizon);
  renderer.setClearColor(horizon);
  document.body.style.background = horizon.getStyle();
  document.body.classList.toggle("dark-sky", day.id === "night");
  paintSky(day);
  sunMesh.material.color.set(day.sun);
  sunMesh.position.set(sun.x, sun.y, sun.z).multiplyScalar(SUN_FAR);
  sunMesh.scale.setScalar(day.disc);
  coneMat.color.set(day.cone);
  coneMat.opacity = day.coneOpacity;
  discMat.color.set(day.pool);
  discMat.opacity = day.poolOpacity;
  if (shadowMat) shadowMat.opacity = day.blob;
  writePatches(day, sun);
  if (shadowMesh) {
    placePlantShadows(shadowMesh, built.plants, (plant) => plantShadowShift(sun, 0.9 * plant.s));
  }
}

function buildScene(data) {
  sites = data.sites;
  built = buildMuseum(sites);
  sunShared = {
    dir: { value: new THREE.Vector3(0, 1, 0) },
    tint: { value: new THREE.Color(0xffffff) },
    block: { value: new THREE.Vector4() },
    roof: { value: 6.5 },
    shade: { value: 0.66 },
  };
  const role = () => ({ fill: { value: 1 }, gain: { value: 0 }, cast: { value: 0 } });
  sunRoles = { ground: role(), open: role(), room: role(), glass: role() };
  sunRoles.ground.cast.value = 1;
  const roof = built.dress.find((item) => item.kind === "roof");
  sunShared.block.value.set(roof.minX, roof.maxX, roof.minZ, roof.maxZ);
  sunShared.roof.value = (roof.minY + roof.maxY) / 2;

  const skyGeo = new THREE.SphereGeometry(SKY_R, 20, 12);
  skyGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  }));
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -2;
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false }));
  sunMesh.frustumCulled = false;
  sunMesh.renderOrder = -1;
  scene.add(skyMesh, sunMesh);

  const stoneMat = lit(0xe5e0d6, "open");
  const whiteMat = lit(0xf7f5f2, "room");
  const curbMat = lit(0xc8c4bb, "open");
  const floorMat = lit(0xc5c8cc, "ground");
  const roomMat = lit(0xb3a28c, "room");
  const ceilMat = lit(0x2c2c31, "room");
  const borderMat = lit(0xd5cfc6, "room");
  const matMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  attachFramePicture(matMat, sunShared, sunRoles.room);
  const potMat = lit(0xc2b2a4, "room");
  const leafMat = lit(0x7f957c, "room");
  const latticeMat = lit(0x7a4036, "open");
  const finMat = lit(0x5c3028, "open");
  const grooveMat = lit(0xd4cfc4, "open");
  const roofMat = lit(0xe7e2d8, "open");
  const beamMat = lit(0x1c1c20, "room");
  const glassMat = lit(0xb5d0de, "glass", {
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // 光锥在人走进光池时仍要看得见，所以双面、不写深度。不参与阳光，避免锥面被切成明暗条。
  coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff1dc,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  discMat = new THREE.MeshBasicMaterial({
    color: 0xfff3e4,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  const stone = wallMesh(built.stone, stoneMat);
  const inner = wallMesh(built.white.concat(built.liners), whiteMat);
  const curb = wallMesh(built.curb, curbMat);
  if (stone) scene.add(stone);
  if (inner) scene.add(inner);
  if (curb) scene.add(curb);
  const level = floorAndCeiling(built.bounds, floorMat, ceilMat, built.interior, roomMat);
  scene.add(level.floor);
  if (level.roomFloor) scene.add(level.roomFloor);
  if (level.ceil) scene.add(level.ceil);
  const byKind = { lattice: latticeMat, fin: finMat, groove: grooveMat, roof: roofMat, beam: beamMat, glass: glassMat };
  const kinds = ["lattice", "fin", "groove", "roof", "beam", "glass"];
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k];
    const mesh = boxMesh(built.dress.filter((item) => item.kind === kind), byKind[kind]);
    if (!mesh) continue;
    if (kind === "glass") mesh.renderOrder = 3;
    scene.add(mesh);
  }
  const frames = frameMeshes(built.frames, borderMat, matMat);
  scene.add(frames.border, frames.mat);
  mats = frames.mat;
  const white = new THREE.Color("#f7f3ec");
  baseColors = new Array(built.frames.length);
  hoverColors = new Array(built.frames.length);
  for (let i = 0; i < built.frames.length; i++) {
    baseColors[i] = new THREE.Color(built.frames[i].color);
    hoverColors[i] = baseColors[i].clone().lerp(white, 0.55);
  }
  if (built.plants.length) {
    const plants = plantMeshes(built.plants, potMat, leafMat);
    scene.add(plants.pots, plants.leaves);
    shadowMat = new THREE.MeshBasicMaterial({
      color: 0x3e3832,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    shadowMesh = plantShadowMesh(built.plants, shadowMat);
    if (shadowMesh) scene.add(shadowMesh);
  }
  patchMesh = sunPatchMesh(built.openings.length);
  scene.add(patchMesh);
  const cones = lightConeMesh(built.cones, coneMat);
  const discs = floorDiscMesh(built.cones, discMat);
  if (cones) scene.add(cones);
  if (discs) scene.add(discs);
  if (params.has("debug")) scene.add(colliderLines(built.walls));

  legendEl.replaceChildren();
  for (let i = 0; i < built.legend.length; i++) {
    const item = built.legend[i];
    const li = document.createElement("li");
    li.dataset.name = item.name;
    li.textContent = `${item.name} · ${item.count}`;
    legendEl.appendChild(li);
  }

  applyDay(DAYS[dayCursor]);
  resetPose();
  if (params.has("preview")) {
    const frame = built.frames[Math.min(24, built.frames.length - 1)];
    px = frame.x;
    pz = frame.z + frame.nz * 4.8;
    camera.position.set(px, frame.y, pz);
    camera.lookAt(frame.x, frame.y, frame.z);
  }
  if (params.has("x")) px = Number(params.get("x"));
  if (params.has("z")) pz = Number(params.get("z"));
  if (params.has("x") || params.has("z")) camera.position.set(px, EYE, pz);
  if (params.has("yaw")) {
    camera.rotation.y = Number(params.get("yaw")) * Math.PI / 180;
    camera.rotation.x = Number(params.get("pitch") || 0) * Math.PI / 180;
  }
  const visitorMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  attachSun(visitorMat, sunShared, sunRoles.open);
  const visitorShadow = new THREE.MeshBasicMaterial({
    color: 0x3e3832,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  presence = mountPresence({
    scene,
    material: visitorMat,
    shadowMaterial: visitorShadow,
    bounds: built.bounds,
    interior: built.interior,
    getPose: () => {
      planarBasis(camera, fwd, right);
      return { x: px, z: pz, yaw: yawFacing(fwd) };
    },
    onTyping: (active) => {
      if (active) down.clear();
    },
  });
  loading.hidden = true;
  boot.hidden = false;
  where.hidden = false;
  legendEl.hidden = false;
  hint.hidden = false;
  crosshair.hidden = false;
  resize();
  mountPictures();
  requestAnimationFrame(animate);
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https:\/\//i.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function markPictures(count) {
  document.documentElement.dataset.frames = "ready";
  document.documentElement.dataset.pictures = String(count);
}

function mountPictures() {
  const frames = built.frames;
  const jobs = [];
  for (let i = 0; i < frames.length; i++) {
    const site = sites[frames[i].siteIndex];
    const src = usableFrameImage(site && site.image);
    if (!src) continue;
    jobs.push(loadImage(src).then((img) => ({ index: i, img })));
  }
  if (!jobs.length) {
    markPictures(0);
    return;
  }
  Promise.all(jobs).then((loaded) => {
    const pictures = [];
    for (let i = 0; i < loaded.length; i++) if (loaded[i].img) pictures.push(loaded[i]);
    if (!pictures.length || !mats) {
      markPictures(0);
      return;
    }
    const maxSize = Math.min(renderer.capabilities.maxTextureSize || 4096, 4096);
    const grid = atlasGrid(pictures.length + 1, maxSize);
    const canvas = document.createElement("canvas");
    canvas.width = grid.cols * grid.cellW;
    canvas.height = grid.rows * grid.cellH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f5f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const uv = new Float32Array(frames.length * 4);
    for (let i = 0; i < frames.length; i++) {
      uv.set(cellUv(0, 0, grid.cols, grid.rows), i * 4);
    }
    for (let p = 0; p < pictures.length; p++) {
      const slot = p + 1;
      const col = slot % grid.cols;
      const row = Math.floor(slot / grid.cols);
      const ox = col * grid.cellW;
      const oy = row * grid.cellH;
      const img = pictures[p].img;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, grid.cellW, grid.cellH);
      ctx.clip();
      const fit = coverRect(img.naturalWidth, img.naturalHeight, grid.cellW, grid.cellH);
      ctx.drawImage(img, ox + fit.x, oy + fit.y, fit.w, fit.h);
      ctx.restore();
      const frame = frames[pictures[p].index];
      uv.set(cellUv(col, row, grid.cols, grid.rows), pictures[p].index * 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    mats.geometry.setAttribute("frameUv", new THREE.InstancedBufferAttribute(uv, 4));
    const white = new THREE.Color("#ffffff");
    for (let i = 0; i < frames.length; i++) {
      baseColors[i].copy(white);
      hoverColors[i].copy(white);
      mats.setColorAt(i, hoverIndex === i ? hoverColors[i] : baseColors[i]);
    }
    mats.instanceColor.needsUpdate = true;
    mats.material.map = texture;
    mats.material.needsUpdate = true;
    markPictures(pictures.length);
  }).catch(() => markPictures(0));
}

for (let i = 0; i < DAYS.length; i++) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = DAYS[i].name;
  button.addEventListener("click", () => selectDay(i));
  dayNav.appendChild(button);
}
markDay(dayCursor);
bind();
resize();

fetch("data/sites.json")
  .then((res) => {
    if (!res.ok) throw new Error("sites.json " + res.status);
    return res.json();
  })
  .then(buildScene)
  .catch(() => showFatal("展品清单没有读到。请先运行 node tools/fetch-sites.mjs"));
