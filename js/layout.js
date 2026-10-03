// 广场朝南，建筑沿 -Z 深入，楼层沿 Y 叠上去。
// 碰撞墙和画框共用这一份盒子。dress 里的格栅、玻璃、台阶、栏杆不进 walls。
// blocks 只挡人，不画出来（玻璃门对面、观景栏杆的实体）。

export const PLAYER_RADIUS = 0.34;
export const EYE = 1.62;
export const WALL_H = 5.05;
export const WALL_T = 0.4;
export const STORY = 5.4;
export const FLOOR_TILT = -Math.PI / 2;
export const CEIL_TILT = Math.PI / 2;
export const FRAME = { w: (0.9 * 3.7) / 1.8, h: 0.9, d: 0.06 };
export const PLAZA = { minX: -42, maxX: 42, minZ: 4.4, maxZ: 46 };
const PLAZA_PATH_Z0 = 5.2;
const PLAZA_PATH_Z1 = PLAZA.maxZ - 2.4;
export const PLAZA_CROSS_Z = (PLAZA_PATH_Z0 + PLAZA_PATH_Z1) / 2;
export const PLAZA_PATH = { z0: PLAZA_PATH_Z0, z1: PLAZA_PATH_Z1 };

const ROWS = 3;
const PITCH_X = 2.2;
const MARGIN = 0.5;
const ROW_GAP = 0.36;
const ROW_BASE = 0.82;
const INNER = 18;
const DOOR = 2.2;
const DOOR_H = 2.88;
const DOOR_D = 0.06;
const DOOR_GAP = 0.002;
const DOOR_SENSE = 8.2;
const SOUTH = 4;
// 自动门在南墙厚度正中，只沿 X 滑进两侧墙槽。靠室内另做门框会和内墙贴在同一张面上。
const DOOR_Z = SOUTH + WALL_T / 2;
const FOYER = 14;
const HALL_A = SOUTH - FOYER;
const BAY = 12;
const HALL_B = HALL_A - BAY;
const NORTH = HALL_B - BAY;

const HALF = STORY / 2;
const STAIR_STEPS = 16;
const TREAD = 0.32;
const RISER = HALF / STAIR_STEPS;
const RUN = STAIR_STEPS * TREAD;
const FLIGHT_W = 2.8;
const STAIR_INSET = 0.05;
// 贴着东南墙角的 L 形：进门后向东上第一跑，墙角左转向北上到上一层。
const LAND_X1 = INNER - STAIR_INSET;
const LAND_Z1 = SOUTH - STAIR_INSET;
const LAND_X0 = LAND_X1 - FLIGHT_W;
const LAND_Z0 = LAND_Z1 - FLIGHT_W;
const F1_X1 = LAND_X0;
const F1_X0 = F1_X1 - RUN;
const F1_Z0 = LAND_Z0;
const F1_Z1 = LAND_Z1;
const F2_X0 = LAND_X0;
const F2_X1 = LAND_X1;
const F2_Z1 = LAND_Z0;
const F2_Z0 = F2_Z1 - RUN;

// 半圆直径贴在南墙外侧，圆心在大门中线上，弧朝广场（+Z）。
const DECK_R = 5.2;
const DECK_CZ = SOUTH + WALL_T;

const LIFT_W = 3.5;
const LIFT_D = 2.5;
const LIFT_DOOR = 1.8;
const LIFT_WIN = 2.4;
const LIFT_CAB = 4;
const LIFT_CZ = (HALL_A + SOUTH) / 2;
// 后墙与正门同厚。轿厢深 2.5，从这面墙的内侧起算，不把墙厚算进轿厢。
const LIFT_REAR = -INNER - WALL_T;
const LIFT_INNER = -INNER;
const LIFT_DOOR_X = LIFT_INNER + LIFT_D;
const LIFT_Z0 = LIFT_CZ - LIFT_W / 2;
const LIFT_Z1 = LIFT_CZ + LIFT_W / 2;

// 十人轿厢：沿墙宽 3.5、进深 2.5，内顶 4。门净宽仍是 1.8。后窗比门宽一截。
export const LIFT = {
  capacity: 10,
  carW: LIFT_W,
  carD: LIFT_D,
  doorW: LIFT_DOOR,
  winW: LIFT_WIN,
  cabH: LIFT_CAB,
  cz: LIFT_CZ,
  z0: LIFT_Z0,
  z1: LIFT_Z1,
  xRear: LIFT_REAR,
  xInner: LIFT_INNER,
  xDoor: LIFT_DOOR_X,
  cx: (LIFT_INNER + LIFT_DOOR_X) / 2,
};

export const HALLS = [
  { id: "qianqi", cat: 6, name: "千奇百怪", color: "#e4cbb8" },
  { id: "qingsong", cat: 369, name: "轻松好玩", color: "#c9d7b8" },
  { id: "online", cat: 3, name: "在线应用", color: "#b7cfe0" },
  { id: "gongyi", cat: 370, name: "公益宣传", color: "#e3c3c8" },
];

export const ASSIGN_IDS = ["qianqi", "qingsong", "online", "gongyi"];

const FRAME_PAPER = "#f7f5f2";

function overlapsY(wall, footY) {
  const y0 = footY == null ? 0 : footY;
  const y1 = y0 + 1.75;
  const base = wall.base || 0;
  const top = base + (wall.h == null ? WALL_H : wall.h);
  if (top <= y0 + 0.08 || base >= y1 - 0.02) return false;
  return true;
}

export function blocked(x, z, radius, walls, footY) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!overlapsY(w, footY)) continue;
    if (x > w.minX - radius && x < w.maxX + radius && z > w.minZ - radius && z < w.maxZ + radius) return true;
  }
  return false;
}

export function movePlayer(x, z, dx, dz, radius, walls, footY) {
  const nx = x + dx;
  if (!blocked(nx, z, radius, walls, footY)) x = nx;
  const nz = z + dz;
  if (!blocked(x, nz, radius, walls, footY)) z = nz;
  return { x, z };
}

function rayWall(ox, oy, oz, dx, dy, dz, box, maxT) {
  const y0 = box.base || 0;
  const y1 = y0 + (box.h == null ? WALL_H : box.h);
  const mins = [box.minX, y0, box.minZ];
  const maxs = [box.maxX, y1, box.maxZ];
  const origin = [ox, oy, oz];
  const dir = [dx, dy, dz];
  let t0 = 0;
  let t1 = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-8) {
      if (origin[a] < mins[a] || origin[a] > maxs[a]) return null;
      continue;
    }
    let near = (mins[a] - origin[a]) / dir[a];
    let far = (maxs[a] - origin[a]) / dir[a];
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    if (near > t0) t0 = near;
    if (far < t1) t1 = far;
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return t0 > 0 ? t0 : 0;
}

// 相机沿视线的反方向退开。dir 就是这一帧相机的世界朝向，不再另算一套 yaw。
export function pullCamera(x, y, z, dirX, dirY, dirZ, dist, walls) {
  const len = Math.hypot(dirX, dirY, dirZ) || 1;
  const dx = -dirX / len;
  const dy = -dirY / len;
  const dz = -dirZ / len;
  let travel = dist;
  const list = walls || [];
  for (let i = 0; i < list.length; i++) {
    const box = list[i];
    const hit = rayWall(x, y, z, dx, dy, dz, box, travel);
    if (hit == null || hit >= travel) continue;
    travel = hit > 0.22 ? hit - 0.16 : hit * 0.45;
  }
  if (travel < 0.2) travel = 0.2;
  return { x: x + dx * travel, y: y + dy * travel, z: z + dz * travel, dist: travel };
}

export function zoneAt(x, z, zones, y) {
  let found = null;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
    if (y != null && zone.minY != null && (y < zone.minY || y > zone.maxY)) continue;
    if (!found || zone.rank > found.rank) found = zone;
  }
  return found;
}

function rowY(r) {
  return ROW_BASE + FRAME.h / 2 + r * (FRAME.h + ROW_GAP);
}

function pushBox(list, minX, maxX, minZ, maxZ, h, tone, base) {
  if (maxX - minX < 0.04 || maxZ - minZ < 0.04) return;
  if (h != null && h < 0.04) return;
  const box = { minX, maxX, minZ, maxZ, h: h == null ? WALL_H : h, tone: tone || "stone" };
  if (base) box.base = base;
  list.push(box);
}

function pickOrdered(sites) {
  const chosen = [];
  for (let h = 0; h < HALLS.length; h++) {
    const cat = HALLS[h].cat;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].cat === cat) chosen.push(i);
    }
  }
  return chosen;
}

function placeFace(frames, sites, cursor, minX, maxX, cz, nz, cones, sideCols, baseY, floor) {
  const trim = sideCols || 0;
  let colsFit = Math.floor((maxX - minX - MARGIN * 2) / PITCH_X);
  if (trim > 0) {
    const inset = FRAME.w / 2 + 0.2;
    const room = maxX - minX - inset * 2;
    if (room < 0.2 || cursor.i >= sites.length) return;
    let full = Math.floor(room / PITCH_X) + 1;
    const minPitch = FRAME.w + 0.2;
    while (full > 1 && room / (full - 1) < minPitch) full -= 1;
    colsFit = full - trim * 2;
  }
  const pitch = PITCH_X;
  if (colsFit < 1 || cursor.i >= sites.length) return;
  const count = Math.min(colsFit * ROWS, sites.length - cursor.i);
  const cols = Math.ceil(count / ROWS);
  const faceZ = cz + nz * (WALL_T / 2 + 0.08 + FRAME.d / 2);
  const used = (cols - 1) * pitch;
  const xStart = (minX + maxX) / 2 - used / 2;
  let placed = 0;
  let sumX = 0;
  let n = 0;
  for (let r = 0; r < ROWS && n < count; r++) {
    for (let c = 0; c < cols && n < count; c++) {
      const x = xStart + c * pitch;
      const y = rowY(r) + baseY;
      if (x - FRAME.w / 2 < minX + 0.04 || x + FRAME.w / 2 > maxX - 0.04) {
        throw new Error("frame outside panel");
      }
      frames.push({
        x,
        y,
        z: faceZ,
        nx: 0,
        nz,
        floor,
        siteIndex: sites[cursor.i],
        color: FRAME_PAPER,
      });
      cursor.i += 1;
      placed += 1;
      sumX += x;
      n += 1;
    }
  }
  if (!placed) return;
  cones.push({ x: sumX / placed, z: faceZ + nz * 2.5, y: baseY });
}

function pushOut(dress, kind, axis, at, dir, min, max, minY, maxY, depth) {
  if (maxY - minY < 0.05 || max - min < 0.05) return;
  const a = at + dir * 0.02;
  const b = at + dir * depth;
  if (axis === "z") {
    dress.push({ kind, minX: min, maxX: max, minY, maxY, minZ: Math.min(a, b), maxZ: Math.max(a, b) });
  } else {
    dress.push({ kind, minZ: min, maxZ: max, minY, maxY, minX: Math.min(a, b), maxX: Math.max(a, b) });
  }
}

function spanY(minY, maxY, base, cap) {
  const y0 = base || 0;
  const a = y0 + minY;
  let b = y0 + maxY;
  if (cap != null) {
    const limit = y0 + cap;
    if (a >= limit - 0.02) return null;
    if (b > limit) b = limit;
  }
  if (b - a < 0.05) return null;
  return [a, b];
}

function finCenters(min, max) {
  const width = max - min;
  if (width < 1.6) return [];
  const count = Math.max(1, Math.round(width / 6.4));
  const step = width / count;
  const out = [];
  for (let i = 0; i < count; i++) out.push(min + step * (i + 0.5));
  return out;
}

function addFacade(dress, axis, at, dir, min, max, gap, base, cap) {
  const lattice = spanY(3.42, 6.32, base, cap);
  const glass = spanY(2.95, 3.42, base, cap);
  if (lattice) pushOut(dress, "lattice", axis, at, dir, min, max, lattice[0], lattice[1], 0.2);
  if (glass) pushOut(dress, "glass", axis, at, dir, min, max, glass[0], glass[1], 0.08);
  const along = axis === "z" ? "x" : "z";
  const fin = spanY(3.5, 6.2, base, cap);
  const spans = gap ? [[min, gap[0]], [gap[1], max]] : [[min, max]];
  if (fin) {
    for (let s = 0; s < spans.length; s++) {
      const centers = finCenters(spans[s][0], spans[s][1]);
      for (let c = 0; c < centers.length; c++) {
        const t = centers[c];
        if (along === "x") {
          const f0 = Math.min(at + dir * 0.18, at + dir * 0.32);
          const f1 = Math.max(at + dir * 0.18, at + dir * 0.32);
          dress.push({ kind: "fin", minX: t - 0.045, maxX: t + 0.045, minY: fin[0], maxY: fin[1], minZ: f0, maxZ: f1 });
        } else {
          const f0 = Math.min(at + dir * 0.18, at + dir * 0.32);
          const f1 = Math.max(at + dir * 0.18, at + dir * 0.32);
          dress.push({ kind: "fin", minZ: t - 0.045, maxZ: t + 0.045, minY: fin[0], maxY: fin[1], minX: f0, maxX: f1 });
        }
      }
    }
  }
  for (let t = min + 1.5; t < max - 0.3; t += 1.85) {
    if (gap && t > gap[0] && t < gap[1]) continue;
    const groove = spanY(0.15, 2.88, base, cap);
    if (!groove) continue;
    if (along === "x") {
      const g0 = Math.min(at, at + dir * 0.045);
      const g1 = Math.max(at, at + dir * 0.045);
      dress.push({ kind: "groove", minX: t - 0.02, maxX: t + 0.02, minY: groove[0], maxY: groove[1], minZ: g0, maxZ: g1 });
    } else {
      const g0 = Math.min(at, at + dir * 0.045);
      const g1 = Math.max(at, at + dir * 0.045);
      dress.push({ kind: "groove", minZ: t - 0.02, maxZ: t + 0.02, minY: groove[0], maxY: groove[1], minX: g0, maxX: g1 });
    }
  }
}

function pushOpening(list, axis, at, dir, min, max, minY, maxY, gap) {
  const spans = gap ? [[min, gap[0]], [gap[1], max]] : [[min, max]];
  for (let i = 0; i < spans.length; i++) {
    const a = spans[i][0];
    const b = spans[i][1];
    if (b - a < 0.3) continue;
    if (axis === "z") {
      list.push({ minX: a, maxX: b, minZ: at, maxZ: at, minY, maxY, nx: 0, nz: dir > 0 ? 1 : -1 });
    } else {
      list.push({ minX: at, maxX: at, minZ: a, maxZ: b, minY, maxY, nx: dir > 0 ? 1 : -1, nz: 0 });
    }
  }
}

export function doorBoxes(open, floor) {
  const t = open < 0 ? 0 : open > 1 ? 1 : open;
  const slide = t * (DOOR - DOOR_GAP);
  const z0 = DOOR_Z - DOOR_D / 2;
  const z1 = DOOR_Z + DOOR_D / 2;
  const base = (floor || 0) * STORY;
  const left = { minX: -DOOR - slide, maxX: -DOOR_GAP - slide, minZ: z0, maxZ: z1, h: DOOR_H };
  const right = { minX: DOOR_GAP + slide, maxX: DOOR + slide, minZ: z0, maxZ: z1, h: DOOR_H };
  if (base) {
    left.base = base;
    right.base = base;
  }
  return [left, right];
}

export function doorWantsOpen(x, z, held) {
  const dz = z - DOOR_Z;
  const dist = Math.hypot(x, dz);
  const inSlab = Math.abs(x) < DOOR + 0.5 && dz > -1.4 && dz < WALL_T + 1.2;
  if (inSlab) return true;
  return dist < (held ? DOOR_SENSE + 1.4 : DOOR_SENSE);
}

function liftPair(x0, x1, open, floor) {
  const t = open < 0 ? 0 : open > 1 ? 1 : open;
  const slide = t * (LIFT.doorW / 2);
  const half = LIFT.doorW / 2;
  const base = (floor || 0) * STORY;
  return [
    { minX: x0, maxX: x1, minZ: LIFT.cz - half - slide, maxZ: LIFT.cz - slide, h: DOOR_H, base },
    { minX: x0, maxX: x1, minZ: LIFT.cz + slide, maxZ: LIFT.cz + half + slide, h: DOOR_H, base },
  ];
}

export function liftLeaves(open, floor) {
  // 门框墙从 xDoor-0.06 到 xDoor+0.1，厚 0.16。门扇 0.08，放在这层厚度的正中。
  const mid = LIFT.xDoor + 0.02;
  const half = 0.04;
  return liftPair(mid - half, mid + half, open, floor);
}

export function liftDoorBoxes(open, floor) {
  if (open > 0.98) return [];
  return liftLeaves(open, floor);
}

export function inLiftCar(x, z) {
  return x > LIFT.xRear + 0.16 && x < LIFT.xDoor - 0.12 && z > LIFT.z0 + 0.1 && z < LIFT.z1 - 0.1;
}

// 馆内琴声有多满。1 是展厅和轿厢，0 是广场和观景台，门口这一两步取中间。
export function hallBlend(x, z, interior) {
  if (inLiftCar(x, z)) return 1;
  if (!interior) return 0;
  if (x < interior.minX - 0.5 || x > interior.maxX + 0.35) return 0;
  if (z < interior.minZ - 0.25) return 0;
  const enter = interior.maxZ + 0.5;
  const full = interior.maxZ - 1.5;
  if (z >= enter) return 0;
  if (z <= full) return 1;
  return (enter - z) / (enter - full);
}

export function nearLiftHall(x, z) {
  const half = LIFT.doorW / 2 + 0.15;
  return x > LIFT.xDoor + 0.02 && x < LIFT.xDoor + 1.7 && Math.abs(z - LIFT.cz) < half;
}

export function liftDoorway(x, z) {
  const half = LIFT.doorW / 2 + 0.05;
  if (Math.abs(z - LIFT.cz) >= half) return false;
  return x > LIFT.xDoor - 0.06 && x < LIFT.xDoor + 0.4;
}

function inWell(x, z) {
  const onF1 = x >= F1_X0 - 0.08 && x <= F1_X1 + 0.02 && z >= F1_Z0 - 0.02 && z <= F1_Z1 + 0.02;
  const onLand = x >= LAND_X0 - 0.02 && x <= LAND_X1 + 0.02 && z >= LAND_Z0 - 0.02 && z <= LAND_Z1 + 0.02;
  const onF2 = x >= F2_X0 - 0.02 && x <= F2_X1 + 0.02 && z >= F2_Z0 - 0.08 && z <= F2_Z1 + 0.02;
  return onF1 || onLand || onF2;
}

function inShaft(x, z) {
  return x >= LIFT.xRear - 0.02 && x <= LIFT.xDoor - 0.02 && z >= LIFT.z0 + 0.04 && z <= LIFT.z1 - 0.04;
}

function nearest(cands, py) {
  let best = null;
  let bestD = 1.25;
  for (let i = 0; i < cands.length; i++) {
    const d = Math.abs(cands[i] - py);
    if (d < bestD) {
      bestD = d;
      best = cands[i];
    }
  }
  return best;
}

function stairHeight(x, z, py, floors) {
  if (floors < 2 || !inWell(x, z)) return null;
  const onLand = x >= LAND_X0 - 0.02 && x <= LAND_X1 + 0.02 && z >= LAND_Z0 - 0.02 && z <= LAND_Z1 + 0.02;
  const onF1 = x >= F1_X0 - 0.08 && x <= F1_X1 + 0.02 && z >= F1_Z0 - 0.02 && z <= F1_Z1 + 0.02;
  const onF2 = x >= F2_X0 - 0.02 && x <= F2_X1 + 0.02 && z >= F2_Z0 - 0.08 && z <= F2_Z1 + 0.02;
  const cands = [];
  for (let i = 0; i < floors - 1; i++) {
    const base = i * STORY;
    if (onLand) cands.push(base + HALF);
    if (onF1) {
      const t = Math.min(1, Math.max(0, (x - F1_X0) / RUN));
      cands.push(base + t * HALF);
    }
    if (onF2) {
      const t = Math.min(1, Math.max(0, (F2_Z1 - z) / RUN));
      cands.push(base + HALF + t * HALF);
    }
  }
  return nearest(cands, py);
}

function flatY(py, floors) {
  let best = 0;
  let bestD = Math.abs(py);
  for (let i = 1; i < floors; i++) {
    const d = Math.abs(py - i * STORY);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (bestD > 1.45) return null;
  return best * STORY;
}

function onThreshold(x, z) {
  return Math.abs(x) < DOOR - 0.02 && z >= SOUTH - 0.12 && z <= DECK_CZ + 0.16;
}

function onDeck(x, z) {
  const dz = z - DECK_CZ;
  if (dz < -0.04) return false;
  const r = DECK_R - 0.28;
  return x * x + dz * dz <= r * r;
}

function onInterior(x, z) {
  if (x <= -INNER + 0.05 || x >= INNER - 0.05) return false;
  if (z >= SOUTH - 0.02 || z <= NORTH + 0.06) return false;
  if (inWell(x, z) || inShaft(x, z)) return false;
  return true;
}

export function groundAt(x, z, py, floors) {
  const count = floors || 1;
  const foot = py || 0;
  if (inShaft(x, z)) {
    const nearDoor = x > LIFT.xDoor - 0.6 || x < LIFT.xRear + 0.6;
    if (nearDoor) {
      const lip = flatY(foot, count);
      if (lip != null) return lip;
    }
    if (foot < STORY * 0.45) return 0;
    return null;
  }
  const climbed = stairHeight(x, z, foot, count);
  if (climbed != null) return climbed;
  const deck = flatY(foot, count);
  if (onThreshold(x, z) && deck != null) return deck;
  if (deck != null && deck >= STORY - 0.01 && onDeck(x, z)) return deck;
  if (onInterior(x, z) && deck != null) return deck;
  if (foot < 2.2 && x > PLAZA.minX - 0.2 && x < PLAZA.maxX + 0.2 && z > SOUTH - 0.35 && z < PLAZA.maxZ + 0.3) return 0;
  return null;
}

function beamRun(zSouth, zNorth, count) {
  const list = [];
  const a = zSouth - 1.2;
  const b = zNorth + 1.2;
  for (let i = 1; i <= count; i++) list.push(a + ((b - a) * i) / (count + 1));
  return list;
}

function addBeam(dress, z, halfZ, base) {
  const y = base || 0;
  // 天花底面在 WALL_H - 0.06。梁顶埋进底面 2 厘米，下面不再留缝。
  const soffit = y + WALL_H - 0.06;
  const beamH = 0.4;
  const top = soffit + 0.02;
  dress.push({
    kind: "beam",
    minX: -14.7,
    maxX: 14.7,
    minY: top - beamH,
    maxY: top,
    minZ: z - halfZ,
    maxZ: z + halfZ,
  });
}

function subtractOne(rect, hole) {
  const x0 = Math.max(rect.minX, hole.minX);
  const x1 = Math.min(rect.maxX, hole.maxX);
  const z0 = Math.max(rect.minZ, hole.minZ);
  const z1 = Math.min(rect.maxZ, hole.maxZ);
  if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return [rect];
  const out = [];
  if (z0 - rect.minZ > 0.04) out.push({ minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: z0 });
  if (rect.maxZ - z1 > 0.04) out.push({ minX: rect.minX, maxX: rect.maxX, minZ: z1, maxZ: rect.maxZ });
  if (x0 - rect.minX > 0.04) out.push({ minX: rect.minX, maxX: x0, minZ: z0, maxZ: z1 });
  if (rect.maxX - x1 > 0.04) out.push({ minX: x1, maxX: rect.maxX, minZ: z0, maxZ: z1 });
  return out;
}

function cutRects(outer, holes) {
  let rects = [outer];
  for (let h = 0; h < holes.length; h++) {
    const next = [];
    for (let i = 0; i < rects.length; i++) {
      const parts = subtractOne(rects[i], holes[h]);
      for (let p = 0; p < parts.length; p++) next.push(parts[p]);
    }
    rects = next;
  }
  return rects;
}

// 从上往下看，外轮廓逆时针，洞顺时针。靠大厅的边向外让开踏步和玻璃。
// 靠墙的两边埋进墙厚中段，离开内外墙面，角上不留能看见的楼板，也不和墙面贴在一起抖。
function stairHolePoly(pad) {
  const bury = 0.2;
  const A = F1_X0 + 0.12 - pad;
  const B = LAND_X0 - pad;
  const C = INNER + bury;
  const P = F2_Z0 - pad;
  const Q = LAND_Z0 - pad;
  const R = SOUTH + bury;
  return [[A, Q], [B, Q], [B, P], [C, P], [C, R], [A, R]];
}

// 西边沿墙走，到电梯井改向内拐。楼板停在门厅一侧的墙面，不穿进门扇，窗洞里也不留隔板。
function shaftWestEdge(xWest, zNorth) {
  const z0 = LIFT.z0 - 0.08;
  const z1 = LIFT.z1 + 0.08;
  // 楼板边收到门墙里面，不贴在正面上。
  const xIn = LIFT.xDoor + 0.03;
  return [
    [xWest, zNorth],
    [xWest, z0],
    [xIn, z0],
    [xIn, z1],
    [xWest, z1],
  ];
}

function roomOuterPoly(openShaft) {
  const xWest = -INNER - 0.02;
  const xEast = INNER + 0.32;
  const zNorth = NORTH - 0.02;
  const zSouth = SOUTH + 0.32;
  const loop = [
    [xWest, zSouth],
    [xEast, zSouth],
    [xEast, zNorth],
  ];
  if (openShaft) loop.push(...shaftWestEdge(xWest, zNorth));
  else loop.push([xWest, zNorth]);
  return loop;
}

function floorOuterPoly(tongueZ) {
  const wallZ = SOUTH + 0.32;
  const doorL = -DOOR - 0.12;
  const doorR = DOOR + 0.12;
  const xWest = -INNER - 0.02;
  const xEast = INNER + 0.32;
  const zNorth = NORTH - 0.02;
  return [
    [xWest, wallZ],
    [doorL, wallZ],
    [doorL, tongueZ],
    [doorR, tongueZ],
    [doorR, wallZ],
    [xEast, wallZ],
    [xEast, zNorth],
    ...shaftWestEdge(xWest, zNorth),
  ];
}

function hangFloor(frames, chosen, cursor, cones, floor) {
  const baseY = floor * STORY;
  const panelL0 = -17.35;
  const panelL1 = -DOOR;
  const panelR0 = DOOR;
  const panelR1 = 17.35;
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_A, 1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_A, 1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_B, 1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_B, 1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, -INNER, INNER, NORTH - WALL_T / 2, 1, cones, 1, baseY, floor);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_A, -1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_A, -1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_B, -1, cones, 0, baseY, floor);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_B, -1, cones, 0, baseY, floor);
}

function addTread(dress, minX, maxX, minZ, maxZ, top) {
  dress.push({ kind: "step", minX, maxX, minY: top - 0.045, maxY: top, minZ, maxZ });
}

const RAIL_IN = 0.06;
const POST_HALF = 0.018;

function addWoodEdge(blocks, dress, handrails, along, fixed, a0, a1, yAt, collide, skipStart) {
  for (let i = 0; i < STAIR_STEPS; i++) {
    const t = (i + 0.5) / STAIR_STEPS;
    const y = yAt(t);
    const a = a0 + ((a1 - a0) * i) / STAIR_STEPS;
    const b = a0 + ((a1 - a0) * (i + 1)) / STAIR_STEPS;
    const minA = Math.min(a, b);
    const maxA = Math.max(a, b);
    const minX = along === "x" ? minA : fixed - 0.03;
    const maxX = along === "x" ? maxA : fixed + 0.03;
    const minZ = along === "z" ? minA : fixed - 0.03;
    const maxZ = along === "z" ? maxA : fixed + 0.03;
    if (collide) blocks.push({ minX, maxX, minZ, maxZ, h: 1.02, base: y });
  }
  const marks = [0, 4, 8, 12, STAIR_STEPS];
  for (let k = 0; k < marks.length; k++) {
    const i = marks[k];
    if (i === 0 && skipStart) continue;
    const t = i / STAIR_STEPS;
    const y = yAt(t);
    const a = a0 + (a1 - a0) * t;
    const x = along === "x" ? a : fixed;
    const z = along === "z" ? a : fixed;
    dress.push({
      kind: "wood",
      minX: x - POST_HALF,
      maxX: x + POST_HALF,
      minY: y + 0.02,
      maxY: y + 0.87,
      minZ: z - POST_HALF,
      maxZ: z + POST_HALF,
    });
  }
  if (along === "x") {
    handrails.push({ x0: a0, y0: yAt(0) + 0.9, z0: fixed, x1: a1, y1: yAt(1) + 0.9, z1: fixed });
  } else {
    handrails.push({ x0: fixed, y0: yAt(0) + 0.9, z0: a0, x1: fixed, y1: yAt(1) + 0.9, z1: a1 });
  }
}

function pushCapRail(handrails, x0, y, z0, x1, z1) {
  handrails.push({
    x0, y0: y, z0, x1, y1: y, z1,
    sy: 1.35,
    sz: 2.6,
  });
}

function pushAlignedPosts(dress, x0, z0, x1, z1, y, top, skipEnd) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.85));
  const last = skipEnd ? n - 1 : n;
  const half = 0.026;
  for (let i = 0; i <= last; i++) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    dress.push({
      kind: "wood",
      minX: px - half,
      maxX: px + half,
      minY: y + 0.02,
      maxY: top,
      minZ: pz - half,
      maxZ: pz + half,
    });
  }
}

// 二楼及以上，楼梯孔靠大厅的两侧：玻璃落到楼板边上，底边埋进地面，不再悬在洞口里。
function addTurnGuard(blocks, dress, handrails, floor) {
  const y = floor * STORY;
  const x1 = LAND_X0 - 0.06;
  const z1 = LAND_Z0 - 0.06;
  const x0 = F1_X0 + 0.04;
  const z0 = F2_Z0 + 0.06;
  const t = 0.016;
  const railY = y + 0.94;
  const postTop = railY + 0.02;
  dress.push({ kind: "glass", minX: x0, maxX: x1, minY: y + 0.02, maxY: railY, minZ: z1 - t, maxZ: z1 });
  blocks.push({ minX: x0, maxX: x1, minZ: z1 - t, maxZ: z1 + 0.02, h: 1.02, base: y });
  dress.push({ kind: "glass", minX: x1 - t, maxX: x1, minY: y + 0.02, maxY: railY, minZ: z0, maxZ: z1 });
  blocks.push({ minX: x1 - t, maxX: x1 + 0.02, minZ: z0, maxZ: z1, h: 1.02, base: y });
  const zRail = z1 - t / 2;
  const xRail = x1 - t / 2;
  pushCapRail(handrails, x0, railY, zRail, xRail, zRail);
  pushCapRail(handrails, xRail, railY, z0, xRail, zRail);
  pushAlignedPosts(dress, x0, zRail, xRail, zRail, y, postTop, false);
  pushAlignedPosts(dress, xRail, z0, xRail, zRail, y, postTop, true);
}

// 顶层没有再往上的楼梯。把围栏从楼梯口沿西端接到南墙，洞口不再敞着。
function addTopClose(blocks, dress, handrails, floor) {
  const y = floor * STORY;
  const x = F1_X0 + 0.04;
  const z0 = LAND_Z0;
  const z1 = SOUTH + 0.06;
  const t = 0.016;
  const railY = y + 0.94;
  const postTop = railY + 0.02;
  dress.push({ kind: "glass", minX: x - t, maxX: x, minY: y + 0.02, maxY: railY, minZ: z0, maxZ: z1 });
  blocks.push({ minX: x - 0.02, maxX: x + 0.04, minZ: z0, maxZ: z1, h: 1.02, base: y });
  const xRail = x - t / 2;
  pushCapRail(handrails, xRail, railY, z0, xRail, z1);
  pushAlignedPosts(dress, xRail, z0, xRail, z1, y, postTop, true);
}

function addTurnPlant(plants, floor) {
  const kind = (floor * 5 + 1) % 3;
  plants.push({
    x: LAND_X0 - 0.95,
    z: LAND_Z0 - 0.95,
    y: floor * STORY,
    s: 0.96 + ((floor * 3) % 4) * 0.08,
    kind,
    floor,
  });
}

function addStair(blocks, dress, handrails, floors) {
  for (let s = 0; s < floors - 1; s++) {
    const base = s * STORY;
    for (let i = 0; i < STAIR_STEPS; i++) {
      const top = base + (i + 1) * RISER;
      const x0 = F1_X0 + i * TREAD;
      addTread(dress, x0, x0 + TREAD, F1_Z0, F1_Z1, top);
      const top2 = base + HALF + (i + 1) * RISER;
      const z1 = F2_Z1 - i * TREAD;
      addTread(dress, F2_X0, F2_X1, z1 - TREAD, z1, top2);
    }
    addTread(dress, LAND_X0, LAND_X1, LAND_Z0, LAND_Z1, base + HALF);
    const zIn = F1_Z0 + RAIL_IN;
    const zOut = F1_Z1 - RAIL_IN;
    const xIn = F2_X0 + RAIL_IN;
    const xOut = F2_X1 - RAIL_IN;
    addWoodEdge(blocks, dress, handrails, "x", zIn, F1_X0, LAND_X0 + RAIL_IN, (t) => base + t * HALF, true, false);
    addWoodEdge(blocks, dress, handrails, "x", zOut, F1_X0, F1_X1, (t) => base + t * HALF, false, false);
    addWoodEdge(blocks, dress, handrails, "z", xIn, LAND_Z0 + RAIL_IN, F2_Z0, (t) => base + HALF + t * HALF, true, true);
    addWoodEdge(blocks, dress, handrails, "z", xOut, F2_Z1, F2_Z0, (t) => base + HALF + t * HALF, false, false);
  }
}

function addDeck(blocks, floor) {
  const y = floor * STORY;
  const glassH = 1.02;
  const segments = 28;
  for (let i = 0; i < segments; i++) {
    const a0 = Math.PI + (Math.PI * i) / segments;
    const a1 = Math.PI + (Math.PI * (i + 1)) / segments;
    const x0 = Math.cos(a0) * DECK_R;
    const z0 = DECK_CZ - Math.sin(a0) * DECK_R;
    const x1 = Math.cos(a1) * DECK_R;
    const z1 = DECK_CZ - Math.sin(a1) * DECK_R;
    const minX = Math.min(x0, x1) - 0.05;
    const maxX = Math.max(x0, x1) + 0.05;
    const minZ = Math.min(z0, z1) - 0.05;
    const maxZ = Math.max(z0, z1) + 0.05;
    blocks.push({ minX, maxX, minZ, maxZ, h: glassH, base: y });
  }
}

function placeTree(blocks, yard, x, z) {
  yard.push({ kind: "tree", x, z });
  blocks.push({ minX: x - 0.22, maxX: x + 0.22, minZ: z - 0.22, maxZ: z + 0.22, h: 2.1 });
}

function placeHedge(blocks, yard, x, z, w, d) {
  yard.push({ kind: "hedge", x, z, w, d });
  blocks.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: 0.42 });
}

function placeBench(blocks, yard, x, z, yaw) {
  yard.push({ kind: "bench", x, z, yaw });
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const hw = (2.72 * c + 0.62 * s) / 2;
  const hd = (2.72 * s + 0.62 * c) / 2;
  blocks.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h: 0.55 });
}

// 广场四周一圈：树在外，矮篱靠路边。长椅只留六张，朝向圆心。正中留出通往大门的空档。
function addPlazaDress(blocks, yard) {
  const xs = [-34, -26, -18, -10, 10, 18, 26, 34];
  const zs = [14, 22, 30, 38];
  const west = -36.8;
  const east = 36.8;
  const north = 10.2;
  const south = 40.2;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    placeTree(blocks, yard, x, north);
    placeHedge(blocks, yard, x, north - 1.65, 2.4, 0.7);
    placeTree(blocks, yard, x, south);
    placeHedge(blocks, yard, x, south + 1.65, 2.4, 0.7);
  }
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    placeTree(blocks, yard, west, z);
    placeHedge(blocks, yard, west - 1.65, z, 0.7, 2.4);
    placeTree(blocks, yard, east, z);
    placeHedge(blocks, yard, east + 1.65, z, 0.7, 2.4);
  }
  // 北排八棵树，正中空档留给大门。六张椅子坐在其余树档里，朝广场，比树干稍靠前。
  // 南排相同的六个树档再放六张，同样朝向广场圆心。
  const gaps = [-30, -22, -14, 14, 22, 30];
  for (let i = 0; i < gaps.length; i++) {
    placeBench(blocks, yard, gaps[i], north + 1.65, 0);
    placeBench(blocks, yard, gaps[i], south - 1.65, Math.PI);
  }
}

// 每层门厅：两根柱子靠过道一侧各一只灭火器；进门左手、大门墙中间一张圆桌。
function addLobbyDress(blocks, floors) {
  const extinguishers = [];
  const tables = [];
  const colZ = (-3.55 + -2.8) / 2;
  const tableX = (-INNER - DOOR) / 2;
  const tableR = 0.8;
  const tableZ = SOUTH - tableR - 0.28;
  for (let f = 0; f < floors; f++) {
    const y = f * STORY;
    const spots = [
      { x: 8.04, z: colZ },
      { x: -8.04, z: colZ },
    ];
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      extinguishers.push({ x: spot.x, y, z: spot.z });
      blocks.push({
        minX: spot.x - 0.16,
        maxX: spot.x + 0.16,
        minZ: spot.z - 0.16,
        maxZ: spot.z + 0.16,
        h: 0.78,
        base: y,
      });
    }
    tables.push({ x: tableX, y, z: tableZ, floor: f });
    blocks.push({
      minX: tableX - 1.78,
      maxX: tableX + 1.78,
      minZ: tableZ - 1.05,
      maxZ: tableZ + 0.96,
      h: 1.28,
      base: y,
    });
  }
  return { extinguishers, tables };
}

function addPlants(plants, floors) {
  const spots = [
    { x: -10.2, z: -8.2 },
    { x: 6.4, z: -13.6 },
    { x: -2.8, z: -19.4 },
  ];
  const scales = [1.28, 1.02, 1.42];
  for (let floor = 0; floor < floors; floor++) {
    const ox = (floor % 3) * 0.65;
    const oz = (floor % 4) * 0.32;
    for (let i = 0; i < spots.length; i++) {
      const kind = (i + floor) % 3;
      plants.push({
        x: spots[i].x + ox,
        z: spots[i].z - oz,
        y: floor * STORY,
        s: scales[kind] * (0.94 + (floor % 3) * 0.04),
        kind,
        floor,
      });
    }
  }
}

export function buildMuseum(sites) {
  const chosen = pickOrdered(sites || []);
  const stone = [];
  const white = [];
  const curb = [];
  const liners = [];
  const blocks = [];
  const T = WALL_T;
  const frames = [];
  const cones = [];
  const cursor = { i: 0 };
  let floorCount = 0;
  while (cursor.i < chosen.length && floorCount < 48) {
    const before = cursor.i;
    hangFloor(frames, chosen, cursor, cones, floorCount);
    if (cursor.i === before) break;
    floorCount += 1;
  }
  if (floorCount < 1) floorCount = 1;
  const top = (floorCount - 1) * STORY;
  const totalH = top + 6.9;
  const shellH = totalH;

  // 两侧墙是双层：靠厅、靠广场各一层，中间留槽。门扇整段待在槽里，不和墙皮交上。
  const parkedLeaf = doorBoxes(1, 0)[0];
  const slotGap = 0.012;
  const pocketClear = 0.07;
  const skinIn = parkedLeaf.minZ - slotGap;
  const skinOut = parkedLeaf.maxZ + slotGap;
  const pocketFar = -parkedLeaf.minX + pocketClear;
  pushBox(stone, -INNER, -pocketFar, SOUTH, SOUTH + T, shellH);
  pushBox(stone, pocketFar, INNER, SOUTH, SOUTH + T, shellH);
  pushBox(stone, -pocketFar, -DOOR, SOUTH, skinIn, shellH);
  pushBox(stone, -pocketFar, -DOOR, skinOut, SOUTH + T, shellH);
  pushBox(stone, DOOR, pocketFar, SOUTH, skinIn, shellH);
  pushBox(stone, DOOR, pocketFar, skinOut, SOUTH + T, shellH);
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    const next = f === floorCount - 1 ? shellH : (f + 1) * STORY;
    const y0 = base + DOOR_H + 0.004;
    pushBox(stone, -pocketFar, -DOOR, skinIn, skinOut, next - y0, "stone", y0);
    pushBox(stone, DOOR, pocketFar, skinIn, skinOut, next - y0, "stone", y0);
  }
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    const headTop = f === floorCount - 1 ? WALL_H : STORY;
    pushBox(stone, -DOOR, DOOR, SOUTH, SOUTH + T, headTop - DOOR_H, "stone", base + DOOR_H);
    pushBox(white, -DOOR, DOOR, SOUTH - 0.052, SOUTH - 0.01, headTop - DOOR_H, "white", base + DOOR_H);
  }

  const cheek = 0.16;
  const winJamb = (LIFT.carW - LIFT.winW) / 2;
  // 后墙一路做到窗边，中间只留窗洞。不要再叠一块墙垛，外立面和内墙才不会抖。
  pushBox(stone, -INNER - T, -INNER, NORTH, LIFT.z0 + winJamb, shellH);
  pushBox(stone, -INNER - T, -INNER, LIFT.z1 - winJamb, SOUTH, shellH);
  pushBox(stone, INNER, INNER + T, NORTH, SOUTH, shellH);
  pushBox(stone, -INNER, INNER, NORTH - T, NORTH, shellH);
  const corners = [];
  pushBox(corners, -INNER - T, -INNER, SOUTH, SOUTH + T, shellH);
  pushBox(corners, INNER, INNER + T, SOUTH, SOUTH + T, shellH);
  pushBox(corners, -INNER - T, -INNER, NORTH - T, NORTH, shellH);
  pushBox(corners, INNER, INNER + T, NORTH - T, NORTH, shellH);

  pushBox(curb, INNER + T, PLAZA.maxX + T, SOUTH, SOUTH + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, -INNER - T, SOUTH, SOUTH + T, 0.45, "curb");
  pushBox(curb, PLAZA.maxX, PLAZA.maxX + T, SOUTH + T, PLAZA.maxZ + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, PLAZA.minX, SOUTH + T, PLAZA.maxZ + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, PLAZA.maxX + T, PLAZA.maxZ, PLAZA.maxZ + T, 0.45, "curb");

  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    const h = f === floorCount - 1 ? WALL_H : STORY;
    pushBox(white, -INNER, -DOOR, HALL_A - T / 2, HALL_A + T / 2, h, "white", base);
    pushBox(white, DOOR, INNER, HALL_A - T / 2, HALL_A + T / 2, h, "white", base);
    pushBox(white, -INNER, -DOOR, HALL_B - T / 2, HALL_B + T / 2, h, "white", base);
    pushBox(white, DOOR, INNER, HALL_B - T / 2, HALL_B + T / 2, h, "white", base);
    pushBox(white, 8.2, 8.95, -3.55, -2.8, WALL_H, "white", base);
    pushBox(white, -8.95, -8.2, -3.55, -2.8, WALL_H, "white", base);
    pushBox(white, 10.1, 10.85, NORTH + 5.6, NORTH + 6.35, WALL_H, "white", base);
    pushBox(white, -10.85, -10.1, NORTH + 5.6, NORTH + 6.35, WALL_H, "white", base);
  }

  // 正面要比门扇再靠大厅 6 厘米，门前那层皮才够 4 厘米，不会被墙盒丢掉。
  const liftFace = LIFT.xDoor + 0.12;
  const liftInner = LIFT.xInner;
  const doorJamb = (LIFT.carW - LIFT.doorW) / 2;
  const leafBox = liftLeaves(0, 0)[0];
  const leafX0 = leafBox.minX;
  const leafX1 = leafBox.maxX;
  const slot = 0.012;
  const pocket = 0.07;
  // 侧墙伸进后墙 2 厘米，端面埋进石墙，不和窗边内墙贴在同一张面上。
  const cheekIn = liftInner - 0.02;
  // 门垛在门扇前后各留一层实墙，中间留槽。两层都厚过 4 厘米，正面才画得出来。
  const skinX0 = leafX1 + 0.004;
  const backX1 = leafX0 - slot;
  const backX0 = LIFT.xDoor - 0.085;
  pushBox(white, cheekIn, liftFace, LIFT.z0 - cheek - 0.02, LIFT.z0 - pocket, shellH, "white");
  pushBox(white, cheekIn, backX1, LIFT.z0 - pocket, LIFT.z0, shellH, "white");
  pushBox(white, skinX0, liftFace, LIFT.z0 - pocket, LIFT.z0, shellH, "white");
  pushBox(white, cheekIn, liftFace, LIFT.z1 + pocket, LIFT.z1 + cheek + 0.02, shellH, "white");
  pushBox(white, cheekIn, backX1, LIFT.z1, LIFT.z1 + pocket, shellH, "white");
  pushBox(white, skinX0, liftFace, LIFT.z1, LIFT.z1 + pocket, shellH, "white");
  pushBox(white, backX0, backX1, LIFT.z0, LIFT.z0 + doorJamb, shellH, "white");
  pushBox(white, skinX0, liftFace, LIFT.z0, LIFT.z0 + doorJamb, shellH, "white");
  pushBox(white, backX0, backX1, LIFT.z1 - doorJamb, LIFT.z1, shellH, "white");
  pushBox(white, skinX0, liftFace, LIFT.z1 - doorJamb, LIFT.z1, shellH, "white");
  blocks.push({
    minX: LIFT.xRear - 0.04,
    maxX: LIFT.xRear + 0.06,
    minZ: LIFT.cz - LIFT.winW / 2,
    maxZ: LIFT.cz + LIFT.winW / 2,
    h: shellH,
  });
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    const headTop = f === floorCount - 1 ? WALL_H : STORY + 0.036;
    pushBox(white, LIFT.xDoor - 0.06, liftFace, LIFT.cz - LIFT.doorW / 2, LIFT.cz + LIFT.doorW / 2, headTop - DOOR_H - 0.004, "white", base + DOOR_H + 0.004);
  }

  const skin = INNER + T - 0.006;
  liners.push({ minX: -skin, maxX: -DOOR, minZ: SOUTH - 0.052, maxZ: SOUTH - 0.01, h: shellH });
  liners.push({ minX: DOOR, maxX: skin, minZ: SOUTH - 0.052, maxZ: SOUTH - 0.01, h: shellH });
  const winJambLiner = (LIFT.carW - LIFT.winW) / 2;
  // 内衬在窗洞边收进 3 厘米，端面不和石墙的窗侧切在同一张面上。
  liners.push({ minX: -INNER - 0.01, maxX: -INNER + 0.05, minZ: NORTH, maxZ: LIFT.z0 + winJambLiner - 0.03, h: shellH });
  liners.push({ minX: -INNER - 0.01, maxX: -INNER + 0.05, minZ: LIFT.z1 - winJambLiner + 0.03, maxZ: SOUTH - 0.02, h: shellH });
  liners.push({ minX: INNER - 0.05, maxX: INNER + 0.01, minZ: NORTH, maxZ: SOUTH - 0.02, h: shellH });
  liners.push({ minX: -skin, maxX: skin, minZ: NORTH - 0.01, maxZ: NORTH + 0.008, h: shellH });

  const dress = [];
  const bandCorners = [];
  const cap = floorCount > 1 ? STORY - 0.08 : null;
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    const storyCap = f === floorCount - 1 ? null : cap;
    addFacade(dress, "z", SOUTH + T, 1, -18.35, 18.35, [-2.7, 2.7], base, storyCap);
    addFacade(dress, "z", NORTH - T, -1, -18.35, 18.35, null, base, storyCap);
    addFacade(dress, "x", INNER + T, 1, NORTH - 0.2, SOUTH + 0.2, null, base, storyCap);
    addFacade(dress, "x", -INNER - T, -1, NORTH - 0.2, SOUTH + 0.2, [LIFT.z0 - 0.3, LIFT.z1 + 0.3], base, storyCap);
    const band = spanY(3.42, 6.32, base, storyCap);
    if (band) {
      const xOut = INNER + T + 0.2;
      const xBand = 18.35;
      const zFront = SOUTH + T + 0.2;
      const zSideS = SOUTH + 0.2;
      const zBack = NORTH - T - 0.2;
      const zSideN = NORTH - 0.2;
      bandCorners.push({ minX: xBand, maxX: xOut, minY: band[0], maxY: band[1], minZ: zSideS, maxZ: zFront });
      bandCorners.push({ minX: -xOut, maxX: -xBand, minY: band[0], maxY: band[1], minZ: zSideS, maxZ: zFront });
      bandCorners.push({ minX: xBand, maxX: xOut, minY: band[0], maxY: band[1], minZ: zBack, maxZ: zSideN });
      bandCorners.push({ minX: -xOut, maxX: -xBand, minY: band[0], maxY: band[1], minZ: zBack, maxZ: zSideN });
    }
  }
  // 后窗是一整块玻璃。按层切开的话，上下两块之间会留缝，两块叠在同一张面上又会抖。
  dress.push({
    kind: "glass",
    minX: LIFT.xRear + 0.02,
    maxX: LIFT.xRear + 0.06,
    minY: 0.02,
    maxY: (floorCount - 1) * STORY + WALL_H - 0.02,
    minZ: LIFT.cz - LIFT.winW / 2 - 0.16,
    maxZ: LIFT.cz + LIFT.winW / 2 + 0.16,
  });
  dress.push({
    kind: "roof",
    minX: -19.15,
    maxX: 19.15,
    minY: top + 6.28,
    maxY: top + 6.72,
    minZ: NORTH - 0.85,
    maxZ: SOUTH + T + 0.7,
  });

  const openings = [];
  pushOpening(openings, "z", SOUTH - 0.02, 1, -18.35, 18.35, 2.95, 3.42, [-2.7, 2.7]);
  pushOpening(openings, "z", NORTH + 0.02, -1, -18.35, 18.35, 2.95, 3.42);
  pushOpening(openings, "x", INNER - 0.02, 1, NORTH + 0.2, SOUTH - 0.2, 2.95, 3.42);
  // 电梯和大门之间是实墙，这里不再开一条光缝。
  pushOpening(openings, "x", -INNER + 0.02, -1, NORTH + 0.2, SOUTH - 0.2, 2.95, 3.42, [LIFT.z0 - 0.05, SOUTH + 1]);
  pushOpening(openings, "z", SOUTH - 0.02, 1, -DOOR, DOOR, 0, DOOR_H);

  const beamZ = beamRun(SOUTH, HALL_A, 2).concat(beamRun(HALL_A, HALL_B, 2), beamRun(HALL_B, NORTH, 2));
  for (let f = 0; f < floorCount; f++) {
    for (let i = 0; i < beamZ.length; i++) addBeam(dress, beamZ[i], 0.22, f * STORY);
  }
  const handrails = [];
  addStair(blocks, dress, handrails, floorCount);
  for (let f = 1; f < floorCount; f++) addTurnGuard(blocks, dress, handrails, f);
  if (floorCount > 1) addTopClose(blocks, dress, handrails, floorCount - 1);

  const lobes = [];
  for (let f = 1; f < floorCount; f++) {
    const y = f * STORY;
    addDeck(blocks, f);
    lobes.push({ x: 0, z: DECK_CZ, y, r: DECK_R, theta: Math.PI, sweep: Math.PI });
  }

  const stairWall = 0.22;
  const stairHoles = [
    { minX: F1_X0 + 0.12, maxX: F1_X1, minZ: F1_Z0, maxZ: Math.min(F1_Z1, SOUTH - stairWall) },
    { minX: LAND_X0, maxX: Math.min(LAND_X1, INNER - stairWall), minZ: LAND_Z0, maxZ: Math.min(LAND_Z1, SOUTH - stairWall) },
    { minX: F2_X0, maxX: Math.min(F2_X1, INNER - stairWall), minZ: F2_Z0, maxZ: F2_Z1 },
  ];
  // 井道连窗洞一起挖空。楼板外轮廓已经让开这段，这里再切一层，避免旧盒子还留着隔板。
  const shaftHole = { minX: LIFT.xRear - 0.2, maxX: LIFT.xDoor + 0.1, minZ: LIFT.z0 - 0.08, maxZ: LIFT.z1 + 0.08 };
  const outer = { minX: -INNER - 0.02, maxX: INNER + 0.02, minZ: NORTH - 0.02, maxZ: SOUTH + 0.02 };
  const cut = floorCount > 1 ? cutRects(outer, stairHoles.concat([shaftHole])) : [outer];
  const groundCut = cutRects(outer, [shaftHole]);
  const slabs = [];
  const ceils = [];
  const whole = [outer];
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    if (f === 0) {
      for (let i = 0; i < groundCut.length; i++) {
        const part = groundCut[i];
        slabs.push({ minX: part.minX, maxX: part.maxX, minY: 0.012, maxY: 0.04, minZ: part.minZ, maxZ: part.maxZ });
      }
    }
    if (f < floorCount - 1) {
      const y0 = base + WALL_H - 0.06;
      const mid = base + WALL_H + 0.16;
      const y1 = base + STORY + 0.04;
      for (let i = 0; i < cut.length; i++) {
        const part = cut[i];
        ceils.push({ minX: part.minX, maxX: part.maxX, minY: y0, maxY: mid, minZ: part.minZ, maxZ: part.maxZ });
        slabs.push({ minX: part.minX, maxX: part.maxX, minY: mid, maxY: y1, minZ: part.minZ, maxZ: part.maxZ });
      }
    } else {
      const ceilTop = base + WALL_H;
      for (let i = 0; i < whole.length; i++) {
        const part = whole[i];
        ceils.push({ minX: part.minX, maxX: part.maxX, minY: ceilTop - 0.06, maxY: ceilTop, minZ: part.minZ, maxZ: part.maxZ });
      }
    }
    slabs.push({
      minX: -DOOR + 0.04,
      maxX: DOOR - 0.04,
      minY: base + 0.012,
      maxY: base + 0.04,
      minZ: SOUTH - 0.04,
      maxZ: f === 0 ? SOUTH + T : DECK_CZ,
    });
  }

  // 楼板画成一整块，楼梯孔只有一条边。井道从外轮廓上挖掉，窗洞里没有隔板。
  // 楼梯孔靠墙的角收到墙厚里面，角上不再露楼板。
  // 一层门口收到楼体外皮，不再把室内地面伸到广场上。
  const floorPlates = [];
  const ceilPlates = [];
  floorPlates.push({
    minY: 0.012,
    maxY: 0.04,
    outer: floorOuterPoly(PLAZA.minZ),
    holes: [],
  });
  const stairCut = stairHolePoly(0.03);
  const stairWide = stairHolePoly(0.05);
  for (let f = 0; f < floorCount; f++) {
    const base = f * STORY;
    if (f < floorCount - 1) {
      const y0 = base + WALL_H - 0.06;
      const mid = base + WALL_H + 0.16;
      const y1 = base + STORY + 0.04;
      ceilPlates.push({
        minY: y0,
        maxY: mid - 0.006,
        outer: roomOuterPoly(true),
        holes: [stairWide],
      });
      floorPlates.push({
        minY: mid,
        maxY: y1,
        outer: floorOuterPoly(DECK_CZ),
        holes: [stairCut],
      });
    } else {
      const ceilTop = base + WALL_H;
      ceilPlates.push({
        minY: ceilTop - 0.06,
        maxY: ceilTop,
        outer: roomOuterPoly(true),
        holes: [],
      });
    }
  }

  const plants = [];
  addPlants(plants, floorCount);
  for (let f = 1; f < floorCount; f++) addTurnPlant(plants, f);
  const props = addLobbyDress(blocks, floorCount);
  const yard = [];
  addPlazaDress(blocks, yard);

  const hallByCat = new Map();
  for (let i = 0; i < HALLS.length; i++) hallByCat.set(HALLS[i].cat, HALLS[i]);
  const floorNames = [];
  for (let f = 0; f < floorCount; f++) floorNames.push([]);
  for (let i = 0; i < frames.length; i++) {
    const hall = hallByCat.get(sites[frames[i].siteIndex].cat);
    const name = hall ? hall.name : "";
    if (name && floorNames[frames[i].floor].indexOf(name) < 0) floorNames[frames[i].floor].push(name);
  }

  const zones = [];
  for (let f = 0; f < floorCount; f++) {
    const names = floorNames[f];
    const label = (names.length ? names.join("、") : "展厅") + " · " + (f + 1) + "楼";
    zones.push({
      name: label,
      legend: names,
      rank: 3,
      minX: -INNER - 0.3,
      maxX: INNER + 0.3,
      minZ: NORTH - 0.3,
      maxZ: SOUTH + T + 0.3,
      minY: f * STORY - 0.35,
      maxY: f === floorCount - 1 ? f * STORY + WALL_H : (f + 1) * STORY - 0.15,
    });
    if (f > 0) {
      zones.push({
        name: "观景台 · " + (f + 1) + "楼",
        legend: names,
        rank: 4,
        minX: -DECK_R - 0.45,
        maxX: DECK_R + 0.45,
        minZ: DECK_CZ - 0.3,
        maxZ: DECK_CZ + DECK_R + 0.45,
        minY: f * STORY - 0.35,
        maxY: f * STORY + 2.4,
      });
    }
  }
  zones.push({
    name: "广场",
    legend: [],
    cat: 0,
    rank: 1,
    minX: PLAZA.minX - 0.2,
    maxX: PLAZA.maxX + 0.2,
    minZ: SOUTH - 0.15,
    maxZ: PLAZA.maxZ + 0.2,
    minY: -0.4,
    maxY: 2.3,
  });

  const counts = new Map();
  for (let i = 0; i < HALLS.length; i++) counts.set(HALLS[i].cat, 0);
  for (let i = 0; i < frames.length; i++) {
    const cat = sites[frames[i].siteIndex].cat;
    if (counts.has(cat)) counts.set(cat, counts.get(cat) + 1);
  }
  const legend = [];
  for (let i = 0; i < HALLS.length; i++) {
    legend.push({ name: HALLS[i].name, cat: HALLS[i].cat, count: counts.get(HALLS[i].cat) });
  }

  const signs = [
    {
      text: "趣站博物馆",
      x: 0,
      y: DOOR_H + 1.68,
      z: SOUTH + WALL_T + 0.32,
      yaw: 0,
      w: 4.8,
      h: 0.64,
      facade: true,
    },
    {
      text: "入口",
      x: 0,
      y: DOOR_H + 1.02,
      z: SOUTH + WALL_T + 0.32,
      yaw: 0,
      w: 1.4,
      h: 0.4,
      facade: true,
    },
  ];
  for (let f = 0; f < floorCount; f++) {
    signs.push({
      text: (f + 1) + "F",
      x: LIFT.xDoor + 0.14,
      y: f * STORY + DOOR_H + 0.36,
      z: LIFT.cz,
      yaw: Math.PI / 2,
      w: 0.78,
      h: 0.34,
    });
  }

  const walls = stone.concat(corners, white, curb, blocks);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.minX < minX) minX = w.minX;
    if (w.maxX > maxX) maxX = w.maxX;
    if (w.minZ < minZ) minZ = w.minZ;
    if (w.maxZ > maxZ) maxZ = w.maxZ;
  }

  return {
    walls,
    stone,
    corners,
    bandCorners,
    white,
    curb,
    liners,
    blocks,
    frames,
    plants,
    yard,
    cones,
    dress,
    openings,
    slabs,
    ceils,
    floorPlates,
    ceilPlates,
    extinguishers: props.extinguishers,
    tables: props.tables,
    lobes,
    handrails,
    zones,
    floors: floorCount,
    floorNames,
    legend,
    signs,
    bounds: { minX, maxX, minZ, maxZ },
    interior: { minX: -INNER + 0.02, maxX: INNER - 0.02, minZ: NORTH + 0.02, maxZ: SOUTH - 0.02 },
    spawn: { x: 0, z: PLAZA_CROSS_Z + 2.8 },
    stair: {
      f1x0: F1_X0,
      f1x1: F1_X1,
      f1z0: F1_Z0,
      f1z1: F1_Z1,
      f2x0: F2_X0,
      f2x1: F2_X1,
      f2z0: F2_Z0,
      f2z1: F2_Z1,
      landX0: LAND_X0,
      landX1: LAND_X1,
      landZ0: LAND_Z0,
      landZ1: LAND_Z1,
      half: HALF,
      run: RUN,
    },
    deck: { x: 0, z: DECK_CZ, r: DECK_R },
  };
}
