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
  LIFT,
  PLAZA,
  PLAZA_PATH,
  PLAYER_RADIUS,
  STORY,
  WALL_H,
  WALL_T,
  buildMuseum,
  blocked,
  doorBoxes,
  doorWantsOpen,
  groundAt,
  hallBlend,
  liftLeaves,
  movePlayer,
  pullCamera,
} from "../js/layout.js";
import { DAYS, findDay, groundShadow, openingQuads, sunVector } from "../js/day.js";
import { createLift } from "../js/lift.js";
import { atlasGrid, cellUv, coverRect, doorRig, floorAndCeiling, frameMeshes, horizonMeshes, liftRig, maskPaths, spotFixtureTop, usableFrameImage, wallMesh } from "../js/meshes.js";
import { bakeLoop, museumImpulse } from "../js/ambience.js";
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

function flood(built, footY, origin) {
  const cell = 0.45;
  const y = footY || 0;
  const start = origin || built.spawn;
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
  const sx = Math.floor(start.x / cell);
  const sz = Math.floor(start.z / cell);
  const push = (x, z) => {
    if (x < x0 || z < z0 || x >= x0 + cols || z >= z0 + rows) return;
    const id = (z - z0) * cols + (x - x0);
    if (seen[id]) return;
    const wx = (x + 0.5) * cell;
    const wz = (z + 0.5) * cell;
    if (blocked(wx, wz, PLAYER_RADIUS, built.walls, y)) {
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

function walkToDoor(walls) {
  let z = 15.5;
  for (let i = 0; i < 80; i++) {
    const next = movePlayer(0, z, 0, -0.35, PLAYER_RADIUS, walls);
    if (next.z === z) return z;
    z = next.z;
  }
  return z;
}

function checkDoors() {
  const closed = doorBoxes(0);
  const open = doorBoxes(1);
  const cz = (closed[0].minZ + closed[0].maxZ) / 2;
  assert(blocked(0, cz, PLAYER_RADIUS, closed), "closed doors block the middle");
  assert(!blocked(0, cz, PLAYER_RADIUS, open), "open doors leave the middle clear");
  assert(open[0].maxX < closed[0].minX + 0.05, "left leaf slides left");
  assert(open[1].minX > closed[1].maxX - 0.05, "right leaf slides right");
  const shut = walkToDoor(closed);
  assert(shut > 3.5 && shut < 6, `closed door stops outside, z=${shut}`);
  const passed = walkToDoor(open);
  assert(passed < 0, `open door lets the player in, z=${passed}`);
  assert(doorWantsOpen(0, 15.5, false) === false, "spawn leaves the door shut");
  assert(doorWantsOpen(0, 10, false) === true, "approach opens the door");
  assert(doorWantsOpen(0, 12.5, true) === true, "door stays open a little past the sensor");
  assert(doorWantsOpen(0, 14.5, true) === false, "door shuts once the player is clear");
  const rig = doorRig(new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
  rig.update(0);
  const shutX = (closed[0].minX + closed[0].maxX) / 2;
  assert(Math.abs(rig.leaves[0].position.x - shutX) < 1e-6, "left mesh matches the closed collider");
  rig.update(1);
  const openX = (open[0].minX + open[0].maxX) / 2;
  const openRight = (open[1].minX + open[1].maxX) / 2;
  assert(Math.abs(rig.leaves[0].position.x - openX) < 1e-6, "left mesh matches the open collider");
  assert(Math.abs(rig.leaves[1].position.x - openRight) < 1e-6, "right mesh matches the open collider");
  assert(rig.leaves[0].position.x < shutX, "left mesh moves toward -X");
  assert(rig.leaves[1].position.x > 0, "right mesh moves toward +X");
  const seam = closed[1].minX - closed[0].maxX;
  assert(seam > 0 && seam < 0.012, `closed door seam ${seam}`);

  const glass = new THREE.MeshBasicMaterial();
  const frame = new THREE.MeshBasicMaterial();
  const rigLift = liftRig(glass, frame, frame, frame, 1);
  const liftLeavesMesh = () => rigLift.root.children.filter((child) => child.userData.span);
  const shutLeaf = liftLeaves(0, 0)[0];
  const shutSlot = (shutLeaf.minX + shutLeaf.maxX) / 2;
  rigLift.update([0], 0);
  assert(liftLeavesMesh().every((leaf) => leaf.visible), "closed lift door is drawn");
  assert(Math.abs(liftLeavesMesh()[0].position.x - shutSlot) < 1e-4, "closed lift door sits in the slot");
  rigLift.update([0.5], 0);
  assert(Math.abs(liftLeavesMesh()[0].position.x - shutSlot) < 1e-4, "half-open lift door stays in the slot");
  assert(liftLeavesMesh().every((leaf) => leaf.visible), "half-open lift door is still drawn");
  rigLift.update([1], 0);
  const parked = liftLeavesMesh();
  assert(parked.length === 2 && parked.every((leaf) => leaf.visible), "open lift door stays visible");
  assert(parked.every((leaf) => Math.abs(leaf.position.x - shutSlot) < 1e-4), "open lift door stays in the slot");
  const zs = parked.map((leaf) => leaf.position.z).sort((a, b) => a - b);
  assert(zs[0] < LIFT.cz - 0.4 && zs[1] > LIFT.cz + 0.4, "open lift door slides aside");
  let doorMat = null;
  parked[0].traverse((obj) => {
    if (obj.material && doorMat == null) doorMat = obj.material;
  });
  assert(doorMat && doorMat.polygonOffset === false, "open lift door is not pulled through the front wall");
  const openingLo = LIFT.cz - LIFT.doorW / 2;
  const openingHi = LIFT.cz + LIFT.doorW / 2;
  const reach = parked.map((leaf) => {
    const half = leaf.userData.span * 0.5;
    return [leaf.position.z - half, leaf.position.z + half];
  });
  const leftEdge = Math.max(...reach.map((span) => span[1]).filter((z) => z <= LIFT.cz + 1e-4));
  const rightEdge = Math.min(...reach.map((span) => span[0]).filter((z) => z >= LIFT.cz - 1e-4));
  assert(Math.abs(leftEdge - openingLo) < 1e-4, "open lift door meets the left frame");
  assert(Math.abs(rightEdge - openingHi) < 1e-4, "open lift door meets the right frame");
  let clipped = false;
  parked[0].traverse((obj) => {
    if (obj.material && obj.material.clippingPlanes && obj.material.clippingPlanes.length) clipped = true;
  });
  assert(!clipped, "open lift door is not clipped away");
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
  for (let i = 0; i < 200 && z > 0.2; i++) {
    const next = movePlayer(x, z, 0, -0.35, PLAYER_RADIUS, built.walls);
    if (next.z === z) break;
    x = next.x;
    z = next.z;
  }
  assert(z < 1 && z > -1, "front door leads into the foyer");
  for (let i = 0; i < 12; i++) {
    const next = movePlayer(x, z, 0.35, 0, PLAYER_RADIUS, built.walls);
    if (next.x === x) break;
    x = next.x;
    z = next.z;
  }
  assert(x > 3 && x < 6, "foyer has room beside the aisle");
  for (let i = 0; i < 90; i++) {
    const next = movePlayer(x, z, 0, -0.35, PLAYER_RADIUS, built.walls);
    if (next.z === z) break;
    x = next.x;
    z = next.z;
  }
  assert(z < -8.8 && z > -10.2, "first wall stops the player after the foyer");

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
  assert(!built.openings.some((opening) => opening.nx < 0 && opening.maxZ > -2), "light slit between the lift and the door");
  const limits = {
    minX: built.interior.minX + 0.15,
    maxX: built.interior.maxX - 0.15,
    minZ: built.interior.minZ + 0.15,
    maxZ: built.interior.maxZ - 0.15,
  };
  const quads = openingQuads(built.openings, dawn, limits, 1);
  for (let i = 0; i < quads.length; i++) {
    const quad = quads[i];
    if (!quad) continue;
    for (let k = 0; k < quad.pts.length; k++) {
      const point = quad.pts[k];
      assert(point[0] <= limits.maxX + 1e-6 && point[0] >= limits.minX - 1e-6, "streak stays inside x");
      assert(point[1] <= limits.maxZ + 1e-6 && point[1] >= limits.minZ - 1e-6, "streak stays inside z");
    }
  }
  for (const name of ["清晨", "正午", "黄昏"]) {
    const quadsAt = openingQuads(built.openings, sunVector(findDay(name)), limits, 1);
    for (let i = 0; i < quadsAt.length; i++) {
      const opening = built.openings[i];
      const door = opening.nz > 0 && opening.minY < 0.05 && opening.maxX < 3 && opening.minX > -3;
      assert(!(door && quadsAt[i]), `${name} door does not leak onto the foyer floor`);
      const quad = quadsAt[i];
      if (!quad) continue;
      for (let k = 0; k < quad.pts.length; k++) {
        const point = quad.pts[k];
        assert(!(point[0] < limits.minX + 0.45 && point[1] > limits.maxZ - 0.45), `${name} light is pinned in the foyer corner`);
      }
    }
  }
  assert(DAYS.map((day) => day.name).join(",") === "清晨,上午,正午,午后,黄昏,夜晚", "day names");
}

function checkBuild(sites, label) {
  const built = buildMuseum(sites);
  const cats = new Set(HALLS.map((hall) => hall.cat));
  const rank = new Map(HALLS.map((hall, index) => [hall.cat, index]));
  let want = 0;
  for (let i = 0; i < sites.length; i++) if (cats.has(sites[i].cat)) want++;
  assert(built.frames.length === want, `${label} frame count ${built.frames.length} != ${want}`);
  let prevRank = -1;
  let prevIndex = -1;
  let prev = null;
  let backA = 0;
  let backB = 0;
  const onFloor = new Map();
  for (let i = 0; i < built.frames.length; i++) {
    const frame = built.frames[i];
    const cat = sites[frame.siteIndex].cat;
    const place = rank.get(cat);
    assert(place != null && place >= prevRank, `${label} frames left the category order`);
    if (place === prevRank) assert(frame.siteIndex > prevIndex, `${label} frames left the date order`);
    prevRank = place;
    prevIndex = frame.siteIndex;
    prev = frame;
    onFloor.set(frame.floor, (onFloor.get(frame.floor) || 0) + 1);
    if (frame.floor === 0 && frame.nz < 0 && frame.z < -9.6 && frame.z > -11.2) backA++;
    if (frame.floor === 0 && frame.nz < 0 && frame.z < -21.6 && frame.z > -23.2) backB++;
  }
  const floorCounts = Array.from(onFloor.entries()).sort((a, b) => a[0] - b[0]);
  const full = floorCounts.length ? floorCounts[0][1] : 0;
  if (floorCounts.length > 1) {
    for (let i = 0; i < floorCounts.length - 1; i++) {
      assert(floorCounts[i][1] === full, `${label} floor ${floorCounts[i][0]} left space ${floorCounts[i][1]} != ${full}`);
    }
    assert(floorCounts[floorCounts.length - 1][1] <= full, `${label} top floor overfilled`);
  }
  prev = null;
  for (let i = 0; i < built.frames.length; i++) {
    const frame = built.frames[i];
    const place = rank.get(sites[frame.siteIndex].cat);
    if (prev && place > rank.get(sites[prev.siteIndex].cat) && frame.floor !== prev.floor) {
      assert((onFloor.get(prev.floor) || 0) === full, `${label} category opened a new floor with room left`);
    }
    prev = frame;
  }
  if (full > 100) {
    assert(backA >= 18 && backB >= 18, `${label} middle walls are missing back frames`);
    for (const [floor, count] of onFloor) {
      if (count !== full) continue;
      let northN = 0;
      let northMin = Infinity;
      let northMax = -Infinity;
      for (let i = 0; i < built.frames.length; i++) {
        const frame = built.frames[i];
        if (frame.floor !== floor || frame.nz <= 0 || frame.z >= -32) continue;
        northN++;
        if (frame.x < northMin) northMin = frame.x;
        if (frame.x > northMax) northMax = frame.x;
      }
      assert(northN === 42 && northMin < -13.5 && northMin > -15.2 && northMax > 13.5 && northMax < 15.2, `${label} floor ${floor} north wall side margin ${northMin}..${northMax} n=${northN}`);
    }
  }
  assert(Math.abs(FRAME.w / FRAME.h - 3.7 / 1.8) < 1e-9, `${label} frame ratio`);
  const rows = new Map();
  for (let i = 0; i < built.frames.length; i++) {
    const frame = built.frames[i];
    const rel = (frame.y - frame.floor * STORY).toFixed(3);
    if (!rows.has(frame.floor)) rows.set(frame.floor, new Set());
    rows.get(frame.floor).add(rel);
  }
  for (const [floor, set] of rows) {
    assert(set.size >= 1 && set.size <= 3, `${label} floor ${floor} frame rows ${set.size}`);
    if ((onFloor.get(floor) || 0) === full && full > 40) assert(set.size === 3, `${label} full floor ${floor} rows ${set.size}`);
  }
  assert(!built.dress.some((item) => item.kind === "wash"), `${label} frames hang on the bare wall`);
  assert(!blocked(built.spawn.x, built.spawn.z, PLAYER_RADIUS, built.walls), `${label} spawn is inside a wall`);
  assert(hallBlend(built.spawn.x, built.spawn.z, built.interior) === 0, `${label} plaza is quiet`);
  const midZ = (built.interior.minZ + built.interior.maxZ) / 2;
  assert(hallBlend(0, midZ, built.interior) === 1, `${label} hall is in the music`);
  assert(hallBlend(LIFT.cx, LIFT.cz, built.interior) === 1, `${label} cab keeps the music`);
  assert(hallBlend(0, built.interior.maxZ + 3, built.interior) === 0, `${label} deck is quiet`);
  const lip = hallBlend(0, built.interior.maxZ + 0.15, built.interior);
  assert(lip > 0.05 && lip < 0.45, `${label} doorway eases the music in, got ${lip}`);
  assert(hallBlend(built.interior.minX - 4, midZ, built.interior) === 0, `${label} west yard is quiet`);
  let doorInner = null;
  for (let i = 0; i < built.stone.length; i++) {
    const wall = built.stone[i];
    if (wall.minZ > 2 && wall.maxZ < 6 && wall.maxX < 0 && wall.minX < -10) doorInner = wall.minZ;
  }
  let firstNear = -Infinity;
  for (let i = 0; i < built.white.length; i++) {
    const wall = built.white[i];
    if (wall.maxX - wall.minX < 8 || wall.maxZ >= doorInner || wall.maxZ <= firstNear) continue;
    firstNear = wall.maxZ;
  }
  const foyerGap = doorInner - firstNear;
  assert(Math.abs(foyerGap - 13.8) < 0.05, `${label} foyer gap ${foyerGap}`);
  if (label === "fixture") checkDoors();

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
    const foot = frame.y - 1;
    const into = blocked(frame.x, frame.z - frame.nz * 0.2, 0.02, built.walls, foot);
    const approachZ = frame.z + frame.nz * 0.75;
    const approachFree = !blocked(frame.x, approachZ, PLAYER_RADIUS, built.walls, foot);
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
    assert(!blocked(plant.x, plant.z, 0.05, built.walls, plant.y || 0), `${label} plant ${i} inside a wall`);
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

  const kinds = [new Set(), new Set()];
  for (let i = 0; i < built.plants.length; i++) {
    const plant = built.plants[i];
    if (plant.floor < 2) kinds[plant.floor].add(plant.kind);
  }
  assert(built.plants.length === built.floors * 3 + Math.max(0, built.floors - 1), `${label} plants ${built.plants.length}`);
  assert(built.yard && built.yard.filter((item) => item.kind === "tree").length >= 12, `${label} plaza trees`);
  assert(built.yard.every((item) => Math.abs(item.x) > 6 || item.z > 12), `${label} plaza dress blocks the door`);
  const liftFace = LIFT.xDoor + 0.12;
  const liftInner = LIFT.xRear + WALL_T;
  const cheeks = built.white.filter((wall) => wall.minX < liftInner + 0.001 && wall.minX > liftInner - 0.04 && Math.abs(wall.maxX - liftFace) < 1e-6 && wall.maxX - wall.minX > 2);
  assert(cheeks.length === 2, `${label} lift cheeks ${cheeks.length}`);
  const jambLeaf = liftLeaves(0, 0)[0];
  const jambSkinX = jambLeaf.maxX + 0.004;
  const jambSkins = built.white.filter((wall) => Math.abs(wall.minX - jambSkinX) < 1e-4 && Math.abs(wall.maxX - liftFace) < 1e-4 && wall.maxZ - wall.minZ > 0.5 && !(wall.base > 0));
  assert(jambSkins.length === 2, `${label} lift front wall ${jambSkins.length}`);
  assert(kinds[0].size === 3, `${label} lobby plants repeat a kind`);
  if (built.floors > 1) {
    const sig = (floor) => built.plants.filter((plant) => plant.floor === floor).map((plant) => plant.kind).join(",");
    assert(sig(0) !== sig(1), `${label} second lobby copies the first plants`);
  }
  assert(LIFT.capacity === 10 && LIFT.carW >= 3.4 && LIFT.carD >= 2.4 && Math.abs(LIFT.doorW - 1.8) < 0.02 && LIFT.winW > LIFT.doorW + 0.3 && LIFT.cabH >= 3.9 && LIFT.cabH < WALL_H - 0.6, `${label} lift is not the widened 10-person car`);
  assert(LIFT.cz < -1 && LIFT.cz > -6, `${label} lift is not mid-lobby ${LIFT.cz}`);
  assert(blocked(LIFT.xDoor, LIFT.z0 - 0.08, 0.05, built.walls, 0), `${label} lift side is open`);
  assert(blocked(LIFT.xDoor, LIFT.z0 - 0.08, 0.05, built.walls, STORY), `${label} lift side stops at the ground`);
  assert(!blocked(LIFT.xDoor + 0.35, LIFT.cz, 0.05, built.walls, 0), `${label} lift door is a solid wall`);
  assert(blocked(LIFT.xRear - 0.02, LIFT.cz, 0.05, built.walls, STORY), `${label} lift rear glass can be walked through`);
  const shutDoor = liftLeaves(0, 1);
  const openDoor = liftLeaves(1, 1);
  assert(shutDoor.length === 2, `${label} lift has a second door`);
  assert(blocked(LIFT.xDoor, LIFT.cz, 0.05, shutDoor, STORY), `${label} closed front door can be walked through`);
  assert(!blocked(LIFT.xDoor, LIFT.cz, 0.05, openDoor, STORY), `${label} open front door stays shut`);
  assert(built.dress.some((item) => item.kind === "glass" && item.minX < LIFT.xRear + 0.08 && item.maxX > LIFT.xRear - 0.08 && item.minY < STORY + 1 && item.maxY > STORY + 2.2 && item.maxZ - item.minZ > LIFT.doorW + 0.2), `${label} rear wall is not glass`);
  assert(groundAt(LIFT.xRear - 0.6, LIFT.cz, STORY, built.floors) == null, `${label} rear balcony is still there`);
  if (built.floors > 1) {
    const stair = built.stair;
    const zMid = (stair.f1z0 + stair.f1z1) / 2;
    const xMid = (stair.f2x0 + stair.f2x1) / 2;
    assert(stair.f1x0 > 6, `${label} stair mouth is too close to the door ${stair.f1x0}`);
    assert(stair.f1x1 - stair.f1x0 > 4 && stair.f1z1 - stair.f1z0 > 2.4, `${label} stair is still narrow`);
    const yStart = groundAt(stair.f1x0 + 0.2, zMid, 0.05, built.floors);
    const yClimb = groundAt((stair.f1x0 + stair.f1x1) / 2, zMid, stair.half * 0.6, built.floors);
    const yLand = groundAt((stair.landX0 + stair.landX1) / 2, (stair.landZ0 + stair.landZ1) / 2, stair.half, built.floors);
    const yBack = groundAt(xMid, (stair.f2z0 + stair.f2z1) / 2, stair.half + 0.4, built.floors);
    const yTop = groundAt(xMid, stair.f2z0 + 0.2, STORY - 0.05, built.floors);
    assert(Math.abs(yStart) < 0.25, `${label} stair does not start on the ground ${yStart}`);
    assert(yClimb > yStart + 0.7, `${label} first flight does not rise east ${yClimb}`);
    assert(Math.abs(yLand - stair.half) < 0.25, `${label} stair has no corner landing ${yLand}`);
    assert(yBack > yLand + 0.4 && yTop > yBack, `${label} second flight does not rise north`);
    assert(Math.abs(yTop - STORY) < 0.25, `${label} stair does not arrive on the next floor ${yTop}`);
    let x = xMid;
    let z = stair.f2z0 + 0.25;
    let left = false;
    for (let i = 0; i < 8; i++) {
      const next = movePlayer(x, z, 0, -0.28, PLAYER_RADIUS, built.walls, STORY);
      if (next.z < z - 0.05) left = true;
      x = next.x;
      z = next.z;
    }
    assert(left && Math.abs(groundAt(x, z, STORY, built.floors) - STORY) < 0.08, `${label} stair sticks at floor 2`);
    if (built.floors > 2) {
      const yUpper = groundAt(stair.f1x0 + 0.25, zMid, STORY + 0.05, built.floors);
      const yThird = groundAt(xMid, stair.f2z0 + 0.2, STORY * 2 - 0.05, built.floors);
      assert(Math.abs(yUpper - STORY) < 0.25, `${label} floor 2 has no onward stair ${yUpper}`);
      assert(Math.abs(yThird - STORY * 2) < 0.25, `${label} stair does not reach floor 3 ${yThird}`);
      x = xMid;
      z = stair.f2z0 + 0.25;
      left = false;
      for (let i = 0; i < 8; i++) {
        const next = movePlayer(x, z, 0, -0.28, PLAYER_RADIUS, built.walls, STORY * 2);
        if (next.z < z - 0.05) left = true;
        x = next.x;
        z = next.z;
      }
      assert(left, `${label} stair sticks at floor 3`);
    }
    assert(built.dress.some((item) => item.kind === "wood"), `${label} stair has no wood rail`);
    const landX = (stair.landX0 + stair.landX1) / 2;
    const landZ = (stair.landZ0 + stair.landZ1) / 2;
    assert(built.slabs.some((slab) => slab.maxY < 0.08 && slab.minX <= landX && slab.maxX >= landX && slab.minZ <= landZ && slab.maxZ >= landZ), `${label} ground under the stair is missing`);
    assert(built.white.some((wall) => wall.minX < -1 && wall.maxX > 1 && wall.base > 2.4 && wall.base < 3.2 && wall.minZ > 3.5 && wall.minZ < 4.05), `${label} inside of the door head is not white`);
    assert(built.dress.some((item) => item.kind === "glass" && item.minY > STORY && item.minY < STORY + 0.2 && item.minX > 12), `${label} floor 2 stair corner has no glass rail`);
    assert(built.dress.some((item) => item.kind === "glass" && item.minY > STORY && item.minY < STORY + 0.2 && item.maxX > 14 && item.maxX < 17 && item.minZ < -3), `${label} corner glass stops short of the stair mouth`);
    assert(built.signs.some((sign) => sign.text === "1F" && sign.x > LIFT.xDoor), `${label} lift door has no floor mark`);
    const facadeTitle = built.signs.find((sign) => sign.text === "趣站博物馆");
    const facadeEntry = built.signs.find((sign) => sign.text === "入口");
    assert(facadeTitle && facadeEntry && facadeEntry.y < facadeTitle.y, `${label} facade title and entry are out of order`);
    assert(built.plants.some((plant) => plant.floor === 1 && plant.x > 12), `${label} floor 2 stair corner has no plant`);
    assert(built.handrails.some((rail) => rail.y0 > STORY + 0.5 && rail.y0 < STORY + 1.4 && rail.x0 > 12), `${label} floor 2 stair corner has no wood rail`);
    const steps = built.dress.filter((item) => item.kind === "step");
    assert(steps.length > 0 && steps.every((item) => item.maxY - item.minY < 0.1), `${label} stair treads are solid`);
    const deck = built.deck;
    const onDeck = groundAt(0, deck.z + 2.2, STORY, built.floors);
    const outer = groundAt(0, deck.z + deck.r - 0.6, STORY, built.floors);
    assert(onDeck != null && Math.abs(onDeck - STORY) < 0.05, `${label} upper door has no deck ${onDeck}`);
    assert(outer != null && Math.abs(outer - STORY) < 0.05, `${label} semicircle deck is missing ${outer}`);
    assert(groundAt(0, deck.z + deck.r + 1.4, STORY, built.floors) == null, `${label} viewing deck has no edge`);
    assert(groundAt(-7.5, 6.5, STORY, built.floors) == null, `${label} viewing deck reaches the side`);
    assert(blocked(0, deck.z + deck.r, 0.2, built.walls, STORY), `${label} viewing rail does not stop the player`);
    assert(!blocked(0, deck.z - 1.1, 0.2, built.walls, STORY), `${label} viewing rail blocks the foyer`);
    assert(built.lobes.length === built.floors - 1, `${label} lobes ${built.lobes.length}`);
  }

  const flooded = flood(built);
  assert(flooded.leaks === 0, `${label} walkable leak cells ${flooded.leaks}`);
  let missed = 0;
  for (let i = 0; i < built.frames.length; i += 7) {
    const frame = built.frames[i];
    if (frame.floor !== 0) continue;
    if (!reachable(flooded, frame.x, frame.z + frame.nz * 0.75)) missed++;
  }
  assert(missed === 0, `${label} unreachable frames ${missed}`);
  if (built.floors > 1) {
    const up = flood(built, STORY, { x: 0, z: 0 });
    assert(up.leaks === 0, `${label} upper leak cells ${up.leaks}`);
    assert(reachable(up, 0, 6.5), `${label} upper deck is cut off`);
    assert(!reachable(up, 0, 16), `${label} upper floor walks onto the plaza air`);
    let upperMiss = 0;
    for (let i = 0; i < built.frames.length; i += 11) {
      const frame = built.frames[i];
      if (frame.floor !== 1) continue;
      if (!reachable(up, frame.x, frame.z + frame.nz * 0.75)) upperMiss++;
    }
    assert(upperMiss === 0, `${label} unreachable upper frames ${upperMiss}`);
  }
  checkMotion(built);
  if (label === "fixture") {
    checkDay(built);
    checkDress(built);
  }
  return built;
}

function checkDress(built) {
  const beams = built.dress.filter((item) => item.kind === "beam");
  assert(beams.length > 0, "ceiling beams");
  for (let i = 0; i < beams.length; i++) {
    const beam = beams[i];
    const floor = Math.round((beam.maxY - WALL_H) / STORY);
    const soffit = floor * STORY + WALL_H - 0.06;
    assert(beam.maxY > soffit && beam.maxY < soffit + 0.04, "beam stays against the ceiling");
  }
  const lamp = spotFixtureTop(0);
  assert(lamp > WALL_H - 0.06 && lamp < WALL_H - 0.02, "spotlight sits against the ceiling");
  assert(Math.abs(spotFixtureTop(STORY) - (STORY + lamp)) < 1e-6, "upper spotlight follows its ceiling");
  const paint = new THREE.MeshBasicMaterial();
  const dressed = horizonMeshes({
    grass: paint, water: paint, path: paint, disc: paint, plaster: paint,
    roof: paint, glass: paint, glow: paint, hill: paint, cloud: paint,
  });
  const approach = dressed.root.getObjectByName("plaza-approach");
  assert(approach != null, "plaza approach");
  const approachNorth = approach.position.z - approach.geometry.parameters.height / 2;
  assert(approachNorth <= PLAZA.minZ && approachNorth > PLAZA.minZ - 0.05, "plaza cross reaches the front door");
  let apronSouth = -Infinity;
  const apron = built.floorPlates[0].outer;
  for (let i = 0; i < apron.length; i++) if (apron[i][1] > apronSouth) apronSouth = apron[i][1];
  assert(apronSouth >= PLAZA_PATH.z0 - 0.001, "door apron meets the plaza cross");
  const rails = built.dress.filter((item) => item.kind === "glass" && item.maxY - item.minY > 0.7 && item.maxY - item.minY < 1.2);
  assert(rails.length > 0, "stair-corner glass");
  for (let i = 0; i < rails.length; i++) {
    const rail = rails[i];
    const floor = Math.round(rail.minY / STORY);
    const foot = floor * STORY + 0.04;
    assert(rail.minY < foot, "stair glass meets the floor");
  }
  const cans = built.extinguishers.filter((item) => item.y < 0.01);
  assert(cans.some((item) => item.x > 7.98 && item.x < 8.16), "extinguisher nearer the column");
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

async function checkPublicLobby() {
  const source = await readFile(path.join(root, "js", "presence.js"), "utf8");
  assert(source.includes('const PUBLIC_LOBBY = "wss://lobby.youquhome.com/lobby"'), "public lobby goes through the youquhome proxy");
  const proxy = await readFile(path.join(root, "worker", "youqu-proxy.js"), "utf8");
  assert(proxy.includes("sitopia-lobby.adhesive-quarter.workers.dev"), "proxy still forwards to the cloudflare room");
  const worker = await readFile(path.join(root, "worker", "lobby.js"), "utf8");
  assert(worker.includes('"https://sitopia.youquhome.com"'), "custom domain may enter the cloudflare room");
  assert(worker.includes('"https://wenxiuncle.github.io"'), "github pages may enter the cloudflare room");
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

function checkLift() {
  const lift = createLift(4, STORY);
  lift.call(2);
  let guard = 0;
  while ((lift.current !== 2 || lift.phase !== "open") && guard < 900) {
    lift.tick(0.05, false);
    guard += 1;
  }
  assert(guard < 900 && lift.current === 2 && lift.door > 0.95 && lift.phase === "open", "lift opens on the called floor");
  const parked = lift.y;
  for (let i = 0; i < 80; i++) lift.tick(0.05, true);
  assert(lift.phase !== "moving" && Math.abs(lift.y - parked) < 1e-6, "a person in the doorway keeps the lift put");
  for (let i = 0; i < 120; i++) lift.tick(0.05, false);
  lift.call(0);
  guard = 0;
  while ((lift.current !== 0 || lift.phase !== "open") && guard < 900) {
    lift.tick(0.05, false);
    guard += 1;
  }
  assert(lift.current === 0 && lift.y < 0.05 && lift.door > 0.95, "lift returns to the ground floor and opens");
  const fine = createLift(13, STORY);
  fine.call(0);
  for (let i = 0; i < 120; i++) fine.tick(1 / 60, false);
  fine.call(5);
  guard = 0;
  while ((fine.current !== 5 || fine.phase !== "open") && guard < 4000) {
    fine.tick(1 / 60, false);
    guard += 1;
  }
  assert(guard < 4000 && fine.current === 5 && fine.door > 0.95, "lift opens after a ride at frame rate");
  const y = lift.y;
  lift.call(3);
  lift.tick(0.05, false);
  assert(lift.phase !== "moving" && Math.abs(lift.y - y) < 1e-6, "lift does not leave while the door is open");
  const once = createLift(3, STORY);
  let opens = 0;
  let prev = once.phase;
  once.call(0);
  if (prev !== "opening" && once.phase === "opening") opens += 1;
  prev = once.phase;
  for (let i = 0; i < 500; i++) {
    once.tick(1 / 60, false);
    if (prev !== "opening" && once.phase === "opening") opens += 1;
    prev = once.phase;
  }
  assert(opens === 1 && once.phase === "idle" && once.door < 0.02, `door cycles twice (${opens}, ${once.phase}, ${once.door})`);
  const ride = createLift(8, STORY);
  ride.call(6);
  let passed = false;
  let aimed = true;
  guard = 0;
  while (!(ride.current === 6 && ride.phase === "open") && guard < 5000) {
    ride.tick(1 / 60, false);
    if (ride.phase === "moving") {
      if (ride.dest !== 6) aimed = false;
      if (ride.y > STORY * 1.2 && ride.y < STORY * 4) passed = true;
    }
    guard += 1;
  }
  assert(aimed && passed && ride.dest === 6, "moving lift keeps the destination floor");
  const stay = createLift(6, STORY);
  stay.call(4);
  assert(stay.has(4) && !stay.has(1), "call marks only the chosen floor");
  stay.cancel(4);
  assert(!stay.has(4), "cancel removes the floor");
  for (let i = 0; i < 180; i++) stay.tick(1 / 60, false);
  assert(stay.current === 0 && stay.y < 0.05 && stay.phase !== "moving", "cancel before leaving stays put");
  const back = createLift(6, STORY);
  back.call(4);
  for (let i = 0; i < 8; i++) back.tick(1 / 60, false);
  back.cancel(4);
  for (let i = 0; i < 400; i++) back.tick(1 / 60, false);
  assert(back.current === 0 && back.y < STORY * 0.2 && back.phase !== "moving", "a short start returns home");
  const drop = createLift(8, STORY);
  drop.call(6);
  guard = 0;
  while ((drop.phase !== "moving" || drop.y < STORY * 1.4) && guard < 2000) {
    drop.tick(1 / 60, false);
    guard += 1;
  }
  assert(drop.phase === "moving" && drop.y > STORY && drop.has(6), "left the ground before cancel");
  drop.cancel(6);
  assert(!drop.has(6), "cancel clears the floor in motion");
  guard = 0;
  let settled = false;
  while (guard < 2000) {
    drop.tick(1 / 60, false);
    guard += 1;
    if (drop.phase === "open" || drop.phase === "idle") {
      settled = Math.abs(drop.y / STORY - Math.round(drop.y / STORY)) < 0.02;
      break;
    }
  }
  assert(settled && !drop.has(6) && drop.phase !== "moving", "cancelled ride finishes on a floor");
  const both = createLift(8, STORY);
  both.call(3);
  both.call(6);
  both.cancel(3);
  guard = 0;
  while ((both.current !== 6 || both.phase !== "open") && guard < 5000) {
    both.tick(1 / 60, false);
    guard += 1;
  }
  assert(guard < 5000 && both.current === 6 && both.phase === "open" && !both.has(3) && !both.has(6), "the other floor still gets the car");
}

function checkPull() {
  const open = pullCamera(0, 1.6, 0, 0, 0, -1, 3, []);
  assert(Math.abs(open.x) < 1e-6 && Math.abs(open.z - 3) < 1e-6, "camera backs away from look -Z");
  const side = pullCamera(0, 1.6, 0, 1, 0, 0, 3, []);
  assert(side.x < -2.5 && Math.abs(side.z) < 1e-6, "camera backs away from look +X");
  const wall = { minX: -1, maxX: 1, minZ: 1, maxZ: 1.5, h: 3, base: 0 };
  const stopped = pullCamera(0, 1.6, 0, 0, 0, -1, 4, [wall]);
  assert(stopped.z < 1 && stopped.z > 0.4, "camera stops before the wall behind");
}

function checkMask() {
  const w = 9;
  const h = 9;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = x >= 1 && x < 8 && y >= 1 && y < 8;
      const hole = x >= 3 && x < 6 && y >= 3 && y < 6;
      if (on && !hole) mask[y * w + x] = 1;
    }
  }
  const shapes = maskPaths(mask, w, h);
  assert(shapes.length === 1 && shapes[0].holes.length === 1, "outline keeps its hole");
  const area = (path) => {
    let sum = 0;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const q = path[(i + 1) % path.length];
      sum += p[0] * q[1] - q[0] * p[1];
    }
    return sum / 2;
  };
  assert(area(shapes[0].pts) > 0 && area(shapes[0].holes[0]) < 0, "outer winds CCW and the hole winds CW");
}

function roomEnergy(ir, t0, t1) {
  const i0 = Math.floor(t0 * ir.rate);
  const i1 = Math.floor(t1 * ir.rate);
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += ir.left[i] * ir.left[i] + ir.right[i] * ir.right[i];
  return sum / Math.max(1, i1 - i0);
}

function checkRoom() {
  const ir = museumImpulse(44100);
  assert(ir.left.length === ir.right.length && ir.left.length > 44100 * 2, "room impulse lasts through the tail");
  const early = roomEnergy(ir, 0, 0.015);
  const taps = roomEnergy(ir, 0.02, 0.09);
  const body = roomEnergy(ir, 0.15, 0.4);
  const tail = roomEnergy(ir, 1.7, 2.05);
  assert(early < taps * 0.02, "room stays quiet before the first reflection");
  assert(taps > 0 && body > 0, "room has early sound and a tail");
  assert(tail < body * 0.2, "room tail dies away");
  let peak = 0;
  let bad = false;
  for (let i = 0; i < ir.left.length; i++) {
    if (!Number.isFinite(ir.left[i]) || !Number.isFinite(ir.right[i])) bad = true;
    const a = Math.abs(ir.left[i]);
    const b = Math.abs(ir.right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  assert(!bad && peak > 0.2 && peak <= 0.63, `room impulse stays in range, peak ${peak}`);
  const n = 1000;
  const ramp = new Float32Array(n);
  const flat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ramp[i] = i;
    flat[i] = 1;
  }
  const fade = 100;
  const out = bakeLoop([ramp, flat], fade);
  assert(out[0].length === n - fade, "loop trims the overlap");
  assert(Math.abs(out[0][0] - ramp[n - fade]) < 1e-4, "loop starts on the outgoing tail");
  assert(Math.abs(out[0][fade] - ramp[fade]) < 1e-4, "loop joins the unfaded body");
  assert(Math.abs(out[1][0] - 1) < 1e-4 && Math.abs(out[1][fade] - 1) < 1e-4, "constant channel stays put");
}

checkRoom();
checkFacing();
checkPull();
checkMask();
checkLift();
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
  await checkPublicLobby();
  await checkLobby();
} catch (err) {
  failures.push("lobby: " + err.message);
}

if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("selftest ok");
