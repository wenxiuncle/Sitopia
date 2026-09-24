// 时辰只改这一张表。方位角 0 朝南（+Z，广场一侧），90 朝东。
// 地面阴影是屋顶投影，不用阴影贴图。边缘和 meshes.js 里的判断用同一对数字。

export const SHADOW_IN = -1.6;
export const SHADOW_OUT = 0.4;

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
    fillOpen: 0.58,
    gainOpen: 0.55,
    fillRoom: 0.72,
    gainRoom: 0.38,
    fillGlass: 0.9,
    gainGlass: 0.12,
    shade: 0.5,
    sun: 0xffc896,
    disc: 16,
    cone: 0xffe3c6,
    coneOpacity: 0.12,
    pool: 0xffedd4,
    poolOpacity: 0.4,
    streak: 0xffe0c0,
    streakGain: 1,
    blob: 0.3,
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
    fillOpen: 0.66,
    gainOpen: 0.48,
    fillRoom: 0.8,
    gainRoom: 0.3,
    fillGlass: 0.92,
    gainGlass: 0.1,
    shade: 0.58,
    sun: 0xffe0b0,
    disc: 12,
    cone: 0xfff1dc,
    coneOpacity: 0.1,
    pool: 0xfff3e4,
    poolOpacity: 0.42,
    streak: 0xfff0dc,
    streakGain: 1,
    blob: 0.24,
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
    fillOpen: 0.76,
    gainOpen: 0.36,
    fillRoom: 0.86,
    gainRoom: 0.22,
    fillGlass: 0.94,
    gainGlass: 0.08,
    shade: 0.66,
    sun: 0xfff6d8,
    disc: 10,
    cone: 0xfff1dc,
    coneOpacity: 0.1,
    pool: 0xfff3e4,
    poolOpacity: 0.42,
    streak: 0xfff6ea,
    streakGain: 0.85,
    blob: 0.18,
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
    fillOpen: 0.62,
    gainOpen: 0.5,
    fillRoom: 0.78,
    gainRoom: 0.32,
    fillGlass: 0.9,
    gainGlass: 0.1,
    shade: 0.56,
    sun: 0xffcc96,
    disc: 13,
    cone: 0xffe7c8,
    coneOpacity: 0.12,
    pool: 0xffefd8,
    poolOpacity: 0.46,
    streak: 0xffe4c4,
    streakGain: 1,
    blob: 0.26,
  },
  {
    id: "dusk",
    name: "黄昏",
    az: 248,
    el: 11,
    zenith: 0x6678a4,
    horizon: 0xe98a62,
    tint: 0xffc2a4,
    fillGround: 0.62,
    gainGround: 0.28,
    fillOpen: 0.48,
    gainOpen: 0.58,
    fillRoom: 0.58,
    gainRoom: 0.34,
    fillGlass: 0.72,
    gainGlass: 0.16,
    shade: 0.42,
    sun: 0xff9a62,
    disc: 18,
    cone: 0xffd2a4,
    coneOpacity: 0.18,
    pool: 0xffd8b0,
    poolOpacity: 0.52,
    streak: 0xffc49a,
    streakGain: 0.9,
    blob: 0.34,
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
    fillOpen: 0.38,
    gainOpen: 0.12,
    fillRoom: 0.5,
    gainRoom: 0.1,
    fillGlass: 0.55,
    gainGlass: 0.06,
    shade: 0.78,
    sun: 0xe4eef8,
    disc: 6,
    cone: 0xffd8b0,
    coneOpacity: 0.22,
    pool: 0xffe6c8,
    poolOpacity: 0.58,
    streak: 0xd5e2f4,
    streakGain: 0.28,
    blob: 0.16,
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

// 与 meshes.js 屋顶落影同一公式：把地面点沿阳光抬到屋顶高度，看是否落在屋顶范围内。
export function groundShadow(x, z, sun, block, roofY) {
  const t = roofY / Math.max(sun.y, 0.05);
  const qx = x + sun.x * t;
  const qz = z + sun.z * t;
  const cx = (block.minX + block.maxX) * 0.5;
  const cz = (block.minZ + block.maxZ) * 0.5;
  const hx = (block.maxX - block.minX) * 0.5;
  const hz = (block.maxZ - block.minZ) * 0.5;
  const dx = Math.abs(qx - cx) - hx;
  const dz = Math.abs(qz - cz) - hz;
  const dist = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  return 1 - smoothstep(SHADOW_IN, SHADOW_OUT, dist);
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
    for (let k = 0; k < 4; k++) {
      pts.push(throwOnFloor(corners[k][0], corners[k][1], corners[k][2], sun, limits));
    }
    out[i] = { pts, near, far: near * 0.22 };
  }
  return out;
}

export function plantShadowShift(sun, height) {
  const scale = Math.min(2.4, height / Math.max(sun.y, 0.18));
  return [-sun.x * scale, -sun.z * scale];
}
