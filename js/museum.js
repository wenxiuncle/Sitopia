import * as THREE from "../vendor/three.module.js";
import { createAmbience } from "./ambience.js";
import { createVisitor, placeBodyShadow, poseVisitor, setBodyLight } from "./avatar.js";
import { planarBasis, yawFacing } from "./basis.js";
import { DAYS, dayIndex, nightSpillQuads, openingQuads, sunVector } from "./day.js";
import { createLift } from "./lift.js";
import {
  EYE,
  FRAME,
  HALLS,
  LIFT,
  PLAZA,
  PLAYER_RADIUS,
  STORY,
  WALL_H,
  buildMuseum,
  doorBoxes,
  doorWantsOpen,
  groundAt,
  hallDoorNear,
  hallBlend,
  inLiftCar,
  liftDoorBoxes,
  movePlayer,
  nearLiftHall,
  pullCamera,
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
  FALLBACK_FRAME_IMAGE,
  usableFrameImage,
  doorRig,
  floorAndCeiling,
  deckRailMesh,
  floorDiscMesh,
  frameMeshes,
  frameShadowMesh,
  handrailMesh,
  labelMeshes,
  lampTexture,
  ledRig,
  lightConeMesh,
  liftRig,
  lobbyPropMeshes,
  lobeMeshes,
  paneMesh,
  plateMesh,
  setFacadeSignNight,
  castShadowMaterial,
  deckShadowPolys,
  dropShadowMesh,
  placeDropShadows,
  shapeShadowMaterial,
  shapeShadowMesh,
  yardShadowPolys,
  placePlantShadows,
  plantMeshes,
  plantShadowMesh,
  sconceRig,
  softShadowMaterial,
  spotHeadMesh,
  sunPatchMesh,
  wallMesh,
  yardMeshes,
  horizonMeshes,
} from "./meshes.js";

const WALK = 6.2;
const SPRINT = 11.2;
const MAX_STEP = 0.05;
const params = new URLSearchParams(location.search);

const view = document.getElementById("view");
const loading = document.getElementById("loading");
const boot = document.getElementById("boot");
const where = document.getElementById("where");
const place = document.getElementById("place");
const legendEl = document.getElementById("legend");
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
const corner = document.getElementById("corner");
const liftToggle = document.getElementById("lift-toggle");
const liftPad = document.getElementById("lift-pad");
const liftHint = document.getElementById("lift-hint");

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
let py = 0;
let pz = 0;
let ambience = null;
let heardGesture = false;
let dayCursor = dayIndex(params.get("time"));
let sunShared = null;
let sunRoles = null;
let skyMesh = null;
let sunMesh = null;
let patchMesh = null;
let nightSpillMesh = null;
let beacons = null;
let dayIsNight = false;
let shadowMesh = null;
let coneMat = null;
let discMat = null;
let shadowMat = null;
let shapeMat = null;
let shapeMesh = null;
let bodyRoom = null;
let nightCeilMat = null;
let nightCeilPlateMat = null;
let nightBeamMat = null;
let presence = null;
let visitorOut = false;
let navHoldsLook = false;
let doors = null;
let liftDoors = null;
let lift = null;
let doorOpen = [];
let doorHeld = [];
const hallNear = [];
let shownFloor = -1;
let pictureGrid = null;
const imageCache = new Map();
let loadWait = [];
let loadActive = 0;
let loadPumping = false;
const LOAD_CAP = 2;
const FALLBACK_SRC = usableFrameImage(FALLBACK_FRAME_IMAGE);
let liftPadOpen = false;
let doorCall = false;
let revealFloor = -1;
let pictureAim = -1;
let prefetchFloor = -2;
let thirdPerson = false;
let orbiting = false;
let orbitYaw = 0;
let orbitPitch = 0;
let lookReleasedByPage = false;
let blurUnlock = false;
const bodyLook = new THREE.PerspectiveCamera();
const orbitRig = new THREE.PerspectiveCamera();
bodyLook.rotation.order = "YXZ";
orbitRig.rotation.order = "YXZ";
let selfVisitor = null;
let walkPhase = 0;
const lookDir = new THREE.Vector3();
let solidList = null;
let solidWalls = 0;
let clickShieldUntil = 0;
let escWantsCard = false;
let atlasGridSize = null;
const atlasSlots = [];
const atlasReady = new Map();
let shownAtlas = -1;
let buildSerial = 0;
let horizon = null;
let dropMesh = null;
let dropItems = null;
const WINDOW_GLOW = {
  dawn: 0xd2c2a6,
  morning: 0xb7c3c8,
  noon: 0xa9b8c0,
  afternoon: 0xc2bba8,
  dusk: 0xe8b56e,
  night: 0xf0d2a0,
};

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
scene.fog = new THREE.Fog(0xb7d6ea, 60, 420);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
camera.rotation.order = "YXZ";

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

function gateOpen() {
  const gate = document.getElementById("name-gate");
  return !!(gate && !gate.hidden);
}

function showEscCard() {
  escWantsCard = false;
  boot.hidden = false;
  document.body.classList.add("esc-card");
}

function hideEscCard() {
  if (gateOpen()) {
    boot.hidden = false;
    document.body.classList.add("esc-card");
    return;
  }
  document.body.classList.remove("esc-card");
  boot.hidden = true;
}

function requestWalk() {
  if (visitorOut) return;
  parkFocus();
  const pending = view.requestPointerLock();
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

function releaseLook() {
  if (document.pointerLockElement !== view) return;
  lookReleasedByPage = true;
  document.exitPointerLock();
}

function beginOrbit() {
  if (orbiting || !thirdPerson) return;
  if (document.pointerLockElement !== view) return;
  if (corner.classList.contains("nav-open")) return;
  bodyLook.rotation.copy(camera.rotation);
  bodyLook.rotation.z = 0;
  orbitYaw = camera.rotation.y;
  orbitPitch = camera.rotation.x;
  orbiting = true;
}

function endOrbit() {
  if (!orbiting) return;
  orbiting = false;
  camera.rotation.copy(bodyLook.rotation);
  camera.rotation.z = 0;
}

function lookSource() {
  if (!orbiting) return camera;
  bodyLook.updateMatrixWorld();
  return bodyLook;
}

function closePanel(relock) {
  panel.hidden = true;
  document.body.classList.remove("reading");
  if (!relock || corner.classList.contains("nav-open")) return;
  requestWalk();
}

function interactiveTarget(target) {
  return !!(target && target.closest && target.closest(
    "#panel, #roster, #drawer, #name-gate, #kick-gate, #chat-bar, #lift-pad, #boot, #day, #hud-row, #drawer-toggle, #map-card, #map-switch, a, button, input, textarea, label",
  ));
}

function enterWalk() {
  hideEscCard();
  if (presence) presence.dismiss(true);
  closePanel(false);
  requestWalk();
}

function parkFocus() {
  const gate = document.getElementById("name-gate");
  if (gate && !gate.hidden) return;
  const el = document.activeElement;
  if (el && el.closest && el.closest("#chat-bar, #name-gate")) return;
  if (el && el !== view && el !== document.body && el.blur) el.blur();
  view.focus({ preventScroll: true });
}

function openFrame(index) {
  const siteIndex = built.frames[index].siteIndex;
  const site = sites[siteIndex];
  const cat = built.hangCat ? built.hangCat[siteIndex] : site.cat;
  const hall = HALLS.find((item) => item.cat === cat);
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
  document.body.classList.add("reading");
  panel.style.pointerEvents = "none";
  ignoreUntil = performance.now() + 420;
  window.setTimeout(() => {
    panel.style.pointerEvents = "auto";
  }, 420);
  releaseLook();
}

function pickFrame() {
  if (!built) return -1;
  camera.getWorldDirection(lookDir);
  const ox = camera.position.x;
  const oy = camera.position.y;
  const oz = camera.position.z;
  let minT = 0.15;
  if (thirdPerson) {
    const gap = Math.hypot(ox - px, oy - (py + EYE), oz - pz);
    if (gap > minT) minT = gap - 0.25;
  }
  const floor = playerFloor();
  let best = -1;
  let bestT = 7;
  const frames = built.frames;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.floor !== floor) continue;
    const denom = frame.nx * lookDir.x + frame.nz * lookDir.z;
    if (denom > -1e-4) continue;
    const t = ((frame.x - ox) * frame.nx + (frame.z - oz) * frame.nz) / denom;
    if (t < minT || t >= bestT) continue;
    const hy = oy + lookDir.y * t;
    if (Math.abs(hy - frame.y) > FRAME.h * 0.5) continue;
    const hx = ox + lookDir.x * t;
    const hz = oz + lookDir.z * t;
    const along = Math.abs(frame.nz) > 0.5 ? Math.abs(hx - frame.x) : Math.abs(hz - frame.z);
    if (along > FRAME.w * 0.5) continue;
    best = i;
    bestT = t;
  }
  return best;
}

function resetPose() {
  px = built.spawn.x;
  pz = built.spawn.z;
  py = 0;
  vx = 0;
  vz = 0;
  camera.rotation.set(0, 0, 0);
  camera.position.set(px, py + EYE, pz);
  closePanel();
  closeLiftPad();
}

function paintLegend(names) {
  const items = legendEl.children;
  const on = names || [];
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle("on", on.indexOf(items[i].dataset.name) >= 0);
  }
}

function updatePlace() {
  const zone = zoneAt(px, pz, built.zones, py);
  const name = zone ? zone.name : "馆内";
  if (place.textContent !== name) {
    place.textContent = name;
    paintLegend(zone && zone.legend);
  }
}

let hoverClock = 0;

function playerFloor() {
  let floor = Math.round(py / STORY);
  if (floor < 0) floor = 0;
  if (built && floor >= built.floors) floor = built.floors - 1;
  return floor;
}

function othersInCar() {
  const people = presence && presence.others ? presence.others() : [];
  let n = 0;
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (!inLiftCar(person.x, person.z)) continue;
    if (Math.abs((person.y || 0) - lift.y) > 0.85) continue;
    n += 1;
  }
  return n;
}

function liftOpenVisual(floor) {
  if (!lift || Math.abs(lift.y - floor * STORY) > 0.22) return 0;
  return lift.door;
}

function liftOpenSolid(floor) {
  const open = liftOpenVisual(floor);
  const inside = lift && inLiftCar(px, pz) && Math.abs(py - lift.y) < 0.9;
  if (!inside && othersInCar() >= LIFT.capacity) return 0;
  return open;
}

function collide() {
  if (!solidList) {
    solidList = built.walls.slice();
    solidWalls = solidList.length;
  }
  solidList.length = solidWalls;
  for (let f = 0; f < built.floors; f++) {
    const leaves = doorBoxes(doorOpen[f] || 0, f);
    solidList.push(leaves[0], leaves[1]);
    const shut = liftDoorBoxes(liftOpenSolid(f), f);
    for (let i = 0; i < shut.length; i++) solidList.push(shut[i]);
  }
  return solidList;
}

function insideLift() {
  return !!(lift && inLiftCar(px, pz) && Math.abs(py - lift.y) < 0.9);
}

function atLiftDoor() {
  if (!built) return false;
  return nearLiftHall(px, pz) && Math.abs(py - playerFloor() * STORY) < 1.2;
}

// 门洞和轿厢、大厅门口连成一片。标签不要在跨过门扇的那一截灭掉。
function inLiftMouth(x, z) {
  const half = LIFT.doorW / 2 + 0.35;
  if (Math.abs(z - LIFT.cz) >= half) return false;
  return x > LIFT.xRear + 0.2 && x < LIFT.xDoor + 1.7;
}

function liftLabelOn() {
  if (!built) return false;
  if (insideLift()) return true;
  if (Math.abs(py - playerFloor() * STORY) > 1.2) return false;
  return atLiftDoor() || inLiftMouth(px, pz);
}

// 人还停在门上时不算进了电梯。完全进到轿厢里，门才可以关。
function holdingLiftDoor() {
  if (!lift || Math.abs(py - lift.y) > 0.9) return false;
  if (inLiftCar(px, pz)) return false;
  const half = LIFT.doorW / 2 + 0.45;
  if (Math.abs(pz - LIFT.cz) > half) return false;
  return px > LIFT.xDoor - 0.55 && px < LIFT.xDoor + 1.5;
}

function settleFeet(dt) {
  if (lift && inLiftCar(px, pz) && (Math.abs(py - lift.y) < 1.15 || lift.phase === "moving")) {
    py = lift.y;
    return;
  }
  const support = groundAt(px, pz, py, built.floors);
  if (support == null) {
    py -= 9 * dt;
    if (py < 0) py = 0;
    return;
  }
  if (py > support + 0.35) py = Math.max(support, py - 9 * dt);
  else py = support;
}

function closeLiftPad() {
  if (!liftPadOpen) return;
  liftPadOpen = false;
  if (liftPad) liftPad.hidden = true;
  if (liftToggle) liftToggle.setAttribute("aria-expanded", "false");
}

function openLiftPad() {
  if (!liftPad || liftPadOpen) return;
  liftPadOpen = true;
  liftPad.hidden = false;
  if (liftToggle) liftToggle.setAttribute("aria-expanded", "true");
  down.clear();
  releaseLook();
}

function fillLiftPad() {
  if (!liftPad) return;
  liftPad.replaceChildren();
  const note = document.createElement("p");
  note.id = "lift-note";
  note.textContent = "限乘 " + LIFT.capacity + " 人";
  const list = document.createElement("div");
  list.id = "lift-list";
  liftPad.append(note, list);
  for (let f = built.floors - 1; f >= 0; f--) {
    const button = document.createElement("button");
    button.type = "button";
    const names = built.floorNames[f];
    button.dataset.floor = String(f);
    button.setAttribute("aria-pressed", "false");
    button.textContent = (f + 1) + " 楼" + (names && names.length ? " · " + names.join("、") : "");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!lift) return;
      const chosen = lift.has(f);
      if (ambience) ambience.press();
      if (chosen) lift.cancel(f);
      else lift.call(f);
      paintLiftChoices();
      if (!chosen) requestWalk();
    });
    list.appendChild(button);
  }
}

function onDoorKey() {
  if (!lift || !built) return;
  if (insideLift()) {
    if (lift.phase === "moving") return;
    if (ambience) ambience.press();
    lift.call(lift.current);
    return;
  }
  if (!atLiftDoor()) return;
  if (ambience) ambience.press();
  doorCall = true;
  lift.call(playerFloor());
}

function paintLiftChoices() {
  const list = document.getElementById("lift-list");
  if (!list || !lift) return;
  const buttons = list.children;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const on = lift.has(Number(button.dataset.floor));
    button.classList.toggle("chosen", on);
    const pressed = on ? "true" : "false";
    if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
  }
}

function onFloorKey() {
  if (!lift || !built || !insideLift()) return;
  if (presence) presence.closeRoster();
  if (!liftPadOpen) {
    openLiftPad();
    return;
  }
  down.clear();
  releaseLook();
}

function syncLiftHud() {
  if (!liftToggle || !lift) return;
  const inside = insideLift();
  if (!atLiftDoor()) doorCall = false;
  if (!inside && liftPadOpen) closeLiftPad();
  const showStatus = liftLabelOn();
  liftToggle.hidden = !showStatus;
  if (liftPad) liftPad.hidden = !liftPadOpen;
  const level = lift.y / STORY;
  const rounded = Math.round(level);
  const shown = Math.abs(level - rounded) > 0.18 ? (lift.dir < 0 ? Math.floor(level) : Math.ceil(level)) : rounded;
  const arrow = lift.dir > 0 && lift.phase === "moving" ? " ▲" : lift.dir < 0 && lift.phase === "moving" ? " ▼" : "";
  const label = (shown + 1) + "F" + arrow;
  if (liftToggle.textContent !== label) liftToggle.textContent = label;
  const note = document.getElementById("lift-note");
  if (note && liftPadOpen) {
    const next = "点一层就走，再点一次取消";
    if (note.textContent !== next) note.textContent = next;
  }
  paintLiftChoices();
}

// 轿厢和大厅门口中间有一截两边的判断都够不着，提示会在过门时灭掉。
function crossingLiftDoor() {
  if (!built || insideLift() || atLiftDoor()) return false;
  const onFoot = Math.abs(py - playerFloor() * STORY) < 1.2;
  const inCarY = lift && Math.abs(py - lift.y) < 0.9;
  if (!onFoot && !inCarY) return false;
  if (Math.abs(pz - LIFT.cz) >= LIFT.doorW / 2 + 0.12) return false;
  return px > LIFT.xDoor - 0.55 && px < LIFT.xDoor + 0.08;
}

function syncLiftHint() {
  if (!liftHint) return;
  let text = "";
  if (hoverIndex < 0 && (insideLift() || crossingLiftDoor())) text = "按 E 开门\n按 F 选层";
  else if (hoverIndex < 0 && atLiftDoor()) text = "按 E 叫电梯";
  if (!text) {
    liftHint.hidden = true;
    return;
  }
  if (liftHint.textContent !== text) liftHint.textContent = text;
  liftHint.hidden = false;
}

function poseSelf(pulled) {
  if (!selfVisitor) return;
  selfVisitor.group.visible = pulled.dist > 0.9;
  selfVisitor.group.position.set(px, py, pz);
  planarBasis(lookSource(), fwd, right);
  selfVisitor.group.rotation.y = yawFacing(fwd);
  placeBodyShadow(selfVisitor, px, py, pz, yawFacing(fwd));
  const speed = Math.hypot(vx, vz);
  if (speed > 0.2) walkPhase += speed * 0.02;
  poseVisitor(selfVisitor.parts, walkPhase, speed > 0.2 ? 1 : 0);
}

function placeCamera() {
  const eyeY = py + EYE;
  const aimY = py + EYE * 0.7;
  if (thirdPerson && orbiting) {
    orbitRig.rotation.set(orbitPitch, orbitYaw, 0);
    orbitRig.updateMatrixWorld();
    orbitRig.getWorldDirection(lookDir);
    const pulled = pullCamera(px, aimY, pz, lookDir.x, lookDir.y, lookDir.z, 3.2, collide());
    let top = py + WALL_H - 0.45;
    if (insideLift()) top = Math.min(top, py + LIFT.cabH - 0.35);
    camera.position.set(pulled.x, Math.min(top, Math.max(py + 0.28, pulled.y)), pulled.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(px, aimY, pz);
    poseSelf(pulled);
    return;
  }
  if (!thirdPerson) {
    camera.position.set(px, eyeY, pz);
    if (selfVisitor) selfVisitor.group.visible = false;
    return;
  }
  camera.updateMatrixWorld();
  camera.getWorldDirection(lookDir);
  const pulled = pullCamera(px, aimY, pz, lookDir.x, lookDir.y, lookDir.z, 3.2, collide());
  let top = py + WALL_H - 0.45;
  if (insideLift()) top = Math.min(top, py + LIFT.cabH - 0.35);
  camera.position.set(pulled.x, Math.min(top, Math.max(py + 0.28, pulled.y)), pulled.z);
  poseSelf(pulled);
}

function footSurface() {
  if (lift && inLiftCar(px, pz) && Math.abs(py - lift.y) < 1.3) return "indoor";
  const support = groundAt(px, pz, py, built.floors);
  if (support == null) return "air";
  const slab = Math.round(support / STORY) * STORY;
  if (Math.abs(support - slab) > 0.12) return "stair";
  if (hallBlend(px, pz, built.interior) >= 0.42) return "indoor";
  return "plaza";
}

function liftNear() {
  if (!lift) return 0;
  if (inLiftCar(px, pz) && Math.abs(py - lift.y) < 1.3) return 1;
  const horiz = Math.hypot(px - LIFT.cx, pz - LIFT.cz);
  const dy = Math.abs(py - lift.y);
  return Math.exp(-horiz * 0.22) * Math.exp(-dy * 0.32);
}

function step(dt, now) {
  const floorNow = playerFloor();
  for (let f = 0; f < built.floors; f++) {
    const want = f === floorNow && Math.abs(py - f * STORY) < 1.35 && doorWantsOpen(px, pz, doorHeld[f]);
    doorHeld[f] = want;
    hallNear[f] = hallDoorNear(px, py, pz, f);
    const aim = want ? 1 : 0;
    doorOpen[f] += (aim - (doorOpen[f] || 0)) * (1 - Math.exp(-dt * 8));
    if (doorOpen[f] < 0.0008) doorOpen[f] = 0;
    else if (doorOpen[f] > 0.9992) doorOpen[f] = 1;
  }
  if (doors) doors.update(doorOpen);
  if (lift) {
    lift.tick(dt, holdingLiftDoor());
    if (liftDoors) {
      const opens = [];
      for (let f = 0; f < built.floors; f++) opens.push(liftOpenVisual(f));
      liftDoors.update(opens, lift.y);
    }
  }
  const locked = document.pointerLockElement === view && !corner.classList.contains("nav-open") && !visitorOut;
  document.body.classList.toggle("walking", locked);
  if (!locked) {
    vx = 0;
    vz = 0;
    if (hoverIndex >= 0) setHover(-1);
  } else {
    planarBasis(lookSource(), fwd, right);
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
    const moved = movePlayer(px, pz, vx * dt, vz * dt, PLAYER_RADIUS, collide(), py);
    px = moved.x;
    pz = moved.z;
    if (now >= hoverClock) {
      hoverClock = now + 120;
      setHover(pickFrame());
    }
  }
  settleFeet(dt);
  placeCamera();
  updatePlace();
  syncLiftHud();
  syncLiftHint();
  trackPictures();
  if (presence) presence.update(dt, now);
  if (ambience && built) {
    const indoors = hallBlend(px, pz, built.interior);
    ambience.hear(indoors);
    ambience.place({
      outdoor: 1 - indoors,
      surface: footSurface(),
      speed: Math.hypot(vx, vz),
      day: DAYS[dayCursor].id,
      dt,
      liftY: lift ? lift.y : 0,
      liftPhase: lift ? lift.phase : "idle",
      liftNear: liftNear(),
      hallHeld: doorHeld,
      hallNear,
    });
  }
}

function noteGesture() {
  heardGesture = true;
  if (ambience) ambience.unlock();
}

const fpsReadout = document.getElementById("fps");
const lagReadout = document.getElementById("lag");
let fpsCount = 0;
let fpsStamp = 0;
let lagBusy = false;
let lagNext = 0;

function noteFps(now) {
  if (!fpsReadout) return;
  fpsCount += 1;
  if (!fpsStamp) fpsStamp = now;
  const span = now - fpsStamp;
  if (span < 400) return;
  fpsReadout.textContent = Math.round((fpsCount * 1000) / span) + " 帧";
  fpsCount = 0;
  fpsStamp = now;
}

function noteLag(now) {
  if (!lagReadout || lagBusy || document.hidden || now < lagNext) return;
  lagNext = now + 2000;
  lagBusy = true;
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("_lag", String(Math.floor(now)));
  const start = performance.now();
  fetch(url, { method: "HEAD", cache: "no-store" })
    .then((res) => {
      if (res.ok) return null;
      if (res.status !== 405 && res.status !== 501) throw new Error(String(res.status));
      return fetch(url, { cache: "no-store" }).then((got) => {
        if (!got.ok) throw new Error(String(got.status));
        return got.arrayBuffer();
      });
    })
    .then(() => {
      const ms = Math.max(0, Math.round(performance.now() - start));
      lagReadout.textContent = "延迟 " + ms + " ms";
    })
    .catch(() => {
      lagReadout.textContent = "延迟 –";
    })
    .finally(() => {
      lagBusy = false;
    });
}

function makeBeacons(roof) {
  if (!roof) return null;
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x3a0a08, fog: false });
  const glow = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const y = roof.maxY + 0.45;
  const spots = [
    [roof.minX - 0.2, roof.minZ - 0.2],
    [roof.maxX + 0.2, roof.minZ - 0.2],
    [roof.minX - 0.2, roof.maxZ + 0.2],
    [roof.maxX + 0.2, roof.maxZ + 0.2],
  ];
  for (let i = 0; i < spots.length; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat);
    lamp.position.set(spots[i][0], y, spots[i][1]);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.58, 8, 6), glow);
    halo.position.copy(lamp.position);
    group.add(lamp, halo);
  }
  group.visible = false;
  return { group, mat, glow };
}

function animate(now) {
  noteFps(now);
  noteLag(now);
  if (beacons) {
    const phase = now % 1300;
    const blink = dayIsNight && (phase < 120 || (phase > 240 && phase < 360));
    beacons.group.visible = dayIsNight;
    beacons.mat.color.setHex(blink ? 0xff2a18 : 0xc41410);
    beacons.glow.opacity = blink ? 0.45 : 0.14;
  }
  const dt = Math.min(MAX_STEP, seconds(now));
  step(dt, now);
  if (horizon) horizon.drift(now);
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
  // 昵称框里从右往左拖选，松开时落点在画面上。这次不能当成点画面走进去。
  let suppressWalkClick = false;
  let draggingField = false;
  document.addEventListener("pointerdown", (event) => {
    if (draggingField) return;
    const target = event.target;
    const onField = event.button === 0 && !!(target && target.closest && target.closest("input, textarea"));
    if (!onField) suppressWalkClick = false;
    draggingField = onField;
    if (onField) suppressWalkClick = true;
  }, true);
  const releaseFieldDrag = () => {
    draggingField = false;
  };
  document.addEventListener("pointerup", releaseFieldDrag, true);
  document.addEventListener("pointercancel", releaseFieldDrag, true);
  view.addEventListener("click", () => {
    if (performance.now() < ignoreUntil) return;
    if (document.pointerLockElement !== view) return;
    const index = pickFrame();
    if (index >= 0) openFrame(index);
  });
  document.addEventListener("click", (event) => {
    noteGesture();
    const selecting = suppressWalkClick;
    if (selecting) suppressWalkClick = false;
    if (performance.now() < ignoreUntil) return;
    const gate = document.getElementById("name-gate");
    if (gate && !gate.hidden) return;
    if (selecting || interactiveTarget(event.target)) return;
    if (performance.now() < clickShieldUntil) return;
    if (document.pointerLockElement === view) return;
    enterWalk();
  }, true);
  document.addEventListener("mousemove", (event) => {
    if (draggingField) return;
    if (corner.classList.contains("nav-open")) return;
    if (document.pointerLockElement !== view) return;
    if (orbiting) {
      orbitYaw -= event.movementX * 0.0022;
      orbitPitch -= event.movementY * 0.0022;
      if (orbitPitch > 1.15) orbitPitch = 1.15;
      if (orbitPitch < -1.05) orbitPitch = -1.05;
      return;
    }
    camera.rotation.y -= event.movementX * 0.0022;
    camera.rotation.x -= event.movementY * 0.0022;
    if (camera.rotation.x > 1.15) camera.rotation.x = 1.15;
    if (camera.rotation.x < -1.15) camera.rotation.x = -1.15;
  });
  document.addEventListener("click", (event) => {
    if (performance.now() > clickShieldUntil) return;
    const target = event.target;
    if (!target || target === view) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener("keydown", (event) => {
    noteGesture();
    if (event.code === "Tab") return;
    const typing = event.target;
    if (typing && typing.closest && typing.closest("input, textarea, select")) return;
    if (typing && typing !== view && typing !== document.body && typing.blur && document.pointerLockElement === view) {
      if (typing.closest && typing.closest("button, a")) typing.blur();
    }
    if (event.code === "AltLeft" || event.code === "AltRight") {
      if (event.repeat) return;
      if (thirdPerson) {
        event.preventDefault();
        beginOrbit();
      }
      return;
    }
    if (event.code === "KeyE") {
      if (event.repeat) return;
      event.preventDefault();
      onDoorKey();
      return;
    }
    if (event.code === "KeyF") {
      if (event.repeat) return;
      event.preventDefault();
      onFloorKey();
      return;
    }
    if (event.code === "KeyV") {
      if (event.repeat) return;
      event.preventDefault();
      if (thirdPerson) endOrbit();
      thirdPerson = !thirdPerson;
      if (thirdPerson && event.altKey) beginOrbit();
      return;
    }
    if (event.code === "KeyM") {
      if (event.repeat) return;
      event.preventDefault();
      if (ambience) ambience.toggle();
      return;
    }
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
    if (event.code === "Escape") {
      if (event.repeat) return;
      escWantsCard = true;
      if (!panel.hidden) closePanel(false);
      if (document.pointerLockElement !== view) showEscCard();
      return;
    }
    if (event.repeat) return;
    down.add(event.code);
  });
  document.addEventListener("keyup", (event) => {
    if ((event.code === "AltLeft" || event.code === "AltRight") && !event.altKey) endOrbit();
    down.delete(event.code);
  });
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === view) {
      lookReleasedByPage = false;
      blurUnlock = false;
      hideEscCard();
      return;
    }
    endOrbit();
    const fromEsc = !lookReleasedByPage && !blurUnlock && document.hasFocus();
    lookReleasedByPage = false;
    blurUnlock = false;
    clickShieldUntil = performance.now() + 200;
    if (fromEsc || escWantsCard) showEscCard();
    else hideEscCard();
    // 锁定松开后，画布上的系统指针会停在一张被放大的糊图上。先换成按钮那种指针，下一帧再回到箭头，浏览器才会重新取清晰的原生光标。
    view.style.cursor = "pointer";
    requestAnimationFrame(() => {
      view.style.cursor = "auto";
    });
  });
  window.addEventListener("blur", () => {
    blurUnlock = true;
    endOrbit();
    down.clear();
  });
  panelClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePanel(true);
  });
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

function writeQuad(pos, col, index, quad, y, color) {
  for (let k = 0; k < 4; k++) {
    const vi = index * 4 + k;
    if (!quad) {
      pos.setXYZ(vi, 0, 0, 0);
      col.setXYZW(vi, 0, 0, 0, 0);
      continue;
    }
    pos.setXYZ(vi, quad.pts[k][0], y, quad.pts[k][1]);
    col.setXYZW(vi, color.r, color.g, color.b, k < 2 ? quad.near : quad.far);
  }
}

function writeNightSpill(day) {
  if (!nightSpillMesh || !built) return;
  const pos = nightSpillMesh.geometry.attributes.position;
  const col = nightSpillMesh.geometry.attributes.color;
  const quads = day.id === "night" ? nightSpillQuads(built.openings, built.dress) : [null, null];
  const color = new THREE.Color(0xd5e6f6);
  for (let i = 0; i < quads.length; i++) writeQuad(pos, col, i, quads[i], 0.05, color);
  pos.needsUpdate = true;
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

function placeShapeShadows(sun) {
  if (!shapeMat || !built) return;
  const polys = yardShadowPolys(built.yard, sun).concat(deckShadowPolys(built.lobes, sun));
  const next = shapeShadowMesh(polys, shapeMat);
  if (shapeMesh) {
    scene.remove(shapeMesh);
    shapeMesh.geometry.dispose();
  }
  shapeMesh = next;
  if (shapeMesh) scene.add(shapeMesh);
}

function applyDay(day) {
  const sun = sunVector(day);
  sunShared.dir.value.set(sun.x, sun.y, sun.z);
  sunShared.tint.value.set(day.tint);
  // 馆内只吃天花灯。室外的墙和地面仍跟这一时辰的太阳。
  sunRoles.room.tint.value.set(day.tint);
  sunRoles.glass.tint.value.set(day.tint);
  sunShared.shade.value = day.shade;
  sunRoles.ground.fill.value = day.fillGround;
  sunRoles.ground.gain.value = day.gainGround;
  sunRoles.open.fill.value = day.fillOpen;
  sunRoles.open.gain.value = day.gainOpen;
  sunRoles.room.fill.value = day.fillRoom;
  sunRoles.room.gain.value = day.gainRoom;
  sunRoles.glass.fill.value = day.fillGlass;
  sunRoles.glass.gain.value = day.gainGlass;
  const skyline = new THREE.Color(day.horizon);
  scene.background.copy(skyline);
  scene.fog.color.copy(skyline);
  renderer.setClearColor(skyline);
  document.body.style.background = skyline.getStyle();
  document.body.classList.toggle("dark-sky", day.id === "night");
  dayIsNight = day.id === "night";
  writeNightSpill(day);
  paintSky(day);
  sunMesh.material.color.set(day.sun);
  sunMesh.position.set(sun.x, sun.y, sun.z).multiplyScalar(SUN_FAR);
  sunMesh.scale.setScalar(day.disc);
  setFacadeSignNight(day.id === "night" || day.id === "dusk");
  if (nightCeilMat) nightCeilMat.color.setHex(0x2c2c31);
  if (nightCeilPlateMat) nightCeilPlateMat.color.setHex(0x2c2c31);
  if (nightBeamMat) nightBeamMat.color.setHex(0x1c1c20);
  if (shadowMat) shadowMat.opacity = 1 - day.shade;
  if (shapeMat) shapeMat.opacity = 1 - day.shade;
  placeShapeShadows(sun);
  if (horizon && horizon.glow) horizon.glow.color.set(WINDOW_GLOW[day.id] || WINDOW_GLOW.noon);
  // 门口光斑是室外太阳投进来的。馆内改由天花灯照，地面不再铺这条亮带。
  writePatches({ streak: 0x000000, streakGain: 0 }, sun);
  if (dropMesh && dropItems) placeDropShadows(dropMesh, dropItems, sun);
  if (bodyRoom) setBodyLight(sun, bodyRoom);
}

// 布置阶段先把馆内、门口和轿厢各画一次到离屏目标，着色器和网格在进门前就编译好。
function warmPrograms() {
  const target = new THREE.WebGLRenderTarget(8, 8);
  const prevTarget = renderer.getRenderTarget();
  const pose = camera.position.clone();
  const rx = camera.rotation.x;
  const ry = camera.rotation.y;
  const rz = camera.rotation.z;
  const shots = [
    [0, EYE, 1.1, 0, EYE, -12],
    [0, EYE, 1.1, 0, EYE, 6],
    [LIFT.xDoor + 1.1, EYE, LIFT.cz, LIFT.xInner + 0.4, EYE, LIFT.cz],
  ];
  try {
    renderer.setRenderTarget(target);
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      camera.position.set(s[0], s[1], s[2]);
      camera.rotation.set(0, 0, 0);
      camera.lookAt(s[3], s[4], s[5]);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
    }
  } finally {
    camera.position.copy(pose);
    camera.rotation.set(rx, ry, rz);
    camera.updateMatrixWorld();
    renderer.setRenderTarget(prevTarget);
    target.dispose();
  }
}

function buildScene(data, arrange) {
  sites = data.sites;
  built = buildMuseum(sites, arrange);
  const lamps = lampTexture(built.cones.concat(built.leds, built.sconces));
  bodyRoom = {
    minX: Math.min(built.interior.minX, LIFT.xRear) - 0.35,
    maxX: built.interior.maxX + 0.25,
    minZ: built.interior.minZ - 0.2,
    maxZ: built.interior.maxZ + 0.7,
    maxY: 1e9,
  };
  sunShared = {
    dir: { value: new THREE.Vector3(0, 1, 0) },
    tint: { value: new THREE.Color(0xffffff) },
    block: { value: new THREE.Vector4() },
    front: { value: PLAZA.minZ },
    roof: { value: 6.5 },
    shade: { value: 0.42 },
    slab: { value: new THREE.Vector4() },
    slabY: { value: 0 },
    lamps: { value: lamps.tex },
    lampInv: { value: new THREE.Vector2(1 / lamps.cols, 1 / lamps.floors) },
    story: { value: STORY },
    lampTint: { value: new THREE.Color(0xfff4e4) },
    roomBox: { value: new THREE.Vector4(bodyRoom.minX, bodyRoom.maxX, bodyRoom.minZ, bodyRoom.maxZ) },
  };
  const role = () => ({ fill: { value: 1 }, gain: { value: 0 }, cast: { value: 0 }, lamps: { value: 0 } });
  sunRoles = { ground: role(), open: role(), room: role(), glass: role(), body: role() };
  sunRoles.room.tint = { value: new THREE.Color(0xfff4e4) };
  sunRoles.glass.tint = { value: new THREE.Color(0xffffff) };
  sunRoles.body.fill = sunRoles.open.fill;
  sunRoles.body.gain = sunRoles.open.gain;
  sunRoles.room.lamps.value = 1;
  sunRoles.glass.lamps.value = 2;
  sunRoles.body.lamps.value = 2;
  sunRoles.ground.cast.value = 1;
  const roof = built.dress.find((item) => item.kind === "roof");
  const shell = built.shell;
  sunShared.block.value.set(shell.minX, shell.maxX, shell.minZ, shell.maxZ);
  sunShared.roof.value = shell.top;
  sunShared.slab.value.set(roof.minX, roof.maxX, roof.minZ, roof.maxZ);
  sunShared.slabY.value = roof.maxY;
  bodyRoom.maxY = sunShared.roof.value - 1;

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

  const stoneColor = 0xe5e0d6;
  const stoneMat = lit(stoneColor, "open");
  const whiteMat = lit(0xf7f5f2, "room");
  const curbMat = lit(0xc8c4bb, "open");
  const floorMat = lit(0xc5c8cc, "ground");
  // 深灰 0x3e4248 朝白走到一半是 0x9fa1a4。再往回收大约四分之一。
  const storyFloor = 0x86898d;
  const roomMat = lit(stoneColor, "room");
  const ceilMat = lit(0x2c2c31, "room");
  nightCeilMat = ceilMat;
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
  nightBeamMat = beamMat;
  const glassMat = lit(0xb5d0de, "glass", {
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // 正门和电梯门都整扇留在墙槽里，材质不往镜头偏，否则会穿出盖住槽的墙皮。
  const doorGlass = lit(0xc5dde8, "glass", {
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const doorFrame = lit(0x4c5550, "room");
  // 光锥在人走进光池时仍要看得见，所以双面、不写深度。不参与阳光，避免锥面被切成明暗条。
  coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff1dc,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  discMat = new THREE.MeshBasicMaterial({
    color: 0xfff3e4,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const stone = wallMesh(built.stone, stoneMat);
  const cornerMat = lit(0xe5e0d6, "open", {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const cornerMesh = wallMesh(built.corners, cornerMat);
  const bandMat = lit(0x7a4036, "open", {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const bandMesh = boxMesh(built.bandCorners, bandMat);
  const inner = wallMesh(built.white.concat(built.liners), whiteMat);
  const curb = wallMesh(built.curb, curbMat);
  if (stone) scene.add(stone);
  if (cornerMesh) scene.add(cornerMesh);
  if (bandMesh) scene.add(bandMesh);
  if (inner) scene.add(inner);
  if (curb) scene.add(curb);
  const level = floorAndCeiling(built.bounds, floorMat, ceilMat, null, roomMat);
  scene.add(level.floor);
  const plazaMark = 0xa8adb2;
  const pathMat = lit(plazaMark, "ground", {
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  horizon = horizonMeshes({
    grass: lit(0x6f8b58, "ground"),
    water: lit(0x5e93a6, "open"),
    path: pathMat,
    disc: lit(plazaMark, "ground", {
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    plaster: lit(0xffffff, "open"),
    roof: lit(0xffffff, "open"),
    glass: lit(0x6d8494, "open"),
    glow: new THREE.MeshBasicMaterial({
      color: WINDOW_GLOW.noon,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    hill: lit(0xffffff, "open"),
    cloud: lit(0xf7f4ee, "open", { transparent: true, opacity: 0.78, depthWrite: false }),
  });
  scene.add(horizon.root);
  const yard = yardMeshes(
    built.yard,
    lit(0x6b5142, "open"),
    lit(0x3f6a45, "open"),
    lit(0x4f7c52, "open"),
    lit(0xa68462, "open"),
  );
  if (yard) scene.add(yard);
  const stepMat = lit(0xd9d0c4, "room");
  const railMat = lit(0x5e6764, "open");
  const woodMat = lit(0xa67c52, "room");
  const byKind = {
    lattice: latticeMat,
    fin: finMat,
    groove: grooveMat,
    roof: roofMat,
    beam: beamMat,
    glass: glassMat,
    step: stepMat,
    rail: railMat,
    wood: woodMat,
  };
  const kinds = ["lattice", "fin", "groove", "roof", "beam", "glass", "step", "rail", "wood"];
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k];
    const items = built.dress.filter((item) => item.kind === kind);
    const mesh = kind === "glass" ? paneMesh(items, byKind[kind]) : boxMesh(items, byKind[kind]);
    if (!mesh) continue;
    if (kind === "glass") mesh.renderOrder = 3;
    scene.add(mesh);
  }
  const plateMat = lit(storyFloor, "room", {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const ceilPlateMat = lit(0x2c2c31, "room", {
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  nightCeilPlateMat = ceilPlateMat;
  const storySlabs = plateMesh(built.floorPlates, plateMat);
  const storyCeils = plateMesh(built.ceilPlates, ceilPlateMat, plateMat);
  if (storySlabs) scene.add(storySlabs);
  if (storyCeils) scene.add(storyCeils);
  const props = lobbyPropMeshes(built.extinguishers, built.tables, {
    red: lit(0xc52828, "room"),
    metal: lit(0x2a2c2e, "room"),
    wood: woodMat,
    chair: lit(0xffffff, "room"),
    vase: lit(0xf3f0ea, "room"),
    stem: leafMat,
    flowers: [lit(0xd24b4b, "room"), lit(0xe7c14a, "room"), lit(0xf4f1ea, "room"), lit(0xd46a8c, "room")],
  });
  if (props) scene.add(props);
  const deckShellMat = lit(stoneColor, "open", {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const lobes = lobeMeshes(built.lobes, plateMat, deckShellMat);
  if (lobes) scene.add(lobes);
  const hands = handrailMesh(built.handrails, woodMat);
  if (hands) scene.add(hands);
  const labels = labelMeshes(built.signs);
  if (labels) scene.add(labels);
  const deckRail = deckRailMesh(built.lobes, glassMat, railMat);
  if (deckRail) scene.add(deckRail);
  doorOpen = new Array(built.floors).fill(0);
  doorHeld = new Array(built.floors).fill(false);
  doors = doorRig(doorGlass, doorFrame, built.floors);
  doors.update(doorOpen);
  scene.add(doors.root);
  lift = createLift(built.floors, STORY);
  liftDoors = liftRig(doorGlass, doorFrame, roomMat, ceilMat, built.floors, plateMat);
  liftDoors.update(doorOpen, 0);
  scene.add(liftDoors.root);
  fillLiftPad();
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
  const indoorShadow = softShadowMaterial(0.55);
  if (built.plants.length) {
    const plants = plantMeshes(built.plants, potMat, leafMat);
    if (plants.pots) scene.add(plants.pots);
    for (let i = 0; i < plants.leaves.length; i++) if (plants.leaves[i]) scene.add(plants.leaves[i]);
    const plantShade = softShadowMaterial(0.6, true);
    shadowMesh = plantShadowMesh(built.plants, plantShade);
    if (shadowMesh) {
      placePlantShadows(shadowMesh, built.plants, 1.7);
      scene.add(shadowMesh);
    }
  }
  const frameShade = frameShadowMesh(built.frames, indoorShadow);
  if (frameShade) scene.add(frameShade);
  const contactShadow = softShadowMaterial(0.55, true);
  const indoorDrops = [];
  for (let i = 0; i < built.extinguishers.length; i++) {
    const item = built.extinguishers[i];
    indoorDrops.push({ x: item.x, z: item.z, rx: 0.32, rz: 0.26, h: 0.7, y: item.y + 0.055 });
  }
  for (let i = 0; i < built.tables.length; i++) {
    const table = built.tables[i];
    indoorDrops.push({ x: table.x, z: table.z, rx: 0.98, rz: 0.98, h: 0.9, y: table.y + 0.055 });
    indoorDrops.push({ x: table.x - 1.32, z: table.z, rx: 0.46, rz: 0.4, h: 0.85, y: table.y + 0.055 });
    indoorDrops.push({ x: table.x + 1.32, z: table.z, rx: 0.46, rz: 0.4, h: 0.85, y: table.y + 0.055 });
  }
  const indoorDropMesh = dropShadowMesh(indoorDrops.length, contactShadow);
  if (indoorDropMesh) {
    placeDropShadows(indoorDropMesh, indoorDrops, null);
    scene.add(indoorDropMesh);
  }
  dropItems = horizon && horizon.shadows ? horizon.shadows.slice() : [];
  shapeMat = shapeShadowMaterial(1 - DAYS[dayCursor].shade);
  if (dropItems.length) {
    shadowMat = castShadowMaterial(1 - DAYS[dayCursor].shade);
    dropMesh = dropShadowMesh(dropItems.length, shadowMat);
    if (dropMesh) scene.add(dropMesh);
  }
  patchMesh = sunPatchMesh(built.openings.length);
  scene.add(patchMesh);
  nightSpillMesh = sunPatchMesh(2);
  scene.add(nightSpillMesh);
  beacons = makeBeacons(built.dress.find((item) => item.kind === "roof"));
  if (beacons) scene.add(beacons.group);
  const cones = lightConeMesh(built.cones, coneMat);
  const discs = floorDiscMesh(built.cones, discMat);
  const heads = spotHeadMesh(
    built.cones,
    beamMat,
    lit(0xd5cfc6, "room"),
  );
  if (cones) scene.add(cones);
  if (discs) scene.add(discs);
  if (heads) scene.add(heads);
  const ledGlow = new THREE.MeshBasicMaterial({ color: 0xe8c98a });
  const ledPool = new THREE.MeshBasicMaterial({
    color: 0xf0ddb8,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sconceShade = new THREE.MeshBasicMaterial({ color: 0xf0d7a4, side: THREE.DoubleSide });
  const sconceWash = new THREE.MeshBasicMaterial({
    color: 0xf0d2a4,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const sconcePool = new THREE.MeshBasicMaterial({
    color: 0xf3ddb4,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const leds = ledRig(built.leds, lit(0xc8bba6, "room"), ledGlow, ledPool);
  const sconces = sconceRig(built.sconces, lit(0xa67c3d, "room"), sconceShade, sconceWash, sconcePool);
  if (leds) scene.add(leds);
  if (sconces) scene.add(sconces);
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
  if (params.has("preview") && built.frames.length) {
    const frame = built.frames[Math.min(24, built.frames.length - 1)];
    px = frame.x;
    pz = frame.z + frame.nz * 4.8;
    py = frame.y - EYE;
    camera.position.set(px, py + EYE, pz);
    camera.lookAt(frame.x, frame.y, frame.z);
  }
  if (params.has("x")) px = Number(params.get("x"));
  if (params.has("z")) pz = Number(params.get("z"));
  if (params.has("car") && lift) {
    const level = Number(params.get("car"));
    if (Number.isFinite(level)) {
      lift.place(level);
      if (!params.has("y")) py = lift.y;
    }
  }
  if (params.has("y")) py = Number(params.get("y"));
  if (params.has("x") || params.has("z") || params.has("y") || params.has("car")) camera.position.set(px, py + EYE, pz);
  if (params.has("yaw")) {
    camera.rotation.y = Number(params.get("yaw")) * Math.PI / 180;
    camera.rotation.x = Number(params.get("pitch") || 0) * Math.PI / 180;
  }
  const visitorMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  attachSun(visitorMat, sunShared, sunRoles.body);
  const visitorShadow = softShadowMaterial(0.5);
  selfVisitor = createVisitor(visitorMat, visitorShadow);
  selfVisitor.group.visible = false;
  scene.add(selfVisitor.group);
  presence = mountPresence({
    scene,
    material: visitorMat,
    shadowMaterial: visitorShadow,
    bounds: built.bounds,
    interior: built.interior,
    zones: built.zones,
    onReleaseLook: releaseLook,
    getPose: () => {
      planarBasis(lookSource(), fwd, right);
      return { x: px, z: pz, y: py, yaw: yawFacing(fwd) };
    },
    onTyping: (active) => {
      if (active) down.clear();
    },
    onGate: (open) => {
      if (open) showEscCard();
      else hideEscCard();
    },
    onKick: (active) => {
      visitorOut = !!active;
      if (active) releaseLook();
    },
    onMusic: (view) => {
      if (ambience) ambience.follow(view);
    },
    onExclusive: (which) => {
      if (which === "roster") closeLiftPad();
    },
    onNav: (open) => {
      parkFocus();
      if (open) {
        down.clear();
        if (document.pointerLockElement === view) {
          navHoldsLook = true;
          clickShieldUntil = performance.now() + 200;
          releaseLook();
        }
        return;
      }
      if (!navHoldsLook) return;
      navHoldsLook = false;
      requestWalk();
    },
  });
  prepareAtlases();
  resize();
  shownFloor = playerFloor();
  if (params.get("person") === "3") thirdPerson = true;
  if (params.has("nav")) {
    const toggle = document.getElementById("drawer-toggle");
    if (toggle) toggle.click();
  }
  trackPictures();
  ambience = createAmbience();
  if (heardGesture) ambience.unlock();
  try {
    warmPrograms();
  } catch {
    /* 预热失败也要能进馆。 */
  }
  let warmed = Promise.resolve();
  try {
    if (typeof renderer.compileAsync === "function") warmed = renderer.compileAsync(scene, camera);
  } catch {
    warmed = Promise.resolve();
  }
  const cap = new Promise((resolve) => window.setTimeout(resolve, 5000));
  const reveal = () => {
    if (reveal.done) return;
    reveal.done = true;
    renderer.setRenderTarget(null);
    resize();
    loading.hidden = true;
    hideEscCard();
    where.hidden = false;
    crosshair.hidden = false;
    requestAnimationFrame(animate);
  };
  Promise.race([Promise.resolve(warmed), cap]).then(reveal, reveal);
}

function yieldTurn(fn) {
  requestAnimationFrame(() => {
    window.setTimeout(fn, 0);
  });
}

function dropQueued() {
  const keep = [];
  for (let i = 0; i < loadWait.length; i++) {
    const job = loadWait[i];
    if (job.token === buildSerial) keep.push(job);
    else {
      if (imageCache.get(job.url) === job.pending) imageCache.delete(job.url);
      job.resolve(null);
    }
  }
  loadWait = keep;
}

function pumpLoads() {
  if (loadPumping) return;
  loadPumping = true;
  while (loadActive < LOAD_CAP && loadWait.length) {
    const job = loadWait.shift();
    if (job.token !== buildSerial) {
      if (imageCache.get(job.url) === job.pending) imageCache.delete(job.url);
      job.resolve(null);
      continue;
    }
    loadActive += 1;
    const finish = (value) => {
      loadActive -= 1;
      job.resolve(value);
      loadPumping = false;
      pumpLoads();
    };
    fetch(job.url, { mode: "cors" })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || typeof createImageBitmap !== "function") return null;
        return createImageBitmap(blob);
      })
      .then((bmp) => finish(bmp && bmp.width > 0 ? bmp : null))
      .catch(() => finish(null));
  }
  loadPumping = false;
}

function loadImage(url) {
  const cached = imageCache.get(url);
  if (cached) return cached;
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const job = { url, resolve, token: buildSerial, pending };
  imageCache.set(url, pending);
  loadWait.push(job);
  pumpLoads();
  return pending.then((bmp) => {
    if (!bmp && imageCache.get(url) === pending) imageCache.delete(url);
    return bmp;
  });
}

function markPictures(count) {
  document.documentElement.dataset.frames = "ready";
  document.documentElement.dataset.pictures = String(count);
}

function floorPictureJobs(floor) {
  const jobs = [];
  if (!built || floor < 0 || floor >= built.floors) return jobs;
  const frames = built.frames;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].floor !== floor) continue;
    const site = sites[frames[i].siteIndex];
    const src = usableFrameImage(site && site.image);
    if (src) jobs.push({ index: i, src });
  }
  return jobs;
}

function blankUv() {
  const uv = new Float32Array(built.frames.length * 4);
  const cell = cellUv(0, 0, atlasGridSize.cols, atlasGridSize.rows);
  for (let i = 0; i < built.frames.length; i++) uv.set(cell, i * 4);
  return uv;
}

function prepareAtlases() {
  let most = 1;
  for (let f = 0; f < built.floors; f++) {
    const n = floorPictureJobs(f).length;
    if (n > most) most = n;
  }
  const maxSize = Math.min(renderer.capabilities.maxTextureSize || 4096, 4096);
  const grid = atlasGrid(most + 1, maxSize);
  grid.cellW = Math.max(4, Math.floor(grid.cellW / 4) * 4);
  grid.cellH = Math.max(2, Math.floor(grid.cellH / 2) * 2);
  atlasGridSize = grid;
  const w = grid.cols * grid.cellW;
  const h = grid.rows * grid.cellH;
  for (let s = 0; s < 2; s++) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#f7f5f2";
    ctx.fillRect(0, 0, w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    renderer.initTexture(texture);
    texture.needsUpdate = false;
    atlasSlots.push({ canvas, ctx, texture, w, h });
  }
  const strip = document.createElement("canvas");
  strip.width = w;
  strip.height = 128;
  const stripTex = new THREE.CanvasTexture(strip);
  stripTex.generateMipmaps = false;
  stripTex.minFilter = THREE.LinearFilter;
  stripTex.magFilter = THREE.LinearFilter;
  atlasSlots.strip = strip;
  atlasSlots.stripTex = stripTex;
  atlasSlots.stripCtx = strip.getContext("2d", { alpha: false });
  const attr = new THREE.InstancedBufferAttribute(blankUv(), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  mats.geometry.setAttribute("frameUv", attr);
  mats.material.map = atlasSlots[0].texture;
  mats.material.needsUpdate = true;
  const white = new THREE.Color("#ffffff");
  for (let i = 0; i < built.frames.length; i++) {
    baseColors[i].copy(white);
    hoverColors[i].copy(white);
    mats.setColorAt(i, white);
  }
  mats.instanceColor.needsUpdate = true;
  shownAtlas = 0;
  pictureGrid = grid;
}

function applyAtlas(pack) {
  const attr = mats.geometry.getAttribute("frameUv");
  if (!attr) return;
  attr.array.set(pack.uv);
  attr.needsUpdate = true;
  if (mats.material.map !== pack.texture) mats.material.map = pack.texture;
  pictureGrid = atlasGridSize;
  shownAtlas = pack.slot;
  markPictures(pack.count);
}

function claimSlot() {
  const slot = shownAtlas === 0 ? 1 : 0;
  for (const [floor, pack] of atlasReady) {
    if (pack.slot === slot) atlasReady.delete(floor);
  }
  return slot;
}

function uploadBands(token, canvas, texture, done) {
  const band = 24;
  let y = 0;
  const strip = atlasSlots.strip;
  const stripTex = atlasSlots.stripTex;
  const sctx = atlasSlots.stripCtx;
  const step = () => {
    if (token !== buildSerial) return;
    const h = Math.min(band, canvas.height - y);
    if (strip.height !== h) strip.height = h;
    sctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    renderer.copyTextureToTexture(stripTex, texture, null, { x: 0, y: canvas.height - y - h });
    y += h;
    if (y < canvas.height) {
      yieldTurn(step);
      return;
    }
    done();
  };
  yieldTurn(step);
}

function drawCover(ctx, img, ox, oy, cellW, cellH) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const fit = coverRect(srcW, srcH, cellW, cellH);
  const dx = ox + fit.x;
  const dy = oy + fit.y;
  const x0 = Math.max(dx, ox);
  const y0 = Math.max(dy, oy);
  const x1 = Math.min(dx + fit.w, ox + cellW);
  const y1 = Math.min(dy + fit.h, oy + cellH);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return;
  const sx = ((x0 - dx) / fit.w) * srcW;
  const sy = ((y0 - dy) / fit.h) * srcH;
  const sw = ((x1 - x0) / fit.w) * srcW;
  const sh = ((y1 - y0) / fit.h) * srcH;
  ctx.drawImage(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
}

function paintIntoSlot(token, floor, pictures, fallback) {
  if (token !== buildSerial || !mats) return;
  const slot = claimSlot();
  const holder = atlasSlots[slot];
  const grid = atlasGridSize;
  const uv = blankUv();
  let cursor = 0;
  let clearY = 0;
  let planted = !fallback;
  const step = () => {
    if (token !== buildSerial) return;
    if (clearY < holder.h) {
      const h = Math.min(128, holder.h - clearY);
      holder.ctx.fillStyle = "#f7f5f2";
      holder.ctx.fillRect(0, clearY, holder.w, h);
      clearY += h;
      yieldTurn(step);
      return;
    }
    // 第 0 格是占位图。没配图或没拉下来的画框都指着它，不各占一格。
    if (!planted) {
      drawCover(holder.ctx, fallback, 0, 0, grid.cellW, grid.cellH);
      planted = true;
      yieldTurn(step);
      return;
    }
    if (cursor < pictures.length) {
      const picture = pictures[cursor];
      const cell = cursor + 1;
      const col = cell % grid.cols;
      const row = Math.floor(cell / grid.cols);
      drawCover(holder.ctx, picture.img, col * grid.cellW, row * grid.cellH, grid.cellW, grid.cellH);
      uv.set(cellUv(col, row, grid.cols, grid.rows), picture.index * 4);
      cursor += 1;
      yieldTurn(step);
      return;
    }
    uploadBands(token, holder.canvas, holder.texture, () => {
      if (token !== buildSerial) return;
      const pack = { floor, texture: holder.texture, uv, slot, count: pictures.length };
      atlasReady.set(floor, pack);
      if (revealFloor === floor) applyAtlas(pack);
    });
  };
  yieldTurn(step);
}

// 这一层的图进了缓存之后，再去要楼上和楼下。不占图集，电梯里也不走这里。
function prefetchAround(floor) {
  if (prefetchFloor === floor) return;
  prefetchFloor = floor;
  const up = floorPictureJobs(floor + 1);
  const down = floorPictureJobs(floor - 1);
  const n = Math.max(up.length, down.length);
  for (let i = 0; i < n; i++) {
    if (i < up.length) loadImage(up[i].src);
    if (i < down.length) loadImage(down[i].src);
  }
}

function startBuild(floor, showWhenDone) {
  if (!built || floor < 0 || floor >= built.floors) return;
  if (showWhenDone) revealFloor = floor;
  const cached = atlasReady.get(floor);
  if (cached) {
    if (revealFloor === floor) applyAtlas(cached);
    if (showWhenDone) prefetchAround(floor);
    return;
  }
  const token = ++buildSerial;
  dropQueued();
  const jobs = floorPictureJobs(floor);
  const pictures = [];
  let fallback = null;
  let left = jobs.length + (FALLBACK_SRC ? 1 : 0);
  if (!left) {
    commitPlain(floor);
    if (showWhenDone) prefetchAround(floor);
    return;
  }
  const finish = () => {
    if (token !== buildSerial) return;
    left -= 1;
    if (left > 0) return;
    if (showWhenDone) prefetchAround(floor);
    if (!pictures.length && !fallback) {
      commitPlain(floor);
      return;
    }
    paintIntoSlot(token, floor, pictures, fallback);
  };
  if (FALLBACK_SRC) {
    loadImage(FALLBACK_SRC).then((img) => {
      if (token !== buildSerial) return;
      fallback = img;
      finish();
    });
  }
  for (let i = 0; i < jobs.length; i++) {
    loadImage(jobs[i].src).then((img) => {
      if (token !== buildSerial) return;
      if (img) pictures.push({ index: jobs[i].index, img });
      finish();
    });
  }
}

function commitPlain(floor) {
  const slot = claimSlot();
  const pack = { floor, texture: atlasSlots[slot].texture, uv: blankUv(), slot, count: 0 };
  atlasReady.set(floor, pack);
  if (revealFloor === floor) applyAtlas(pack);
  else markPictures(0);
}

function trackPictures() {
  if (!built) return;
  const riding = !!(lift && inLiftCar(px, pz) && lift.phase === "moving");
  if (riding) {
    const dest = lift.dest;
    if (dest === pictureAim) return;
    pictureAim = dest;
    revealFloor = -1;
    startBuild(dest, false);
    return;
  }
  const standing = playerFloor();
  shownFloor = standing;
  if (pictureAim !== standing) {
    pictureAim = standing;
    revealFloor = standing;
    startBuild(standing, true);
    return;
  }
  revealFloor = standing;
  const pack = atlasReady.get(standing);
  if (pack && mats && mats.material.map !== pack.texture) applyAtlas(pack);
  if (pack) prefetchAround(standing);
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

function arrangeAddress() {
  const host = location.hostname;
  if (host === "127.0.0.1" || host === "localhost") return location.origin + "/lobby/arrange";
  const custom = new URLSearchParams(location.search).get("lobby");
  if (custom && /^(https?|wss?):\/\//.test(custom)) {
    const base = custom.replace(/^ws/i, "http").replace(/\/lobby\/?$/, "");
    return base.replace(/\/$/, "") + "/lobby/arrange";
  }
  return "https://lobby.youquhome.com/lobby/arrange";
}

function loadArrange() {
  return fetch(arrangeAddress(), { cache: "no-store", signal: AbortSignal.timeout(4000) })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

fetch("data/sites.json")
  .then((res) => {
    if (!res.ok) throw new Error("sites.json " + res.status);
    return res.json();
  })
  .then((data) => loadArrange().then((arrange) => buildScene(data, arrange)))
  .catch(() => showFatal("展品清单没有读到。请先运行 node tools/fetch-sites.mjs"));
