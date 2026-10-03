import * as THREE from "../vendor/three.module.js";
import {
  LAMP_AMBI,
  LAMP_AMBI_FAR,
  LAMP_AMBI_NEAR,
  LAMP_ATTEN,
  LAMP_BIAS,
  LAMP_CLAMP,
  LAMP_CONE_IN,
  LAMP_CONE_OUT,
  LAMP_DIRECT,
  LAMP_FILL,
  LAMP_GAIN,
  LAMP_LED_CONE,
  LAMP_LED_DIRECT,
  LAMP_LED_WASH,
  LAMP_SCONCE_DIRECT,
  LAMP_SCONCE_WASH,
  LAMP_WASH_IN,
  LAMP_WASH_OUT,
  LAMP_WRAP,
  LAMP_STORY_BLEND,
  LAMP_CORNER_REACH,
  LAMP_PACK_XZ,
  LAMP_PACK_Y,
  LAMPS_PER_FLOOR,
  FRONT_SHADOW_SLACK,
  SHADOW_IN,
  SHADOW_OUT,
  dropShadowPose,
  floorLamps,
  packLamp,
} from "./day.js";
import { CEIL_TILT, FLOOR_TILT, FRAME, FRAME_WALL_GAP, LIFT, PLAZA, PLAZA_CROSS_Z, PLAZA_PATH, STAIR_LAMP_H, STAIR_LAMP_R, STAIR_LIGHT, STORY, WALL_H, doorBoxes, liftLeaves } from "./layout.js";

const dummy = new THREE.Object3D();

function commit(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function wallMesh(walls, material) {
  if (!walls.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, walls.length);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const h = w.h == null ? WALL_H : w.h;
    const base = w.base || 0;
    dummy.position.set((w.minX + w.maxX) / 2, base + h / 2, (w.minZ + w.maxZ) / 2);
    dummy.scale.set(w.maxX - w.minX, h, w.maxZ - w.minZ);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return commit(mesh);
}

export function boxMesh(boxes, material) {
  if (!boxes.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    dummy.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    dummy.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return commit(mesh);
}

export function frameMeshes(frames, borderMat, matMat) {
  const border = new THREE.InstancedMesh(new THREE.BoxGeometry(FRAME.w, FRAME.h, FRAME.d), borderMat, frames.length);
  const mat = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(FRAME.w - 0.14, FRAME.h - 0.14),
    matMat,
    frames.length,
  );
  const color = new THREE.Color();
  const stick = FRAME.d / 2 + 0.012;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(f.x, f.y, f.z);
    dummy.updateMatrix();
    border.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, f.nz < 0 ? Math.PI : 0, 0);
    dummy.position.set(f.x, f.y, f.z + f.nz * stick);
    dummy.updateMatrix();
    mat.setMatrixAt(i, dummy.matrix);
    color.set(f.color);
    mat.setColorAt(i, color);
  }
  if (mat.instanceColor) mat.instanceColor.needsUpdate = true;
  commit(border);
  commit(mat);
  return { border, mat };
}

// 宽图按画框高度放大，高图按画框宽度放大。多出来的在画框外，不拉变形。
export function coverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio >= dstRatio) {
    const h = dstH;
    const w = dstH * srcRatio;
    return { x: (dstW - w) / 2, y: 0, w, h };
  }
  const w = dstW;
  const h = dstW / srcRatio;
  return { x: 0, y: (dstH - h) / 2, w, h };
}

export function atlasGrid(count, maxSize) {
  const limit = Math.max(64, maxSize || 4096);
  for (let cellH = 360; cellH >= 18; cellH -= 18) {
    const cellW = (cellH * 37) / 18;
    if (cellW > limit) continue;
    const cols = Math.max(1, Math.floor(limit / cellW));
    const rows = Math.ceil(count / cols);
    if (rows * cellH <= limit) return { cols, rows, cellW, cellH };
  }
  return { cols: count, rows: 1, cellW: 37, cellH: 18 };
}

const FRAME_EXT = /\.(webp|jpe?g|png|gif|avif)$/i;

// 画芯只收图片站的 https 地址。本地 data/frames 仍可用，给还没改地址的清单兜底。
export function usableFrameImage(src) {
  if (!src || typeof src !== "string") return "";
  if (/^data\/frames\/\d+\.(webp|jpe?g|png|gif|avif)$/i.test(src)) return src;
  let url;
  try {
    url = new URL(src);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (!/(^|\.)youquhome\.com$/i.test(url.hostname)) return "";
  if (!FRAME_EXT.test(url.pathname)) return "";
  return url.href;
}

export function cellUv(col, row, cols, rows) {
  const u = col / cols;
  const v = 1 - (row + 1) / rows;
  const su = 1 / cols;
  const sv = 1 / rows;
  return [u, v, su, sv];
}

function plantSlot(list, index) {
  const mesh = list[index];
  if (!mesh) return null;
  return mesh;
}

export function plantMeshes(plants, potMat, leafMat) {
  if (!plants.length) return { pots: null, leaves: [] };
  const pots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 6), potMat, plants.length);
  const shapes = [
    new THREE.ConeGeometry(0.34, 0.62, 6),
    new THREE.SphereGeometry(0.34, 7, 5),
    new THREE.ConeGeometry(0.52, 0.28, 7),
  ];
  const counts = [0, 0, 0];
  for (let i = 0; i < plants.length; i++) counts[plants[i].kind || 0] += 1;
  const leaves = [];
  for (let k = 0; k < 3; k++) {
    leaves.push(counts[k] ? new THREE.InstancedMesh(shapes[k], leafMat, counts[k]) : null);
  }
  const cursor = [0, 0, 0];
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    const kind = p.kind || 0;
    const y = p.y || 0;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.position.set(p.x, y + 0.14 * p.s, p.z);
    dummy.updateMatrix();
    pots.setMatrixAt(i, dummy.matrix);
    const leaf = plantSlot(leaves, kind);
    const slot = cursor[kind]++;
    if (kind === 1) dummy.scale.set(p.s * 1.35, p.s * 0.85, p.s * 1.35);
    if (kind === 2) dummy.scale.set(p.s * 1.15, p.s * 0.9, p.s * 1.15);
    dummy.position.set(p.x, y + (kind === 1 ? 0.5 : kind === 2 ? 0.42 : 0.59) * p.s, p.z);
    dummy.updateMatrix();
    leaf.setMatrixAt(slot, dummy.matrix);
  }
  commit(pots);
  for (let k = 0; k < leaves.length; k++) if (leaves[k]) commit(leaves[k]);
  return { pots, leaves };
}

const SPOT_R = 1.85;
const SPOT_BASE = 0.048;
// 天花底面在 WALL_H - 0.06。灯罩顶埋进底面 2 厘米，和梁一样不留缝。
const SPOT_APEX_GAP = 0.008;

function spotApex(baseY) {
  return (baseY || 0) + WALL_H - 0.032;
}

function spotConeHeight() {
  return spotApex(0) - SPOT_BASE;
}

export function spotFixtureTop(baseY) {
  return spotApex(baseY) - SPOT_APEX_GAP;
}

let spotPool = null;

function spotPoolTexture() {
  if (spotPool) return spotPool;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.42, "rgba(255,255,255,0.92)");
  glow.addColorStop(0.72, "rgba(255,255,255,0.38)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  spotPool = new THREE.CanvasTexture(canvas);
  spotPool.colorSpace = THREE.SRGBColorSpace;
  spotPool.needsUpdate = true;
  return spotPool;
}

export function spotHeadMesh(cones, shadeMat, lampMat) {
  if (!cones.length) return null;
  const shadeH = 0.1;
  const lampH = 0.03;
  const shade = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.16, shadeH, 14, 1), shadeMat, cones.length);
  const lamp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, lampH, 12, 1), lampMat, cones.length);
  const root = new THREE.Group();
  for (let i = 0; i < cones.length; i++) {
    const apex = spotApex(cones[i].y);
    const bottom = apex - shadeH - SPOT_APEX_GAP;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(cones[i].x, bottom + shadeH * 0.5, cones[i].z);
    dummy.updateMatrix();
    shade.setMatrixAt(i, dummy.matrix);
    dummy.position.set(cones[i].x, bottom - lampH * 0.5 - 0.004, cones[i].z);
    dummy.updateMatrix();
    lamp.setMatrixAt(i, dummy.matrix);
  }
  root.add(commit(shade), commit(lamp));
  return root;
}

export function lightConeMesh(cones, material) {
  if (!cones.length) return null;
  const coneH = spotConeHeight();
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(SPOT_R, 1, 32, 1, true), material, cones.length);
  for (let i = 0; i < cones.length; i++) {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, coneH, 1);
    dummy.position.set(cones[i].x, spotApex(cones[i].y) - coneH / 2, cones[i].z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  const done = commit(mesh);
  done.renderOrder = 2;
  return done;
}

const LED_R = STAIR_LAMP_R;
const LED_H = STAIR_LAMP_H;

// 圆盘贴在上方平台的天花底面，整圆在楼梯孔北缘之外。光池落在正下方的地面。
export function ledRig(leds, rimMat, glowMat, poolMat) {
  if (!leds || !leds.length) return null;
  const root = new THREE.Group();
  const rim = new THREE.InstancedMesh(new THREE.CylinderGeometry(LED_R, LED_R, LED_H, 28), rimMat, leds.length);
  const glow = new THREE.InstancedMesh(new THREE.CylinderGeometry(LED_R * 0.84, LED_R * 0.84, 0.01, 28), glowMat, leds.length);
  const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1.45, 28), poolMat, leds.length);
  if (!poolMat.map) {
    poolMat.map = spotPoolTexture();
    poolMat.needsUpdate = true;
  }
  for (let i = 0; i < leds.length; i++) {
    const led = leds[i];
    const cy = (led.y || 0) + led.lift;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(led.x, cy, led.z);
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
    dummy.position.set(led.x, cy - LED_H * 0.5 - 0.002, led.z);
    dummy.updateMatrix();
    glow.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.position.set(led.x, led.poolY, led.z);
    dummy.updateMatrix();
    pool.setMatrixAt(i, dummy.matrix);
  }
  pool.renderOrder = 1;
  root.add(commit(rim), commit(glow), commit(pool));
  return root;
}

const rodUp = new THREE.Vector3(0, 1, 0);
const rodDir = new THREE.Vector3();

function placeRod(mesh, index, ax, ay, az, bx, by, bz, thick) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const girth = thick || 1;
  rodDir.set(dx / len, dy / len, dz / len);
  dummy.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
  dummy.scale.set(girth, len, girth);
  dummy.quaternion.setFromUnitVectors(rodUp, rodDir);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  dummy.quaternion.identity();
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
}

// 南墙欧式双头壁灯：圆背板、曲臂、蜡烛和敞口灯罩朝厅内。整体按灯罩中心放大一倍。
export function sconceRig(lamps, brassMat, shadeMat, washMat, poolMat) {
  if (!lamps || !lamps.length) return null;
  const root = new THREE.Group();
  const n = lamps.length;
  const candleMat = new THREE.MeshBasicMaterial({ color: 0xf4eee4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xf0d7a4, side: THREE.DoubleSide });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0xd5e7ee });
  const plate = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.016, 20), brassMat, n);
  const urn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.026, 14, 10), brassMat, n);
  const bird = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 10, 8), brassMat, n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.01, 8, 6), brassMat, n);
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 5), brassMat, n);
  const drop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.02, 0.15, 10), crystalMat, n);
  const finial = new THREE.InstancedMesh(new THREE.SphereGeometry(0.013, 8, 6), brassMat, n);
  const shadeH = 0.11;
  const shades = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.038, 0.074, shadeH, 16, 1, true), shadeMat, n * 2);
  const mouths = new THREE.InstancedMesh(new THREE.CircleGeometry(0.062, 16), glowMat, n * 2);
  const trimTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 14), brassMat, n * 2);
  const trimBot = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.078, 0.078, 0.008, 14), brassMat, n * 2);
  const candles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), candleMat, n * 2);
  const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.014, 0.018, 8), brassMat, n * 2);
  const arms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 6), brassMat, n * 4);
  const gems = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 5), crystalMat, n * 5);
  const wash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.72), washMat, n);
  const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1.25, 24), poolMat, n);
  if (!washMat.map) {
    washMat.map = spotPoolTexture();
    washMat.needsUpdate = true;
  }
  if (!poolMat.map) {
    poolMat.map = spotPoolTexture();
    poolMat.needsUpdate = true;
  }
  const sides = [-1, 1];
  const S = 2;
  function put(mesh, index, ox, oy, oz, lx, ly, lz, rx, ry, rz, sx, sy, sz) {
    dummy.rotation.set(rx || 0, ry || 0, rz || 0);
    dummy.scale.set((sx == null ? 1 : sx) * S, (sy == null ? 1 : sy) * S, (sz == null ? 1 : sz) * S);
    dummy.position.set(ox + lx * S, oy + ly * S, oz + lz * S);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    dummy.quaternion.identity();
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
  }
  for (let i = 0; i < n; i++) {
    const lamp = lamps[i];
    const y = (lamp.y || 0) + lamp.lift;
    const face = lamp.mountZ;
    const x = lamp.x;
    put(plate, i, x, y, face, 0, -0.1, -0.012, Math.PI / 2, 0, 0);
    put(urn, i, x, y, face, 0, -0.055, -0.042);
    put(bird, i, x, y, face, 0, 0.01, -0.055, 0, 0, 0, 0.85, 0.62, 1.25);
    put(head, i, x, y, face, 0, 0.048, -0.078);
    put(stem, i, x, y, face, 0.012, 0.09, -0.05);
    put(drop, i, x, y, face, 0, -0.22, -0.034);
    put(finial, i, x, y, face, 0, -0.308, -0.034);
    put(wash, i, x, y, face, 0, 0, -0.006, 0, Math.PI, 0);
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(lamp.poolX, lamp.poolY, lamp.poolZ);
    dummy.updateMatrix();
    pool.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    const blossoms = [
      [0.0, 0.06, -0.045],
      [0.02, 0.11, -0.04],
      [-0.012, 0.145, -0.048],
    ];
    for (let b = 0; b < blossoms.length; b++) {
      const p = blossoms[b];
      put(gems, i * 5 + b, x, y, face, p[0], p[1], p[2]);
    }
    for (let s = 0; s < sides.length; s++) {
      const side = sides[s];
      const idx = i * 2 + s;
      const lx = side * 0.16;
      const lz = -0.145;
      put(shades, idx, x, y, face, lx, 0, lz);
      put(mouths, idx, x, y, face, lx, -shadeH * 0.5 + 0.008, lz, CEIL_TILT, 0, 0);
      put(trimTop, idx, x, y, face, lx, shadeH * 0.5, lz);
      put(trimBot, idx, x, y, face, lx, -shadeH * 0.5, lz);
      put(candles, idx, x, y, face, lx, -0.082, lz);
      put(cups, idx, x, y, face, lx, -0.116, lz);
      const rootX = x + side * 0.028 * S;
      const elbowX = x + side * 0.1 * S;
      const cupX = x + lx * S;
      const armZ = face + lz * S;
      placeRod(arms, i * 4 + s * 2, rootX, y - 0.05 * S, face - 0.04 * S, elbowX, y - 0.1 * S, face - 0.09 * S, S);
      placeRod(arms, i * 4 + s * 2 + 1, elbowX, y - 0.1 * S, face - 0.09 * S, cupX, y - 0.116 * S, armZ, S);
      put(gems, i * 5 + 3 + s, x, y, face, side * 0.1, -0.128, -0.09);
    }
  }
  wash.renderOrder = 2;
  pool.renderOrder = 1;
  mouths.renderOrder = 2;
  root.add(
    commit(plate), commit(urn), commit(bird), commit(head), commit(stem),
    commit(drop), commit(finial), commit(arms), commit(cups), commit(candles),
    commit(shades), commit(mouths), commit(trimTop), commit(trimBot),
    commit(gems), commit(wash), commit(pool),
  );
  return root;
}

export function floorDiscMesh(cones, material) {
  if (!cones.length) return null;
  if (!material.map) {
    material.map = spotPoolTexture();
    material.needsUpdate = true;
  }
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(SPOT_R, 32), material, cones.length);
  for (let i = 0; i < cones.length; i++) {
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(cones[i].x, (cones[i].y || 0) + SPOT_BASE + 0.006, cones[i].z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  const done = commit(mesh);
  done.renderOrder = 1;
  return done;
}

export function floorAndCeiling(bounds, floorMat, ceilMat, interior, roomMat) {
  const sx = bounds.maxX - bounds.minX + 8;
  const sz = bounds.maxZ - bounds.minZ + 8;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), floorMat);
  floor.rotation.x = FLOOR_TILT;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = false;
  let ceil = null;
  let roomFloor = null;
  if (interior) {
    const rw = interior.maxX - interior.minX;
    const rd = interior.maxZ - interior.minZ;
    const rx = (interior.minX + interior.maxX) / 2;
    const rz = (interior.minZ + interior.maxZ) / 2;
    roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), roomMat || floorMat);
    roomFloor.rotation.x = FLOOR_TILT;
    roomFloor.position.set(rx, 0.018, rz);
    roomFloor.receiveShadow = false;
    ceil = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd), ceilMat);
    ceil.rotation.x = CEIL_TILT;
    ceil.position.set(rx, WALL_H, rz);
    ceil.receiveShadow = false;
  }
  return { floor, ceil, roomFloor };
}

function glslNum(n) {
  const text = String(n);
  return text.includes(".") || text.includes("e") ? text : text + ".0";
}

// 循环里取样会让部分显卡编不过。每盏灯展开成一段。
function lampSamples(acc) {
  const parts = [];
  const packX = glslNum(LAMP_PACK_XZ * 2);
  const packZ = glslNum(LAMP_PACK_XZ);
  const packY = glslNum(LAMP_PACK_Y);
  for (let i = 0; i < LAMPS_PER_FLOOR; i++) {
    parts.push(`{
      vec4 L = texture2D(uLamps, vec2((${i}.0 + 0.5) * uLampInv.x, rowV));
      if (L.a > 0.5) {
        vec3 lampPos = vec3(L.r * ${packX} - ${packZ}, L.g * ${packY}, L.b * ${packX} - ${packZ});
        vec3 toL = lampPos - vSunW;
        float dist2 = dot(toL, toL);
        float dist = sqrt(max(dist2, 1e-6));
        vec3 ldir = toL / dist;
        float wrap = clamp(dot(nrm, ldir) * ${glslNum(LAMP_WRAP)} + ${glslNum(LAMP_BIAS)}, 0.0, 1.0);
        float aim = max(ldir.y, 0.0);
        float down = smoothstep(${glslNum(LAMP_CONE_IN)}, ${glslNum(LAMP_CONE_OUT)}, aim);
        float atten = 1.0 / (1.0 + dist2 * ${glslNum(LAMP_ATTEN)});
        float ambi = smoothstep(${glslNum(LAMP_AMBI_FAR)}, ${glslNum(LAMP_AMBI_NEAR)}, dist) * ${glslNum(LAMP_AMBI)};
        float add = wrap * down * atten * ${glslNum(LAMP_DIRECT)};
        if (L.a < 0.9) {
          float face = smoothstep(${glslNum(LAMP_WASH_IN)}, ${glslNum(LAMP_WASH_OUT)}, wrap);
          if (L.a > 0.7) {
            float wide = smoothstep(${glslNum(LAMP_CONE_IN)}, ${glslNum(LAMP_LED_CONE)}, aim);
            add = wrap * wide * atten * ${glslNum(LAMP_LED_DIRECT)} + face * atten * ${glslNum(LAMP_LED_WASH)};
          } else {
            add = wrap * down * atten * ${glslNum(LAMP_SCONCE_DIRECT)} + face * atten * ${glslNum(LAMP_SCONCE_WASH)};
          }
        }
        ${acc} += add + ambi;
      }
    }`);
  }
  return parts.join("\n");
}

// 顶点前缀里已经声明了 normal，这里不再声明。
function patchSunShader(shader, shared, role) {
  shader.uniforms.uSunDir = role.dir || shared.dir;
  shader.uniforms.uSunTint = role.tint || shared.tint;
  shader.uniforms.uBlock = shared.block;
  shader.uniforms.uFront = shared.front;
  shader.uniforms.uRoof = shared.roof;
  shader.uniforms.uShade = shared.shade;
  shader.uniforms.uFill = role.fill;
  shader.uniforms.uGain = role.gain;
  shader.uniforms.uCast = role.cast;
  shader.uniforms.uRoom = shared.roomBox;
  shader.uniforms.uLamps = shared.lamps;
  shader.uniforms.uLampInv = shared.lampInv;
  shader.uniforms.uStory = shared.story;
  shader.uniforms.uLampTint = shared.lampTint;
  shader.uniforms.uLampMode = role.lamps;
  const vertex = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
    vec3 sunN = normal;
    #ifdef USE_INSTANCING
      mat3 sunIM = mat3(instanceMatrix);
      sunN /= vec3(dot(sunIM[0], sunIM[0]), dot(sunIM[1], sunIM[1]), dot(sunIM[2], sunIM[2]));
      sunN = sunIM * sunN;
      vSunW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vSunW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif
    sunN = mat3(modelMatrix) * sunN;
    vSunN = normalize(sunN);`,
  );
  if (vertex === shader.vertexShader) throw new Error("阳光顶点着色器没有对上");
  shader.vertexShader = "varying vec3 vSunN;\nvarying vec3 vSunW;\n" + vertex;
  const fragment = shader.fragmentShader.replace(
    "vec3 outgoingLight = reflectedLight.indirectDiffuse;",
    `vec3 outgoingLight = reflectedLight.indirectDiffuse;
    vec3 nrm = normalize(vSunN);
    bool useLamp = uLampMode > 0.5;
    if (uLampMode > 1.5) {
      useLamp = vSunW.y > -0.2 && vSunW.y < uRoof - 1.0 && vSunW.x > uRoom.x && vSunW.x < uRoom.y && vSunW.z > uRoom.z && vSunW.z < uRoom.w;
    }
    float shade;
    vec3 sunTint = uSunTint;
    if (useLamp) {
      float rows = uLampInv.y > 0.0 ? (1.0 / uLampInv.y) : 1.0;
      float u = (vSunW.y + 0.05) / uStory;
      float fy = clamp(floor(u), 0.0, rows - 1.0);
      bool onSouth = abs(vSunW.z - ${glslNum(STAIR_LIGHT.cornerZ)}) < 0.2 && vSunW.x > ${glslNum(STAIR_LIGHT.minX)} && vSunW.x < ${glslNum(STAIR_LIGHT.maxX)};
      bool onEast = abs(vSunW.x - ${glslNum(STAIR_LIGHT.cornerX)}) < 0.2 && vSunW.z > ${glslNum(STAIR_LIGHT.minZ)} && vSunW.z < ${glslNum(STAIR_LIGHT.cornerZ)} + 0.08;
      bool upright = abs(nrm.y) < 0.55;
      vec3 cornerN = vec3(-0.70710678, 0.0, -0.70710678);
      if (onSouth && nrm.z < -0.45) {
        float along = max(${glslNum(STAIR_LIGHT.cornerX)} - vSunW.x, 0.0);
        float feather = 1.0 - smoothstep(0.0, ${glslNum(LAMP_CORNER_REACH)}, along);
        nrm = normalize(mix(nrm, cornerN, feather));
      } else if (onEast && nrm.x < -0.45) {
        float along = max(${glslNum(STAIR_LIGHT.cornerZ)} - vSunW.z, 0.0);
        float feather = 1.0 - smoothstep(0.0, ${glslNum(LAMP_CORNER_REACH)}, along);
        nrm = normalize(mix(nrm, cornerN, feather));
      }
      float rowV = (fy + 0.5) * uLampInv.y;
      float lamp = 0.0;
      ${lampSamples("lamp")}
      if (upright && (onSouth || onEast)) {
        float frac = u - floor(u);
        float band = ${glslNum(LAMP_STORY_BLEND)} / uStory;
        float wNext = 0.5 * smoothstep(1.0 - band, 1.0, frac);
        float wPrev = 0.5 * (1.0 - smoothstep(0.0, band, frac));
        float neighbor = fy;
        float wMix = 0.0;
        if (wNext > 0.001 && fy + 1.0 < rows) {
          neighbor = fy + 1.0;
          wMix = wNext;
        } else if (wPrev > 0.001 && fy > 0.0) {
          neighbor = fy - 1.0;
          wMix = wPrev;
        }
        if (wMix > 0.0) {
          rowV = (neighbor + 0.5) * uLampInv.y;
          float other = 0.0;
          ${lampSamples("other")}
          lamp = mix(lamp, other, wMix);
        }
      }
      shade = min(${glslNum(LAMP_FILL)} + ${glslNum(LAMP_GAIN)} * lamp, ${glslNum(LAMP_CLAMP)});
      float storyY = mod(max(vSunW.y, 0.0), uStory);
      float ceilLift = smoothstep(${glslNum(WALL_H - 1.15)}, ${glslNum(WALL_H - 0.28)}, storyY);
      shade = mix(shade, max(shade, 0.94), max(-nrm.y, 0.0) * ceilLift);
      sunTint = uLampTint;
    } else {
      float ndl = max(dot(nrm, normalize(uSunDir)), 0.0);
      shade = uFill + uGain * ndl;
      if (uCast > 0.5) {
        vec2 p = vSunW.xz;
        vec2 dir = uSunDir.xz;
        vec2 lo = vec2(uBlock.x, uBlock.z);
        vec2 hi = vec2(uBlock.y, uBlock.w);
        float t0 = 0.0;
        float t1 = 1e6;
        bool miss = false;
        if (abs(dir.x) < 1e-5) {
          if (p.x < lo.x || p.x > hi.x) miss = true;
        } else {
          float a = (lo.x - p.x) / dir.x;
          float b = (hi.x - p.x) / dir.x;
          if (a > b) { float s = a; a = b; b = s; }
          t0 = max(t0, a);
          t1 = min(t1, b);
        }
        if (abs(dir.y) < 1e-5) {
          if (p.y < lo.y || p.y > hi.y) miss = true;
        } else {
          float a = (lo.y - p.y) / dir.y;
          float b = (hi.y - p.y) / dir.y;
          if (a > b) { float s = a; a = b; b = s; }
          t0 = max(t0, a);
          t1 = min(t1, b);
        }
        float mask = 0.0;
        bool inFront = p.y > uFront - ${glslNum(FRONT_SHADOW_SLACK)} && p.x > lo.x && p.x < hi.x;
        if (!inFront && !miss && t1 >= max(t0, 0.0)) {
          float enter = max(t0, 0.0);
          float yHit = uSunDir.y * enter;
          float slack = ((yHit - uRoof) / max(uSunDir.y, 0.05)) * length(dir);
          mask = 1.0 - smoothstep(${SHADOW_IN}, ${SHADOW_OUT}, slack);
        }
        shade *= mix(1.0, uShade, mask);
      }
    }
    outgoingLight *= sunTint * shade;`,
  );
  if (fragment === shader.fragmentShader) throw new Error("阳光片元着色器没有对上");
  shader.fragmentShader = `uniform vec3 uSunDir;
uniform vec3 uSunTint;
uniform vec4 uBlock;
uniform float uFront;
uniform float uRoof;
uniform float uShade;
uniform float uFill;
uniform float uGain;
uniform float uCast;
uniform vec4 uRoom;
uniform sampler2D uLamps;
uniform vec2 uLampInv;
uniform float uStory;
uniform vec3 uLampTint;
uniform float uLampMode;
varying vec3 vSunN;
varying vec3 vSunW;
` + fragment;
}

export function attachSun(material, shared, role) {
  material.onBeforeCompile = (shader) => patchSunShader(shader, shared, role);
  material.customProgramCacheKey = () => "museum-sun-9";
}

// 画芯共用一张图集。frameUv 是格子偏移和缩放。
// 朝 -Z 的平面已经绕 Y 转过 180°，U 不再反转，否则墙背面左右镜像。
export function attachFramePicture(material, shared, role) {
  material.onBeforeCompile = (shader) => {
    patchSunShader(shader, shared, role);
    if (!material.map) return;
    const next = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = frameUv.xy + MAP_UV * frameUv.zw;\n#endif",
    );
    if (next === shader.vertexShader) throw new Error("画框贴图坐标没有对上");
    shader.vertexShader = "attribute vec4 frameUv;\n" + next;
  };
  material.customProgramCacheKey = () => "museum-sun-frame-9";
}

export function sunPatchMesh(count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 16), 4));
  const index = [];
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

export function plantShadowMesh(plants, material) {
  if (!plants.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.36, 10), material, plants.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return commit(mesh);
}

export function dropShadowMesh(count, material) {
  if (!count) return null;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), material, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return commit(mesh);
}

export function placeDropShadows(mesh, items, sun) {
  for (let i = 0; i < items.length; i++) {
    const pose = dropShadowPose(items[i], sun);
    dummy.rotation.order = "YXZ";
    dummy.rotation.set(FLOOR_TILT, pose.yaw, 0);
    dummy.scale.set(pose.across, pose.along, 1);
    dummy.position.set(pose.x, pose.y, pose.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  dummy.rotation.order = "XYZ";
  mesh.instanceMatrix.needsUpdate = true;
}

export function placePlantShadows(mesh, plants, spread) {
  const k = spread || 1;
  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    dummy.rotation.order = "XYZ";
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.scale.set(plant.s * k, plant.s * k, 1);
    dummy.position.set(plant.x, (plant.y || 0) + 0.058, plant.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function frameShadowMesh(frames, material) {
  if (!frames.length) return null;
  const geo = new THREE.PlaneGeometry(FRAME.w + 0.18, FRAME.h + 0.24);
  const mesh = new THREE.InstancedMesh(geo, material, frames.length);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    dummy.rotation.order = "XYZ";
    dummy.rotation.set(0, f.nz < 0 ? Math.PI : 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(f.x, f.y - 0.11, f.z - f.nz * (FRAME.d / 2 + FRAME_WALL_GAP * 0.35));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  const done = commit(mesh);
  done.renderOrder = 1;
  return done;
}

let shadowBlob = null;

export function softShadowMap() {
  if (shadowBlob) return shadowBlob;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  glow.addColorStop(0, "rgba(0,0,0,1)");
  glow.addColorStop(0.38, "rgba(0,0,0,0.72)");
  glow.addColorStop(0.72, "rgba(0,0,0,0.28)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  shadowBlob = new THREE.CanvasTexture(canvas);
  shadowBlob.colorSpace = THREE.SRGBColorSpace;
  // 远了走 mip 会把软边平均成透明，影子还没出雾就没了。
  shadowBlob.generateMipmaps = false;
  shadowBlob.minFilter = THREE.LinearFilter;
  shadowBlob.magFilter = THREE.LinearFilter;
  shadowBlob.needsUpdate = true;
  return shadowBlob;
}

export function softShadowMaterial(opacity, contact) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x1a1614,
    map: softShadowMap(),
    transparent: true,
    depthWrite: false,
    opacity,
  });
  if (contact) {
    material.fog = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -8;
  }
  return material;
}

export function lampTexture(cones) {
  const rows = floorLamps(cones, STORY, WALL_H - 0.032);
  const floors = Math.max(1, rows.length);
  const cols = LAMPS_PER_FLOOR;
  const data = new Float32Array(cols * floors * 4);
  for (let f = 0; f < floors; f++) {
    const list = rows[f] || [];
    for (let i = 0; i < list.length && i < cols; i++) {
      const packed = packLamp(list[i].x, list[i].y, list[i].z);
      const o = (f * cols + i) * 4;
      data[o] = packed[0];
      data[o + 1] = packed[1];
      data[o + 2] = packed[2];
      data[o + 3] = list[i].kind || 1;
    }
  }
  const tex = new THREE.DataTexture(data, cols, floors, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, cols, floors };
}

function solidBox(box, material) {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const d = box.maxZ - box.minZ;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
  return mesh;
}

// 地面会盖住门底约 4 厘米。底框加高这一截，露在地面上的宽度才和左右、上框一样。
const FRAME_T = 0.06;
const FLOOR_COVER = 0.04;

function framedLeaf(group, glassMat, frameMat, span, depth, h, glassAxis, sink) {
  const t = FRAME_T;
  const cover = sink == null ? FLOOR_COVER : sink;
  const glassSpan = Math.max(0.05, span - t * 2);
  const glassH = Math.max(0.05, h - cover - t * 2);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassSpan + 0.012, glassH + 0.012), glassMat);
  if (glassAxis === "z") glass.rotation.y = Math.PI / 2;
  glass.position.y = cover / 2;
  glass.renderOrder = 2;
  group.add(glass);
  const side = (at) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(glassAxis === "z" ? depth : t, h, glassAxis === "z" ? t : depth),
      frameMat,
    );
    if (glassAxis === "z") mesh.position.set(0, 0, at);
    else mesh.position.set(at, 0, 0);
    return mesh;
  };
  const edge = span / 2 - t / 2;
  const capSpan = Math.max(0.02, span - t * 2);
  const cap = (y, ch) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(glassAxis === "z" ? depth : capSpan, ch, glassAxis === "z" ? capSpan : depth),
      frameMat,
    );
    mesh.position.y = y;
    return mesh;
  };
  const bottomH = cover + t;
  group.add(
    side(-edge),
    side(edge),
    cap(h / 2 - t / 2, t),
    cap(-h / 2 + bottomH / 2, bottomH),
  );
}

function doorLeaf(box, glassMat, frameMat) {
  const group = new THREE.Group();
  framedLeaf(group, glassMat, frameMat, box.maxX - box.minX, box.maxZ - box.minZ, box.h, "x");
  return group;
}

// 扇页位置直接抄 doorBoxes 的中心，避免网格和碰撞各算一遍。
function placeLeaf(leaf, box) {
  leaf.position.set((box.minX + box.maxX) / 2, (box.base || 0) + box.h / 2, (box.minZ + box.maxZ) / 2);
}

// 门扇整段留在墙槽里。材质若往镜头偏，会穿出盖住槽的那层墙。
function slotDoorMaterials(glassMat, frameMat) {
  const next = (material) => {
    const copy = material.clone();
    copy.onBeforeCompile = material.onBeforeCompile;
    copy.customProgramCacheKey = material.customProgramCacheKey;
    copy.polygonOffset = false;
    copy.polygonOffsetFactor = 0;
    copy.polygonOffsetUnits = 0;
    return copy;
  };
  return { glass: next(glassMat), frame: next(frameMat) };
}

export function doorRig(glassMat, frameMat, floors) {
  const count = floors || 1;
  const root = new THREE.Group();
  const leaves = [];
  const doorMats = slotDoorMaterials(glassMat, frameMat);
  for (let f = 0; f < count; f++) {
    const boxes = doorBoxes(0, f);
    const pair = [doorLeaf(boxes[0], doorMats.glass, doorMats.frame), doorLeaf(boxes[1], doorMats.glass, doorMats.frame)];
    pair[0].userData.span = boxes[0].maxX - boxes[0].minX;
    pair[1].userData.span = boxes[1].maxX - boxes[1].minX;
    placeLeaf(pair[0], boxes[0]);
    placeLeaf(pair[1], boxes[1]);
    root.add(pair[0], pair[1]);
    leaves.push(pair[0], pair[1]);
  }
  return {
    root,
    leaves,
    update(open) {
      const list = Array.isArray(open) ? open : null;
      for (let f = 0; f < count; f++) {
        const value = list ? list[f] || 0 : f === 0 ? open : 0;
        const boxes = doorBoxes(value, f);
        for (let i = 0; i < 2; i++) {
          const leaf = leaves[f * 2 + i];
          leaf.visible = true;
          leaf.scale.set(1, 1, 1);
          placeLeaf(leaf, boxes[i]);
        }
      }
    },
  };
}

// 电梯门的宽在 Z，厚在 X。大厅门的 doorLeaf 宽在 X，拿来做电梯门会把玻璃挤成一条。
function shaftLeaf(box, glassMat, frameMat) {
  const group = new THREE.Group();
  const h = box.h - FLOOR_COVER;
  framedLeaf(group, glassMat, frameMat, box.maxZ - box.minZ, box.maxX - box.minX, h, "z", 0);
  return group;
}

export function liftRig(glassMat, frameMat, cabMat, ceilMat, floors, floorMat) {
  const count = floors || 1;
  const root = new THREE.Group();
  const leaves = [];
  const doorMats = slotDoorMaterials(glassMat, frameMat);
  for (let f = 0; f < count; f++) {
    const boxes = liftLeaves(0, f);
    for (let i = 0; i < boxes.length; i++) {
      const leaf = shaftLeaf(boxes[i], doorMats.glass, doorMats.frame);
      leaf.userData.span = boxes[i].maxZ - boxes[i].minZ;
      placeLeaf(leaf, boxes[i]);
      root.add(leaf);
      leaves.push(leaf);
    }
  }
  // 轿厢从加厚后墙的内侧起算。前缘停在门垛内侧面以里，不蹭到正面墙。
  // 楼板材质会往镜头偏，轿厢地面若沿用，升降时会被拉进正面墙。
  const cabRear = LIFT.xInner + 0.08;
  const cabFront = LIFT.xDoor - 0.16;
  const wide = Math.max(0.4, cabFront - cabRear);
  const cabX = (cabRear + cabFront) / 2;
  const deep = LIFT.carW - 0.08;
  const sideH = LIFT.cabH - 0.06;
  const cabFloorMat = (floorMat || cabMat).clone();
  cabFloorMat.onBeforeCompile = (floorMat || cabMat).onBeforeCompile;
  cabFloorMat.customProgramCacheKey = (floorMat || cabMat).customProgramCacheKey;
  cabFloorMat.polygonOffset = false;
  cabFloorMat.polygonOffsetFactor = 0;
  cabFloorMat.polygonOffsetUnits = 0;
  const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.07, deep), cabFloorMat);
  const cabCeil = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.05, deep), ceilMat);
  const cabSideL = new THREE.Mesh(new THREE.BoxGeometry(wide, sideH, 0.06), cabMat);
  const cabSideR = new THREE.Mesh(new THREE.BoxGeometry(wide, sideH, 0.06), cabMat);
  root.add(cabFloor, cabCeil, cabSideL, cabSideR);
  return {
    root,
    update(open, carY) {
      const list = Array.isArray(open) ? open : [];
      for (let f = 0; f < count; f++) {
        const t = list[f] || 0;
        const boxes = liftLeaves(t, f);
        for (let i = 0; i < boxes.length; i++) {
          const leaf = leaves[f * boxes.length + i];
          leaf.visible = true;
          leaf.scale.set(1, 1, 1);
          placeLeaf(leaf, boxes[i]);
          // 底边落在楼板面上。门扇比碰撞盒矮一截，顶仍齐门洞，下面不再穿进地板。
          leaf.position.y += FLOOR_COVER / 2;
        }
      }
      const zOff = LIFT.carW / 2 - 0.03;
      cabFloor.position.set(cabX, carY + 0.04, LIFT.cz);
      cabCeil.position.set(cabX, carY + LIFT.cabH + 0.025, LIFT.cz);
      cabSideL.position.set(cabX, carY + 0.05 + sideH / 2, LIFT.cz - zOff);
      cabSideR.position.set(cabX, carY + 0.05 + sideH / 2, LIFT.cz + zOff);
    },
  };
}

const DECK_THICK = 0.22;

function deckShape(radius) {
  const shape = new THREE.Shape();
  const n = 40;
  shape.moveTo(Math.cos(Math.PI) * radius, Math.sin(Math.PI) * radius);
  for (let i = 1; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return shape;
}

function writeXZPath(path, points) {
  const last = points.length - 1;
  path.moveTo(points[last][0], -points[last][1]);
  for (let i = last - 1; i >= 0; i--) path.lineTo(points[i][0], -points[i][1]);
  return path;
}

// 一层楼板或天花是一块挤出的板。洞的绕向和外轮廓相反，楼梯孔才是空的。
export function plateMesh(plates, material) {
  if (!plates || !plates.length) return null;
  const root = new THREE.Group();
  for (let i = 0; i < plates.length; i++) {
    const plate = plates[i];
    const shape = writeXZPath(new THREE.Shape(), plate.outer);
    const holes = plate.holes || [];
    for (let h = 0; h < holes.length; h++) shape.holes.push(writeXZPath(new THREE.Path(), holes[h]));
    const depth = Math.max(0.008, plate.maxY - plate.minY);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = FLOOR_TILT;
    mesh.position.y = plate.minY;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  return root;
}

// 挤出盖板先写下底再写上盖，两半一样厚，侧面另成一组。
// 上盖用馆内地面，下底和侧面用外墙。绕 X 转 -90° 后，本地 +Z 朝上。
function paintDeckFaces(geo) {
  const lid = geo.groups[0];
  const side = geo.groups[1];
  const half = lid.count / 2;
  geo.clearGroups();
  geo.addGroup(lid.start + half, half, 0);
  geo.addGroup(lid.start, half, 1);
  geo.addGroup(side.start, side.count, 1);
}

export function lobeMeshes(lobes, topMat, shellMat) {
  if (!lobes.length) return null;
  const root = new THREE.Group();
  const shell = shellMat || topMat;
  for (let i = 0; i < lobes.length; i++) {
    const lobe = lobes[i];
    const geo = new THREE.ExtrudeGeometry(deckShape(lobe.r), { depth: DECK_THICK, bevelEnabled: false });
    paintDeckFaces(geo);
    const mesh = new THREE.Mesh(geo, [topMat, shell]);
    mesh.rotation.x = FLOOR_TILT;
    mesh.position.set(lobe.x, lobe.y + 0.04 - DECK_THICK, lobe.z);
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  return root;
}

export function handrailMesh(rails, material) {
  if (!rails || !rails.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.055, 0.055), material, rails.length);
  const dir = new THREE.Vector3();
  const axis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < rails.length; i++) {
    const rail = rails[i];
    dir.set(rail.x1 - rail.x0, rail.y1 - rail.y0, rail.z1 - rail.z0);
    const len = dir.length();
    dir.multiplyScalar(1 / len);
    dummy.position.set((rail.x0 + rail.x1) / 2, (rail.y0 + rail.y1) / 2, (rail.z0 + rail.z1) / 2);
    dummy.scale.set(len, rail.sy || 1, rail.sz || 1);
    dummy.quaternion.setFromUnitVectors(axis, dir);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return commit(mesh);
}

// CircleGeometry 经 rotation.x = -PI/2 后，本地 (cos θ, sin θ) 落到世界 (cos θ, 0, -sin θ)。
// θ 从 π 到 2π 时弧在大门外侧。栏杆长轴是本地 +X，rotation.y = atan2(-dz, dx) 才沿着这条弧。
export function deckRailMesh(lobes, glassMat, railMat) {
  if (!lobes.length) return null;
  const segments = 36;
  const count = lobes.length * segments;
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.84, 0.035), glassMat, count);
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.06), railMat, count);
  let n = 0;
  for (let i = 0; i < lobes.length; i++) {
    const lobe = lobes[i];
    for (let s = 0; s < segments; s++) {
      const a0 = lobe.theta + (lobe.sweep * s) / segments;
      const a1 = lobe.theta + (lobe.sweep * (s + 1)) / segments;
      const x0 = lobe.x + Math.cos(a0) * lobe.r;
      const z0 = lobe.z - Math.sin(a0) * lobe.r;
      const x1 = lobe.x + Math.cos(a1) * lobe.r;
      const z1 = lobe.z - Math.sin(a1) * lobe.r;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(len, 1, 1);
      dummy.position.set((x0 + x1) / 2, lobe.y + 0.5, (z0 + z1) / 2);
      dummy.updateMatrix();
      glass.setMatrixAt(n, dummy.matrix);
      dummy.position.y = lobe.y + 0.96;
      dummy.updateMatrix();
      rail.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
  }
  glass.renderOrder = 3;
  const root = new THREE.Group();
  root.add(commit(glass), commit(rail));
  return root;
}

// 玻璃用一张平面。薄盒子的正反两面几乎贴在一起，走动时会闪。
export function paneMesh(boxes, material) {
  if (!boxes.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const sx = b.maxX - b.minX;
    const sy = b.maxY - b.minY;
    const sz = b.maxZ - b.minZ;
    dummy.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    if (sx <= sy && sx <= sz) {
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.scale.set(sz, sy, 1);
    } else if (sz <= sx && sz <= sy) {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sx, sy, 1);
    } else {
      dummy.rotation.set(FLOOR_TILT, 0, 0);
      dummy.scale.set(sx, sz, 1);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return commit(mesh);
}

function pathArea(path) {
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}

function pathHolds(path, x, y) {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const yi = path[i][1];
    const yj = path[j][1];
    const xi = path[i][0];
    const xj = path[j][0];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

function simplifyPath(path, epsilon) {
  if (path.length < 4) return path;
  function keep(start, end, out) {
    let far = 0;
    let index = -1;
    const ax = path[start][0];
    const ay = path[start][1];
    const bx = path[end][0];
    const by = path[end][1];
    const abx = bx - ax;
    const aby = by - ay;
    const ab = abx * abx + aby * aby || 1;
    for (let i = start + 1; i < end; i++) {
      const px = path[i][0] - ax;
      const py = path[i][1] - ay;
      const t = Math.max(0, Math.min(1, (px * abx + py * aby) / ab));
      const dx = px - abx * t;
      const dy = py - aby * t;
      const dist = dx * dx + dy * dy;
      if (dist > far) {
        far = dist;
        index = i;
      }
    }
    if (far > epsilon * epsilon && index > 0) {
      keep(start, index, out);
      out.push(path[index]);
      keep(index, end, out);
    }
  }
  const out = [path[0]];
  keep(0, path.length - 1, out);
  out.push(path[path.length - 1]);
  return out;
}

// 像素边界。实心在左手边，翻到 Y 朝上之后外轮廓是逆时针，孔是顺时针。
export function maskPaths(mask, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 0;
  const next = new Map();
  function add(x0, y0, x1, y1) {
    const key = x0 + "," + y0;
    const list = next.get(key);
    if (list) list.push([x1, y1]);
    else next.set(key, [[x1, y1]]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const south = h - (y + 1);
      const north = h - y;
      if (!on(x, y + 1)) add(x, south, x + 1, south);
      if (!on(x + 1, y)) add(x + 1, south, x + 1, north);
      if (!on(x, y - 1)) add(x + 1, north, x, north);
      if (!on(x - 1, y)) add(x, north, x, south);
    }
  }
  const paths = [];
  for (const [key, outs] of next) {
    while (outs.length) {
      const start = key.split(",");
      let x = Number(start[0]);
      let y = Number(start[1]);
      const path = [[x, y]];
      let guard = 0;
      let closed = false;
      while (guard < w * h * 8) {
        guard += 1;
        const step = (next.get(x + "," + y) || []).shift();
        if (!step) break;
        x = step[0];
        y = step[1];
        if (x === path[0][0] && y === path[0][1]) {
          closed = true;
          break;
        }
        path.push([x, y]);
      }
      if (closed && path.length > 6) paths.push(path);
    }
  }
  const kept = [];
  for (let i = 0; i < paths.length; i++) {
    const slim = simplifyPath(paths[i], 1.15);
    if (Math.abs(pathArea(slim)) < 8) continue;
    kept.push(slim);
  }
  kept.sort((a, b) => Math.abs(pathArea(b)) - Math.abs(pathArea(a)));
  const shapes = [];
  for (let i = 0; i < kept.length; i++) {
    const path = kept[i];
    let depth = 0;
    let parent = -1;
    let parentArea = Infinity;
    const probe = path[0];
    for (let j = 0; j < i; j++) {
      if (!pathHolds(kept[j], probe[0], probe[1])) continue;
      depth += 1;
      const area = Math.abs(pathArea(kept[j]));
      if (area < parentArea) {
        parentArea = area;
        parent = j;
      }
    }
    if (depth % 2 === 0) shapes.push({ pts: path, holes: [], index: i });
    else if (parent >= 0) {
      for (let s = 0; s < shapes.length; s++) {
        if (shapes[s].index === parent) shapes[s].holes.push(path);
      }
    }
  }
  return shapes;
}

function rasterMask(text, px) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const font = "600 " + px + "px Songti SC, SimSun, STSong, serif";
  ctx.font = font;
  const width = Math.max(8, Math.ceil(ctx.measureText(text).width) + Math.round(px * 0.35));
  const height = Math.max(8, Math.ceil(px * 1.4));
  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height * 0.54);
  const image = ctx.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = image.data[i * 4 + 3] > 96 ? 1 : 0;
  return { mask, width, height };
}

function shapeFromPath(path) {
  const shape = new THREE.Shape();
  shape.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) shape.lineTo(path[i][0], path[i][1]);
  return shape;
}

function centerPaths(shapes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  function take(path) {
    for (let i = 0; i < path.length; i++) {
      if (path[i][0] < minX) minX = path[i][0];
      if (path[i][0] > maxX) maxX = path[i][0];
      if (path[i][1] < minY) minY = path[i][1];
      if (path[i][1] > maxY) maxY = path[i][1];
    }
  }
  for (let i = 0; i < shapes.length; i++) {
    take(shapes[i].pts);
    for (let h = 0; h < shapes[i].holes.length; h++) take(shapes[i].holes[h]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  function shift(path) {
    const out = [];
    for (let i = 0; i < path.length; i++) out.push([path[i][0] - cx, path[i][1] - cy]);
    return out;
  }
  for (let i = 0; i < shapes.length; i++) {
    shapes[i].pts = shift(shapes[i].pts);
    for (let h = 0; h < shapes[i].holes.length; h++) shapes[i].holes[h] = shift(shapes[i].holes[h]);
  }
  return { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

const letterMat = new THREE.MeshBasicMaterial({ color: 0x2c2926, fog: false });
const facadeMat = new THREE.MeshBasicMaterial({ color: 0x2c2926, fog: false });

export function setFacadeSignNight(glow) {
  facadeMat.color.set(glow ? 0xb0aba2 : 0x2c2926);
}

function solidSign(sign) {
  try {
    const px = sign.h > 0.5 ? 64 : 48;
    const raster = rasterMask(sign.text, px);
    const shapes = maskPaths(raster.mask, raster.width, raster.height);
    if (!shapes.length) return null;
    const box = centerPaths(shapes);
    const scale = sign.h / box.height;
    const group = new THREE.Group();
    const depth = 0.045 / scale;
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapeFromPath(shapes[i].pts);
      for (let h = 0; h < shapes[i].holes.length; h++) {
        const hole = new THREE.Path();
        const pts = shapes[i].holes[h];
        hole.moveTo(pts[0][0], pts[0][1]);
        for (let p = 1; p < pts.length; p++) hole.lineTo(pts[p][0], pts[p][1]);
        shape.holes.push(hole);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
      group.add(new THREE.Mesh(geo, sign.facade ? facadeMat : letterMat));
    }
    group.scale.set(scale, scale, scale);
    group.position.set(sign.x, sign.y, sign.z);
    group.rotation.y = sign.yaw || 0;
    return group;
  } catch {
    return null;
  }
}

export function labelMeshes(signs) {
  if (!signs || !signs.length) return null;
  const root = new THREE.Group();
  for (let i = 0; i < signs.length; i++) {
    const mesh = solidSign(signs[i]);
    if (mesh) root.add(mesh);
  }
  return root;
}

function paintInstances(geo, material, count, place, tint) {
  if (!count) return null;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    place(i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (tint) {
      color.copy(tint(i));
      mesh.setColorAt(i, color);
    }
  }
  if (tint && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return commit(mesh);
}

function chairTint(floor) {
  const color = new THREE.Color();
  color.setHSL(((floor * 47) % 360) / 360, 0.46, 0.46);
  return color;
}

function spinFlat(yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

// 灭火器、圆桌、椅子、花瓶都是重复的小物体，各用一份实例，不给每层单独材质。
export function lobbyPropMeshes(extinguishers, tables, mats) {
  const root = new THREE.Group();
  const cans = extinguishers || [];
  const sets = tables || [];
  if (cans.length) {
    const aisle = (i) => (cans[i].x > 0 ? -1 : 1);
    const foot = (i) => cans[i].y + 0.046;
    root.add(paintInstances(new THREE.CylinderGeometry(0.078, 0.09, 0.04, 12), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.02, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.068, 0.074, 0.4, 14), mats.red, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.236, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.034, 0.068, 0.05, 12), mats.red, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.452, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.492, cans[i].z);
    }));
    root.add(paintInstances(new THREE.BoxGeometry(0.078, 0.016, 0.028), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.516, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 8), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x, foot(i) + 0.53, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x + aisle(i) * 0.096, foot(i) + 0.3, cans[i].z);
    }));
    root.add(paintInstances(new THREE.CylinderGeometry(0.01, 0.012, 0.05, 6), mats.metal, cans.length, (i) => {
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x + aisle(i) * 0.12, foot(i) + 0.2, cans[i].z);
    }));
    root.add(paintInstances(new THREE.BoxGeometry(0.01, 0.09, 0.055), mats.vase, cans.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(cans[i].x + aisle(i) * 0.08, foot(i) + 0.26, cans[i].z);
    }));
  }
  if (!sets.length) return root.children.length ? root : null;
  const chairs = sets.length * 2;
  const seatX = 1.32;
  const footOf = (table) => table.y + 0.046;
  const tintChair = (index) => chairTint(sets[Math.floor(index / 2)].floor || 0);
  root.add(paintInstances(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 20), mats.wood, sets.length, (i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(sets[i].x, footOf(sets[i]) + 0.84, sets[i].z);
  }));
  root.add(paintInstances(new THREE.CylinderGeometry(0.085, 0.11, 0.78, 10), mats.wood, sets.length, (i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(sets[i].x, footOf(sets[i]) + 0.42, sets[i].z);
  }));
  root.add(paintInstances(new THREE.BoxGeometry(0.66, 0.05, 0.64), mats.chair, chairs, (i) => {
    const table = sets[Math.floor(i / 2)];
    const side = i % 2 === 0 ? -1 : 1;
    const yaw = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(table.x + side * seatX, footOf(table) + 0.52, table.z);
  }, tintChair));
  root.add(paintInstances(new THREE.BoxGeometry(0.66, 0.68, 0.06), mats.chair, chairs, (i) => {
    const table = sets[Math.floor(i / 2)];
    const side = i % 2 === 0 ? -1 : 1;
    const yaw = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const back = spinFlat(yaw, 0, 0.32);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(table.x + side * seatX + back.x, footOf(table) + 0.8, table.z + back.z);
  }, tintChair));
  root.add(paintInstances(new THREE.BoxGeometry(0.05, 0.5, 0.05), mats.chair, chairs * 4, (i) => {
    const chair = Math.floor(i / 4);
    const table = sets[Math.floor(chair / 2)];
    const side = chair % 2 === 0 ? -1 : 1;
    const yaw = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const corner = i % 4;
    const lx = corner < 2 ? -0.25 : 0.25;
    const lz = corner % 2 === 0 ? -0.24 : 0.24;
    const leg = spinFlat(yaw, lx, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(table.x + side * seatX + leg.x, footOf(table) + 0.26, table.z + leg.z);
  }, (i) => tintChair(Math.floor(i / 4))));
  root.add(paintInstances(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 10), mats.vase, sets.length, (i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(sets[i].x, footOf(sets[i]) + 0.98, sets[i].z);
  }));
  const blooms = [
    { x: 0.06, y: 1.18, z: 0.02, s: 1.15 },
    { x: -0.06, y: 1.22, z: -0.02, s: 1.05 },
    { x: 0.02, y: 1.26, z: -0.06, s: 1 },
    { x: -0.02, y: 1.16, z: 0.07, s: 0.95 },
  ];
  for (let b = 0; b < blooms.length; b++) {
    const bloom = blooms[b];
    root.add(paintInstances(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), mats.stem, sets.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(sets[i].x + bloom.x, sets[i].y + bloom.y - 0.034, sets[i].z + bloom.z);
    }));
    root.add(paintInstances(new THREE.SphereGeometry(0.045, 8, 6), mats.flowers[b], sets.length, (i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(bloom.s, bloom.s, bloom.s);
      dummy.position.set(sets[i].x + bloom.x, sets[i].y + 0.046 + bloom.y, sets[i].z + bloom.z);
    }));
  }
  return root;
}

export function colliderLines(walls) {
  const pts = [];
  const y = 0.07;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    pts.push(
      w.minX, y, w.minZ, w.maxX, y, w.minZ,
      w.maxX, y, w.minZ, w.maxX, y, w.maxZ,
      w.maxX, y, w.maxZ, w.minX, y, w.maxZ,
      w.minX, y, w.maxZ, w.minX, y, w.minZ,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2456b0 }));
}

function paintBoxes(list, material) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
  const color = new THREE.Color();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.position.set(b.x, b.y, b.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (b.color != null) {
      color.setHex(b.color);
      mesh.setColorAt(i, color);
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return commit(mesh);
}

export function yardMeshes(items, trunkMat, leafMat, hedgeMat, benchMat) {
  if (!items || !items.length) return null;
  const trees = [];
  const hedges = [];
  const benches = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "tree") trees.push(item);
    else if (item.kind === "hedge") hedges.push(item);
    else benches.push(item);
  }
  const root = new THREE.Group();
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 2.65, 6), trunkMat, trees.length);
    const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1.22, 7, 5), leafMat, trees.length);
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(t.x, 1.34, t.z);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(1.12, 0.82, 1.12);
      dummy.position.set(t.x, 3.15, t.z);
      dummy.updateMatrix();
      crown.setMatrixAt(i, dummy.matrix);
    }
    root.add(commit(trunk), commit(crown));
  }
  if (hedges.length) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), hedgeMat, hedges.length);
    for (let i = 0; i < hedges.length; i++) {
      const h = hedges[i];
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(h.w, 0.4, h.d);
      dummy.position.set(h.x, 0.2, h.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    root.add(commit(mesh));
  }
  if (benches.length) {
    const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(2.56, 0.07, 0.46), benchMat, benches.length);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(2.56, 0.42, 0.06), benchMat, benches.length);
    const leg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.42, 0.46), benchMat, benches.length * 2);
    for (let i = 0; i < benches.length; i++) {
      const b = benches[i];
      const yaw = b.yaw || 0;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const put = (mesh, index, y, lx, lz) => {
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.position.set(b.x + lx * c + lz * s, y, b.z - lx * s + lz * c);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      };
      put(seat, i, 0.44, 0, 0.02);
      put(back, i, 0.66, 0, -0.2);
      put(leg, i * 2, 0.21, -1.12, 0.02);
      put(leg, i * 2 + 1, 0.21, 1.12, 0.02);
    }
    root.add(commit(seat), commit(back), commit(leg));
  }
  return root;
}

function flat(material, w, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = FLOOR_TILT;
  mesh.position.set(x, y, z);
  return mesh;
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function sheet(material, pts, y) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = FLOOR_TILT;
  mesh.position.y = y;
  return mesh;
}

function pushWindows(dark, lit, body, axis, face, seed) {
  const span = axis === "z" ? body.d : body.w;
  const floors = Math.max(2, Math.round(body.h / 3.15));
  const cols = Math.max(2, Math.min(5, Math.floor((span - 0.9) / 1.85)));
  const winW = Math.min(0.92, (span / cols) - 0.72);
  const pitch = (body.h - 1.15) / floors;
  const winH = Math.min(1.15, pitch - 0.55);
  if (winW < 0.42 || winH < 0.5) return;
  const awake = hash01(seed) > 0.2;
  for (let f = 0; f < floors; f++) {
    const y = body.y0 + 0.72 + (f + 0.5) * pitch;
    const floorOn = awake && hash01(seed + (f + 1) * 5.3) > 0.4;
    for (let c = 0; c < cols; c++) {
      const along = -span / 2 + (c + 0.5) * (span / cols);
      const on = floorOn && hash01(seed + f * 17 + c * 3.1) > 0.42;
      const pane = {
        x: axis === "z" ? body.x + face * (body.w / 2 + 0.045) : body.x + along,
        y,
        z: axis === "z" ? body.z + along : body.z + face * (body.d / 2 + 0.045),
        w: axis === "z" ? 0.045 : winW,
        h: winH,
        d: axis === "z" ? winW : 0.045,
      };
      (on ? lit : dark).push(pane);
    }
  }
}

function keepOut(x, z, w, d) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const hit = (ax0, ax1, az0, az1) => x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1;
  if (hit(-21, 21, -39, 7)) return true;
  return hit(PLAZA.minX - 1, PLAZA.maxX + 1, 3, PLAZA.maxZ + 1);
}

// 馆外全是盒子、锥和几片面。云每帧只改横坐标。
export function horizonMeshes(mats) {
  const root = new THREE.Group();
  root.add(flat(mats.grass, 780, 780, 0, -0.04, 0));
  root.add(sheet(mats.water, [
    [-12, 86], [-28, 108], [-24, 148], [-4, 178], [14, 170],
    [28, 142], [22, 110], [6, 84],
  ], 0.02));
  root.add(sheet(mats.water, [
    [-250, 214], [-168, 236], [-40, 222], [28, 258], [150, 228],
    [248, 252], [236, 338], [40, 312], [-80, 346], [-246, 318],
  ], 0.018));
  const z1 = PLAZA_PATH.z1;
  const crossZ = PLAZA_CROSS_Z;
  // 北端压进楼体外皮 2 厘米，盖住门口楼板的下沿，中间不留一条广场原色。圆心仍用原来的交点。
  const north = PLAZA.minZ - 0.02;
  const approach = flat(mats.path, 3.6, z1 - north, 0, 0.012, (north + z1) / 2);
  approach.name = "plaza-approach";
  root.add(approach);
  root.add(flat(mats.path, PLAZA.maxX - PLAZA.minX - 14, 3.6, 0, 0.012, crossZ));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 28), mats.disc);
  disc.rotation.x = FLOOR_TILT;
  disc.position.set(0, 0.016, crossZ);
  root.add(disc);

  const plaster = [0xc4553a, 0xd8c7a6, 0x7f8c9a, 0xc9844a, 0x6f7f72, 0xb08968, 0x4e6270, 0xe0d2b8, 0x7a5b78, 0xa33b32, 0x9aa58b, 0x5c6a78];
  const roofs = [0x6e3a32, 0x4a5560, 0x8a5a3a, 0x3e4a44, 0x705848, 0x5c5348];
  const rows = [
    { x: 30, z: -33, n: 3, axis: "z", gap: 12, w: 8.5, d: 9, h: 12, face: -1 },
    { x: -30, z: -33, n: 3, axis: "z", gap: 12, w: 8.5, d: 9, h: 12, face: 1 },
    { x: 52, z: 6, n: 4, axis: "z", gap: 12, w: 9, d: 8, h: 13, face: -1 },
    { x: -52, z: 6, n: 4, axis: "z", gap: 12, w: 9, d: 8, h: 13, face: 1 },
    { x: -37, z: 60, n: 6, axis: "x", gap: 15, w: 11, d: 9, h: 12, face: -1 },
    { x: -40, z: 90, n: 6, axis: "x", gap: 16, w: 12, d: 10, h: 18, face: -1 },
    { x: -36, z: -62, n: 5, axis: "x", gap: 16, w: 12, d: 10, h: 18, face: 1 },
    { x: -40, z: -96, n: 5, axis: "x", gap: 18, w: 13, d: 11, h: 24, face: 1 },
    { x: 96, z: -24, n: 4, axis: "z", gap: 20, w: 14, d: 12, h: 26, face: -1 },
    { x: -96, z: -24, n: 4, axis: "z", gap: 20, w: 14, d: 12, h: 26, face: 1 },
    { x: -52, z: 136, n: 5, axis: "x", gap: 24, w: 16, d: 14, h: 30, face: -1 },
    { x: -48, z: -140, n: 5, axis: "x", gap: 24, w: 16, d: 14, h: 32, face: 1 },
  ];
  const bodies = [];
  const caps = [];
  const peaksRoof = [];
  const darkWins = [];
  const litWins = [];
  const shadows = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let i = 0; i < row.n; i++) {
      const x = row.axis === "x" ? row.x + i * row.gap : row.x;
      const z = row.axis === "z" ? row.z + i * row.gap : row.z;
      const seed = r * 40 + i * 7 + 3;
      let w = row.w * (0.78 + hash01(seed) * 0.4);
      let d = row.d * (0.76 + hash01(seed + 1) * 0.42);
      let h = row.h * (0.55 + hash01(seed + 2) * 0.72);
      const style = Math.floor(hash01(seed + 3) * 5);
      if (style === 3) {
        w *= 0.58;
        d *= 0.58;
        h *= 1.42;
      } else if (style === 2) {
        h *= 0.7;
      }
      if (keepOut(x, z, w, d)) continue;
      if (z > PLAZA.maxZ && Math.abs(x) < 36) continue;
      const color = plaster[Math.floor(hash01(seed + 4) * plaster.length)];
      const roofColor = roofs[Math.floor(hash01(seed + 5) * roofs.length)];
      const mass = { x, z, w, d, h, y0: 0 };
      if (style === 1) {
        const lower = h * 0.58;
        const upperH = h * 0.42;
        bodies.push({ x, y: lower / 2 + 0.02, z, w, h: lower, d, color });
        bodies.push({
          x, y: lower + upperH / 2, z,
          w: w * 0.66, h: upperH, d: d * 0.66, color,
        });
        caps.push({ x, y: h + 0.16, z, w: w * 0.72, h: 0.28, d: d * 0.72, color: roofColor });
        pushWindows(darkWins, litWins, { x, z, w, d, h: lower, y0: 0 }, row.axis, row.face, seed + 11);
        pushWindows(darkWins, litWins, {
          x, z, w: w * 0.66, d: d * 0.66, h: upperH, y0: lower,
        }, row.axis, row.face, seed + 29);
      } else {
        bodies.push({ x, y: h / 2 + 0.02, z, w, h, d, color });
        if (style === 4) {
          const annexH = h * 0.46;
          const back = -row.face;
          const ax = row.axis === "z" ? x + back * w * 0.32 : x;
          const az = row.axis === "z" ? z : z + back * d * 0.32;
          bodies.push({
            x: ax, y: annexH / 2 + 0.02, z: az,
            w: w * 0.62, h: annexH, d: d * 0.62, color,
          });
        }
        if (style === 2) {
          const roofH = Math.min(3.6, Math.max(1.5, Math.min(w, d) * 0.42));
          peaksRoof.push({ x, y: h + roofH / 2, z, w, h: roofH, d, color: roofColor });
        } else {
          caps.push({ x, y: h + 0.18, z, w: w + 0.3, h: 0.32, d: d + 0.3, color: roofColor });
        }
        pushWindows(darkWins, litWins, mass, row.axis, row.face, seed + 11);
      }
      shadows.push({ x, z, rx: w * 0.52, rz: d * 0.52, h, y: 0.03 });
    }
  }
  const shell = paintBoxes(bodies, mats.plaster);
  const roof = paintBoxes(caps, mats.roof);
  const glass = paintBoxes(darkWins, mats.glass);
  const glowMesh = paintBoxes(litWins, mats.glow);
  if (shell) root.add(shell);
  if (roof) root.add(roof);
  if (glass) root.add(glass);
  if (glowMesh) root.add(glowMesh);
  if (peaksRoof.length) {
    const pitched = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), mats.roof, peaksRoof.length);
    const tint = new THREE.Color();
    for (let i = 0; i < peaksRoof.length; i++) {
      const cap = peaksRoof[i];
      dummy.rotation.set(0, Math.PI / 4, 0);
      dummy.scale.set(cap.w * 0.72, cap.h, cap.d * 0.72);
      dummy.position.set(cap.x, cap.y, cap.z);
      dummy.updateMatrix();
      pitched.setMatrixAt(i, dummy.matrix);
      tint.setHex(cap.color);
      pitched.setColorAt(i, tint);
    }
    pitched.instanceColor.needsUpdate = true;
    root.add(commit(pitched));
  }

  const peaks = [
    [0, 312, 58, 44, 0x8d8a82],
    [-108, 296, 42, 30, 0x7f8b78],
    [116, 288, 48, 34, 0x918c84],
    [-48, 152, 16, 9, 0x6f8a62],
    [56, 156, 14, 8, 0x7a946c],
    [-214, 36, 36, 22, 0x8a8e86],
    [224, 18, 40, 24, 0x80887c],
    [-156, -214, 48, 30, 0x8a887e],
    [148, -224, 44, 28, 0x7d8874],
    [0, -256, 56, 36, 0x918c84],
  ];
  const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), mats.hill, peaks.length);
  const color = new THREE.Color();
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(p[2], p[3], p[2]);
    dummy.position.set(p[0], p[3] / 2 - 2, p[1]);
    dummy.updateMatrix();
    hills.setMatrixAt(i, dummy.matrix);
    color.setHex(p[4]);
    hills.setColorAt(i, color);
  }
  hills.instanceColor.needsUpdate = true;
  root.add(commit(hills));

  const homes = [
    [-70, 64, 168, 62, 10, 26],
    [36, 58, 214, 74, 11, 30],
    [-16, 78, 126, 44, 8, 18],
    [150, 118, 40, 40, 8, 18],
    [-160, 128, 70, 36, 7, 16],
    [8, 108, 48, 48, 8, 20],
    [96, 136, 160, 42, 8, 18],
    [-46, 146, 210, 34, 7, 16],
  ];
  const clouds = [];
  const puff = new THREE.SphereGeometry(1, 7, 5);
  for (let i = 0; i < homes.length; i++) {
    const home = homes[i];
    const mesh = new THREE.Mesh(puff, mats.cloud);
    mesh.position.set(home[0], home[1], home[2]);
    mesh.scale.set(home[3], home[4], home[5]);
    clouds.push(mesh);
    root.add(mesh);
  }
  return {
    root,
    glow: mats.glow,
    shadows,
    drift(now) {
      const shift = now * 0.00035;
      for (let i = 0; i < clouds.length; i++) {
        const x = homes[i][0] + shift;
        clouds[i].position.x = ((x + 260) % 520) - 260;
      }
    },
  };
}
