// 时辰只改这一张表。方位角 0 朝南（+Z，广场一侧），90 朝东。
// 地面阴影是屋顶投影，不用阴影贴图。边缘和 meshes.js 里的判断用同一对数字。
// 馆内不读这张表的太阳方向。天花灯在 floorLamps / lampAt，着色器和这里用同一组数字。

import { STAIR_LIGHT } from "./layout.js";

export const SHADOW_IN = -1.6;
export const SHADOW_OUT = 0.4;
// 南墙外皮再往外这一点仍算「楼前」，观景台根部和门口地面都在里面。
export const FRONT_SHADOW_SLACK = 0.05;

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
// 楼梯东南角的整高墙，在楼层线上下各滤开这一段，东墙才不会被切出一条亮边。
export const LAMP_STORY_BLEND = 1.35;
// 内角这一段里，朝向收到角平分线，南墙和东墙的亮度在棱上接上。
export const LAMP_CORNER_REACH = 1.15;
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

// 正面楼宽之内、南墙外皮以前：广场地面和观景台不再吃楼体落影。
export function inFrontOfHall(x, z, block, frontZ) {
  if (frontZ == null || !block) return false;
  return z > frontZ - FRONT_SHADOW_SLACK && x > block.minX && x < block.maxX;
}

// 与 meshes.js 同一公式：阳光射向楼体，碰到屋顶高度以前就算挡住。
export function groundShadow(x, z, sun, block, roofY, frontZ) {
  if (inFrontOfHall(x, z, block, frontZ)) return 0;
  const enter = rayEnter(x, z, sun.x, sun.z, block.minX, block.maxX, block.minZ, block.maxZ);
  if (enter == null) return 0;
  const yHit = sun.y * enter;
  const slack = ((yHit - roofY) / Math.max(sun.y, 0.05)) * Math.hypot(sun.x, sun.z);
  return 1 - smoothstep(SHADOW_IN, SHADOW_OUT, slack);
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

function stairWallHit(x, z) {
  const onSouth = Math.abs(z - STAIR_LIGHT.cornerZ) < STAIR_FACE && x > STAIR_LIGHT.minX && x < STAIR_LIGHT.maxX;
  const onEast = Math.abs(x - STAIR_LIGHT.cornerX) < STAIR_FACE && z > STAIR_LIGHT.minZ && z < STAIR_LIGHT.cornerZ + 0.08;
  return [onSouth, onEast];
}

// 东南内角的两面墙朝向差一个直角。棱上把法线收到角平分线，亮度才接得上。
// 贴角处一个点会同时落进两面墙的范围，朝向决定收哪一边。
function bendStairNormal(x, z, nx, ny, nz) {
  const hit = stairWallHit(x, z);
  let along = null;
  if (hit[0] && nz < -0.45) along = STAIR_LIGHT.cornerX - x;
  else if (hit[1] && nx < -0.45) along = STAIR_LIGHT.cornerZ - z;
  if (along == null) return [nx, ny, nz];
  const feather = 1 - smoothstep(0, LAMP_CORNER_REACH, along < 0 ? 0 : along);
  if (feather <= 0) return [nx, ny, nz];
  const share = Math.SQRT1_2;
  const mx = nx * (1 - feather) - share * feather;
  const my = ny * (1 - feather);
  const mz = nz * (1 - feather) - share * feather;
  const len = Math.hypot(mx, my, mz) || 1;
  return [mx / len, my / len, mz / len];
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
// 楼梯南墙和东墙立面同样吃天花射灯，不单留壁灯。
// 这两面墙穿过楼板。靠近楼层线时混进相邻一层的灯，东南棱上的法线再收向角平分线。
export function lampAt(rows, x, y, z, nx, ny, nz, story) {
  const floors = rows.length || 1;
  const nlen = Math.hypot(nx, ny, nz) || 1;
  nx /= nlen;
  ny /= nlen;
  nz /= nlen;
  const upright = Math.abs(ny) < 0.55;
  const hit = stairWallHit(x, z);
  const side = hit[0] || hit[1];
  const bent = bendStairNormal(x, z, nx, ny, nz);
  nx = bent[0];
  ny = bent[1];
  nz = bent[2];
  const yLift = y + 0.05;
  const u = yLift / story;
  let fy = Math.floor(u);
  if (fy < 0) fy = 0;
  if (fy > floors - 1) fy = floors - 1;
  const current = lampSum(rows[fy] || [], x, y, z, nx, ny, nz);
  let lamp = current;
  if (upright && side) {
    const frac = u - Math.floor(u);
    const band = LAMP_STORY_BLEND / story;
    const wNext = 0.5 * smoothstep(1 - band, 1, frac);
    const wPrev = 0.5 * (1 - smoothstep(0, band, frac));
    if (wNext > 0 && fy + 1 < floors) {
      const other = lampSum(rows[fy + 1] || [], x, y, z, nx, ny, nz);
      lamp = lamp * (1 - wNext) + other * wNext;
    } else if (wPrev > 0 && fy > 0) {
      const other = lampSum(rows[fy - 1] || [], x, y, z, nx, ny, nz);
      lamp = lamp * (1 - wPrev) + other * wPrev;
    }
  }
  return Math.min(LAMP_FILL + LAMP_GAIN * lamp, LAMP_CLAMP);
}

// sun 为空时影子落在物体正下方，给馆内天花灯用。室外沿太阳拉开。
export function dropShadowPose(item, sun) {
  if (!sun) {
    return { x: item.x, z: item.z, y: item.y, yaw: 0, across: item.rx, along: item.rz };
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
