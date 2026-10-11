// 接待机器人的走动。不画东西。朝向只用 basis 里的那一套。
import { forwardFromYaw } from "./basis.js";
import { PLAYER_RADIUS, RECEPTION, receptionObstacles } from "./layout.js";

// 座身 0.7×0.56，整机缩放 1.3。外接圆当实体半径，转身时盒子大小不变，人碰不到角上。
const MODEL_SCALE = 1.3;
export const ROBOT_RADIUS = Math.hypot(0.35, 0.28) * MODEL_SCALE;
const ROBOT_HEIGHT = 1.34 * MODEL_SCALE;
// 原来 0.85，减慢两成。
export const ROBOT_SPEED = 0.68;
// 大约每秒 24 度，直角要转将近四秒。
const TURN_RATE = 0.42;
const REST_SECONDS = 10;

const boxes = receptionObstacles();
const fwd = {
  x: 0,
  y: 0,
  z: -1,
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  },
};

function inPen(x, z) {
  return x > RECEPTION.minX + ROBOT_RADIUS
    && x < RECEPTION.maxX - ROBOT_RADIUS
    && z > RECEPTION.minZ + ROBOT_RADIUS
    && z < RECEPTION.maxZ - ROBOT_RADIUS;
}

function hitsBox(x, z, box) {
  return x > box.minX - ROBOT_RADIUS
    && x < box.maxX + ROBOT_RADIUS
    && z > box.minZ - ROBOT_RADIUS
    && z < box.maxZ + ROBOT_RADIUS;
}

function hitsCrowd(x, z, people) {
  const reach = ROBOT_RADIUS + PLAYER_RADIUS + 0.06;
  const reach2 = reach * reach;
  if (!people) return false;
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    if (!person) continue;
    const y = person.y || 0;
    if (y < -0.4 || y > 2.4) continue;
    const dx = x - person.x;
    const dz = z - person.z;
    if (dx * dx + dz * dz < reach2) return true;
  }
  return false;
}

function busy(x, z, people) {
  if (!inPen(x, z)) return true;
  for (let i = 0; i < boxes.length; i++) {
    if (hitsBox(x, z, boxes[i])) return true;
  }
  return hitsCrowd(x, z, people);
}

function ahead(x, z, yaw, people) {
  forwardFromYaw(yaw, fwd);
  if (busy(x + fwd.x * 0.38, z + fwd.z * 0.38, people)) return true;
  return busy(x + fwd.x * 0.78, z + fwd.z * 0.78, people);
}

function steer(state, people) {
  let yaw = state.yaw;
  for (let i = 0; i < 8; i++) {
    const turn = (1.15 + Math.random() * 2.6) * (Math.random() < 0.5 ? -1 : 1);
    yaw = state.yaw + turn;
    if (!ahead(state.x, state.z, yaw, people)) return yaw;
  }
  return state.yaw + Math.PI * (0.55 + Math.random() * 0.7);
}

function shortest(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// 对着 face 慢慢转。转完才返回 true。转的时候不往前走。
function turnToward(state, dt) {
  const delta = shortest(state.yaw, state.face);
  const left = Math.abs(delta);
  if (left < 0.012) {
    state.yaw = state.face;
    return true;
  }
  const step = Math.min(TURN_RATE * dt, left);
  state.yaw += delta > 0 ? step : -step;
  return false;
}

function nextRest() {
  return 26 + Math.random() * 34;
}

export function receptionBody(x, z) {
  const r = ROBOT_RADIUS;
  return {
    minX: x - r,
    maxX: x + r,
    minZ: z - r,
    maxZ: z + r,
    base: 0,
    h: ROBOT_HEIGHT,
  };
}

export function createReceptionState(home) {
  return {
    x: home.x,
    z: home.z,
    yaw: home.yaw,
    face: home.yaw,
    hold: 0,
    wander: 2 + Math.random() * 3,
    pauseIn: 12 + Math.random() * 16,
  };
}

// 前方有人、有柱边的灭火器，或走到范围边上，就换个方向，原地慢慢转过去。
// 走一阵会自己站定十秒。卡片开着时不要调用，计时才停得住。
export function stepReception(state, dt, people) {
  if (!state || dt <= 0) return;
  if (state.hold > 0) {
    state.hold -= dt;
    if (state.hold < 0) state.hold = 0;
    return;
  }
  if (!turnToward(state, dt)) return;
  state.wander -= dt;
  state.pauseIn -= dt;
  if (state.pauseIn <= 0) {
    state.hold = REST_SECONDS;
    state.pauseIn = nextRest();
    return;
  }
  const blocked = ahead(state.x, state.z, state.yaw, people);
  if (blocked || state.wander <= 0) {
    state.face = steer(state, people);
    state.wander = 3.2 + Math.random() * 4.2;
    return;
  }
  forwardFromYaw(state.yaw, fwd);
  const nx = state.x + fwd.x * ROBOT_SPEED * dt;
  const nz = state.z + fwd.z * ROBOT_SPEED * dt;
  if (busy(nx, nz, people)) {
    state.face = steer(state, people);
    state.wander = 3.2 + Math.random() * 4.2;
    return;
  }
  state.x = nx;
  state.z = nz;
}
