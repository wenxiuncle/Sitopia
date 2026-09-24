import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three.module.js";
import { forwardFromYaw, planarBasis, yawFacing } from "../js/basis.js";
import { createVisitor, poseVisitor } from "../js/avatar.js";
import { attachLobby } from "./lobby.mjs";
import {
  CEIL_TILT,
  EYE,
  FLOOR_TILT,
  FRAME,
  HALLS,
  PLAZA,
  PLAYER_RADIUS,
  buildMuseum,
  blocked,
  movePlayer,
} from "../js/layout.js";
import { DAYS, findDay, groundShadow, openingQuads, sunVector } from "../js/day.js";
import { atlasGrid, cellUv, coverRect, floorAndCeiling, frameMeshes, usableFrameImage, wallMesh } from "../js/meshes.js";
import { extractBlurb, extractImage, extractPortal, markedDown } from "./fetch-sites.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function assert(cond, message) {
  if (!cond) failures.push(message);
}

function closeTo(v, x, y, z, message) {
  const ok = Math.abs(v.x - x) < 1e-3 && Math.abs(v.y - y) < 1e-3 && Math.abs(v.z - z) < 1e-3;
  assert(ok, `${message}: got ${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`);
}

function fixture() {
  const sites = [];
  let id = 1;
  for (let i = 0; i < 12; i++) {
    sites.push({
      id: id++,
      title: "其它" + i,
      blurb: "测试介绍",
      portal: "https://example.com/" + id,
      article: "https://youquhome.com/" + id + "/",
      cat: 3,
    });
  }
  const hall = HALLS[0];
  for (let i = 0; i < 250; i++) {
    sites.push({
      id: id++,
      title: hall.name + i,
      blurb: "测试介绍",
      portal: "https://example.com/" + id,
      article: "https://youquhome.com/" + id + "/",
      cat: hall.cat,
    });
  }
  return sites;
}

function indexWalls(walls) {
  const cell = 0.45;
  const map = new Map();
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const x0 = Math.floor((w.minX - PLAYER_RADIUS) / cell);
    const x1 = Math.floor((w.maxX + PLAYER_RADIUS) / cell);
    const z0 = Math.floor((w.minZ - PLAYER_RADIUS) / cell);
    const z1 = Math.floor((w.maxZ + PLAYER_RADIUS) / cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = x + "," + z;
        let list = map.get(key);
        if (!list) map.set(key, (list = []));
        list.push(w);
      }
    }
  }
  return { map, cell };
}

function blockedFast(x, z, index) {
  const key = Math.floor(x / index.cell) + "," + Math.floor(z / index.cell);
  const list = index.map.get(key);
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (x > w.minX - PLAYER_RADIUS && x < w.maxX + PLAYER_RADIUS && z > w.minZ - PLAYER_RADIUS && z < w.maxZ + PLAYER_RADIUS) {
      return true;
    }
  }
  return false;
}

function insideZone(x, z, zones) {
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return true;
  }
  return false;
}

function flood(built) {
  const cell = 0.45;
  const index = indexWalls(built.walls);
  const minX = built.bounds.minX - 4;
  const maxX = built.bounds.maxX + 4;
  const minZ = built.bounds.minZ - 4;
  const maxZ = built.bounds.maxZ + 4;
  const x0 = Math.floor(minX / cell);
  const z0 = Math.floor(minZ / cell);
  const cols = Math.floor(maxX / cell) - x0 + 1;
  const rows = Math.floor(maxZ / cell) - z0 + 1;
  const seen = new Uint8Array(cols * rows);
  const qx = new Int32Array(cols * rows);
  const qz = new Int32Array(cols * rows);
  let qs = 0;
  let qe = 0;
  const sx = Math.floor(built.spawn.x / cell);
  const sz = Math.floor(built.spawn.z / cell);
  const push = (x, z) => {
    if (x < x0 || z < z0 || x >= x0 + cols || z >= z0 + rows) return;
    const id = (z - z0) * cols + (x - x0);
    if (seen[id]) return;
    const wx = (x + 0.5) * cell;
    const wz = (z + 0.5) * cell;
    if (blockedFast(wx, wz, index)) {
      seen[id] = 1;
      return;
    }
    seen[id] = 2;
    qx[qe] = x;
    qz[qe] = z;
    qe++;
  };
  push(sx, sz);
  let leaks = 0;
  while (qs < qe) {
    const x = qx[qs];
    const z = qz[qs];
    qs++;
    const wx = (x + 0.5) * cell;
    const wz = (z + 0.5) * cell;
    if (!insideZone(wx, wz, built.zones)) leaks++;
    push(x + 1, z);
    push(x - 1, z);
    push(x, z + 1);
    push(x, z - 1);
  }
  return { seen, cols, rows, x0, z0, cell, leaks };
}

function reachable(flooded, x, z) {
  const gx = Math.floor(x / flooded.cell);
  const gz = Math.floor(z / flooded.cell);
  if (gx < flooded.x0 || gz < flooded.z0) return false;
  const id = (gz - flooded.z0) * flooded.cols + (gx - flooded.x0);
  if (id < 0 || id >= flooded.seen.length) return false;
  return flooded.seen[id] === 2;
}

function checkParser() {
  const kami = '<p>折叠屏终于有点好玩的东西了！</p><p>传送门 <a href="https://kami.maxwase.eu/" target="_blank">https://kami.maxwase.eu/</a></p>';
  const tetra = "<p>经典。</p><!--more--><p>传送门 <a href=\"https://later.example/\">x</a></p>";
  const nbsp = '<p>介绍。</p><p>传送门&nbsp;<a href="https://www.freetetris.org/">https://www.freetetris.org/</a></p>';
  const ad = "<p>全球免费在线小游戏合集</p><p>传送门 榜一大哥位置</p>";
  const dead = '<p>介绍还在。</p><p>传送门 <del>http://www.jellyjumper.com/</del> 已挂</p>';
  assert(extractPortal(kami) === "https://kami.maxwase.eu/", "kami portal");
  assert(extractPortal(nbsp) === "https://www.freetetris.org/", "nbsp portal");
  assert(extractPortal(tetra) === "", "portal after more is ignored");
  assert(extractPortal(ad) === "", "ad slot has no portal");
  assert(extractPortal(dead) === "http://www.jellyjumper.com/", "struck portal is kept");
  assert(markedDown(dead) === true, "已挂 is flagged");
  assert(markedDown(kami) === false, "live portal is not flagged");
  assert(extractBlurb(kami).includes("折叠屏"), "blurb keeps opening");
  assert(!extractBlurb(kami).includes("kami.maxwase"), "blurb drops portal url");
  const pic = '<p><img src="https://img.youquhome.com/uploads/2026/09/kami.webp" alt="kami"></p>';
  assert(extractImage(pic) === "https://img.youquhome.com/uploads/2026/09/kami.webp", "opening image");
  const junk = '<img src="https://s.w.org/images/core/emoji/14/svg/1f600.svg" width="20" height="20"><img src="https://img.youquhome.com/a.webp">';
  assert(extractImage(junk) === "https://img.youquhome.com/a.webp", "skip emoji");
  assert(extractImage('<img src="https://img.youquhome.com/uploads/2026/03/emojiparty.jpg">') === "https://img.youquhome.com/uploads/2026/03/emojiparty.jpg", "emoji in the filename stays");
  const late = "<p>无图</p><!--more--><img src=\"https://img.youquhome.com/later.webp\">";
  assert(extractImage(late) === "https://img.youquhome.com/later.webp", "image after more still counts");
  assert(usableFrameImage("https://img.youquhome.com/uploads/2026/09/kami.webp") === "https://img.youquhome.com/uploads/2026/09/kami.webp", "picture host is usable");
  assert(usableFrameImage("https://evil.example/a.webp") === "", "other hosts are not frame images");
  assert(usableFrameImage("http://img.youquhome.com/a.webp") === "", "picture url stays https");
  const wide = coverRect(1000, 200, 370, 180);
  assert(Math.abs(wide.h - 180) < 1e-6 && wide.w > 370, "wide image covers the frame");
  assert(Math.abs(wide.w / wide.h - 5) < 1e-6, "wide image keeps its ratio");
  const tall = coverRect(200, 1000, 370, 180);
  assert(Math.abs(tall.w - 370) < 1e-6 && tall.h > 180, "tall image covers the frame");
  assert(Math.abs(tall.w / tall.h - 0.2) < 1e-6, "tall image keeps its ratio");
  const grid = atlasGrid(101, 4096);
  assert(grid.cols * grid.cellW <= 4096 && grid.rows * grid.cellH <= 4096, "atlas fits");
  assert(grid.cols * grid.rows >= 101, "atlas has a cell per picture");
  assert(Math.abs(grid.cellW / grid.cellH - 3.7 / 1.8) < 1e-9, "atlas cell matches the frame");
  checkPictureFacing();
}

// 图集左缘画在较小的 U。正反两面站在画前时，这一侧都要落在画面左边。
function checkPictureFacing() {
  const cell = cellUv(1, 0, 10, 11);
  assert(cell[2] > 0 && cell[3] > 0, "atlas cell keeps picture orientation");
  const mat = new THREE.MeshBasicMaterial();
  const drawnLeft = cell[0];
  const drawnRight = cell[0] + cell[2];
  const drawnBottom = cell[1];
  const drawnTop = cell[1] + cell[3];
  for (const nz of [1, -1]) {
    const frames = [{ x: 0, y: 1.5, z: -10, nx: 0, nz, siteIndex: 0, color: "#ffffff" }];
    const meshes = frameMeshes(frames, mat, mat);
    meshes.mat.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    camera.position.set(0, 1.5, -10 + nz * 2);
    camera.lookAt(0, 1.5, -10);
    camera.updateMatrixWorld(true);
    const geo = meshes.mat.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const inst = new THREE.Matrix4();
    meshes.mat.getMatrixAt(0, inst);
    let leftX = 0;
    let leftN = 0;
    let rightX = 0;
    let rightN = 0;
    let topY = 0;
    let topN = 0;
    let botY = 0;
    let botN = 0;
    for (let i = 0; i < pos.count; i++) {
      const world = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(inst);
      const ndc = world.project(camera);
      const atlasU = cell[0] + uv.getX(i) * cell[2];
      const atlasV = cell[1] + uv.getY(i) * cell[3];
      if (Math.abs(atlasU - drawnLeft) < 1e-5) {
        leftX += ndc.x;
        leftN += 1;
      }
      if (Math.abs(atlasU - drawnRight) < 1e-5) {
        rightX += ndc.x;
        rightN += 1;
      }
      if (Math.abs(atlasV - drawnTop) < 1e-5) {
        topY += ndc.y;
        topN += 1;
      }
      if (Math.abs(atlasV - drawnBottom) < 1e-5) {
        botY += ndc.y;
        botN += 1;
      }
    }
    const face = nz < 0 ? "back" : "front";
    assert(leftN === 2 && rightN === 2 && leftX / leftN < rightX / rightN, `${face} picture is mirrored`);
    assert(topN === 2 && botN === 2 && topY / topN > botY / botN, `${face} picture is upside down`);
  }
}

function checkMotion(built) {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
  camera.rotation.order = "YXZ";
  camera.rotation.set(0, 0, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  planarBasis(camera, forward, right);
  closeTo(forward, 0, 0, -1, "default forward");
  closeTo(right, 1, 0, 0, "default right");
  camera.rotation.y = Math.PI / 2;
  planarBasis(camera, forward, right);
  closeTo(forward, -1, 0, 0, "yaw +90 forward");
  closeTo(right, 0, 0, -1, "yaw +90 right");

  camera.rotation.set(0, 0, 0);
  planarBasis(camera, forward, right);
  let moved = movePlayer(built.spawn.x, built.spawn.z, forward.x * 0.4, forward.z * 0.4, PLAYER_RADIUS, built.walls);
  assert(moved.z < built.spawn.z - 0.2 && Math.abs(moved.x - built.spawn.x) < 1e-6, "W from spawn walks toward -Z");

  let x = PLAZA.maxX - 1.6;
  let z = built.spawn.z;
  for (let i = 0; i < 40; i++) {
    const next = movePlayer(x, z, 0.5, 0, PLAYER_RADIUS, built.walls);
    x = next.x;
    z = next.z;
  }
  assert(x < PLAZA.maxX - PLAYER_RADIUS + 0.08, "east plaza wall stops the player");
  assert(z === built.spawn.z, "sliding on X keeps Z");

  x = built.spawn.x;
  z = built.spawn.z;
  for (let i = 0; i < 90; i++) {
    const next = movePlayer(x, z, 0, -0.35, PLAYER_RADIUS, built.walls);
    if (next.z === z) break;
    x = next.x;
    z = next.z;
  }
  assert(z < -12, "front door leads into the halls");

  const floor = new THREE.Object3D();
  floor.rotation.x = FLOOR_TILT;
  const floorNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(floor.quaternion);
  assert(floorNormal.y > 0.9, "floor faces up");
  const ceil = new THREE.Object3D();
  ceil.rotation.x = CEIL_TILT;
  const ceilNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(ceil.quaternion);
  assert(ceilNormal.y < -0.9, "ceiling faces down");
  assert(EYE > 1 && EYE < 3.2, "eye height is inside the room");
  assert(PLAYER_RADIUS > FRAME.d / 2 + 0.04 + 0.12, "eye stops before the frame clips the near plane");
}

function checkDay(built) {
  const roof = built.dress.find((item) => item.kind === "roof");
  const roofY = (roof.minY + roof.maxY) / 2;
  const noon = sunVector(findDay("noon"));
  const dawn = sunVector(findDay("dawn"));
  const dusk = sunVector(findDay("dusk"));
  assert(noon.z > 0.25 && noon.y > 0.75, "noon lights the south front from above");
  assert(dawn.x > 0.75 && dawn.y < 0.45 && dawn.y > 0.05, "dawn is a low eastern sun");
  assert(dusk.x < -0.75 && dusk.y < 0.4 && dusk.y > 0.05, "dusk is a low western sun");
  assert(groundShadow(built.spawn.x, built.spawn.z, noon, roof, roofY) < 0.15, "noon spawn stays in the sun");
  assert(groundShadow(built.spawn.x, built.spawn.z, dawn, roof, roofY) < 0.15, "dawn spawn stays in the sun");
  let west = 0;
  for (let z = -20; z <= 16; z += 2) {
    if (groundShadow(-30, z, dawn, roof, roofY) > 0.5) west++;
  }
  assert(west > 2, "dawn shadow falls west of the hall");
  let east = 0;
  for (let x = 8; x <= 30; x += 2) {
    if (groundShadow(x, 10, dusk, roof, roofY) > 0.5) east++;
  }
  assert(east > 2, "dusk shadow reaches the east plaza");
  assert(built.openings.length === 6, `sun openings ${built.openings.length}`);
  const limits = {
    minX: built.interior.minX + 0.15,
    maxX: built.interior.maxX - 0.15,
    minZ: built.interior.minZ + 0.15,
    maxZ: built.interior.maxZ - 0.15,
  };
  const quads = openingQuads(built.openings, dawn, limits, 1);
  let lit = 0;
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    if (!quad) continue;
    lit++;
    for (let k = 0; k < quad.pts.length; k++) {
      const point = quad.pts[k];
      assert(point[0] <= limits.maxX + 1e-6 && point[0] >= limits.minX - 1e-6, "streak stays inside x");
      assert(point[1] <= limits.maxZ + 1e-6 && point[1] >= limits.minZ - 1e-6, "streak stays inside z");
    }
  }
  assert(lit >= 2, "dawn opens at least two light streaks");
  assert(DAYS.map((day) => day.name).join(",") === "清晨,上午,正午,午后,黄昏,夜晚", "day names");
}

function hangCapacity() {
  const sites = [];
  for (let i = 0; i < 500; i++) sites.push({ cat: HALLS[0].cat });
  return buildMuseum(sites).frames.length;
}

const HANG_CAPACITY = hangCapacity();

function checkBuild(sites, label) {
  const built = buildMuseum(sites);
  let qianqi = 0;
  for (let i = 0; i < sites.length; i++) if (sites[i].cat === HALLS[0].cat) qianqi++;
  const expect = Math.min(HANG_CAPACITY, qianqi);
  assert(built.frames.length === expect, `${label} frame count ${built.frames.length} != ${expect}`);
  let prev = -1;
  let backA = 0;
  let backB = 0;
  let northN = 0;
  let northMin = Infinity;
  let northMax = -Infinity;
  for (let i = 0; i < built.frames.length; i++) {
    const frame = built.frames[i];
    assert(frame.siteIndex > prev, `${label} frames left the date order`);
    prev = frame.siteIndex;
    if (frame.nz < 0 && frame.z < -8 && frame.z > -16) backA++;
    if (frame.nz < 0 && frame.z < -18 && frame.z > -26) backB++;
    if (frame.nz > 0 && frame.z < -30) {
      northN++;
      if (frame.x < northMin) northMin = frame.x;
      if (frame.x > northMax) northMax = frame.x;
    }
  }
  if (qianqi >= HANG_CAPACITY) {
    assert(backA >= 18 && backB >= 18, `${label} middle walls are missing back frames`);
    assert(northN === 42 && northMin < -13.5 && northMin > -15.2 && northMax > 13.5 && northMax < 15.2, `${label} north wall side margin ${northMin}..${northMax} n=${northN}`);
  }
  assert(Math.abs(FRAME.w / FRAME.h - 3.7 / 1.8) < 1e-9, `${label} frame ratio`);
  const ys = new Set();
  for (let i = 0; i < built.frames.length; i++) {
    ys.add(built.frames[i].y.toFixed(3));
    assert(sites[built.frames[i].siteIndex].cat === HALLS[0].cat, `${label} frame ${i} is not 千奇百怪`);
  }
  assert(ys.size === 3, `${label} frame rows ${ys.size}`);
  assert(!built.dress.some((item) => item.kind === "wash"), `${label} frames hang on the bare wall`);
  assert(!blocked(built.spawn.x, built.spawn.z, PLAYER_RADIUS, built.walls), `${label} spawn is inside a wall`);

  const scene = new THREE.Scene();
  const borderMat = new THREE.MeshLambertMaterial();
  const matMat = new THREE.MeshLambertMaterial();
  const meshes = frameMeshes(built.frames, borderMat, matMat);
  scene.add(meshes.mat);
  meshes.mat.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const samples = [0, Math.floor(built.frames.length / 2), built.frames.length - 1];
  for (let s = 0; s < samples.length; s++) {
    const index = samples[s];
    const frame = built.frames[index];
    const origin = new THREE.Vector3(frame.x, frame.y, frame.z + frame.nz * 0.55);
    const dir = new THREE.Vector3(0, 0, -frame.nz);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObject(meshes.mat, false);
    assert(hits.length > 0 && hits[0].instanceId === index, `${label} raycast frame ${index}`);
    const into = blocked(frame.x, frame.z - frame.nz * 0.2, 0.02, built.walls);
    const approachZ = frame.z + frame.nz * 0.75;
    const approachFree = !blocked(frame.x, approachZ, PLAYER_RADIUS, built.walls);
    assert(into, `${label} frame ${index} is not mounted on a wall`);
    assert(approachFree, `${label} frame ${index} approach is blocked`);
  }

  let minGap = Infinity;
  for (let i = 0; i < built.frames.length; i++) {
    const a = built.frames[i];
    for (let j = i + 1; j < Math.min(built.frames.length, i + 20); j++) {
      const b = built.frames[j];
      if (a.nz !== b.nz || Math.abs(a.z - b.z) > 0.2) continue;
      const gap = Math.abs(a.x - b.x);
      if (gap > 0 && gap < minGap) minGap = gap;
    }
  }
  assert(minGap > FRAME.w * 0.92, `${label} frames overlap ${minGap.toFixed(3)}`);

  for (let i = 0; i < built.plants.length; i++) {
    const plant = built.plants[i];
    assert(!blocked(plant.x, plant.z, 0.05, built.walls), `${label} plant ${i} inside a wall`);
  }

  const level = floorAndCeiling(
    built.bounds,
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    built.interior,
    new THREE.MeshLambertMaterial(),
  );
  scene.add(level.floor);
  if (level.ceil) scene.add(level.ceil);
  scene.add(wallMesh(built.walls, new THREE.MeshLambertMaterial()));
  level.floor.updateMatrixWorld(true);
  const floorNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(level.floor.quaternion);
  assert(floorNormal.y > 0.9, `${label} built floor faces up`);

  const flooded = flood(built);
  assert(flooded.leaks === 0, `${label} walkable leak cells ${flooded.leaks}`);
  let missed = 0;
  for (let i = 0; i < built.frames.length; i += 7) {
    const frame = built.frames[i];
    if (!reachable(flooded, frame.x, frame.z + frame.nz * 0.75)) missed++;
  }
  assert(missed === 0, `${label} unreachable frames ${missed}`);
  checkMotion(built);
  if (label === "fixture") checkDay(built);
  return built;
}

function checkFacing() {
  const samples = [
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0.6, 0, -0.8).normalize(),
  ];
  const back = new THREE.Vector3();
  for (let i = 0; i < samples.length; i++) {
    const dir = samples[i];
    forwardFromYaw(yawFacing(dir), back);
    assert(back.dot(dir) > 0.999, "yaw round trip " + i);
  }

  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const visitor = createVisitor(material);
  visitor.group.updateMatrixWorld(true);
  const nose = new THREE.Vector3();
  visitor.group.getObjectByName("nose").getWorldPosition(nose);
  assert(nose.z < -0.2 && Math.abs(nose.x) < 1e-3, "visitor face points -Z at yaw 0");

  const ahead = new THREE.Vector3(1, 0, 0);
  visitor.group.rotation.y = yawFacing(ahead);
  visitor.group.updateMatrixWorld(true);
  visitor.group.getObjectByName("nose").getWorldPosition(nose);
  const face = nose.clone().setY(0);
  face.normalize();
  assert(face.dot(ahead) > 0.95, "visitor face follows yawFacing");

  visitor.group.rotation.y = 0;
  poseVisitor(visitor.parts, Math.PI / 2, 1);
  visitor.group.updateMatrixWorld(true);
  const hip = new THREE.Vector3();
  const foot = new THREE.Vector3();
  visitor.parts.legL.getWorldPosition(hip);
  visitor.group.getObjectByName("footL").getWorldPosition(foot);
  assert(foot.z < hip.z - 0.05, "left step reaches forward -Z");
}

function openClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue = [];
    const pending = [];
    const fail = (err) => reject(err);
    ws.addEventListener("error", () => fail(new Error("socket error")));
    ws.addEventListener("message", (event) => {
      queue.push(JSON.parse(event.data));
      flush();
    });
    function flush() {
      for (let i = 0; i < pending.length; i++) {
        const job = pending[i];
        const index = queue.findIndex((msg) => msg.t === job.type);
        if (index < 0) continue;
        pending.splice(i, 1);
        i -= 1;
        clearTimeout(job.timer);
        job.resolve(queue.splice(index, 1)[0]);
      }
    }
    const api = {
      send(obj) { ws.send(JSON.stringify(obj)); },
      wait(type) {
        return new Promise((resolveWait, rejectWait) => {
          const timer = setTimeout(() => rejectWait(new Error("timeout " + type)), 2000);
          pending.push({ type, resolve: resolveWait, reject: rejectWait, timer });
          flush();
        });
      },
      has(type) { return queue.some((msg) => msg.t === type); },
      close() { ws.close(); },
    };
    ws.addEventListener("open", () => resolve(api));
  });
}

async function checkLobby() {
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const lobby = attachLobby(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = "ws://127.0.0.1:" + port + "/lobby";
  const a = await openClient(url);
  const b = await openClient(url);
  a.send({ t: "hi", name: "  甲\n  " });
  const welcomeA = await a.wait("welcome");
  assert(welcomeA.name === "甲" && welcomeA.n === 1 && welcomeA.people.length === 0, "first arrival");
  b.send({ t: "hi", name: "甲" });
  const welcomeB = await b.wait("welcome");
  const join = await a.wait("join");
  assert(welcomeB.n === 2 && welcomeB.name !== "甲" && welcomeB.people.length === 1, "second arrival count");
  assert(join.n === 2 && join.name === welcomeB.name && join.id === welcomeB.id, "join notice");
  b.send({ t: "say", text: "你好\n世界" });
  const said = await a.wait("say");
  const echo = await b.wait("say");
  assert(said.text === "你好世界" && said.name === welcomeB.name, "chat text");
  assert(echo.id === said.id && echo.text === said.text, "sender hears the line");
  await new Promise((resolve) => setTimeout(resolve, 500));
  b.send({ t: "move", x: 999, z: 0, yaw: 0 });
  b.send({ t: "say", text: "还在" });
  const still = await a.wait("say");
  assert(still.text === "还在" && !a.has("move"), "wild move dropped");
  b.send({ t: "move", x: 1.25, z: -3.5, yaw: Math.PI });
  const moved = await a.wait("move");
  assert(moved.id === welcomeB.id && Math.abs(moved.x - 1.25) < 1e-6 && Math.abs(moved.z + 3.5) < 1e-6, "move relay");
  b.send({ t: "away" });
  const hid = await a.wait("bye");
  assert(hid.n === 1 && hid.id === welcomeB.id && hid.name === welcomeB.name, "hide leaves once");
  b.send({ t: "move", x: 2, z: -1, yaw: 0.4 });
  b.send({ t: "say", text: "人在外面" });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert(!a.has("move") && !a.has("say"), "hidden player stays quiet");
  b.send({ t: "back" });
  const back = await a.wait("join");
  assert(back.n === 2 && back.id === welcomeB.id && back.name === welcomeB.name, "return enters once");
  b.send({ t: "name", name: "乙" });
  const renamed = await a.wait("name");
  const renameEcho = await b.wait("name");
  assert(renamed.name === "乙" && renamed.id === welcomeB.id, "rename relay");
  assert(renameEcho.name === "乙", "rename echo");
  const c = await openClient(url);
  c.send({ t: "hi", name: "丙", away: true });
  const welcomeC = await c.wait("welcome");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert(welcomeC.away === true && welcomeC.n === 2 && !a.has("join"), "hidden entry does not announce");
  c.send({ t: "back" });
  const cJoin = await a.wait("join");
  assert(cJoin.name === "丙" && cJoin.n === 3, "activate announces entry");
  c.send({ t: "away" });
  const cBye = await a.wait("bye");
  assert(cBye.name === "丙" && cBye.n === 2, "second hide leaves");
  c.close();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert(!a.has("bye") && !a.has("join"), "closing while away stays gone");
  b.close();
  const bye = await a.wait("bye");
  assert(bye.n === 1 && bye.id === welcomeB.id, "leave notice");
  a.close();
  lobby.close();
  await new Promise((resolve) => server.close(resolve));
}

checkFacing();
checkParser();
const fixtureSites = fixture();
checkBuild(fixtureSites, "fixture");

if (!process.argv.includes("--fixture")) {
  const dataPath = path.join(root, "data", "sites.json");
  try {
    const data = JSON.parse(await readFile(dataPath, "utf8"));
    if (data.sites && data.sites.length > 100) checkBuild(data.sites, "archive");
    else failures.push("sites.json is too small to be the archive");
  } catch (err) {
    failures.push("sites.json unreadable: " + err.message);
  }
}

try {
  await checkLobby();
} catch (err) {
  failures.push("lobby: " + err.message);
}

if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("selftest ok");
