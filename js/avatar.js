import * as THREE from "../vendor/three.module.js";
import { FLOOR_TILT } from "./layout.js";

// 别人在第一人称里看到的方块人。样子对齐参考海报中间那个：
// 棕发盖住额头、浅色短袖、深色短裤、方头。正面是局部 -Z，鼻子标记在脸前。

const SKIN = "#f0c4a4";
const HAIR = "#6b4632";
const SHIRT = "#f4efe6";
const SHORTS = "#3a312b";
const SHOE = "#5c4032";
const EYE = "#1a1a1a";
const MOUTH = "#2b2420";

const BUBBLE_LIFE = 6000;

function sink() {
  return { pos: [], nor: [], col: [], idx: [], count: 0 };
}

function appendBox(dst, w, h, d, cx, cy, cz, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const index = geo.index;
  const tint = new THREE.Color(color);
  const base = dst.count;
  for (let i = 0; i < pos.count; i++) {
    dst.pos.push(pos.getX(i) + cx, pos.getY(i) + cy, pos.getZ(i) + cz);
    dst.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    dst.col.push(tint.r, tint.g, tint.b);
  }
  for (let i = 0; i < index.count; i++) dst.idx.push(index.getX(i) + base);
  dst.count += pos.count;
  geo.dispose();
}

function bake(dst) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(dst.pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(dst.nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(dst.col, 3));
  geo.setIndex(dst.idx);
  return geo;
}

function buildBody() {
  const dst = sink();
  appendBox(dst, 0.38, 0.28, 0.22, 0, 0.74, 0, SHORTS);
  appendBox(dst, 0.46, 0.4, 0.24, 0, 1.06, 0, SHIRT);
  appendBox(dst, 0.14, 0.08, 0.14, 0, 1.3, 0, SKIN);
  appendBox(dst, 0.44, 0.42, 0.42, 0, 1.54, 0, SKIN);
  appendBox(dst, 0.48, 0.12, 0.46, 0, 1.78, 0.03, HAIR);
  appendBox(dst, 0.46, 0.16, 0.12, 0, 1.68, -0.22, HAIR);
  appendBox(dst, 0.07, 0.095, 0.04, -0.1, 1.53, -0.24, EYE);
  appendBox(dst, 0.07, 0.095, 0.04, 0.1, 1.53, -0.24, EYE);
  appendBox(dst, 0.1, 0.03, 0.03, 0, 1.42, -0.24, MOUTH);
  return bake(dst);
}

function buildArm() {
  const dst = sink();
  appendBox(dst, 0.16, 0.16, 0.16, 0, -0.08, 0, SHIRT);
  appendBox(dst, 0.13, 0.28, 0.13, 0, -0.28, 0, SKIN);
  appendBox(dst, 0.14, 0.12, 0.13, 0, -0.46, 0, SKIN);
  return bake(dst);
}

function buildLeg() {
  const dst = sink();
  appendBox(dst, 0.16, 0.5, 0.16, 0, -0.26, 0, SKIN);
  appendBox(dst, 0.18, 0.1, 0.28, 0, -0.54, -0.04, SHOE);
  return bake(dst);
}

const BODY_GEO = buildBody();
const ARM_GEO = buildArm();
const LEG_GEO = buildLeg();
const SHADOW_GEO = new THREE.CircleGeometry(0.28, 16);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bubbleTexture(text) {
  const chars = Array.from(text);
  const lines = [];
  for (let i = 0; i < chars.length && lines.length < 3; i += 16) {
    lines.push(chars.slice(i, i + 16).join(""));
  }
  if (chars.length > 48) lines[2] = lines[2].slice(0, 15) + "…";
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "28px Microsoft YaHei, PingFang SC, sans-serif";
  let width = 48;
  for (let i = 0; i < lines.length; i++) {
    width = Math.max(width, Math.ceil(measure.measureText(lines[i]).width) + 36);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 28 + lines.length * 34 + 22;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255,252,248,0.96)";
  roundRect(ctx, 2, 2, width - 4, canvas.height - 22, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width / 2 - 8, canvas.height - 22);
  ctx.lineTo(width / 2, canvas.height - 4);
  ctx.lineTo(width / 2 + 8, canvas.height - 22);
  ctx.fill();
  ctx.fillStyle = "#2c2926";
  ctx.font = "28px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 18, 14 + i * 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, width, height: canvas.height };
}

export function createVisitor(material, shadowMaterial) {
  const group = new THREE.Group();
  group.name = "visitor";
  const body = new THREE.Mesh(BODY_GEO, material);
  const armL = new THREE.Group();
  armL.position.set(-0.32, 1.22, 0);
  armL.add(new THREE.Mesh(ARM_GEO, material));
  const armR = new THREE.Group();
  armR.position.set(0.32, 1.22, 0);
  armR.add(new THREE.Mesh(ARM_GEO, material));
  const legL = new THREE.Group();
  legL.position.set(-0.1, 0.61, 0);
  legL.add(new THREE.Mesh(LEG_GEO, material));
  const footL = new THREE.Object3D();
  footL.name = "footL";
  footL.position.set(0, -0.59, -0.04);
  legL.add(footL);
  const legR = new THREE.Group();
  legR.position.set(0.1, 0.61, 0);
  legR.add(new THREE.Mesh(LEG_GEO, material));
  const nose = new THREE.Object3D();
  nose.name = "nose";
  nose.position.set(0, 1.54, -0.36);
  group.add(body, armL, armR, legL, legR, nose);
  if (shadowMaterial) {
    const shadow = new THREE.Mesh(SHADOW_GEO, shadowMaterial);
    shadow.rotation.x = FLOOR_TILT;
    shadow.position.y = 0.035;
    group.add(shadow);
  }
  return { group, parts: { armL, armR, legL, legR } };
}

// amount 为 0 时站直。phase 在 π/2 且 amount 为 1 时，左脚迈向局部 -Z。
export function poseVisitor(parts, phase, amount) {
  const step = Math.sin(phase) * 0.65 * amount;
  parts.legL.rotation.x = step;
  parts.legR.rotation.x = -step;
  parts.armL.rotation.x = -step * 0.85;
  parts.armR.rotation.x = step * 0.85;
}

function dropBubble(row) {
  if (!row.bubble) return;
  row.visitor.group.remove(row.bubble);
  row.bubble.material.map.dispose();
  row.bubble.material.dispose();
  row.bubble = null;
}

export function createCrowd(scene, material, shadowMaterial) {
  const people = new Map();

  function ensure(person, snap) {
    let row = people.get(person.id);
    if (!row) {
      const visitor = createVisitor(material, shadowMaterial);
      scene.add(visitor.group);
      row = {
        id: person.id,
        name: person.name || "",
        visitor,
        x: person.x,
        z: person.z,
        yaw: person.yaw || 0,
        tx: person.x,
        tz: person.z,
        ty: person.yaw || 0,
        lx: person.x,
        lz: person.z,
        phase: Math.random() * Math.PI * 2,
        swing: 0,
        bubble: null,
        bubbleUntil: 0,
      };
      people.set(person.id, row);
      snap = true;
    }
    row.name = person.name || row.name;
    row.tx = person.x;
    row.tz = person.z;
    row.ty = person.yaw || 0;
    if (snap) {
      row.x = person.x;
      row.z = person.z;
      row.yaw = row.ty;
      row.lx = person.x;
      row.lz = person.z;
    }
    return row;
  }

  return {
    upsert(person, snap) {
      ensure(person, snap);
    },
    remove(id) {
      const row = people.get(id);
      if (!row) return;
      dropBubble(row);
      scene.remove(row.visitor.group);
      people.delete(id);
    },
    clear() {
      for (const id of Array.from(people.keys())) this.remove(id);
    },
    say(id, text, now) {
      const row = people.get(id);
      if (!row || !text) return;
      dropBubble(row);
      const drawn = bubbleTexture(text);
      const material = new THREE.SpriteMaterial({
        map: drawn.texture,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(material);
      const worldW = Math.min(1.7, drawn.width / 200);
      sprite.scale.set(worldW, worldW * drawn.height / drawn.width, 1);
      sprite.center.set(0.5, 0);
      sprite.position.set(0, 1.9, 0);
      sprite.renderOrder = 2;
      row.visitor.group.add(sprite);
      row.bubble = sprite;
      row.bubbleUntil = now + BUBBLE_LIFE;
    },
    update(dt, now) {
      const k = 1 - Math.exp(-dt * 12);
      for (const row of people.values()) {
        const beforeX = row.x;
        const beforeZ = row.z;
        row.x += (row.tx - row.x) * k;
        row.z += (row.tz - row.z) * k;
        const turn = Math.atan2(Math.sin(row.ty - row.yaw), Math.cos(row.ty - row.yaw));
        row.yaw += turn * k;
        const moving = Math.hypot(row.x - beforeX, row.z - beforeZ) > 0.0015;
        if (moving) row.phase += dt * 10;
        row.swing += ((moving ? 1 : 0) - row.swing) * (1 - Math.exp(-dt * 8));
        poseVisitor(row.visitor.parts, row.phase, row.swing);
        const idle = Math.sin(now * 0.002 + row.phase) * 0.01;
        row.visitor.group.position.set(row.x, idle, row.z);
        row.visitor.group.rotation.y = row.yaw;
        if (row.bubble && now > row.bubbleUntil) dropBubble(row);
      }
    },
    rename(id, name) {
      const row = people.get(id);
      if (!row || !name) return;
      row.name = name;
    },
    list() {
      const out = [];
      for (const row of people.values()) out.push({ id: row.id, name: row.name, x: row.x, z: row.z, yaw: row.yaw });
      return out;
    },
  };
}
