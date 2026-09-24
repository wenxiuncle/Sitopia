import * as THREE from "../vendor/three.module.js";
import { SHADOW_IN, SHADOW_OUT } from "./day.js";
import { CEIL_TILT, FLOOR_TILT, FRAME, WALL_H } from "./layout.js";

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
    dummy.position.set((w.minX + w.maxX) / 2, h / 2, (w.minZ + w.maxZ) / 2);
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

export function plantMeshes(plants, potMat, leafMat) {
  const pots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 6), potMat, plants.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.62, 6), leafMat, plants.length);
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(p.s, p.s, p.s);
    dummy.position.set(p.x, 0.14 * p.s, p.z);
    dummy.updateMatrix();
    pots.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 0.59 * p.s, p.z);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  commit(pots);
  commit(leaves);
  return { pots, leaves };
}

export function lightConeMesh(cones, material) {
  if (!cones.length) return null;
  const coneH = 3.55;
  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.45, 5, 1, true), material, cones.length);
  for (let i = 0; i < cones.length; i++) {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.35, coneH / 2.45, 1.35);
    dummy.position.set(cones[i].x, WALL_H - 0.18 - coneH / 2, cones[i].z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  const done = commit(mesh);
  done.renderOrder = 2;
  return done;
}

export function floorDiscMesh(cones, material) {
  if (!cones.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1.15, 10), material, cones.length);
  for (let i = 0; i < cones.length; i++) {
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.scale.set(1.65, 1.65, 1.65);
    dummy.position.set(cones[i].x, 0.03, cones[i].z);
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

// 顶点前缀里已经声明了 normal，这里不再声明。
function patchSunShader(shader, shared, role) {
  shader.uniforms.uSunDir = shared.dir;
  shader.uniforms.uSunTint = shared.tint;
  shader.uniforms.uBlock = shared.block;
  shader.uniforms.uRoof = shared.roof;
  shader.uniforms.uShade = shared.shade;
  shader.uniforms.uFill = role.fill;
  shader.uniforms.uGain = role.gain;
  shader.uniforms.uCast = role.cast;
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
    float ndl = max(dot(normalize(vSunN), normalize(uSunDir)), 0.0);
    float shade = uFill + uGain * ndl;
    if (uCast > 0.5) {
      float t = uRoof / max(uSunDir.y, 0.05);
      vec2 q = vSunW.xz + uSunDir.xz * t;
      vec2 c = vec2(uBlock.x + uBlock.y, uBlock.z + uBlock.w) * 0.5;
      vec2 he = vec2(uBlock.y - uBlock.x, uBlock.w - uBlock.z) * 0.5;
      vec2 d = abs(q - c) - he;
      float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      float mask = 1.0 - smoothstep(${SHADOW_IN}, ${SHADOW_OUT}, dist);
      shade *= mix(1.0, uShade, mask);
    }
    outgoingLight *= uSunTint * shade;`,
  );
  if (fragment === shader.fragmentShader) throw new Error("阳光片元着色器没有对上");
  shader.fragmentShader = `uniform vec3 uSunDir;
uniform vec3 uSunTint;
uniform vec4 uBlock;
uniform float uRoof;
uniform float uShade;
uniform float uFill;
uniform float uGain;
uniform float uCast;
varying vec3 vSunN;
varying vec3 vSunW;
` + fragment;
}

export function attachSun(material, shared, role) {
  material.onBeforeCompile = (shader) => patchSunShader(shader, shared, role);
  material.customProgramCacheKey = () => "museum-sun-1";
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
  material.customProgramCacheKey = () => "museum-sun-frame-1";
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

export function placePlantShadows(mesh, plants, sunShift) {
  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    const shift = sunShift(plant);
    dummy.rotation.set(FLOOR_TILT, 0, 0);
    dummy.scale.set(plant.s, plant.s, plant.s);
    dummy.position.set(plant.x + shift[0], 0.036, plant.z + shift[1]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
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
