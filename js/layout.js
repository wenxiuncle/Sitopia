// 样式展厅：广场朝南，建筑沿 -Z 深入。碰撞墙和画框共用这一份盒子。
// 画框只挂在沿 X 的墙上，朝 ±Z，薄边在 Z，网格不再另转朝向。
// dress 里的格栅、玻璃、梁、屋顶只负责外观，不进 walls。

export const PLAYER_RADIUS = 0.34;
export const EYE = 1.62;
export const WALL_H = 5.05;
export const WALL_T = 0.4;
export const FLOOR_TILT = -Math.PI / 2;
export const CEIL_TILT = Math.PI / 2;
export const FRAME = { w: (0.9 * 3.7) / 1.8, h: 0.9, d: 0.06 };
export const PLAZA = { minX: -24, maxX: 24, minZ: 4.4, maxZ: 26 };

const ROWS = 3;
const PITCH_X = 2.2;
const MARGIN = 0.5;
const ROW_GAP = 0.36;
const ROW_BASE = 0.82;
const INNER = 18;
const DOOR = 2.2;
const SOUTH = 4;
const NORTH = -34;
const HALL_A = -10;
const HALL_B = -22;

export const HALLS = [
  { id: "qianqi", cat: 6, name: "千奇百怪", color: "#e4cbb8" },
];

export const ASSIGN_IDS = ["qianqi"];

const FRAME_PAPER = "#f7f5f2";

export function blocked(x, z, radius, walls) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (x > w.minX - radius && x < w.maxX + radius && z > w.minZ - radius && z < w.maxZ + radius) {
      return true;
    }
  }
  return false;
}

// 分轴滑动。调用方要把单步位移限制在墙厚以内，避免一步穿墙。
export function movePlayer(x, z, dx, dz, radius, walls) {
  const nx = x + dx;
  if (!blocked(nx, z, radius, walls)) x = nx;
  const nz = z + dz;
  if (!blocked(x, nz, radius, walls)) z = nz;
  return { x, z };
}

export function zoneAt(x, z, zones) {
  let found = null;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
    if (!found || zone.rank > found.rank) found = zone;
  }
  return found;
}

function rowY(r) {
  return ROW_BASE + FRAME.h / 2 + r * (FRAME.h + ROW_GAP);
}

function pushBox(list, minX, maxX, minZ, maxZ, h, tone) {
  if (maxX - minX < 0.04 || maxZ - minZ < 0.04) return;
  list.push({ minX, maxX, minZ, maxZ, h: h == null ? WALL_H : h, tone: tone || "stone" });
}

function pickQianqi(sites) {
  const list = [];
  const cat = HALLS[0].cat;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].cat !== cat) continue;
    list.push(i);
  }
  return list;
}

// sideCols：左右各空出几列。北墙各空一列，也就是每边少三件，避免贴到侧墙。
function placeFace(frames, sites, cursor, minX, maxX, cz, nz, cones, sideCols) {
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
      const y = rowY(r);
      if (x - FRAME.w / 2 < minX + 0.04 || x + FRAME.w / 2 > maxX - 0.04) {
        throw new Error("frame outside panel");
      }
      frames.push({
        x,
        y,
        z: faceZ,
        nx: 0,
        nz,
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
  cones.push({ x: sumX / placed, z: faceZ + nz * 2.5 });
}

function pushOut(dress, kind, axis, at, dir, min, max, minY, maxY, depth) {
  const a = at + dir * 0.02;
  const b = at + dir * depth;
  if (axis === "z") {
    dress.push({ kind, minX: min, maxX: max, minY, maxY, minZ: Math.min(a, b), maxZ: Math.max(a, b) });
  } else {
    dress.push({ kind, minZ: min, maxZ: max, minY, maxY, minX: Math.min(a, b), maxX: Math.max(a, b) });
  }
}

function addFacade(dress, axis, at, dir, min, max, gap) {
  pushOut(dress, "lattice", axis, at, dir, min, max, 3.42, 6.32, 0.2);
  pushOut(dress, "glass", axis, at, dir, min, max, 2.95, 3.42, 0.08);
  const along = axis === "z" ? "x" : "z";
  for (let t = min + 3.2; t < max - 0.4; t += 6.4) {
    if (gap && t > gap[0] && t < gap[1]) continue;
    if (along === "x") {
      const f0 = Math.min(at + dir * 0.18, at + dir * 0.32);
      const f1 = Math.max(at + dir * 0.18, at + dir * 0.32);
      dress.push({ kind: "fin", minX: t - 0.045, maxX: t + 0.045, minY: 3.5, maxY: 6.2, minZ: f0, maxZ: f1 });
    } else {
      const f0 = Math.min(at + dir * 0.18, at + dir * 0.32);
      const f1 = Math.max(at + dir * 0.18, at + dir * 0.32);
      dress.push({ kind: "fin", minZ: t - 0.045, maxZ: t + 0.045, minY: 3.5, maxY: 6.2, minX: f0, maxX: f1 });
    }
  }
  for (let t = min + 1.5; t < max - 0.3; t += 1.85) {
    if (gap && t > gap[0] && t < gap[1]) continue;
    if (along === "x") {
      const g0 = Math.min(at, at + dir * 0.045);
      const g1 = Math.max(at, at + dir * 0.045);
      dress.push({ kind: "groove", minX: t - 0.02, maxX: t + 0.02, minY: 0.15, maxY: 2.88, minZ: g0, maxZ: g1 });
    } else {
      const g0 = Math.min(at, at + dir * 0.045);
      const g1 = Math.max(at, at + dir * 0.045);
      dress.push({ kind: "groove", minZ: t - 0.02, maxZ: t + 0.02, minY: 0.15, maxY: 2.88, minX: g0, maxX: g1 });
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

function addBeam(dress, z, halfZ) {
  dress.push({
    kind: "beam",
    minX: -15.2,
    maxX: 15.2,
    minY: 4.52,
    maxY: 4.92,
    minZ: z - halfZ,
    maxZ: z + halfZ,
  });
}

export function buildMuseum(sites) {
  const chosen = pickQianqi(sites);
  const stone = [];
  const white = [];
  const curb = [];
  const liners = [];
  const T = WALL_T;

  pushBox(stone, -INNER - T, -DOOR, SOUTH, SOUTH + T);
  pushBox(stone, DOOR, INNER + T, SOUTH, SOUTH + T);
  pushBox(stone, -INNER - T, -INNER, NORTH - T, SOUTH + T);
  pushBox(stone, INNER, INNER + T, NORTH - T, SOUTH + T);
  pushBox(stone, -INNER - T, INNER + T, NORTH - T, NORTH);

  pushBox(curb, INNER + T, PLAZA.maxX + T, SOUTH, SOUTH + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, -INNER - T, SOUTH, SOUTH + T, 0.45, "curb");
  pushBox(curb, PLAZA.maxX, PLAZA.maxX + T, SOUTH + T, PLAZA.maxZ + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, PLAZA.minX, SOUTH + T, PLAZA.maxZ + T, 0.45, "curb");
  pushBox(curb, PLAZA.minX - T, PLAZA.maxX + T, PLAZA.maxZ, PLAZA.maxZ + T, 0.45, "curb");

  pushBox(white, -INNER, -DOOR, HALL_A - T / 2, HALL_A + T / 2, WALL_H, "white");
  pushBox(white, DOOR, INNER, HALL_A - T / 2, HALL_A + T / 2, WALL_H, "white");
  pushBox(white, -INNER, -DOOR, HALL_B - T / 2, HALL_B + T / 2, WALL_H, "white");
  pushBox(white, DOOR, INNER, HALL_B - T / 2, HALL_B + T / 2, WALL_H, "white");

  pushBox(white, 8.2, 8.95, -3.55, -2.8, WALL_H, "white");
  pushBox(white, -8.95, -8.2, -3.55, -2.8, WALL_H, "white");
  pushBox(white, 10.1, 10.85, -28.4, -27.65, WALL_H, "white");
  pushBox(white, -10.85, -10.1, -28.4, -27.65, WALL_H, "white");

  liners.push({ minX: -INNER - T, maxX: -DOOR, minZ: SOUTH - 0.05, maxZ: SOUTH + 0.01, h: WALL_H });
  liners.push({ minX: DOOR, maxX: INNER + T, minZ: SOUTH - 0.05, maxZ: SOUTH + 0.01, h: WALL_H });
  liners.push({ minX: -INNER - 0.01, maxX: -INNER + 0.05, minZ: NORTH, maxZ: SOUTH, h: WALL_H });
  liners.push({ minX: INNER - 0.05, maxX: INNER + 0.01, minZ: NORTH, maxZ: SOUTH, h: WALL_H });
  liners.push({ minX: -INNER, maxX: INNER, minZ: NORTH - 0.01, maxZ: NORTH + 0.008, h: WALL_H });

  const walls = stone.concat(white, curb);
  const frames = [];
  const cones = [];
  const cursor = { i: 0 };
  const panelL0 = -17.35;
  const panelL1 = -DOOR;
  const panelR0 = DOOR;
  const panelR1 = 17.35;
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_A, 1, cones);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_A, 1, cones);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_B, 1, cones);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_B, 1, cones);
  placeFace(frames, chosen, cursor, -INNER, INNER, NORTH - T / 2, 1, cones, 1);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_A, -1, cones);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_A, -1, cones);
  placeFace(frames, chosen, cursor, panelL0, panelL1, HALL_B, -1, cones);
  placeFace(frames, chosen, cursor, panelR0, panelR1, HALL_B, -1, cones);

  const dress = [];
  addFacade(dress, "z", SOUTH + T, 1, -18.35, 18.35, [-2.7, 2.7]);
  addFacade(dress, "z", NORTH - T, -1, -18.35, 18.35);
  addFacade(dress, "x", INNER + T, 1, NORTH - 0.2, SOUTH + 0.2);
  addFacade(dress, "x", -INNER - T, -1, NORTH - 0.2, SOUTH + 0.2);
  dress.push({ kind: "roof", minX: -19.15, maxX: 19.15, minY: 6.28, maxY: 6.72, minZ: NORTH - 0.85, maxZ: SOUTH + T + 0.7 });
  const openings = [];
  // 玻璃和正门的受光口。平面退进室内一点，光斑才落在地板上。
  pushOpening(openings, "z", SOUTH - 0.02, 1, -18.35, 18.35, 2.95, 3.42, [-2.7, 2.7]);
  pushOpening(openings, "z", NORTH + 0.02, -1, -18.35, 18.35, 2.95, 3.42);
  pushOpening(openings, "x", INNER - 0.02, 1, NORTH + 0.2, SOUTH - 0.2, 2.95, 3.42);
  pushOpening(openings, "x", -INNER + 0.02, -1, NORTH + 0.2, SOUTH - 0.2, 2.95, 3.42);
  pushOpening(openings, "z", SOUTH - 0.02, 1, -DOOR, DOOR, 0, WALL_H);
  addBeam(dress, -2.2, 0.22);
  addBeam(dress, -6.4, 0.22);
  addBeam(dress, -14.2, 0.22);
  addBeam(dress, -18.2, 0.22);
  addBeam(dress, -26.2, 0.22);
  addBeam(dress, -30.4, 0.22);

  const plants = [
    { x: -13.2, z: -4.6, s: 1.35 },
    { x: 13.1, z: -16.2, s: 1.2 },
  ];

  const zones = [
    {
      name: "千奇百怪",
      cat: 6,
      rank: 3,
      minX: -INNER - 0.3,
      maxX: INNER + 0.3,
      minZ: NORTH - 0.3,
      maxZ: SOUTH + T + 0.08,
    },
    {
      name: "广场",
      cat: 0,
      rank: 1,
      minX: PLAZA.minX - 0.2,
      maxX: PLAZA.maxX + 0.2,
      minZ: SOUTH - 0.15,
      maxZ: PLAZA.maxZ + 0.2,
    },
  ];

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
    white,
    curb,
    liners,
    frames,
    plants,
    cones,
    dress,
    openings,
    zones,
    legend: [{ name: HALLS[0].name, cat: HALLS[0].cat, count: frames.length }],
    bounds: { minX, maxX, minZ, maxZ },
    interior: { minX: -INNER + 0.02, maxX: INNER - 0.02, minZ: NORTH + 0.02, maxZ: SOUTH + T },
    spawn: { x: 0, z: 15.5 },
  };
}
