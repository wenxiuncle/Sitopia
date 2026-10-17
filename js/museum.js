import * as THREE from "../vendor/three.module.js";
import { createAmbience } from "./ambience.js";
import { createVisitor, placeBodyShadow, poseVisitor, setBodyLight } from "./avatar.js";
import { planarBasis, yawFacing } from "./basis.js";
import { CITY_SHADOW_MAX, DAYS, dayIndex, findDay, nightSpillQuads, openingQuads, shapeShadowOpacity, sunVector } from "./day.js";
import { createLift } from "./lift.js";
import {
  DOOR,
  EYE,
  FRAME,
  HALLS,
  LIFT,
  PLAYER_RADIUS,
  STORY,
  WALL_H,
  buildMuseum,
  hangOrder,
  liftFloorLabel,
  retitleFloors,
  blocksLiftDoor,
  doorBoxes,
  doorWantsOpen,
  groundAt,
  hallDoorNear,
  receptionHome,
  hallBlend,
  inLiftCar,
  liftDoorBoxes,
  blocked,
  movePlayer,
  nearLiftHall,
  pullCamera,
  zoneAt,
} from "./layout.js";
import { hasEnteredName, mountPresence, readSortMode } from "./presence.js";
import { aimRobot, createReceptionState, receptionBody, releaseRobotHeading, rememberRobotHeading, stepReception, stepYaw, turnRobot, yawAt } from "./reception.js";
import { createReception } from "./robot.js";
import {
  attachFramePicture,
  attachSun,
  atlasGrid,
  boxMesh,
  cellUv,
  colliderLines,
  containRect,
  FALLBACK_FRAME_IMAGE,
  usableFrameImage,
  doorRig,
  floorAndCeiling,
  deckRailMesh,
  floorDiscMesh,
  allocFrameMeshes,
  writeFrameMeshes,
  finishFrameMeshes,
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
const JUMP_V = 5.4;
const GRAVITY = 18;
const MAX_STEP = 0.05;
const params = new URLSearchParams(location.search);

const view = document.getElementById("view");
const loading = document.getElementById("loading");
const loadingLabel = document.getElementById("loading-label");
const loadingBar = document.getElementById("loading-bar");
const loadingMeter = document.getElementById("loading-meter");
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
const guestbook = document.getElementById("guestbook");
const guestbookHint = document.getElementById("guestbook-hint");
const guestbookForm = document.getElementById("guestbook-form");
const guestbookText = document.getElementById("guestbook-text");
const guestbookList = document.getElementById("guestbook-list");
const guestbookPage = document.getElementById("guestbook-page");
const guestbookPrev = document.getElementById("guestbook-prev");
const guestbookNext = document.getElementById("guestbook-next");
const guestbookClose = document.getElementById("guestbook-close");
const guestbookTabPlan = document.getElementById("guestbook-tab-plan");
const guestbookTabNotes = document.getElementById("guestbook-tab-notes");
const guestbookPlan = document.getElementById("guestbook-plan");
const guestbookPlanScroll = document.getElementById("guestbook-plan-scroll");
const guestbookNotes = document.getElementById("guestbook-notes");
const guestbookReplying = document.getElementById("guestbook-replying");
const guestbookReplyCancel = document.getElementById("guestbook-reply-cancel");
const NOTE_PAGE = 10;
const NOTES_KEY = "quzhan-museum-notes";
const receptionHomePose = receptionHome();
const receptionState = createReceptionState(receptionHomePose);
const receptionFollow = { x: receptionHomePose.x, z: receptionHomePose.z, yaw: receptionHomePose.yaw };
const receptionRender = { x: receptionHomePose.x, z: receptionHomePose.z, yaw: receptionHomePose.yaw };
let reception = null;
let receptionDriver = "";
let sharedNotes = [];
let localNotes = readLocalNotes();
let notesShared = false;
let notePage = 0;
let noteWait = 0;
let replyTo = "";
let hoverRobot = false;
let planSig = "";
let planSeenFloor = -2;
let planPeopleKey = "";
let guestPlaceKey = "";
let remoteFace = null;
let robotLookHeld = false;
let framePickDist = Infinity;
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
let hangArrange = null;
let hangSort = "cat";
let mats = null;
let baseColors = [];
let hoverColors = [];
let hoverIndex = -1;
let ignoreUntil = 0;
let vx = 0;
let vy = 0;
let vz = 0;
let px = 0;
let py = 0;
let pz = 0;
let airborne = false;
let takeoffY = 0;
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
let liftShared = false;
const liftWish = new Map();
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
let floorLoaded = -2;
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
let pictureFloor = -2;
let pictureToken = 0;
let pictureDefer = null;
let horizon = null;

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.body.classList.add("opening");

const scene = new THREE.Scene();
const bootNoon = findDay("noon");
renderer.setClearColor(bootNoon.horizon);
scene.background = new THREE.Color(bootNoon.horizon);
scene.fog = new THREE.Fog(bootNoon.horizon, 60, 420);
document.body.style.background = "#" + bootNoon.horizon.toString(16).padStart(6, "0");

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
camera.rotation.order = "YXZ";

let loadProgress = 0;
let loadPace = true;
let loadCeil = 0.08;
let paceBoot = false;
let hallReady = false;
let framesReady = false;
let beginHang = () => {};
let nameCommitted = false;
let vistaRun = false;
let vistaBegun = false;
let vistaNow = 0;
let vistaStamp = 0;
let vistaT0 = 0;
let entryView = null;
let parkFresh = null;
const VISTA_LEG = 20000;
const VISTA_STEP = 32;
// 起名后从当前远景滑到出生点。二次缓出：开头快，收尾速度落到零，才接得上静止的出生画面。
const ARRIVE_MS = 2400;
const ARRIVE_STEP = 32;
let arriveFromGate = false;
let arrivalQueued = false;
let arrivalRun = false;
let hallVeiled = false;
let arrivalStamp = 0;
let arrivalNow = 0;
let arrivalT0 = 0;
const arrivalFromPos = new THREE.Vector3();
const arrivalToPos = new THREE.Vector3();
const arrivalFromQuat = new THREE.Quaternion();
const arrivalToQuat = new THREE.Quaternion();

// 这些刻度是这一段真正做完时的位置。条跟着刻度走，不再在半路停住再跳到头。
// 外立面一出来就开始画，进度条盖在楼上。画框不占这条。
const LOAD_LIST = 0.10;
const LOAD_ARRANGE = 0.14;
const LOAD_LAYOUT = 0.24;
const LOAD_SHELL = 0.46;
const LOAD_INDOOR = 0.78;

function setLoadProgress(value) {
  const next = Math.max(loadProgress, Math.min(1, value));
  if (Math.abs(next - loadProgress) < 0.0001) return;
  loadProgress = next;
  if (loadingBar) loadingBar.style.transform = "scaleX(" + loadProgress + ")";
  if (loadingMeter) loadingMeter.setAttribute("aria-valuenow", String(Math.round(loadProgress * 100)));
}

function loadSpan(from, to, done, total) {
  const n = total > 0 ? total : 1;
  const u = Math.max(0, Math.min(1, done / n));
  setLoadProgress(from + (to - from) * u);
}

// 等网络时只在这一段里慢慢走，到不了下一段。布置一开始就停，改由每一步自己报进度。
function pumpLoad() {
  if (!loadPace) return;
  if (loadProgress < loadCeil) setLoadProgress(Math.min(loadCeil, loadProgress + 0.0025));
  requestAnimationFrame(pumpLoad);
}

function yieldPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

function showFatal(message) {
  loadPace = false;
  loading.classList.remove("is-leaving");
  loading.hidden = false;
  if (loadingLabel) loadingLabel.textContent = message;
  else loading.textContent = message;
}

resize();
renderer.clear();
setLoadProgress(0.02);
requestAnimationFrame(pumpLoad);

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeGuestbook();
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
  if (guestbook.hidden) document.body.classList.remove("reading");
  if (!relock || corner.classList.contains("nav-open")) return;
  requestWalk();
}

function interactiveTarget(target) {
  return !!(target && target.closest && target.closest(
    "#panel, #guestbook, #roster, #drawer, #name-gate, #kick-gate, #chat-bar, #lift-pad, #boot, #day, #hud-row, #drawer-toggle, #map-card, #map-switch, a, button, input, textarea, label",
  ));
}

function enterWalk() {
  hideEscCard();
  if (presence) presence.dismiss(true);
  closePanel(false);
  closeGuestbook(false);
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

function readLocalNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length && out.length < 200; i++) {
      const row = raw[i];
      if (!row || !row.text) continue;
      out.push({
        id: String(row.id || i),
        name: String(row.name || "访客").slice(0, 12),
        text: String(row.text).slice(0, 120),
        at: Number(row.at) || 0,
        parent: row.parent ? String(row.parent) : "",
      });
    }
    return out;
  } catch {
    return [];
  }
}

function noteWhen(at) {
  const date = new Date(at || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (date.getMonth() + 1) + "-" + date.getDate() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function noteSource() {
  return notesShared ? sharedNotes : localNotes;
}

const PLAN_NS = "http://www.w3.org/2000/svg";
const PLAN_PITCH = 36;
const PLAN_TOP = 28;
const PLAN_DEPTH = 22;
const PLAN_LABEL = 16;

function planNode(name, attrs) {
  const el = document.createElementNS(PLAN_NS, name);
  if (attrs) {
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i++) el.setAttribute(keys[i], attrs[keys[i]]);
  }
  return el;
}

function planPoints(points) {
  let text = "";
  for (let i = 0; i < points.length; i++) {
    if (i) text += " ";
    text += points[i][0].toFixed(1) + "," + points[i][1].toFixed(1);
  }
  return text;
}

function planProject(x, z, level) {
  const shell = built.shell;
  const spanX = shell.maxX - shell.minX || 1;
  const spanZ = shell.maxZ - shell.minZ || 1;
  const u = (x - shell.minX) / spanX;
  const v = (shell.maxZ - z) / spanZ;
  const sx = 18 + u * 132 + v * 46;
  const sy = PLAN_TOP + (built.floors - level) * PLAN_PITCH - v * PLAN_DEPTH;
  return [sx, sy];
}

function planQuad(x0, z0, x1, z1, level) {
  return [
    planProject(x0, z1, level),
    planProject(x1, z1, level),
    planProject(x1, z0, level),
    planProject(x0, z0, level),
  ];
}

function planWall(x0, z0, x1, z1, low, high) {
  return [
    planProject(x0, z0, low),
    planProject(x1, z1, low),
    planProject(x1, z1, high),
    planProject(x0, z0, high),
  ];
}

function planClamp(x, z, floor) {
  const shell = built.shell;
  const deck = built.deck;
  const deckReach = deck ? deck.r + 0.8 : 2.4;
  if (z > shell.maxZ) {
    const limit = floor > 0 ? shell.maxZ + deckReach : shell.maxZ + 2.6;
    if (z > limit) z = limit;
  }
  if (z < shell.minZ - 0.6) z = shell.minZ - 0.4;
  if (x < shell.minX - 0.8) x = shell.minX - 0.4;
  if (x > shell.maxX + 0.8) x = shell.maxX + 0.4;
  return { x, z, floor };
}

function planFocus() {
  return planClamp(px, pz, playerFloor());
}

function planOthers() {
  if (!presence || !presence.linked() || presence.solo()) return [];
  const list = presence.others();
  const floors = built.floors || 1;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const person = list[i];
    if (!person) continue;
    let floor = Math.round((person.y || 0) / STORY);
    if (floor < 0) floor = 0;
    if (floor > floors - 1) floor = floors - 1;
    const at = planClamp(person.x || 0, person.z || 0, floor);
    out.push({
      id: person.id || String(i),
      name: person.name || "访客",
      x: at.x,
      z: at.z,
      floor,
    });
  }
  return out;
}

function planLabel(floor) {
  const names = built.floorNames && built.floorNames[floor];
  const span = built.floorSpans && built.floorSpans[floor];
  return liftFloorLabel(names, floor, hangSort, span);
}

function planSignature() {
  let sig = hangSort + "|" + built.floors + "|" + playerFloor();
  for (let f = 0; f < built.floors; f++) sig += "|" + planLabel(f);
  return sig;
}

function scrollPlanTo(floor) {
  const paneEl = guestbookPlanScroll || guestbookPlan;
  if (!paneEl || !guestbookPlan || guestbookPlan.hidden) return;
  const row = document.getElementById("plan-label-" + floor);
  if (!row) return;
  const pane = paneEl.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  paneEl.scrollTop += box.top - pane.top - pane.height / 2 + box.height / 2;
}

function movePlanYou() {
  const mark = document.getElementById("plan-you");
  if (!mark || !built) return;
  const at = planFocus();
  const point = planProject(at.x, at.z, at.floor);
  mark.setAttribute("transform", "translate(" + point[0].toFixed(1) + " " + point[1].toFixed(1) + ")");
}

function apronPiece() {
  const shell = built.shell;
  return {
    points: [
      planProject(shell.minX, shell.maxZ + 3.2, 0),
      planProject(shell.maxX, shell.maxZ + 3.2, 0),
      planProject(shell.maxX, shell.maxZ, 0),
      planProject(shell.minX, shell.maxZ, 0),
    ],
    fill: "#efeae3",
    stroke: "none",
    width: 0,
  };
}

function doorPiece() {
  const shell = built.shell;
  return {
    points: planWall(-DOOR, shell.maxZ, DOOR, shell.maxZ, 0, 0.55),
    fill: "none",
    stroke: "#2c2926",
    width: 1.4,
  };
}

// 一层楼的斜向画法。示意图和右上角平面图都读这一份。
function floorPieces(f, here) {
  const shell = built.shell;
  const stair = built.stair;
  const deck = built.deck;
  const top = f + 0.92;
  const on = f === here;
  const pieces = [
    {
      points: planWall(shell.minX, shell.minZ, shell.maxX, shell.minZ, f, top),
      fill: on ? "rgba(232, 214, 196, 0.45)" : "rgba(244, 241, 236, 0.72)",
      stroke: "rgba(44, 41, 38, 0.28)",
      width: 1,
    },
    {
      points: planWall(shell.minX, shell.minZ, shell.minX, shell.maxZ, f, top),
      fill: "rgba(236, 232, 226, 0.55)",
      stroke: "rgba(44, 41, 38, 0.28)",
      width: 1,
    },
    {
      points: planWall(shell.maxX, shell.minZ, shell.maxX, shell.maxZ, f, top),
      fill: "rgba(236, 232, 226, 0.4)",
      stroke: "rgba(44, 41, 38, 0.22)",
      width: 1,
    },
    {
      points: planQuad(shell.minX, shell.minZ, shell.maxX, shell.maxZ, f),
      fill: on ? "#f4e2cc" : "rgba(255, 252, 248, 0.82)",
      stroke: on ? "#2c2926" : "rgba(44, 41, 38, 0.45)",
      width: on ? 1.4 : 1,
    },
    {
      points: planQuad(LIFT.xRear, LIFT.z0, LIFT.xDoor, LIFT.z1, f),
      fill: "rgba(183, 207, 224, 0.9)",
      stroke: "#5d7e96",
      width: 1,
    },
  ];
  if (stair) {
    pieces.push({
      points: planQuad(
        Math.min(stair.f1x0, stair.landX0),
        Math.min(stair.f2z0, stair.landZ0),
        Math.max(stair.f2x1, stair.landX1),
        Math.max(stair.f1z1, stair.landZ1),
        f,
      ),
      fill: "rgba(228, 203, 184, 0.95)",
      stroke: "#8c6a52",
      width: 1,
    });
  }
  if (deck && f > 0) {
    const arc = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * i / 8;
      arc.push(planProject(deck.x + Math.cos(a) * deck.r, deck.z + Math.sin(a) * deck.r, f));
    }
    pieces.push({
      points: arc,
      fill: "none",
      stroke: "rgba(44, 41, 38, 0.35)",
      width: 1,
      open: true,
    });
  }
  return pieces;
}

function appendPiece(svg, piece) {
  svg.appendChild(planNode(piece.open ? "polyline" : "polygon", {
    points: planPoints(piece.points),
    fill: piece.fill || "none",
    stroke: piece.stroke || "none",
    "stroke-width": String(piece.width == null ? 1 : piece.width),
  }));
}

function cornerPieces(here) {
  const pieces = [];
  if (here === 0) pieces.push(apronPiece());
  const floors = floorPieces(here, here);
  for (let i = 0; i < floors.length; i++) pieces.push(floors[i]);
  if (here === 0) pieces.push(doorPiece());
  return pieces;
}

function growBox(box, x, y) {
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

function piecesBox(pieces) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < pieces.length; i++) {
    const pts = pieces[i].points;
    for (let p = 0; p < pts.length; p++) growBox(box, pts[p][0], pts[p][1]);
  }
  return box;
}

function labelPoints(here) {
  const pts = [];
  const liftMark = planProject((LIFT.xRear + LIFT.xDoor) / 2, LIFT.cz, here + 0.15);
  const lx = Math.max(2, liftMark[0] - 28);
  pts.push([lx, liftMark[1] - 10], [lx + 32, liftMark[1] + 6]);
  const stair = built.stair;
  if (stair) {
    const stairMark = planProject(
      (Math.min(stair.f1x0, stair.landX0) + Math.max(stair.f2x1, stair.landX1)) / 2,
      (Math.min(stair.f2z0, stair.landZ0) + Math.max(stair.f1z1, stair.landZ1)) / 2,
      here + 0.2,
    );
    pts.push([stairMark[0] - 14, stairMark[1] - 10], [stairMark[0] + 28, stairMark[1] + 6]);
  }
  return pts;
}

const CORNER_PAD = 16;

function cornerPlanLayout(w) {
  const here = playerFloor();
  const pieces = cornerPieces(here);
  const box = piecesBox(pieces);
  const labels = labelPoints(here);
  for (let i = 0; i < labels.length; i++) growBox(box, labels[i][0], labels[i][1]);
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const innerW = Math.max(40, w - CORNER_PAD * 2);
  const s = innerW / bw;
  return { here, pieces, box, s, h: bh * s + CORNER_PAD * 2 };
}

function cornerPlanHeight(w) {
  if (!built || !built.shell) return Math.round((w || 180) * 0.46);
  return Math.ceil(cornerPlanLayout(w || 180).h);
}

function paintPiece(ctx, piece, map, s) {
  const pts = piece.points;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = map(pts[i]);
    if (i) ctx.lineTo(p[0], p[1]);
    else ctx.moveTo(p[0], p[1]);
  }
  if (!piece.open) ctx.closePath();
  if (piece.fill && piece.fill !== "none") {
    ctx.fillStyle = piece.fill;
    ctx.fill();
  }
  if (piece.stroke && piece.stroke !== "none" && piece.width) {
    ctx.strokeStyle = piece.stroke;
    ctx.lineWidth = piece.width * s;
    ctx.stroke();
  }
}

function paintPin(ctx, x, y, s, you) {
  const outer = (you ? 6.5 : 5.5) * s;
  const inner = (you ? 2.4 : 2.1) * s;
  const stroke = you ? "#c4503a" : "#3d5c73";
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = (you ? 2 : 1.6) * s;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, inner, 0, Math.PI * 2);
  ctx.fillStyle = stroke;
  ctx.fill();
}

function paintCornerPlan(ctx, w) {
  if (!built || !built.shell) return;
  const lay = cornerPlanLayout(w);
  const s = lay.s;
  const box = lay.box;
  const mapPt = (p) => [CORNER_PAD + (p[0] - box.minX) * s, CORNER_PAD + (p[1] - box.minY) * s];
  const pieces = lay.pieces;
  for (let i = 0; i < pieces.length; i++) paintPiece(ctx, pieces[i], mapPt, s);
  const here = lay.here;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = (11 * s) + "px \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
  const liftMark = planProject((LIFT.xRear + LIFT.xDoor) / 2, LIFT.cz, here + 0.15);
  const liftLabel = mapPt([Math.max(2, liftMark[0] - 28), liftMark[1] + 4]);
  ctx.fillStyle = "#3d5c73";
  ctx.fillText("电梯", liftLabel[0], liftLabel[1]);
  const stair = built.stair;
  if (stair) {
    const stairMark = planProject(
      (Math.min(stair.f1x0, stair.landX0) + Math.max(stair.f2x1, stair.landX1)) / 2,
      (Math.min(stair.f2z0, stair.landZ0) + Math.max(stair.f1z1, stair.landZ1)) / 2,
      here + 0.2,
    );
    const stairLabel = mapPt([stairMark[0] - 12, stairMark[1] + 4]);
    ctx.fillStyle = "#6d4c38";
    ctx.fillText("楼梯", stairLabel[0], stairLabel[1]);
  }
  const people = planOthers();
  ctx.font = (12 * s) + "px \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < people.length; i++) {
    if (people[i].floor !== here) continue;
    const at = mapPt(planProject(people[i].x, people[i].z, people[i].floor));
    paintPin(ctx, at[0], at[1], s, false);
    ctx.fillStyle = "#3d5c73";
    ctx.fillText(people[i].name, at[0], at[1] - 9 * s);
  }
  const youAt = planFocus();
  const you = mapPt(planProject(youAt.x, youAt.z, youAt.floor));
  paintPin(ctx, you[0], you[1], s, true);
  ctx.font = (11 * s) + "px \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#c4503a";
  ctx.fillText("你", you[0] + 8 * s, you[1] - 7 * s);
}

function planTextWidth(text) {
  let width = 0;
  const size = PLAN_LABEL;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 32) width += size * 0.4;
    else if (code < 128) width += size * 0.72;
    else width += size;
  }
  return width;
}

function drawMuseumPlan() {
  if (!guestbookPlan || !built || !built.shell) return;
  const shell = built.shell;
  const floors = built.floors;
  const here = playerFloor();
  let labelW = 48;
  for (let f = 0; f < floors; f++) labelW = Math.max(labelW, planTextWidth(planLabel(f)));
  const labelX = 18 + 132 + 46 + 28;
  const width = Math.ceil(labelX + labelW + 16);
  const height = Math.ceil(PLAN_TOP + floors * PLAN_PITCH + 24);
  const svg = planNode("svg", {
    width: String(width),
    height: String(height),
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    "aria-label": "博物馆示意图",
  });
  svg.style.display = "block";
  svg.style.fontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  appendPiece(svg, apronPiece());
  const stair = built.stair;
  for (let f = 0; f < floors; f++) {
    const pieces = floorPieces(f, here);
    for (let i = 0; i < pieces.length; i++) appendPiece(svg, pieces[i]);
  }
  const roof = planNode("polygon", {
    points: planPoints([
      planProject(shell.minX - 0.7, shell.maxZ + 0.5, floors - 0.02),
      planProject(shell.maxX + 0.7, shell.maxZ + 0.5, floors - 0.02),
      planProject(shell.maxX + 0.7, shell.minZ - 0.5, floors - 0.02),
      planProject(shell.minX - 0.7, shell.minZ - 0.5, floors - 0.02),
    ]),
    fill: "#e7e2db",
    stroke: "#2c2926",
    "stroke-width": "1.2",
  });
  svg.appendChild(roof);
  appendPiece(svg, doorPiece());
  const liftMark = planProject((LIFT.xRear + LIFT.xDoor) / 2, LIFT.cz, 0.15);
  const liftText = planNode("text", {
    x: String(Math.max(2, liftMark[0] - 28)),
    y: String(liftMark[1] + 4),
    fill: "#3d5c73",
    "font-size": "11",
  });
  liftText.textContent = "电梯";
  svg.appendChild(liftText);
  if (stair) {
    const stairMark = planProject(
      (Math.min(stair.f1x0, stair.landX0) + Math.max(stair.f2x1, stair.landX1)) / 2,
      (Math.min(stair.f2z0, stair.landZ0) + Math.max(stair.f1z1, stair.landZ1)) / 2,
      0.2,
    );
    const stairText = planNode("text", {
      x: String(stairMark[0] - 12),
      y: String(stairMark[1] + 4),
      fill: "#6d4c38",
      "font-size": "11",
    });
    stairText.textContent = "楼梯";
    svg.appendChild(stairText);
  }
  for (let f = 0; f < floors; f++) {
    const anchor = planProject(shell.maxX, shell.maxZ, f);
    const y = anchor[1].toFixed(1);
    svg.appendChild(planNode("line", {
      x1: anchor[0].toFixed(1),
      y1: y,
      x2: String(labelX - 8),
      y2: y,
      stroke: f === here ? "#2c2926" : "rgba(44, 41, 38, 0.4)",
      "stroke-width": "1.25",
    }));
    const text = planNode("text", {
      id: "plan-label-" + f,
      x: String(labelX),
      y,
      fill: f === here ? "#2c2926" : "#6f6a64",
      "font-size": String(PLAN_LABEL),
      "font-weight": f === here ? "600" : "400",
      "dominant-baseline": "middle",
    });
    text.textContent = planLabel(f);
    svg.appendChild(text);
  }
  svg.appendChild(planNode("g", { id: "plan-people" }));
  const youAt = planFocus();
  const youPoint = planProject(youAt.x, youAt.z, youAt.floor);
  const you = planNode("g", {
    id: "plan-you",
    transform: "translate(" + youPoint[0].toFixed(1) + " " + youPoint[1].toFixed(1) + ")",
  });
  you.appendChild(planNode("circle", { cx: "0", cy: "0", r: "6.5", fill: "#fff", stroke: "#c4503a", "stroke-width": "2" }));
  you.appendChild(planNode("circle", { cx: "0", cy: "0", r: "2.4", fill: "#c4503a" }));
  const youText = planNode("text", { x: "8", y: "-7", fill: "#c4503a", "font-size": "11" });
  youText.textContent = "你";
  you.appendChild(youText);
  svg.appendChild(you);
  const host = guestbookPlanScroll || guestbookPlan;
  host.replaceChildren(svg);
  planPeopleKey = "";
}

function syncPlanPeople() {
  const group = document.getElementById("plan-people");
  if (!group || !built) return;
  const people = planOthers();
  let key = "";
  for (let i = 0; i < people.length; i++) key += people[i].id + "\t" + people[i].name + "\n";
  if (key !== planPeopleKey) {
    planPeopleKey = key;
    group.replaceChildren();
    for (let i = 0; i < people.length; i++) {
      const node = planNode("g");
      node.appendChild(planNode("circle", {
        cx: "0",
        cy: "0",
        r: "5.5",
        fill: "#fff",
        stroke: "#3d5c73",
        "stroke-width": "1.6",
      }));
      node.appendChild(planNode("circle", { cx: "0", cy: "0", r: "2.1", fill: "#3d5c73" }));
      const label = planNode("text", {
        x: "0",
        y: "-9",
        fill: "#3d5c73",
        "font-size": "12",
        "text-anchor": "middle",
      });
      label.textContent = people[i].name;
      node.appendChild(label);
      group.appendChild(node);
    }
  }
  const nodes = group.children;
  for (let i = 0; i < people.length && i < nodes.length; i++) {
    const point = planProject(people[i].x, people[i].z, people[i].floor);
    nodes[i].setAttribute("transform", "translate(" + point[0].toFixed(1) + " " + point[1].toFixed(1) + ")");
  }
}

function placeGuestbook() {
  if (!guestbook || guestbook.hidden) return;
  const gap = 16;
  const dayBox = document.getElementById("day");
  const chat = document.getElementById("chatter");
  const vh = window.innerHeight || 0;
  let top = 160;
  if (dayBox) {
    const box = dayBox.getBoundingClientRect();
    if (box.height > 0) top = Math.round(box.bottom + gap);
  }
  let bottom = 22 + gap;
  if (chat) {
    const box = chat.getBoundingClientRect();
    const edge = box.height > 1 ? box.top : (box.bottom > 0 ? box.bottom : vh - 22);
    bottom = Math.round(vh - edge + gap);
  }
  if (bottom < gap) bottom = gap;
  const minH = 160;
  if (vh - top - bottom < minH) bottom = Math.max(gap, vh - top - minH);
  const key = top + "," + bottom;
  if (key === guestPlaceKey) return;
  guestPlaceKey = key;
  guestbook.style.top = top + "px";
  guestbook.style.bottom = bottom + "px";
  guestbook.style.height = "auto";
}

function syncMuseumPlan(forceScroll) {
  if (!built || !guestbookPlan || guestbook.hidden) return;
  const sig = planSignature();
  const floor = playerFloor();
  if (sig !== planSig) {
    const host = guestbookPlanScroll || guestbookPlan;
    const keep = host.scrollTop;
    planSig = sig;
    drawMuseumPlan();
    syncPlanPeople();
    if (!forceScroll && floor === planSeenFloor) host.scrollTop = keep;
  } else {
    movePlanYou();
    syncPlanPeople();
  }
  if (forceScroll || floor !== planSeenFloor) {
    planSeenFloor = floor;
    scrollPlanTo(floor);
  }
}

function showGuestTab(which) {
  const plan = which !== "notes";
  if (guestbookTabPlan) guestbookTabPlan.setAttribute("aria-selected", plan ? "true" : "false");
  if (guestbookTabNotes) guestbookTabNotes.setAttribute("aria-selected", plan ? "false" : "true");
  if (guestbookPlan) guestbookPlan.hidden = !plan;
  if (guestbookNotes) guestbookNotes.hidden = plan;
  if (plan) syncMuseumPlan(true);
}

function noteFrom(raw) {
  return {
    id: String((raw && raw.id) || ""),
    name: (raw && raw.name) || "访客",
    text: (raw && raw.text) || "",
    at: Number(raw && raw.at) || 0,
    parent: raw && raw.parent ? String(raw.parent) : "",
  };
}

function noteThreads(notes) {
  const ordered = notes.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  const ids = new Set();
  for (let i = 0; i < ordered.length; i++) ids.add(ordered[i].id);
  const kids = new Map();
  const roots = [];
  for (let i = 0; i < ordered.length; i++) {
    const note = ordered[i];
    const parent = note.parent && ids.has(note.parent) ? note.parent : "";
    if (!parent) {
      roots.push(note);
      continue;
    }
    let list = kids.get(parent);
    if (!list) {
      list = [];
      kids.set(parent, list);
    }
    list.push(note);
  }
  roots.reverse();
  return { roots, kids };
}

function placeReplyForm() {
  if (!guestbookForm || !guestbookList) return;
  if (guestbookReplying) guestbookReplying.hidden = !replyTo;
  const buttons = guestbookList.querySelectorAll(".note-reply");
  for (let i = 0; i < buttons.length; i++) buttons[i].hidden = false;
  if (!replyTo) {
    guestbookList.before(guestbookForm);
    return;
  }
  let host = null;
  const nodes = guestbookList.querySelectorAll("[data-note-id]");
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].dataset.noteId === replyTo) {
      host = nodes[i];
      break;
    }
  }
  if (host) {
    host.append(guestbookForm);
    const body = host.querySelector(".note-body");
    const own = body && body.querySelector(".note-reply");
    if (own) own.hidden = true;
  } else guestbookList.before(guestbookForm);
}

function fillNote(note) {
  const li = document.createElement("li");
  li.dataset.noteId = note.id;
  const body = document.createElement("div");
  body.className = "note-body";
  const meta = document.createElement("p");
  meta.className = "note-meta";
  meta.textContent = (note.name || "访客") + " · " + noteWhen(note.at);
  const text = document.createElement("p");
  text.className = "note-text";
  text.textContent = note.text || "";
  const reply = document.createElement("button");
  reply.type = "button";
  reply.className = "note-reply";
  reply.textContent = "回复";
  reply.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    replyTo = note.id;
    placeReplyForm();
    if (guestbookText) guestbookText.focus();
  });
  body.append(meta, text, reply);
  li.append(body);
  return li;
}

function appendThread(parent, note, kids) {
  const li = fillNote(note);
  const replies = kids.get(note.id);
  if (replies && replies.length) {
    const ol = document.createElement("ol");
    ol.className = "note-replies";
    for (let i = 0; i < replies.length; i++) appendThread(ol, replies[i], kids);
    li.append(ol);
  }
  parent.append(li);
}

function renderGuestbook() {
  if (guestbookForm && guestbookList) guestbookList.before(guestbookForm);
  guestbookHint.textContent = notesShared
    ? "写下你对趣站的寄语或感受！你也可以在这里吐槽任何事！"
    : "还没连上展厅。这些话先记在这台浏览器上。";
  const threaded = noteThreads(noteSource());
  const pages = Math.max(1, Math.ceil(threaded.roots.length / NOTE_PAGE));
  if (notePage > pages - 1) notePage = pages - 1;
  if (notePage < 0) notePage = 0;
  const slice = threaded.roots.slice(notePage * NOTE_PAGE, notePage * NOTE_PAGE + NOTE_PAGE);
  guestbookList.replaceChildren();
  if (!slice.length) {
    const empty = document.createElement("li");
    empty.className = "note-empty";
    empty.textContent = "还没有留言。";
    guestbookList.appendChild(empty);
  }
  for (let i = 0; i < slice.length; i++) appendThread(guestbookList, slice[i], threaded.kids);
  guestbookPage.textContent = (notePage + 1) + " / " + pages;
  guestbookPrev.disabled = notePage <= 0;
  guestbookNext.disabled = notePage >= pages - 1;
  placeReplyForm();
}

function closeGuestbook(relock) {
  const wasOpen = !guestbook.hidden;
  guestbook.hidden = true;
  if (wasOpen && presence && presence.linked() && presence.sendRobotFaceOff) presence.sendRobotFaceOff();
  if (panel.hidden) document.body.classList.remove("reading");
  if (!relock || corner.classList.contains("nav-open")) return;
  requestWalk();
}

function openGuestbook() {
  if (!panel.hidden) closePanel(false);
  renderGuestbook();
  guestbook.hidden = false;
  document.body.classList.add("reading");
  placeGuestbook();
  showGuestTab("plan");
  guestbook.style.pointerEvents = "none";
  ignoreUntil = performance.now() + 420;
  window.setTimeout(() => {
    guestbook.style.pointerEvents = "auto";
  }, 420);
  releaseLook();
}

function submitNote(event) {
  event.preventDefault();
  const text = guestbookText.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
  if (!text) return;
  const now = Date.now();
  if (now < noteWait) return;
  noteWait = now + 2500;
  const parent = replyTo;
  if (presence && presence.postNote(text, parent)) {
    guestbookText.value = "";
    replyTo = "";
    placeReplyForm();
    return;
  }
  localNotes.push({
    id: "local-" + now,
    name: (presence && presence.name()) || "访客",
    text,
    at: now,
    parent,
  });
  while (localNotes.length > 200) localNotes.shift();
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(localNotes));
  } catch {
    /* 记不住就只留在这一页。 */
  }
  guestbookText.value = "";
  replyTo = "";
  if (!parent) notePage = 0;
  renderGuestbook();
}

function applySign(text, speed) {
  if (reception && typeof text === "string") reception.setSign(text, speed);
}

function onRobotMessage(view) {
  if (!view) return;
  applySign(view.sign, view.speed);
  const was = receptionDriver;
  receptionDriver = view.driver || "";
  const mine = presence && presence.myId();
  const linked = presence && presence.linked();
  const driving = !linked || !receptionDriver || mine === receptionDriver;
  if (!driving || was !== receptionDriver) {
    receptionState.x = view.x;
    receptionState.z = view.z;
    receptionState.yaw = view.yaw;
    receptionState.face = view.yaw;
    receptionState.hold = 0;
    if (driving) {
      receptionRender.x = view.x;
      receptionRender.z = view.z;
      receptionRender.yaw = view.yaw;
    } else {
      receptionFollow.x = view.x;
      receptionFollow.z = view.z;
      receptionFollow.yaw = view.yaw;
    }
  }
}

function onNotesMessage(payload) {
  if (payload && payload.t === "note-drop") {
    const id = payload.id;
    sharedNotes = sharedNotes.filter((note) => note.id !== id);
    if (!guestbook.hidden) renderGuestbook();
    return;
  }
  notesShared = true;
  if (Array.isArray(payload)) {
    sharedNotes = [];
    for (let i = 0; i < payload.length; i++) sharedNotes.push(noteFrom(payload[i]));
    notePage = 0;
  } else if (payload && payload.text) {
    const note = noteFrom(payload);
    sharedNotes.push(note);
    if (sharedNotes.length > 200) sharedNotes.shift();
    if (!note.parent) notePage = 0;
  }
  if (!guestbook.hidden) renderGuestbook();
}

function onDeskUnlink() {
  receptionDriver = "";
  notesShared = false;
  liftShared = false;
  liftWish.clear();
  if (!guestbook.hidden) renderGuestbook();
}

function lookMin() {
  let minT = 0.15;
  if (thirdPerson) {
    const gap = Math.hypot(camera.position.x - px, camera.position.y - (py + EYE), camera.position.z - pz);
    if (gap > minT) minT = gap - 0.25;
  }
  return minT;
}

function aimHover() {
  const index = pickFrame();
  const robotDist = reception ? reception.pick(camera.position, lookDir, lookMin()) : -1;
  const onRobot = robotDist >= 0 && robotDist < framePickDist;
  if (onRobot) {
    if (hoverIndex >= 0) setHover(-1);
    hoverEl.textContent = "倔强小趣";
    hoverEl.hidden = false;
    hoverRobot = true;
    return;
  }
  if (hoverRobot) {
    hoverRobot = false;
    hoverEl.hidden = true;
  }
  setHover(index);
}

function crowdHere() {
  const people = [{ x: px, z: pz, y: py }];
  if (presence) {
    const others = presence.others();
    for (let i = 0; i < others.length; i++) people.push(others[i]);
  }
  return people;
}

function approachYaw(from, to, k) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * k;
}

function guestStillHere(id) {
  if (!presence || !id) return false;
  const others = presence.others();
  for (let i = 0; i < others.length; i++) {
    if (others[i] && others[i].id === id) return true;
  }
  return false;
}

function onRobotFace(msg) {
  if (!msg) return;
  const mine = presence && presence.myId();
  if (mine && msg.id === mine) return;
  if (msg.off) {
    if (remoteFace && msg.id === remoteFace.id) remoteFace = null;
    return;
  }
  if (!Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
  remoteFace = { id: msg.id || "", x: msg.x, z: msg.z };
}

function showReception(now) {
  if (!reception) return;
  reception.group.visible = true;
  updateReception(0.016, now || performance.now());
}

function updateReception(dt, now) {
  if (!reception) return;
  const card = !guestbook.hidden;
  const linked = presence && presence.linked();
  const mine = presence && presence.myId();
  // 没连上、房间还没指定司机、或司机就是这一页，才由这里往前走。
  const driving = !visitorOut && !document.hidden && (!linked || !receptionDriver || mine === receptionDriver);
  if (remoteFace && !guestStillHere(remoteFace.id)) remoteFace = null;
  const watchGuest = !!(driving && !card && remoteFace);
  // 卡片开着，或有人正在看卡片：停在原地，慢慢转向那个人。关上后再转回点击前的方向。
  const attending = (card && driving) || watchGuest;
  if (attending) {
    if (!robotLookHeld) rememberRobotHeading(receptionState);
    const tx = card ? px : remoteFace.x;
    const tz = card ? pz : remoteFace.z;
    aimRobot(receptionState, tx, tz);
    turnRobot(receptionState, dt);
    receptionRender.x = receptionState.x;
    receptionRender.z = receptionState.z;
    receptionRender.yaw = receptionState.yaw;
    if (linked && mine && mine === receptionDriver) presence.sendRobot(receptionState);
    robotLookHeld = true;
  } else if (driving && !card) {
    if (robotLookHeld) {
      releaseRobotHeading(receptionState);
      robotLookHeld = false;
    }
    stepReception(receptionState, dt, crowdHere());
    receptionRender.x = receptionState.x;
    receptionRender.z = receptionState.z;
    receptionRender.yaw = receptionState.yaw;
    if (linked && mine && mine === receptionDriver) presence.sendRobot(receptionState);
  } else if (card) {
    if (linked && presence.sendRobotFace) presence.sendRobotFace(px, pz);
    const face = yawAt(receptionRender.x, receptionRender.z, px, pz);
    if (face != null) receptionRender.yaw = stepYaw(receptionRender.yaw, face, dt);
  } else {
    const gap = Math.hypot(receptionFollow.x - receptionRender.x, receptionFollow.z - receptionRender.z);
    if (gap > 1.6) {
      receptionRender.x = receptionFollow.x;
      receptionRender.z = receptionFollow.z;
      receptionRender.yaw = receptionFollow.yaw;
    } else {
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 8);
      receptionRender.x += (receptionFollow.x - receptionRender.x) * k;
      receptionRender.z += (receptionFollow.z - receptionRender.z) * k;
      receptionRender.yaw = approachYaw(receptionRender.yaw, receptionFollow.yaw, k);
    }
  }
  reception.place(receptionRender, now, card || watchGuest);
  if (card) {
    placeGuestbook();
    syncMuseumPlan(false);
  }
}

function openFrame(index) {
  if (!guestbook.hidden) closeGuestbook(false);
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
  if (!built || !framesReady) {
    framePickDist = Infinity;
    return -1;
  }
  camera.getWorldDirection(lookDir);
  const ox = camera.position.x;
  const oy = camera.position.y;
  const oz = camera.position.z;
  const minT = lookMin();
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
  framePickDist = best >= 0 ? bestT : Infinity;
  return best;
}

function resetPose() {
  px = built.spawn.x;
  pz = built.spawn.z;
  py = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  airborne = false;
  takeoffY = 0;
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
  if (reception) {
    const body = receptionBody(receptionRender.x, receptionRender.z);
    if (!blocked(px, pz, PLAYER_RADIUS, [body], py)) solidList.push(body);
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
  if (!lift) return false;
  if (blocksLiftDoor(px, pz, py, lift.y)) return true;
  if (!presence) return false;
  const people = presence.others();
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (blocksLiftDoor(person.x, person.z, person.y || 0, lift.y)) return true;
  }
  return false;
}

function personOpensDoor(x, z, y, floor) {
  if (Math.abs(y - floor * STORY) >= 1.35) return false;
  return doorWantsOpen(x, z, doorHeld[floor]);
}

function floorDoorWanted(floor) {
  if (personOpensDoor(px, pz, py, floor)) return true;
  if (!presence) return false;
  const people = presence.others();
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (personOpensDoor(person.x, person.z, person.y || 0, floor)) return true;
  }
  return false;
}

function feetOn() {
  if (lift && inLiftCar(px, pz) && Math.abs(py - lift.y) < 0.2) return lift.y;
  const support = built ? groundAt(px, pz, py, built.floors) : null;
  if (support == null) return py <= 0.04 ? 0 : null;
  return support;
}

function tryJump() {
  if (airborne || !built) return;
  if (lift && inLiftCar(px, pz) && lift.phase === "moving") return;
  const feet = feetOn();
  if (feet == null || Math.abs(py - feet) > 0.12) return;
  airborne = true;
  takeoffY = feet;
  vy = JUMP_V;
}

// 地面查询只认脚附近约一米的楼板。sample 高出落点就不算，免得把人吸到头顶那一层。
function surfaceBelow(sample) {
  if (!built) return null;
  let land = groundAt(px, pz, sample, built.floors);
  if (lift && inLiftCar(px, pz)) {
    const cab = lift.y;
    if (land == null || (cab <= sample + 0.08 && cab >= land - 0.05)) land = cab;
  }
  if (land != null && land > sample + 0.08) return null;
  return land;
}

function settleFeet(dt) {
  const inCar = lift && inLiftCar(px, pz);
  const riding = inCar && (Math.abs(py - lift.y) < 1.15 || lift.phase === "moving");
  if (inCar && lift.phase === "moving") {
    airborne = false;
    vy = 0;
    py = lift.y;
    return;
  }
  if (!airborne && riding) {
    py = lift.y;
    vy = 0;
    return;
  }
  if (airborne) {
    vy -= GRAVITY * dt;
    if (vy < -12) vy = -12;
    const prev = py;
    py += vy * dt;
    let land = surfaceBelow(prev);
    if (land == null) land = surfaceBelow(py);
    if (land == null && takeoffY != null) land = surfaceBelow(takeoffY);
    if (land != null && vy <= 0 && prev >= land - 0.02 && py <= land) {
      py = land;
      vy = 0;
      airborne = false;
      return;
    }
    if (py <= 0) {
      py = 0;
      vy = 0;
      airborne = false;
    }
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
    button.textContent = liftFloorLabel(names, f, hangSort, built.floorSpans && built.floorSpans[f]);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!lift) return;
      const chosen = liftChosen(f);
      if (ambience) ambience.press();
      pushLift(f, !chosen);
      paintLiftChoices();
      if (!chosen) requestWalk();
    });
    list.appendChild(button);
  }
}

function liftChosen(floor) {
  const wish = liftWish.get(floor);
  if (wish && performance.now() - wish.at < 1600) return wish.on;
  if (wish) liftWish.delete(floor);
  return !!(lift && lift.has(floor));
}

function pushLift(floor, on) {
  if (!lift || !built) return;
  let target = floor | 0;
  if (target < 0) target = 0;
  if (target >= built.floors) target = built.floors - 1;
  if (presence && presence.linked()) presence.sendLift(target, !!on);
  if (liftShared) {
    liftWish.set(target, { on: !!on, at: performance.now() });
    return;
  }
  if (on) lift.call(target);
  else lift.cancel(target);
}

function onLiftMessage(view) {
  if (!lift || !view) return;
  lift.adopt(view);
  liftShared = true;
  for (const [floor, wish] of liftWish) {
    if (lift.has(floor) === wish.on) liftWish.delete(floor);
  }
}

function onDoorKey() {
  if (!lift || !built) return;
  if (insideLift()) {
    if (lift.phase === "moving") return;
    if (ambience) ambience.press();
    pushLift(lift.current, true);
    return;
  }
  if (!atLiftDoor()) return;
  if (ambience) ambience.press();
  doorCall = true;
  pushLift(playerFloor(), true);
}

function paintLiftChoices() {
  const list = document.getElementById("lift-list");
  if (!list || !lift) return;
  const buttons = list.children;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const on = liftChosen(Number(button.dataset.floor));
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
  const yaw = yawFacing(fwd);
  selfVisitor.group.rotation.y = yaw;
  placeBodyShadow(selfVisitor, px, py, pz, yaw);
  if (airborne && selfVisitor.shadow) {
    const ground = built ? groundAt(px, pz, takeoffY, built.floors) : null;
    const feet = ground == null ? takeoffY : ground;
    selfVisitor.shadow.position.y = feet - py + 0.035;
  }
  const speed = Math.hypot(vx, vz);
  if (!airborne && speed > 0.2) walkPhase += speed * 0.02;
  poseVisitor(selfVisitor.parts, walkPhase, !airborne && speed > 0.2 ? 1 : 0);
  if (airborne) {
    const rise = Math.min(1, Math.max(0, py - takeoffY) / 0.35);
    selfVisitor.parts.legL.rotation.x = 0.45 * rise;
    selfVisitor.parts.legR.rotation.x = 0.45 * rise;
    selfVisitor.parts.armL.rotation.x = -0.35 * rise;
    selfVisitor.parts.armR.rotation.x = -0.35 * rise;
  }
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
  for (let f = 0; f < built.floors; f++) {
    const want = floorDoorWanted(f);
    doorHeld[f] = want;
    hallNear[f] = hallDoorNear(px, py, pz, f);
    const aim = want ? 1 : 0;
    doorOpen[f] += (aim - (doorOpen[f] || 0)) * (1 - Math.exp(-dt * 8));
    if (doorOpen[f] < 0.0008) doorOpen[f] = 0;
    else if (doorOpen[f] > 0.9992) doorOpen[f] = 1;
  }
  if (doors) doors.update(doorOpen);
  if (lift) {
    if (liftShared) lift.predict(dt);
    else lift.tick(dt, holdingLiftDoor());
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
    if (hoverRobot) {
      hoverRobot = false;
      hoverEl.hidden = true;
    }
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
    const foot = airborne ? takeoffY : py;
    const moved = movePlayer(px, pz, vx * dt, vz * dt, PLAYER_RADIUS, collide(), foot);
    px = moved.x;
    pz = moved.z;
    if (now >= hoverClock) {
      hoverClock = now + 120;
      aimHover();
    }
  }
  settleFeet(dt);
  placeCamera();
  updatePlace();
  syncLiftHud();
  syncLiftHint();
  trackPictures();
  updateReception(dt, now);
  if (presence) {
    presence.update(dt, now);
    if (lift) presence.rideLift(lift.y, lift.phase === "moving");
  }
  if (ambience && built) {
    const indoors = hallBlend(px, pz, built.interior);
    ambience.hear(indoors);
    ambience.place({
      outdoor: 1 - indoors,
      surface: footSurface(),
      speed: airborne ? 0 : Math.hypot(vx, vz),
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

function openingNow() {
  return document.body.classList.contains("opening");
}

function noteGesture() {
  heardGesture = true;
  if (ambience && !openingNow()) ambience.unlock();
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

function paintBeacons(now) {
  if (!beacons) return;
  const phase = now % 1300;
  const blink = dayIsNight && (phase < 120 || (phase > 240 && phase < 360));
  beacons.group.visible = dayIsNight;
  beacons.mat.color.setHex(blink ? 0xff2a18 : 0xc41410);
  beacons.glow.opacity = blink ? 0.45 : 0.14;
}

function veilHallBodies(on) {
  hallVeiled = !!on;
  if (presence && presence.holdHall) presence.holdHall(hallVeiled);
}

function animate(now) {
  // 落地后的第一帧先揭开。update 在这一帧的 render 之前，人已经在真实位置。
  if (hallVeiled) veilHallBodies(false);
  noteFps(now);
  noteLag(now);
  paintBeacons(now);
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
    const robotDist = reception ? reception.pick(camera.position, lookDir, lookMin()) : -1;
    if (robotDist >= 0 && robotDist < framePickDist) openGuestbook();
    else if (index >= 0) openFrame(index);
  });
  document.addEventListener("click", (event) => {
    if (openingNow()) return;
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
    if (openingNow()) return;
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
    if (openingNow()) {
      const field = event.target;
      if (field && field.closest && field.closest("#name-gate")) return;
      event.preventDefault();
      return;
    }
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
    if (event.code === "Space") {
      const locked = document.pointerLockElement === view && !corner.classList.contains("nav-open") && !visitorOut;
      if (!locked) return;
      event.preventDefault();
      if (event.repeat) return;
      tryJump();
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
      if (!guestbook.hidden) closeGuestbook(false);
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
  guestbookClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeGuestbook(true);
  });
  if (guestbookTabPlan) {
    guestbookTabPlan.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showGuestTab("plan");
    });
  }
  if (guestbookTabNotes) {
    guestbookTabNotes.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showGuestTab("notes");
    });
  }
  guestbookForm.addEventListener("submit", submitNote);
  if (guestbookReplyCancel) {
    guestbookReplyCancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      replyTo = "";
      placeReplyForm();
    });
  }
  guestbookPrev.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    notePage -= 1;
    renderGuestbook();
  });
  guestbookNext.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    notePage += 1;
    renderGuestbook();
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
  // 高出楼板顶一截。再低时，门口路面往镜头偏，会把这层光盖住。
  for (let i = 0; i < quads.length; i++) writeQuad(pos, col, i, quads[i], 0.06, color);
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

function fillCityShadows(blocks) {
  const boxes = sunShared.city.value;
  const heights = sunShared.cityH.value;
  const n = Math.min(blocks ? blocks.length : 0, boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    if (i < n) {
      const block = blocks[i];
      boxes[i].set(block.minX, block.maxX, block.minZ, block.maxZ);
      heights[i] = block.top;
    } else {
      boxes[i].set(0, 0, 0, 0);
      heights[i] = 0;
    }
  }
}

function castBlockers() {
  const list = [];
  if (built && built.shell) {
    const shell = built.shell;
    list.push({ minX: shell.minX, maxX: shell.maxX, minZ: shell.minZ, maxZ: shell.maxZ, top: shell.top });
  }
  const blocks = horizon && horizon.blocks;
  if (blocks) {
    for (let i = 0; i < blocks.length; i++) list.push(blocks[i]);
  }
  return list;
}

function placeShapeShadows(sun) {
  if (!shapeMat || !built) return;
  const polys = yardShadowPolys(built.yard, sun, castBlockers()).concat(deckShadowPolys(built.lobes, sun));
  const next = shapeShadowMesh(polys, shapeMat);
  if (shapeMesh) {
    scene.remove(shapeMesh);
    shapeMesh.geometry.dispose();
  }
  shapeMesh = next;
  if (shapeMesh) {
    if (parkFresh) parkFresh(shapeMesh);
    else scene.add(shapeMesh);
  }
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
  if (shapeMat) shapeMat.opacity = shapeShadowOpacity(day, sun);
  placeShapeShadows(sun);
  if (horizon && horizon.glow) horizon.glow.color.set(WINDOW_GLOW[day.id] || WINDOW_GLOW.noon);
  // 门口光斑是室外太阳投进来的。馆内改由天花灯照，地面不再铺这条亮带。
  writePatches({ streak: 0x000000, streakGain: 0 }, sun);
  if (bodyRoom) setBodyLight(sun, bodyRoom);
}

function captureView() {
  return {
    px, py, pz,
    pos: camera.position.clone(),
    rot: camera.rotation.clone(),
  };
}

function restoreView(saved) {
  px = saved.px;
  py = saved.py;
  pz = saved.pz;
  camera.position.copy(saved.pos);
  camera.rotation.copy(saved.rot);
  camera.updateMatrixWorld();
}

function openingDay() {
  return findDay("noon");
}

// 南立面远景。e 从 0 到 1，摄像机沿广场外由西向东横移，始终看着楼。
function placeApproach(e) {
  const shell = built.shell;
  const lookY = Math.max(8, Math.min(shell.top * 0.46, 40));
  const y = Math.max(9, Math.min(lookY * 0.5, 22));
  const z = shell.maxZ + 68;
  const x = -28 + 56 * e;
  camera.position.set(x, y, z);
  camera.lookAt(0, lookY, shell.maxZ);
  camera.updateMatrixWorld();
}

function advanceVista(t) {
  if (!vistaStamp) {
    vistaStamp = t;
    if (!vistaNow) vistaNow = t;
    return vistaNow;
  }
  let dt = t - vistaStamp;
  vistaStamp = t;
  if (!(dt > 0)) dt = 0;
  // 某一帧被布置堵住时，只停在原地，不按墙上的时钟往前跳。
  if (dt > VISTA_STEP) dt = VISTA_STEP;
  vistaNow += dt;
  return vistaNow;
}

function vistaE(now) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0.5;
  const elapsed = Math.max(0, now - vistaT0);
  const leg = Math.floor(elapsed / VISTA_LEG);
  const u = (elapsed % VISTA_LEG) / VISTA_LEG;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * u);
  return leg % 2 === 0 ? eased : 1 - eased;
}

function easeOutArrive(u) {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  const inv = 1 - t;
  return 1 - inv * inv;
}

function advanceArrival(t) {
  if (!arrivalStamp) {
    arrivalStamp = t;
    if (!arrivalNow) arrivalNow = t;
    return arrivalNow;
  }
  let dt = t - arrivalStamp;
  arrivalStamp = t;
  if (!(dt > 0)) dt = 0;
  // 某一帧被室内网格堵住时，只停在半路，不按墙上的时钟甩到出生点。
  if (dt > ARRIVE_STEP) dt = ARRIVE_STEP;
  arrivalNow += dt;
  return arrivalNow;
}

function placeArrival(e) {
  camera.position.lerpVectors(arrivalFromPos, arrivalToPos, e);
  camera.quaternion.slerpQuaternions(arrivalFromQuat, arrivalToQuat, e);
  camera.updateMatrixWorld();
}

function paintOpening() {
  const day = openingDay();
  const sun = sunVector(day);
  if (sunShared) {
    sunShared.dir.value.set(sun.x, sun.y, sun.z);
    sunShared.tint.value.set(day.tint);
    sunShared.shade.value = day.shade;
  }
  if (sunRoles) {
    sunRoles.room.tint.value.set(day.tint);
    sunRoles.glass.tint.value.set(day.tint);
    sunRoles.ground.fill.value = day.fillGround;
    sunRoles.ground.gain.value = day.gainGround;
    sunRoles.open.fill.value = day.fillOpen;
    sunRoles.open.gain.value = day.gainOpen;
    sunRoles.room.fill.value = day.fillRoom;
    sunRoles.room.gain.value = day.gainRoom;
    sunRoles.glass.fill.value = day.fillGlass;
    sunRoles.glass.gain.value = day.gainGlass;
  }
  const skyline = new THREE.Color(day.horizon);
  scene.background.copy(skyline);
  scene.fog.color.copy(skyline);
  renderer.setClearColor(skyline);
  document.body.style.background = skyline.getStyle();
  document.body.classList.remove("dark-sky");
  dayIsNight = false;
  if (skyMesh) paintSky(day);
  if (sunMesh) {
    sunMesh.material.color.set(day.sun);
    sunMesh.position.set(sun.x, sun.y, sun.z).multiplyScalar(SUN_FAR);
    sunMesh.scale.setScalar(day.disc);
  }
  setFacadeSignNight(false);
  if (horizon && horizon.glow) horizon.glow.color.set(WINDOW_GLOW.noon);
}

function drawVista(t) {
  const now = advanceVista(t);
  if (!vistaT0) vistaT0 = now;
  placeApproach(vistaE(now));
  if (horizon) horizon.drift(now);
  if (beacons) beacons.group.visible = false;
  try { renderer.render(scene, camera); } catch { /* 这一帧画失败就等下一帧。 */ }
}

function vistaFrame(t) {
  if (!vistaRun) return;
  drawVista(t || performance.now());
  if (vistaRun) requestAnimationFrame(vistaFrame);
}

function showVistaStill() {
  paintOpening();
  placeApproach(0);
  renderer.setRenderTarget(null);
  try { renderer.render(scene, camera); } catch { /* 远景第一帧失败也继续。 */ }
}

function startVista() {
  if (vistaRun) return;
  if (!vistaBegun) {
    vistaBegun = true;
    vistaNow = 0;
    vistaStamp = 0;
    vistaT0 = 0;
    paintOpening();
  } else {
    vistaStamp = 0;
  }
  renderer.setRenderTarget(null);
  vistaRun = true;
  vistaFrame(performance.now());
}

function stopVista() {
  vistaRun = false;
  vistaStamp = 0;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function shown() {
  // 远景还没开时也要让出一帧，否则布置会在第一次开镜之前把主线程占死。
  if (!vistaRun && !paceBoot) return;
  await nextFrame();
}

async function bootMark(value) {
  setLoadProgress(value);
  await shown();
}

// 一批做完就让一帧。单批不超过大约 6 毫秒，镜头才不会一顿一顿。
async function paceRanges(total, visit, markFrom, markTo) {
  if (!total) {
    setLoadProgress(markTo);
    await shown();
    return;
  }
  let i = 0;
  while (i < total) {
    const t0 = performance.now();
    const from = i;
    let n = 0;
    while (i < total && (n < 16 || performance.now() - t0 < 6)) {
      i += 1;
      n += 1;
    }
    visit(from, i);
    loadSpan(markFrom, markTo, i, total);
    await shown();
  }
}

const warmedKeys = new Set();

function freshMeshes() {
  const list = [];
  scene.traverse((obj) => {
    if (!(obj.isMesh || obj.isPoints || obj.isLine || obj.isSprite)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const keys = [];
    for (let m = 0; m < mats.length; m++) {
      const mat = mats[m];
      if (!mat) continue;
      const key = mat.uuid + ":" + (obj.isInstancedMesh ? "i" : "o");
      if (!warmedKeys.has(key)) keys.push(key);
    }
    if (!keys.length) return;
    for (let k = 0; k < keys.length; k++) warmedKeys.add(keys[k]);
    list.push(obj);
  });
  return list;
}

// 一次只编一个网格的着色器。整场景 compile() 会在主线程里同步链接全部程序，
// 没有并行编译扩展时会停很久，偶发就再也不回到昵称卡片。
async function warmFresh(markFrom, markTo, intoView) {
  const list = freshMeshes();
  // 楼先于天空。第一帧就能看见外立面，清屏天色只留到这一下之前。
  if (intoView) list.sort((a, b) => (b.renderOrder || 0) - (a.renderOrder || 0));
  if (intoView) {
    for (let i = 0; i < list.length; i++) list[i].visible = false;
  }
  if (!list.length) {
    setLoadProgress(markTo);
    if (intoView && !vistaRun) showVistaStill();
    await shown();
    return;
  }
  const probe = new THREE.Scene();
  if (scene.fog) probe.fog = scene.fog;
  const prevTarget = renderer.getRenderTarget();
  const viewSize = new THREE.Vector2();
  renderer.getDrawingBufferSize(viewSize);
  try {
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      const parent = obj.parent;
      const index = parent ? parent.children.indexOf(obj) : -1;
      const vis = obj.visible;
      const culled = obj.frustumCulled;
      if (parent) parent.remove(obj);
      probe.add(obj);
      obj.visible = true;
      obj.frustumCulled = false;
      // 画到屏幕左下角一个像素，着色器才和远景是同一份。整幅清掉的话，加载画面会闪一下。
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, 1, 1);
      renderer.setViewport(0, 0, 1, 1);
      try { renderer.render(probe, camera); }
      catch { /* 这一支编不过也继续。 */ }
      finally {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, viewSize.x, viewSize.y);
        renderer.setRenderTarget(prevTarget);
      }
      probe.remove(obj);
      obj.visible = vis;
      obj.frustumCulled = culled;
      if (parent) {
        const kids = parent.children;
        const at = index >= 0 && index <= kids.length ? index : kids.length;
        kids.splice(at, 0, obj);
        obj.parent = parent;
      }
      if (intoView) {
        obj.visible = true;
        // 远景还没开时，编完一个就整幅画出来。进度条后面先是楼，不是空天。
        if (!vistaRun) showVistaStill();
      }
      loadSpan(markFrom, markTo, i + 1, list.length);
      await shown();
    }
  } finally {
    if (intoView) {
      for (let i = 0; i < list.length; i++) list[i].visible = true;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, viewSize.x, viewSize.y);
    renderer.setRenderTarget(prevTarget);
  }
}

function knownVisitor() {
  return hasEnteredName() || params.has("noname") || nameCommitted;
}

function refreshLiftNames() {
  const list = document.getElementById("lift-list");
  if (!list || !built) return;
  const buttons = list.children;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    if (!button.dataset || button.dataset.floor == null || button.dataset.floor === "") continue;
    const f = Number(button.dataset.floor);
    const names = built.floorNames[f];
    button.textContent = liftFloorLabel(names, f, hangSort, built.floorSpans && built.floorSpans[f]);
  }
}

function rehangFrames() {
  // 画框要进馆后才挂上。这时改排序就先记下，挂完再排，不整页重来。
  if (!built || !sites || !mats) return;
  const ordered = hangOrder(sites, hangArrange, hangSort);
  if (!ordered || ordered.chosen.length !== built.frames.length) {
    location.reload();
    return;
  }
  for (let i = 0; i < ordered.chosen.length; i++) built.frames[i].siteIndex = ordered.chosen[i];
  built.hangCat = ordered.hangCat;
  retitleFloors(built, hangSort, sites);
  if (!panel.hidden) closePanel(false);
  if (hoverIndex >= 0) setHover(-1);
  refreshLiftNames();
  atlasReady.clear();
  prefetchFloor = -2;
  floorLoaded = -2;
  pictureAim = -1;
  revealFloor = -1;
  // 图集按旧顺序画在这一层。pictureFloor 还指着本层时，startBuild 会当成正在画而直接跳过。
  pictureFloor = -2;
  pictureDefer = null;
  place.textContent = "";
  trackPictures();
}

async function buildScene(data, arrange) {
  const directPose = params.has("selftest") || params.has("preview") || params.has("x") || params.has("z") || params.has("y") || params.has("yaw") || params.has("car");
  paceBoot = true;
  sites = data.sites;
  hangArrange = arrange;
  hangSort = readSortMode();
  const hangAtBoot = hangSort;
  await bootMark(LOAD_ARRANGE);
  built = buildMuseum(sites, hangArrange, hangSort);
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
  if (params.has("y")) py = Number(params.get("y"));
  if (params.has("x") || params.has("z") || params.has("y")) camera.position.set(px, py + EYE, pz);
  if (params.has("yaw")) {
    camera.rotation.y = Number(params.get("yaw")) * Math.PI / 180;
    camera.rotation.x = Number(params.get("pitch") || 0) * Math.PI / 180;
  }
  entryView = captureView();
  await bootMark(0.2);
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
    roof: { value: 6.5 },
    city: { value: Array.from({ length: CITY_SHADOW_MAX }, () => new THREE.Vector4()) },
    cityH: { value: new Float32Array(CITY_SHADOW_MAX) },
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
  await bootMark(LOAD_LAYOUT);

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
  const curb = wallMesh(built.curb, curbMat);
  if (stone) scene.add(stone);
  if (cornerMesh) scene.add(cornerMesh);
  if (bandMesh) scene.add(bandMesh);
  if (curb) scene.add(curb);
  const level = floorAndCeiling(built.bounds, floorMat, ceilMat, null, roomMat);
  scene.add(level.floor);
  // 外立面先出现在进度条后面。清屏天色只留到楼体网格交出去之前。
  await warmFresh(0.3, LOAD_SHELL, true);
  if (!directPose) startVista();
  // 后补的楼先藏着。远景继续画已经露出来的外立面，编完一个再露一个。
  const held = [];
  const hold = (obj) => {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh || child.isPoints || child.isLine || child.isSprite) child.visible = false;
    });
    scene.add(obj);
    held.push(obj);
  };
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
  fillCityShadows(horizon.blocks);
  hold(horizon.root);
  await bootMark(0.5);
  const yard = yardMeshes(
    built.yard,
    lit(0x6b5142, "open"),
    lit(0x3f6a45, "open"),
    lit(0x4f7c52, "open"),
    lit(0xa68462, "open"),
  );
  if (yard) hold(yard);
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
    if (mesh) {
      if (kind === "glass") mesh.renderOrder = 3;
      hold(mesh);
    }
    loadSpan(0.5, 0.56, k + 1, kinds.length);
    await shown();
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
  if (storySlabs) hold(storySlabs);
  if (storyCeils) hold(storyCeils);
  const props = lobbyPropMeshes(built.extinguishers, built.tables, {
    red: lit(0xc52828, "room"),
    metal: lit(0x2a2c2e, "room"),
    wood: woodMat,
    chair: lit(0xffffff, "room"),
    vase: lit(0xf3f0ea, "room"),
    stem: leafMat,
    flowers: [lit(0xd24b4b, "room"), lit(0xe7c14a, "room"), lit(0xf4f1ea, "room"), lit(0xd46a8c, "room")],
  });
  if (props) hold(props);
  const deckShellMat = lit(stoneColor, "open", {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const lobes = lobeMeshes(built.lobes, plateMat, deckShellMat);
  if (lobes) hold(lobes);
  const hands = handrailMesh(built.handrails, woodMat);
  if (hands) hold(hands);
  const labels = labelMeshes(built.signs);
  if (labels) hold(labels);
  const deckRail = deckRailMesh(built.lobes, glassMat, railMat);
  if (deckRail) hold(deckRail);
  doorOpen = new Array(built.floors).fill(0);
  doorHeld = new Array(built.floors).fill(false);
  doors = doorRig(doorGlass, doorFrame, built.floors);
  doors.update(doorOpen);
  hold(doors.root);
  lift = createLift(built.floors, STORY);
  liftDoors = liftRig(doorGlass, doorFrame, roomMat, ceilMat, built.floors, plateMat);
  liftDoors.update(doorOpen, 0);
  hold(liftDoors.root);
  fillLiftPad();
  if (params.has("car") && lift) {
    const level = Number(params.get("car"));
    if (Number.isFinite(level)) {
      lift.place(level);
      if (!params.has("y")) {
        py = lift.y;
        if (entryView) {
          entryView.py = py;
          entryView.pos.y = py + EYE;
        }
      }
    }
  }
  const inner = wallMesh(built.white.concat(built.liners), whiteMat);
  if (inner) hold(inner);
  await bootMark(0.6);
  // 门、屋顶和内墙补上时，远景已经在走。一次只编一个，编完再露出来。
  await warmFresh(0.6, 0.74, true);
  for (let h = 0; h < held.length; h++) {
    held[h].traverse((child) => {
      if (child.isMesh || child.isPoints || child.isLine || child.isSprite) child.visible = true;
    });
  }
  if (!vistaRun) showVistaStill();
  const parked = [];
  const stage = (obj) => {
    if (!obj) return;
    // 远景不画这些。进馆之后再亮，着色器已经编过。
    if (!directPose && !hallReady) {
      obj.visible = false;
      parked.push(obj);
    }
    scene.add(obj);
  };
  async function hangFrames() {
    paceBoot = true;
    try {
      await shown();
      if (!built.frames.length) {
        framesReady = true;
        return;
      }
      const framePair = allocFrameMeshes(built.frames, borderMat, matMat);
      await paceRanges(built.frames.length, (from, to) => {
        writeFrameMeshes(built.frames, framePair, from, to);
      }, 1, 1);
      finishFrameMeshes(framePair);
      stage(framePair.border);
      stage(framePair.mat);
      mats = framePair.mat;
      const white = new THREE.Color("#f7f3ec");
      baseColors = new Array(built.frames.length);
      hoverColors = new Array(built.frames.length);
      await paceRanges(built.frames.length, (from, to) => {
        for (let i = from; i < to; i++) {
          baseColors[i] = new THREE.Color(built.frames[i].color);
          hoverColors[i] = baseColors[i].clone().lerp(white, 0.55);
        }
      }, 1, 1);
      framesReady = true;
      const indoorShadow = softShadowMaterial(0.55);
      let frameShade = null;
      await paceRanges(built.frames.length, (from, to) => {
        frameShade = frameShadowMesh(built.frames, indoorShadow, from, to, frameShade);
      }, 1, 1);
      if (frameShade) stage(frameShade);
      await shown();
      try { await prepareAtlases(); }
      catch (err) { console.error(err); }
      await warmFresh(1, 1, false);
      if (hangSort !== hangAtBoot) rehangFrames();
    } finally {
      paceBoot = false;
    }
  }
  beginHang = () => {
    if (beginHang.started) return;
    beginHang.started = true;
    hangFrames().catch((err) => console.error(err));
  };
  if (built.plants.length) {
    const plants = plantMeshes(built.plants, potMat, leafMat);
    if (plants.pots) stage(plants.pots);
    for (let i = 0; i < plants.leaves.length; i++) if (plants.leaves[i]) stage(plants.leaves[i]);
    const plantShade = softShadowMaterial(0.6, true);
    shadowMesh = plantShadowMesh(built.plants, plantShade);
    if (shadowMesh) {
      placePlantShadows(shadowMesh, built.plants, 1.7);
      stage(shadowMesh);
    }
  }
  await bootMark(0.7);
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
    stage(indoorDropMesh);
  }
  await shown();
  shapeMat = shapeShadowMaterial(shapeShadowOpacity(DAYS[dayCursor], sunVector(DAYS[dayCursor])));
  patchMesh = sunPatchMesh(built.openings.length);
  stage(patchMesh);
  nightSpillMesh = sunPatchMesh(2);
  // 观景台影子和门口路面都往镜头偏。光画在它们之后，并再偏一档，才留在最上面。
  nightSpillMesh.renderOrder = 2;
  nightSpillMesh.material.polygonOffset = true;
  nightSpillMesh.material.polygonOffsetFactor = -5;
  nightSpillMesh.material.polygonOffsetUnits = -8;
  stage(nightSpillMesh);
  await shown();
  beacons = makeBeacons(built.dress.find((item) => item.kind === "roof"));
  if (beacons) scene.add(beacons.group);
  const cones = lightConeMesh(built.cones, coneMat);
  const discs = floorDiscMesh(built.cones, discMat);
  const heads = spotHeadMesh(
    built.cones,
    beamMat,
    lit(0xd5cfc6, "room"),
  );
  if (cones) stage(cones);
  if (discs) stage(discs);
  if (heads) stage(heads);
  await shown();
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
  if (leds) stage(leds);
  if (sconces) stage(sconces);
  if (params.has("debug")) scene.add(colliderLines(built.walls));
  await bootMark(LOAD_INDOOR);

  legendEl.replaceChildren();
  for (let i = 0; i < built.legend.length; i++) {
    const item = built.legend[i];
    const li = document.createElement("li");
    li.dataset.name = item.name;
    li.textContent = `${item.name} · ${item.count}`;
    legendEl.appendChild(li);
  }

  await shown();
  parkFresh = stage;
  applyDay(openingDay());
  parkFresh = null;
  await shown();
  const visitorMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  attachSun(visitorMat, sunShared, sunRoles.body);
  const visitorShadow = softShadowMaterial(0.5);
  selfVisitor = createVisitor(visitorMat, visitorShadow);
  selfVisitor.group.visible = false;
  scene.add(selfVisitor.group);
  await shown();
  reception = createReception(scene, sunShared, sunRoles.body);
  reception.place(receptionRender, performance.now());
  // 远景不画接待机器人。着色器留到后面逐个编，不在这里整场景画一帧。
  reception.group.visible = false;
  await shown();
  presence = mountPresence({
    scene,
    material: visitorMat,
    shadowMaterial: visitorShadow,
    zones: built.zones,
    paintPlan: paintCornerPlan,
    planHeight: cornerPlanHeight,
    onReleaseLook: releaseLook,
    getPose: () => {
      planarBasis(lookSource(), fwd, right);
      return { x: px, z: pz, y: py, yaw: yawFacing(fwd) };
    },
    onTyping: (active) => {
      if (active) down.clear();
    },
    onGate: (open) => {
      if (open) {
        nameCommitted = false;
        showEscCard();
      } else {
        nameCommitted = true;
        hideEscCard();
        if (directPose) {
          if (hallReady) reveal();
          return;
        }
        // 卡片先拿掉。远景停在这一帧，滑行从这里出发，不从下一帧的横移出发。
        arriveFromGate = true;
        stopVista();
        if (hallReady) scheduleArrival();
      }
    },
    onKick: (active) => {
      visitorOut = !!active;
      if (active) releaseLook();
    },
    onMusic: (view) => {
      if (view && typeof view.sign === "string") applySign(view.sign, view.speed);
      if (ambience) ambience.follow(view);
    },
    onSign: applySign,
    onRobot: onRobotMessage,
    onRobotFace,
    onNotes: onNotesMessage,
    onUnlink: onDeskUnlink,
    onLift: onLiftMessage,
    onExclusive: (which) => {
      if (which === "roster") closeLiftPad();
    },
    onSort: (mode) => {
      if (mode !== "cat" && mode !== "time") return;
      if (mode === hangSort) return;
      hangSort = mode;
      rehangFrames();
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
  const nameGate = document.getElementById("name-gate");
  const holdGate = !!(nameGate && !nameGate.hidden);
  if (holdGate) {
    nameGate.classList.remove("is-shown");
    nameGate.hidden = true;
  }
  resize();
  shownFloor = playerFloor();
  if (params.get("person") === "3") thirdPerson = true;
  if (params.has("nav")) {
    const toggle = document.getElementById("drawer-toggle");
    if (toggle) toggle.click();
  }
  ambience = createAmbience();
  await shown();
  // 远景已经在画楼。剩下的室内着色器逐个编，进度条继续往前走。
  await warmFresh(LOAD_INDOOR, 1, false);
  if (directPose) showVistaStill();
  else if (!vistaRun) startVista();
  setLoadProgress(1);
  await shown();
  function settleHall() {
    loadPace = false;
    paceBoot = false;
    hallReady = true;
    for (let i = 0; i < parked.length; i++) parked[i].visible = true;
    stopVista();
    applyDay(DAYS[dayCursor]);
    renderer.setRenderTarget(null);
    resize();
    setLoadProgress(1);
    loading.classList.remove("name-hold", "is-leaving");
    loading.hidden = true;
  }

  function fadeLoadingOut() {
    if (!loading || loading.hidden) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      loading.classList.remove("name-hold", "is-leaving");
      loading.hidden = true;
      return;
    }
    loading.classList.add("is-leaving");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      loading.hidden = true;
      loading.classList.remove("is-leaving", "name-hold");
    };
    const timer = window.setTimeout(finish, 1100);
    loading.addEventListener("transitionend", function onEnd(event) {
      if (event.target !== loading || event.propertyName !== "opacity") return;
      window.clearTimeout(timer);
      loading.removeEventListener("transitionend", onEnd);
      finish();
    });
  }

  function showOpeningGate() {
    if (!holdGate || !nameGate) return;
    nameGate.classList.remove("is-shown");
    nameGate.hidden = false;
    const nameInput = document.getElementById("name-input");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealGate = () => {
      if (nameGate.hidden) return;
      nameGate.classList.add("is-shown");
      if (!nameInput) return;
      try { nameInput.focus({ preventScroll: true }); }
      catch { nameInput.focus(); }
    };
    if (reduced) revealGate();
    else requestAnimationFrame(revealGate);
  }

  // 夜空加载层淡出后，昵称和南立面远景一起出现。横移从西边重新起。
  function unveilOpening() {
    loadPace = false;
    paceBoot = false;
    if (!vistaRun) startVista();
    vistaT0 = vistaNow;
    fadeLoadingOut();
    showOpeningGate();
  }

  function showPlayHud() {
    document.body.classList.remove("opening");
    hideEscCard();
    where.hidden = false;
    crosshair.hidden = false;
    if (gateOpen()) {
      const input = document.getElementById("name-input");
      if (input) input.focus();
    }
    if (heardGesture && ambience) ambience.unlock();
    if (presence && presence.syncTabHint) presence.syncTabHint();
  }

  function presentPlayer() {
    showReception(performance.now());
    showPlayHud();
    trackPictures();
    requestAnimationFrame(animate);
  }

  function reveal() {
    if (reveal.done || arrivalQueued) return;
    reveal.done = true;
    settleHall();
    if (entryView) restoreView(entryView);
    presentPlayer();
  }

  function beginArrival() {
    if (reveal.done) return;
    reveal.done = true;
    settleHall();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!entryView || reduced) {
      if (entryView) restoreView(entryView);
      presentPlayer();
      return;
    }
    arrivalFromPos.copy(camera.position);
    arrivalFromQuat.copy(camera.quaternion);
    arrivalToPos.copy(entryView.pos);
    arrivalToQuat.setFromEuler(entryView.rot);
    const samePlace = arrivalFromPos.distanceToSquared(arrivalToPos) < 0.0025
      && Math.abs(arrivalFromQuat.dot(arrivalToQuat)) > 0.9995;
    if (samePlace) {
      restoreView(entryView);
      presentPlayer();
      return;
    }
    const held = performance.now();
    if (horizon) horizon.drift(held);
    paintBeacons(held);
    // 往下飞的这几帧不画展厅里的人。欢迎包刚到时人模还没进玩家循环，不能先露在一楼。
    veilHallBodies(true);
    // 室内网格和真实时辰先画在原地。这一下若偏慢，时钟还没走，镜头不会跳。
    try { renderer.render(scene, camera); } catch { /* 这一帧画失败就等下一帧。 */ }
    const t = performance.now();
    arrivalStamp = t;
    arrivalNow = t;
    arrivalT0 = t;
    arrivalRun = true;
    requestAnimationFrame(arrivalFrame);
  }

  function arrivalFrame(t) {
    if (!arrivalRun) return;
    const now = advanceArrival(t || performance.now());
    const u = Math.min(1, (now - arrivalT0) / ARRIVE_MS);
    if (horizon) horizon.drift(now);
    paintBeacons(now);
    if (u >= 1) {
      arrivalRun = false;
      showReception(now);
      // 不用插值收尾。最后一帧就是出生姿态，下一帧玩家循环接上才没有一跳。
      if (entryView) restoreView(entryView);
      showPlayHud();
      try { renderer.render(scene, camera); } catch { /* 这一帧画失败就等下一帧。 */ }
      trackPictures();
      requestAnimationFrame(animate);
      return;
    }
    placeArrival(easeOutArrive(u));
    try { renderer.render(scene, camera); } catch { /* 这一帧画失败就等下一帧。 */ }
    if (arrivalRun) requestAnimationFrame(arrivalFrame);
  }

  function scheduleArrival() {
    if (reveal.done || arrivalQueued) return;
    arrivalQueued = true;
    // 先让昵称卡片从画面上消失，再开室内。这两帧镜头不动。
    requestAnimationFrame(() => {
      requestAnimationFrame(beginArrival);
    });
  }

  function arriveFromLoad() {
    if (reveal.done || arrivalQueued) return;
    // 加载画面就停在刚画完的这一帧。下一帧再开室内，滑行从这一机位出发。
    stopVista();
    arrivalQueued = true;
    requestAnimationFrame(beginArrival);
  }

  hallReady = true;
  if (directPose) {
    if (holdGate && !hasEnteredName()) showOpeningGate();
    reveal();
    return;
  }
  if (arriveFromGate) {
    stopVista();
    scheduleArrival();
    return;
  }
  if (holdGate) {
    unveilOpening();
    return;
  }
  if (hasEnteredName()) {
    arriveFromLoad();
    return;
  }
  if (knownVisitor()) reveal();
  else unveilOpening();
}

// 场景画完再传图。这一帧剩下的时间不够，就只传一格，避免图片出现前掉帧。
const FRAME_MS = 14;

function afterFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame((now) => {
      window.setTimeout(() => resolve(now), 0);
    });
  });
}

function runSliced(token, step) {
  const tick = (frameStart) => {
    if (token !== buildSerial) return;
    const limit = performance.now() + Math.max(0, FRAME_MS - (performance.now() - frameStart));
    let steps = 0;
    while (steps < 8) {
      if (!step()) return;
      steps += 1;
      if (performance.now() >= limit) break;
    }
    afterFrame().then(tick);
  };
  afterFrame().then(tick);
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

function allocAtlasTexture(w, h) {
  const texture = new THREE.Texture({ width: w, height: h });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = true;
  // 只分配显存。dataReady 保持为假，渲染器才不会把占位对象整张传上去。
  texture.source.dataReady = false;
  texture.needsUpdate = true;
  try { renderer.initTexture(texture); }
  catch { /* 分配失败也继续，画芯先留白。 */ }
  texture.needsUpdate = false;
  texture.source.dataReady = false;
  return texture;
}

function paperStrip(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  ctx.fillStyle = "#f7f5f2";
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.Texture(canvas);
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  return texture;
}

async function uploadPaper(texture, w, h) {
  const stripH = Math.min(64, h);
  const full = paperStrip(w, stripH);
  const tailH = h % stripH;
  const tail = tailH ? paperStrip(w, tailH) : null;
  let y = 0;
  try {
    while (y < h) {
      const frameStart = await afterFrame();
      const limit = performance.now() + Math.max(0, FRAME_MS - (performance.now() - frameStart));
      let bands = 0;
      do {
        const row = Math.min(stripH, h - y);
        const src = row === stripH ? full : tail;
        try {
          renderer.copyTextureToTexture(src, texture, null, { x: 0, y: h - y - row });
        } catch {
          return;
        }
        y += row;
        bands += 1;
      } while (y < h && bands < 4 && performance.now() < limit);
    }
  } finally {
    full.dispose();
    if (tail) tail.dispose();
  }
}

function ensureScratch(cellW, cellH) {
  const prev = atlasSlots.scratch;
  if (prev && prev.w === cellW && prev.h === cellH) return prev;
  if (prev && prev.texture) prev.texture.dispose();
  const canvas = document.createElement("canvas");
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const texture = new THREE.Texture(canvas);
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  const scratch = { canvas, ctx, texture, w: cellW, h: cellH };
  atlasSlots.scratch = scratch;
  return scratch;
}

async function prepareAtlases() {
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
  // 图集在进馆之后才铺。这里只让帧，不再推加载条。不建整张画布，避免回读时卡顿。
  for (let s = 0; s < 2; s++) {
    await afterFrame();
    atlasSlots.push({ texture: allocAtlasTexture(w, h), w, h });
  }
  for (let s = 0; s < atlasSlots.length; s++) {
    await uploadPaper(atlasSlots[s].texture, w, h);
  }
  ensureScratch(grid.cellW, grid.cellH);
  const attr = new THREE.InstancedBufferAttribute(blankUv(), 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  mats.geometry.setAttribute("frameUv", attr);
  mats.material.map = atlasSlots[0].texture;
  mats.material.needsUpdate = true;
  const white = new THREE.Color("#ffffff");
  if (built.frames.length) mats.setColorAt(0, white);
  await nextFrame();
  for (let i = 0; i < built.frames.length; i++) {
    baseColors[i].copy(white);
    hoverColors[i].copy(white);
    mats.setColorAt(i, white);
    if ((i + 1) % 64 === 0) await nextFrame();
  }
  mats.instanceColor.needsUpdate = true;
  shownAtlas = 0;
  pictureGrid = grid;
  await nextFrame();
  flushPictureDefer();
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

function drawContain(ctx, img, ox, oy, cellW, cellH) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW < 1 || srcH < 1) return;
  const fit = containRect(srcW, srcH, cellW, cellH);
  ctx.drawImage(img, 0, 0, srcW, srcH, ox + fit.x, oy + fit.y, fit.w, fit.h);
}

function paintCell(scratch, img) {
  scratch.ctx.fillStyle = "#f7f5f2";
  scratch.ctx.fillRect(0, 0, scratch.w, scratch.h);
  if (img) drawContain(scratch.ctx, img, 0, 0, scratch.w, scratch.h);
}

function paintIntoSlot(token, floor, pictures, fallback) {
  if (token !== buildSerial) return;
  if (!mats || !atlasSlots.length) {
    pictureDefer = { token, floor, pictures, fallback };
    return;
  }
  const slot = claimSlot();
  const holder = atlasSlots[slot];
  const grid = atlasGridSize;
  const uv = blankUv();
  const scratch = ensureScratch(grid.cellW, grid.cellH);
  // 第 0 格是占位图。没配图或没拉下来的画框都指着它，不各占一格。
  const cells = [{ col: 0, row: 0, img: fallback || null }];
  for (let i = 0; i < pictures.length; i++) {
    const cell = i + 1;
    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    cells.push({ col, row, img: pictures[i].img });
    uv.set(cellUv(col, row, grid.cols, grid.rows), pictures[i].index * 4);
  }
  let cursor = 0;
  runSliced(token, () => {
    if (cursor >= cells.length) {
      const pack = { floor, texture: holder.texture, uv, slot, count: pictures.length };
      atlasReady.set(floor, pack);
      if (revealFloor === floor) applyAtlas(pack);
      return false;
    }
    const cell = cells[cursor];
    paintCell(scratch, cell.img);
    try {
      renderer.copyTextureToTexture(scratch.texture, holder.texture, null, {
        x: cell.col * scratch.w,
        y: holder.h - (cell.row + 1) * scratch.h,
      });
    } catch {
      /* 这一格传不上去就留底色。 */
    }
    cursor += 1;
    return true;
  });
}

// 当前层的图一旦都进了缓存，马上加载楼上和楼下。只进缓存，不画进图集。人还在电梯里时不预取。
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

function flushPictureDefer() {
  const pending = pictureDefer;
  if (!pending || pending.token !== buildSerial || !mats || !atlasSlots.length) return;
  pictureDefer = null;
  if (pending.plain) commitPlain(pending.floor);
  else paintIntoSlot(pending.token, pending.floor, pending.pictures, pending.fallback);
}

function startBuild(floor, showWhenDone) {
  if (!built || floor < 0 || floor >= built.floors) return;
  if (showWhenDone) revealFloor = floor;
  const cached = atlasReady.get(floor);
  if (cached) {
    floorLoaded = floor;
    if (revealFloor === floor) applyAtlas(cached);
    if (showWhenDone || revealFloor === floor) prefetchAround(floor);
    return;
  }
  if (pictureFloor === floor && pictureToken === buildSerial) return;
  pictureFloor = floor;
  pictureDefer = null;
  const token = ++buildSerial;
  pictureToken = token;
  dropQueued();
  const jobs = floorPictureJobs(floor);
  const pictures = [];
  let fallback = null;
  let left = jobs.length + (FALLBACK_SRC ? 1 : 0);
  if (!left) {
    floorLoaded = floor;
    commitPlain(floor);
    if (showWhenDone || revealFloor === floor) prefetchAround(floor);
    return;
  }
  const finish = () => {
    if (token !== buildSerial) return;
    left -= 1;
    if (left > 0) return;
    floorLoaded = floor;
    if (showWhenDone || revealFloor === floor) prefetchAround(floor);
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
  if (!mats || !atlasSlots.length) {
    pictureDefer = { token: buildSerial, floor, plain: true };
    return;
  }
  const slot = claimSlot();
  const pack = { floor, texture: atlasSlots[slot].texture, uv: blankUv(), slot, count: 0 };
  atlasReady.set(floor, pack);
  if (revealFloor === floor) applyAtlas(pack);
  else markPictures(0);
}

function trackPictures() {
  if (!built) return;
  beginHang();
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
    if (floorLoaded === standing) prefetchAround(standing);
    return;
  }
  revealFloor = standing;
  const pack = atlasReady.get(standing);
  if (pack && mats && mats.material.map !== pack.texture) applyAtlas(pack);
  if (floorLoaded === standing) prefetchAround(standing);
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
  .then((data) => {
    setLoadProgress(LOAD_LIST);
    loadCeil = 0.13;
    return yieldPaint().then(() => loadArrange().then((arrange) => ({ data, arrange })));
  })
  .then((packed) => {
    loadPace = false;
    setLoadProgress(LOAD_ARRANGE);
    return yieldPaint().then(() => buildScene(packed.data, packed.arrange));
  })
  .catch((err) => {
    const missed = err && String(err.message || "").indexOf("sites.json") >= 0;
    showFatal(missed ? "展品清单没有读到。请先运行 node tools/fetch-sites.mjs" : "展厅没有布置完。请刷新再试。");
  });
