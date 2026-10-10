// 时辰只改这一张表。方位角 0 朝南（+Z，广场一侧），90 朝东。
// 地面阴影是屋顶投影，不用阴影贴图。边缘和 meshes.js 里的判断用同一对数字。
// 馆内不读这张表的太阳方向。天花灯在 floorLamps / lampAt，着色器和这里用同一组数字。

import { STAIR_LIGHT, WALL_H } from "./layout.js";

// 实影贴着遮挡物的轮廓，再往外淡一截。偏进轮廓里面，墙根会留一条亮缝，影子就像错了位。
export const SHADOW_IN = -0.2;
export const SHADOW_OUT = 0.7;
// 南墙外皮再往外这一点仍算门口。只留这一小段不吃楼体落影，避免屋檐正下方变成一条死影。
// 再往外的广场跟太阳走，低角度的光会把楼影投到门前。
export const FRONT_SHADOW_SLACK = 0.05;
export const APRON_KEEP = 0.85;

export const LAMPS_PER_FLOOR = 13;
export const LAMP_FILL = 0.54;
export const LAMP_GAIN = 0.5;
export const LAMP_CLAMP = 1.12;
export const LAMP_WRAP = 0.62;
export const LAMP_BIAS = 0.38;
export const LAMP_ATTEN = 0.04;
// 射灯直射和余光略抬一档。吸顶灯不再往墙上挂。壁灯放大以后，直射和洗墙都收下来。
export const LAMP_DIRECT = 0.9;
export const LAMP_AMBI = 0.15;
export const LAMP_AMBI_FAR = 14;
export const LAMP_AMBI_NEAR = 0.25;
export const LAMP_CONE_IN = 0.02;
export const LAMP_CONE_OUT = 0.48;
// 贴图透明度同时当灯种：1 射灯，0.8 吸顶灯，0.6 壁灯。空位是 0。
export const LAMP_SPOT = 1;
export const LAMP_LED = 0.8;
export const LAMP_SCONCE = 0.6;
export const LAMP_LED_DIRECT = 0.32;
export const LAMP_LED_CONE = 0.22;
export const LAMP_LED_WASH = 0.18;
export const LAMP_SCONCE_DIRECT = 0.28;
export const LAMP_SCONCE_WASH = 0.74;
export const LAMP_WASH_IN = 0.22;
export const LAMP_WASH_OUT = 0.92;
// 楼梯孔侧壁穿过楼层线。这一层的灯和上一层的灯按高度相接，线两侧才是同一亮度。
// 东南棱不把两面墙收成同一条法线。各用自己的朝向，拐角才是一边亮、一边暗。
// 较低的朝下表面靠近井边时，法线收到和竖面相同的朝向，亮度才接得上；再远仍回到大厅天花。
// 贴着天花的天棚底不收这刀。井边再收，底面会被切出一圈暗沟。
// 洞里朝下的踏步底、扶手底不走这条，否则上跑靠近天花时会被抬亮。
export const LAMP_SOFFIT_FADE = 0.72;
// 天花底在 WALL_H 往下 6 厘米。比这再低过这一截，才算扶手底一类，沿井边收灯。
export const LAMP_SOFFIT_KEEP = 0.35;
// 楼梯口以西的南墙、以北的东墙贴在天棚下面。上下层的灯若在井口齐边切断，天棚下会留下一道竖的阳阴线，
// 靠外那截只剩填充光，越靠近天花越暗。先沿用井口的灯，南墙往西、东墙往北用同一对距离淡出。
export const LAMP_SOUTH_HOLD = 4.6;
export const LAMP_SOUTH_SPILL = 2.4;
const STAIR_FACE = 0.2;
export const LAMP_PACK_XZ = 48;
export const LAMP_PACK_Y = 120;

export function packLamp(x, y, z) {
  return [(x + LAMP_PACK_XZ) / (LAMP_PACK_XZ * 2), y / LAMP_PACK_Y, (z + LAMP_PACK_XZ) / (LAMP_PACK_XZ * 2)];
}

export const DAYS = [
  {
    id: "dawn",
    name: "清晨",
    az: 78,
    el: 14,
    zenith: 0x8eabcf,
    horizon: 0xf2c3a4,
    tint: 0xffe2d0,
    fillGround: 0.76,
    gainGround: 0.32,
    fillOpen: 0.5,
    gainOpen: 0.68,
    fillRoom: 0.72,
    gainRoom: 0.38,
    fillGlass: 0.9,
    gainGlass: 0.12,
    shade: 0.36,
    sun: 0xffc896,
    disc: 16,
    cone: 0xffe3c6,
    coneOpacity: 0.12,
    pool: 0xffedd4,
    poolOpacity: 0.4,
    streak: 0xffe0c0,
    streakGain: 1,
    blob: 0.46,
  },
  {
    id: "morning",
    name: "上午",
    az: 46,
    el: 38,
    zenith: 0x8eb4dc,
    horizon: 0xf3e0cc,
    tint: 0xfff0e2,
    fillGround: 0.82,
    gainGround: 0.22,
    fillOpen: 0.56,
    gainOpen: 0.6,
    fillRoom: 0.8,
    gainRoom: 0.3,
    fillGlass: 0.92,
    gainGlass: 0.1,
    shade: 0.4,
    sun: 0xffe0b0,
    disc: 12,
    cone: 0xfff1dc,
    coneOpacity: 0.1,
    pool: 0xfff3e4,
    poolOpacity: 0.42,
    streak: 0xfff0dc,
    streakGain: 1,
    blob: 0.4,
  },
  {
    id: "noon",
    name: "正午",
    az: 12,
    el: 62,
    zenith: 0x74b0e4,
    horizon: 0xc5e2f2,
    tint: 0xfff8f3,
    fillGround: 0.86,
    gainGround: 0.16,
    fillOpen: 0.64,
    gainOpen: 0.52,
    fillRoom: 0.86,
    gainRoom: 0.22,
    fillGlass: 0.94,
    gainGlass: 0.08,
    shade: 0.42,
    sun: 0xfff6d8,
    disc: 10,
    cone: 0xfff1dc,
    coneOpacity: 0.1,
    pool: 0xfff3e4,
    poolOpacity: 0.42,
    streak: 0xfff6ea,
    streakGain: 0.85,
    blob: 0.36,
  },
  {
    id: "afternoon",
    name: "午后",
    az: 300,
    el: 34,
    zenith: 0x86aed4,
    horizon: 0xf6d2b2,
    tint: 0xffe6cf,
    fillGround: 0.8,
    gainGround: 0.24,
    fillOpen: 0.52,
    gainOpen: 0.64,
    fillRoom: 0.78,
    gainRoom: 0.32,
    fillGlass: 0.9,
    gainGlass: 0.1,
    shade: 0.38,
    sun: 0xffcc96,
    disc: 13,
    cone: 0xffe7c8,
    coneOpacity: 0.12,
    pool: 0xffefd8,
    poolOpacity: 0.46,
    streak: 0xffe4c4,
    streakGain: 1,
    blob: 0.42,
  },
  {
    id: "dusk",
    name: "黄昏",
    az: 248,
    el: 11,
    zenith: 0x6678a4,
    horizon: 0xe98a62,
    tint: 0xffc2a4,
    fillGround: 0.55,
    gainGround: 0.38,
    fillOpen: 0.4,
    gainOpen: 0.72,
    fillRoom: 0.58,
    gainRoom: 0.34,
    fillGlass: 0.72,
    gainGlass: 0.16,
    shade: 0.3,
    sun: 0xff9a62,
    disc: 18,
    cone: 0xffd2a4,
    coneOpacity: 0.18,
    pool: 0xffd8b0,
    poolOpacity: 0.52,
    streak: 0xffc49a,
    streakGain: 0.9,
    blob: 0.52,
  },
  {
    id: "night",
    name: "夜晚",
    az: 170,
    el: 62,
    zenith: 0x0c1828,
    horizon: 0x1a3148,
    tint: 0xc5d4ea,
    fillGround: 0.46,
    gainGround: 0.08,
    fillOpen: 0.32,
    gainOpen: 0.2,
    fillRoom: 0.8,
    gainRoom: 0.3,
    fillGlass: 0.92,
    gainGlass: 0.1,
    shade: 0.5,
    sun: 0xe4eef8,
    disc: 6,
    cone: 0xe4eef8,
    coneOpacity: 0.1,
    pool: 0xeef4fb,
    poolOpacity: 0.42,
    streak: 0xd5e2f4,
    streakGain: 0,
    blob: 0.34,
  },
];

export function findDay(key) {
  if (!key) return DAYS[2];
  for (let i = 0; i < DAYS.length; i++) {
    if (DAYS[i].id === key || DAYS[i].name === key) return DAYS[i];
  }
  return DAYS[2];
}

export function dayIndex(key) {
  return DAYS.indexOf(findDay(key));
}

export function sunVector(day) {
  const az = (day.az * Math.PI) / 180;
  const el = (day.el * Math.PI) / 180;
  const flat = Math.cos(el);
  const x = Math.sin(az) * flat;
  const y = Math.sin(el);
  const z = Math.cos(az) * flat;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function rayEnter(x, z, dx, dz, minX, maxX, minZ, maxZ) {
  let t0 = 0;
  let t1 = 1e9;
  if (Math.abs(dx) < 1e-6) {
    if (x < minX || x > maxX) return null;
  } else {
    let a = (minX - x) / dx;
    let b = (maxX - x) / dx;
    if (a > b) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  }
  if (Math.abs(dz) < 1e-6) {
    if (z < minZ || z > maxZ) return null;
  } else {
    let a = (minZ - z) / dz;
    let b = (maxZ - z) / dz;
    if (a > b) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  }
  if (t0 > t1 || t1 < 0) return null;
  return t0 > 0 ? t0 : 0;
}

function underHall(x, z, block) {
  return x > block.minX && x < block.maxX && z > block.minZ && z < block.maxZ;
}

// 屋檐盖住的那一圈，以及门口这一小段，不铺楼体落影。再外面的地面按光线是否碰到楼体来定。
function apronLit(x, z, block, frontZ) {
  if (frontZ == null || !block) return false;
  return z > frontZ - FRONT_SHADOW_SLACK && z < frontZ + APRON_KEEP && x > block.minX && x < block.maxX;
}

function slabMask(x, z, sun, slab) {
  if (!slab || !(slab.y > 1)) return 0;
  const t = slab.y / Math.max(sun.y, 0.05);
  const hx = x + sun.x * t;
  const hz = z + sun.z * t;
  const ix = Math.min(hx - slab.minX, slab.maxX - hx);
  const iz = Math.min(hz - slab.minZ, slab.maxZ - hz);
  const slack = -Math.min(ix, iz);
  return 1 - smoothstep(SHADOW_IN, SHADOW_OUT, slack);
}

// 与 meshes.js 同一公式。block 是外墙实体，高度用女儿墙顶。
// slab 是薄屋檐，只在光线真正穿到那一层时才补一圈，不把挑檐当成落到地面的实心柱。
export function groundShadow(x, z, sun, block, roofY, frontZ, slab) {
  if (!sun || !block) return 0;
  if (underHall(x, z, block) || apronLit(x, z, block, frontZ)) return 0;
  let mask = 0;
  const enter = rayEnter(x, z, sun.x, sun.z, block.minX, block.maxX, block.minZ, block.maxZ);
  if (enter != null) {
    const yHit = sun.y * enter;
    const slack = ((yHit - roofY) / Math.max(sun.y, 0.05)) * Math.hypot(sun.x, sun.z);
    mask = 1 - smoothstep(SHADOW_IN, SHADOW_OUT, slack);
  }
  const extra = slabMask(x, z, sun, slab);
  return extra > mask ? extra : mask;
}

// 阳光从点上射下来，落在 y = 0 的地面。返回 [x, z]。
export function projectShadowXZ(x, y, z, sun) {
  const t = y / Math.max(sun.y, 0.08);
  return [x - sun.x * t, z - sun.z * t];
}

function hullCross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// xz 平面上逆时针（x 向右、z 增大）。从 +Y 看这是顺时针，铺的时候要反绕，面才朝上。
export function shadowHull(points) {
  const src = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    src.push(p);
  }
  if (src.length < 3) return [];
  src.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const p = src[i];
    const q = uniq[uniq.length - 1];
    if (Math.abs(p[0] - q[0]) > 1e-5 || Math.abs(p[1] - q[1]) > 1e-5) uniq.push(p);
  }
  if (uniq.length < 3) return [];
  const lower = [];
  for (let i = 0; i < uniq.length; i++) {
    const p = uniq[i];
    while (lower.length >= 2 && hullCross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && hullCross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : [];
}

function pushProjected(out, x, y, z, sun) {
  out.push(projectShadowXZ(x, y, z, sun));
}

// 椭球沿太阳投到地面，是一圈椭圆。采样顺序交给凸包，树冠用这个。
export function castEllipsoid(cx, cy, cz, rx, ry, rz, sun, steps) {
  const sy = Math.max(sun.y, 0.08);
  const ix = sun.x / rx;
  const iy = sun.y / ry;
  const iz = sun.z / rz;
  const il = Math.hypot(ix, iy, iz) || 1;
  const nx = ix / il;
  const ny = iy / il;
  const nz = iz / il;
  let hx = 0;
  let hy = 1;
  let hz = 0;
  if (Math.abs(ny) > 0.85) {
    hx = 1;
    hy = 0;
  }
  let e1x = ny * hz - nz * hy;
  let e1y = nz * hx - nx * hz;
  let e1z = nx * hy - ny * hx;
  const e1l = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= e1l;
  e1y /= e1l;
  e1z /= e1l;
  const e2x = ny * e1z - nz * e1y;
  const e2y = nz * e1x - nx * e1z;
  const e2z = nx * e1y - ny * e1x;
  const tC = cy / sy;
  const gx = cx - sun.x * tC;
  const gz = cz - sun.z * tC;
  const n = steps || 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const wx = rx * (e1x * ct + e2x * st);
    const wy = ry * (e1y * ct + e2y * st);
    const wz = rz * (e1z * ct + e2z * st);
    const ty = wy / sy;
    pts.push([gx + wx - sun.x * ty, gz + wz - sun.z * ty]);
  }
  return shadowHull(pts);
}

export function castCylinder(cx, z, y0, y1, r0, r1, sun, steps) {
  const n = steps || 6;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pushProjected(pts, cx + c * r0, y0, z + s * r0, sun);
    pushProjected(pts, cx + c * r1, y1, z + s * r1, sun);
  }
  return shadowHull(pts);
}

export function castBox(cx, cy, cz, hx, hy, hz, yaw, sun) {
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  const pts = [];
  const lx = [-hx, hx];
  const ly = [-hy, hy];
  const lz = [-hz, hz];
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const x = lx[ix];
        const z = lz[iz];
        pushProjected(pts, cx + x * c + z * s, cy + ly[iy], cz - x * s + z * c, sun);
      }
    }
  }
  return shadowHull(pts);
}

function rawFloor(x, y, z, sun) {
  const t = y / Math.max(sun.y, 0.05);
  return [x - sun.x * t, z - sun.z * t];
}

function inRoom(x, z, limits) {
  const slack = 0.28;
  return x >= limits.minX - slack && x <= limits.maxX + slack && z >= limits.minZ - slack && z <= limits.maxZ + slack;
}

// 南墙两端在室内是实墙。光斑若被夹到墙角，看起来就像从墙缝里漏进来。
function pinnedCorner(pts, limits) {
  for (let i = 0; i < pts.length; i++) {
    const south = pts[i][1] > limits.maxZ - 0.45;
    const west = pts[i][0] < limits.minX + 0.45;
    const east = pts[i][0] > limits.maxX - 0.45;
    if (south && (west || east)) return true;
  }
  return false;
}

// 高窗投到地上往往只剩一条。又长又薄的亮带看起来像地缝漏光。
function paperSliver(pts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0];
    const z = pts[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const w = maxX - minX;
  const d = maxZ - minZ;
  return Math.min(w, d) < 0.7 && Math.max(w, d) > 2.5;
}

function collapsed(pts) {
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 0.08) return true;
    }
  }
  return false;
}

function throwOnFloor(x, y, z, sun, limits) {
  let t = y / Math.max(sun.y, 0.05);
  const dx = -sun.x;
  const dz = -sun.z;
  if (dx > 1e-4) t = Math.min(t, (limits.maxX - x) / dx);
  else if (dx < -1e-4) t = Math.min(t, (limits.minX - x) / dx);
  if (dz > 1e-4) t = Math.min(t, (limits.maxZ - z) / dz);
  else if (dz < -1e-4) t = Math.min(t, (limits.minZ - z) / dz);
  if (!(t > 0)) t = 0;
  const hx = Math.min(limits.maxX, Math.max(limits.minX, x + dx * t));
  const hz = Math.min(limits.maxZ, Math.max(limits.minZ, z + dz * t));
  return [hx, hz];
}

export function openingQuads(openings, sun, limits, gain) {
  const out = new Array(openings.length);
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i];
    // 大门下沿贴着地面。投进来会在门槛里侧压出一条亮边，看起来像地缝漏光。
    if (opening.minY < 0.05 && opening.nz > 0 && opening.maxX < 3 && opening.minX > -3) {
      out[i] = null;
      continue;
    }
    const face = opening.nx * sun.x + opening.nz * sun.z;
    if (face < 0.06) {
      out[i] = null;
      continue;
    }
    const near = Math.min(0.38, face * 0.72) * gain;
    const corners = [
      [opening.minX, opening.minY, opening.minZ],
      [opening.maxX, opening.minY, opening.maxZ],
      [opening.maxX, opening.maxY, opening.maxZ],
      [opening.minX, opening.maxY, opening.minZ],
    ];
    const pts = [];
    let spill = false;
    for (let k = 0; k < 4; k++) {
      const raw = rawFloor(corners[k][0], corners[k][1], corners[k][2], sun);
      if (!inRoom(raw[0], raw[1], limits)) spill = true;
      pts.push(throwOnFloor(corners[k][0], corners[k][1], corners[k][2], sun, limits));
    }
    if (spill && opening.minX < -16 && opening.nz > 0) {
      out[i] = null;
      continue;
    }
    if (pinnedCorner(pts, limits) || collapsed(pts) || paperSliver(pts)) {
      out[i] = null;
      continue;
    }
    out[i] = { pts, near, far: near * 0.22 };
  }
  return out;
}

// 夜里室内的光从一楼大门和电梯后窗落到室外地面。近边亮，远处淡掉。
export function nightSpillQuads(openings, dress) {
  let door = null;
  for (let i = 0; i < openings.length; i++) {
    const opening = openings[i];
    if (opening.nz > 0 && opening.minY < 0.05 && opening.maxX < 3 && opening.minX > -3) door = opening;
  }
  let win = null;
  for (let i = 0; i < dress.length; i++) {
    const item = dress[i];
    if (item.kind === "glass" && item.minX < -18 && item.minY < 0.2 && item.maxY > 2) {
      win = item;
      break;
    }
  }
  const quads = [null, null];
  if (door) {
    const nearZ = 4.52;
    const farZ = 11.4;
    quads[0] = {
      pts: [
        [door.minX, nearZ],
        [door.maxX, nearZ],
        [door.maxX + 1.15, farZ],
        [door.minX - 1.15, farZ],
      ],
      near: 0.7,
      far: 0,
    };
  }
  if (win) {
    const nearX = win.minX - 0.45;
    const farX = nearX - 6.4;
    quads[1] = {
      pts: [
        [nearX, win.minZ],
        [nearX, win.maxZ],
        [farX, win.maxZ + 0.8],
        [farX, win.minZ - 0.8],
      ],
      near: 0.62,
      far: 0,
    };
  }
  return quads;
}

export function plantShadowShift(sun, height) {
  const scale = Math.min(2.4, height / Math.max(sun.y, 0.18));
  return [-sun.x * scale, -sun.z * scale];
}

// 每层一行。射灯的高度用 apexLift。吸顶灯和壁灯自带 lift，灯心不在天花射灯那一档。
// 灯心跨过楼层线时归到灯心所在的那一层，升进楼梯井的壁灯才照得到旁边的地面。
export function floorLamps(cones, story, apexLift) {
  const rows = [];
  for (let i = 0; i < cones.length; i++) {
    const item = cones[i];
    const base = item.y || 0;
    const y = base + (item.lift != null ? item.lift : apexLift);
    const floor = Math.max(0, Math.floor((y + 1e-4) / story));
    if (!rows[floor]) rows[floor] = [];
    const kind = item.role === "led" ? LAMP_LED : item.role === "sconce" ? LAMP_SCONCE : (item.kind || LAMP_SPOT);
    rows[floor].push({
      x: item.x,
      y,
      z: item.z,
      kind,
    });
  }
  return rows;
}

function nearSeg(x, z, x0, z0, x1, z1, reach) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - x0) * dx + (z - z0) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = x - (x0 + dx * t);
  const ez = z - (z0 + dz * t);
  return ex * ex + ez * ez < reach * reach;
}

// 南墙在楼梯口以西继续吃井里的灯。井口处权重是 1，和井内相接；再往西先保持，临近大门才淡掉。
function southWallWeight(x, z) {
  if (Math.abs(z - STAIR_LIGHT.cornerZ) >= STAIR_FACE || x >= STAIR_LIGHT.maxX) return 0;
  const west = STAIR_LIGHT.minX - x;
  if (west <= LAMP_SOUTH_HOLD) return 1;
  const fade = LAMP_SOUTH_HOLD + LAMP_SOUTH_SPILL;
  if (west >= fade) return 0;
  return 1 - smoothstep(LAMP_SOUTH_HOLD, fade, west);
}

// 东墙在楼梯口以北继续吃井里的灯。井口处权重是 1，和井内相接；再往北先保持，然后淡掉。
function eastWallWeight(x, z) {
  if (Math.abs(x - STAIR_LIGHT.cornerX) >= STAIR_FACE || z >= STAIR_LIGHT.cornerZ + 0.08) return 0;
  const north = STAIR_LIGHT.minZ - z;
  if (north <= LAMP_SOUTH_HOLD) return 1;
  const fade = LAMP_SOUTH_HOLD + LAMP_SOUTH_SPILL;
  if (north >= fade) return 0;
  return 1 - smoothstep(LAMP_SOUTH_HOLD, fade, north);
}

// 井口露出来的天棚边和楼板侧面。上下两截叠在同一条边上，楼层线从这里切过。
// 法线指向洞内，和挤出板孔边的侧面一致。
function stairRimInfo(x, z) {
  const S = STAIR_LIGHT;
  const segs = [
    [S.lipX0, S.lipZ, S.lipX1, S.lipZ, 0, 1],
    [S.runX, S.runZ0, S.runX, S.runZ1, 1, 0],
    [S.endX0, S.endZ, S.endX1, S.endZ, 0, 1],
    [S.westX, S.westZ0, S.westX, S.westZ1, 1, 0],
  ];
  let best = 1e9;
  let nx = 0;
  let nz = 1;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - s[0]) * dx + (z - s[1]) * dz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const ex = x - (s[0] + dx * t);
    const ez = z - (s[1] + dz * t);
    const d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      nx = s[4];
      nz = s[5];
    }
  }
  return [Math.sqrt(best), nx, nz];
}

function stairRimHit(x, z) {
  return stairRimInfo(x, z)[0] < STAIR_LIGHT.rim;
}

function inStairVoid(x, z) {
  const S = STAIR_LIGHT;
  const west = x > S.holeX0 && x < S.holeX1 && z > S.holeLip && z < S.holeSouth;
  const east = x >= S.holeX1 && x < S.holeEast && z > S.holeNorth && z < S.holeSouth;
  return west || east;
}

function lampSum(list, x, y, z, nx, ny, nz) {
  let lamp = 0;
  const count = Math.min(list.length, LAMPS_PER_FLOOR);
  for (let i = 0; i < count; i++) {
    const L = list[i];
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = L.z - z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(dist2) || 1e-3;
    const lx = dx / dist;
    const ly = dy / dist;
    const lz = dz / dist;
    const nd = nx * lx + ny * ly + nz * lz;
    const wrap = Math.min(1, Math.max(0, nd * LAMP_WRAP + LAMP_BIAS));
    const aim = Math.max(ly, 0);
    const down = smoothstep(LAMP_CONE_IN, LAMP_CONE_OUT, aim);
    const atten = 1 / (1 + dist2 * LAMP_ATTEN);
    const ambi = smoothstep(LAMP_AMBI_FAR, LAMP_AMBI_NEAR, dist) * LAMP_AMBI;
    const kind = L.kind == null ? LAMP_SPOT : L.kind;
    let add = wrap * down * atten * LAMP_DIRECT;
    if (kind < 0.9) {
      const face = smoothstep(LAMP_WASH_IN, LAMP_WASH_OUT, wrap);
      if (kind > 0.7) {
        const wide = smoothstep(LAMP_CONE_IN, LAMP_LED_CONE, aim);
        add = wrap * wide * atten * LAMP_LED_DIRECT + face * atten * LAMP_LED_WASH;
      } else {
        add = wrap * down * atten * LAMP_SCONCE_DIRECT + face * atten * LAMP_SCONCE_WASH;
      }
    }
    lamp += add + ambi;
  }
  return lamp;
}

// 馆内亮度。只看这一层天花上的灯，不读太阳。和 meshes.js 的片元循环同一组常数。
// 楼梯南墙、东墙和井口侧面同样吃天花射灯，不单留壁灯。
// 东南两面墙各留自己的法线。朝灯的那面亮，侧过去的那面暗，分界就在棱上。
// 贴着天花的天棚底保持朝下，井边不再收暗。再低的朝下表面才在井边改朝向洞内。洞里的踏步底保持朝下。
// 孔壁和东南墙穿过楼层线。从本层的灯缓到上一层，线的两侧才不会切出一道横的阳阴线。
// 南墙往西、东墙往北同一套权重，天棚下面不再齐边切暗。
export function lampAt(rows, x, y, z, nx, ny, nz, story) {
  const floors = rows.length || 1;
  const nlen = Math.hypot(nx, ny, nz) || 1;
  nx /= nlen;
  ny /= nlen;
  nz /= nlen;
  const faceDown = ny < -0.45;
  const voided = faceDown && inStairVoid(x, z);
  const y0 = y > 0 ? y : 0;
  const storyY = y0 - Math.floor(y0 / story) * story;
  const highSoffit = faceDown && !voided && storyY > WALL_H - LAMP_SOFFIT_KEEP;
  if (faceDown && !voided && !highSoffit) {
    const rim = stairRimInfo(x, z);
    const near = 1 - smoothstep(0.04, LAMP_SOFFIT_FADE, rim[0]);
    if (near > 0) {
      nx = nx * (1 - near) + rim[1] * near;
      ny = ny * (1 - near);
      nz = nz * (1 - near) + rim[2] * near;
      const rlen = Math.hypot(nx, ny, nz) || 1;
      nx /= rlen;
      ny /= rlen;
      nz /= rlen;
    }
  }
  const upright = Math.abs(ny) < 0.55;
  const sideW = Math.max(southWallWeight(x, z), eastWallWeight(x, z), stairRimHit(x, z) ? 1 : 0);
  const side = !voided && upright && sideW > 0;
  const yLift = y + 0.05;
  const u = yLift / story;
  let fy = Math.floor(u);
  const frac = u - fy;
  if (fy < 0) fy = 0;
  if (fy > floors - 1) fy = floors - 1;
  const current = lampSum(rows[fy] || [], x, y, z, nx, ny, nz);
  let lamp = current;
  if (side && fy + 1 < floors && frac > 0 && frac < 1) {
    const w = frac * frac * (3 - 2 * frac) * sideW;
    const upper = lampSum(rows[fy + 1] || [], x, y, z, nx, ny, nz);
    lamp = current * (1 - w) + upper * w;
  }
  return Math.min(LAMP_FILL + LAMP_GAIN * lamp, LAMP_CLAMP);
}

// 软边贴图在这个半径以内是实影，外面才淡掉。网格按它放大，实影才刚好转到物体的投影边上。
export const CAST_EDGE = 0.72;
// 远处楼的影子太长会铺满整片广场。树、篱和长椅按真实高度投，不设这道上限。
const HALL_CAST_MAX = 18;

function sunFlat(sun) {
  const sy = Math.max(sun.y, 0.16);
  const horiz = Math.hypot(sun.x, sun.z) || 1e-4;
  return { sy, ux: sun.x / horiz, uz: sun.z / horiz, horiz };
}

// 树冠、矮篱、长椅和远处楼体：沿太阳把体积投到地面。影子和主楼同一方向，低太阳拉得更长。
function projectCastShadow(item, sun) {
  const flat = sunFlat(sun);
  const rim = 1 / CAST_EDGE;
  let shift = 0;
  let across = item.rx;
  let along = item.rz;
  if (item.kind === "tree") {
    const reach = item.h * flat.horiz / flat.sy;
    const tip = reach + item.rx / flat.sy;
    shift = tip * 0.5;
    along = tip * 0.5;
    across = item.rx;
  } else {
    let cast = item.h * flat.horiz / flat.sy;
    if (item.kind === "hall") cast = Math.min(cast, HALL_CAST_MAX);
    const alongBase = item.rx * Math.abs(flat.ux) + item.rz * Math.abs(flat.uz);
    const acrossBase = item.rx * Math.abs(flat.uz) + item.rz * Math.abs(flat.ux);
    shift = cast * 0.5;
    along = alongBase + cast * 0.5;
    across = Math.max(acrossBase, 0.12);
  }
  return {
    x: item.x - flat.ux * shift,
    z: item.z - flat.uz * shift,
    y: item.y,
    yaw: Math.atan2(flat.ux, flat.uz),
    across: across * rim,
    along: along * rim,
  };
}

// sun 为空时影子落在物体正下方，给馆内天花灯用。室外沿太阳拉开。
export function dropShadowPose(item, sun) {
  if (!sun) {
    return { x: item.x, z: item.z, y: item.y, yaw: 0, across: item.rx, along: item.rz };
  }
  if (item.kind === "tree" || item.kind === "hedge" || item.kind === "bench" || item.kind === "hall") {
    return projectCastShadow(item, sun);
  }
  const lift = Math.max(sun.y, 0.18);
  const shift = Math.min(item.h * 0.9, (item.h * 0.48) / lift);
  const stretch = Math.min(1.45, 0.32 / lift);
  return {
    x: item.x - sun.x * shift,
    z: item.z - sun.z * shift,
    y: item.y,
    yaw: Math.atan2(sun.x, sun.z),
    across: item.rx,
    along: item.rz * (1 + stretch),
  };
}
