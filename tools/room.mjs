// 线上同一套规则在 server/youqu-lobby/index.php。改这里时那份一起改。
// 人数硬顶是 PEOPLE_CAP。后台可以把当前上限调低，不能再调高。
// 来访表只给后台按天查看。PHP 那间房间不记这张表。
// 画框排列存在这间房间里。PHP 那间不存，展厅读不到时用原来的顺序。
// 琴声进度也在这间房间。有人站在展厅里才往下走，没人就停住。
// 电梯也只有这一台。呼叫并进同一组停靠，轿厢位置由这里往前算，各页跟着走。
// 顺序和音量也可以存在这里。没存过时，用 js/score.js 的默认曲目，音量按满。
import { occupiesHall, blocksLiftDoor, STORY, RECEPTION, receptionHome } from "../js/layout.js";
import { createLift } from "../js/lift.js";
import { asPlaylist, playableTracks, scoreTotal, wrapScore } from "../js/score.js";
import { readVolume } from "./audio-catalog.mjs";
import { cleanSign, readSignSpeed, signSpeed, DEFAULT_SIGN_SPEED } from "../js/sign.js";

export { cleanSign, readSignSpeed, signSpeed };

export { PIN_CAP, cleanArrange } from "../js/layout.js";
export const PEOPLE_CAP = 24;
export const MAX_PEOPLE = PEOPLE_CAP;
export const LOG_MAX = 40;
// 前台心跳大约 30 秒一次。页面在后台时，浏览器会把定时器放慢到大约 1 分钟。
// 短于这个间隔，同一次来访会在下一次心跳前被掐掉：离开时间被记回进馆那一下，停留就是 0 秒，下一分钟再记一条。
// 点开链接或把页面放到后台还要再留 10 分钟，所以这里留得更宽。关掉页面会立刻走 leave，不等这里。
export const SOLO_MS = 11 * 60 * 1000;
export const VISIT_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
export const VISIT_LIMIT = 500;
// 安静超过这段时间才把离开记到最后一次心跳。正常关页面仍记现在。
export const VISIT_IDLE_MS = 40000;

export function cleanMax(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > PEOPLE_CAP) return 0;
  return n;
}

export function cleanIp(value) {
  const text = String(value || "").trim();
  if (text.length < 3 || text.length > 64) return "";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text)) {
    const parts = text.split(".");
    for (let i = 0; i < 4; i++) if (Number(parts[i]) > 255) return "";
    return text;
  }
  if (/^[0-9A-Fa-f:]+$/.test(text) && text.includes(":")) return text;
  return "";
}

export function kickSpan(minutes) {
  return Number(minutes) === 1440 ? 1440 * 60 * 1000 : 10 * 60 * 1000;
}

export function kickUntil(kicks, seat, now) {
  if (!kicks || !seat) return 0;
  const until = Number(kicks[seat] || 0);
  return until > now ? until : 0;
}

export function pruneKicks(kicks, now) {
  const next = {};
  if (!kicks) return next;
  const seats = Object.keys(kicks);
  for (let i = 0; i < seats.length; i++) {
    const until = Number(kicks[seats[i]] || 0);
    if (until > now) next[seats[i]] = until;
  }
  return next;
}

export function cleanName(value) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 12);
  return text || "访客";
}

export function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
}

// 单人心跳上报高度和平面坐标。缺高度留空，后台楼层显示「—」，不要当成 1F。
export function cleanHeight(value) {
  if (value == null || value === "") return null;
  const y = Number(value);
  if (!Number.isFinite(y) || y < -1 || y > 90) return null;
  return Math.round(y * 1000) / 1000;
}

export function cleanPlan(msg) {
  if (!msg) return null;
  const x = Number(msg.x);
  const z = Number(msg.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < -40 || x > 40 || z < -50 || z > 40) return null;
  return { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
}

export function cleanPose(msg) {
  const x = Number(msg.x);
  const z = Number(msg.z);
  const y = msg.y == null ? 0 : Number(msg.y);
  let yaw = Number(msg.yaw);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y) || !Number.isFinite(yaw)) return null;
  if (x < -40 || x > 40 || z < -50 || z > 40 || y < -1 || y > 90) return null;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return {
    x: Math.round(x * 1000) / 1000,
    y: Math.round(y * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    yaw: Math.round(yaw * 1000) / 1000,
  };
}

export function cleanSeat(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8,32}$/.test(text) ? text : "";
}

export function blankPerson(id, now) {
  return {
    id,
    name: "",
    named: false,
    x: 0,
    y: 0,
    z: 15.5,
    yaw: 0,
    away: false,
    seat: "",
    seen: now,
    lastMove: 0,
    lastSay: 0,
    lastName: 0,
    lastNote: 0,
    lastRobot: 0,
    entered: 0,
    gone: false,
  };
}

export function namedCount(people) {
  let n = 0;
  for (const person of people.values()) if (person.named && !person.away && !person.gone) n++;
  return n;
}

export function blankMusic(now) {
  return { pos: 0, at: Number(now) || 0, playing: false, volume: 100, tracks: null };
}

export function musicVolume(music) {
  const n = readVolume(music && music.volume);
  return n < 0 ? 100 : n;
}

export function musicPos(music, now) {
  if (!music) return 0;
  let pos = Number(music.pos) || 0;
  if (music.playing) pos += (Number(now) || 0) - (Number(music.at) || 0);
  return wrapScore(pos, scoreTotal(music.tracks));
}

export function musicView(music, now) {
  const at = Number(now) || Date.now();
  const view = {
    t: "music",
    pos: Math.round(musicPos(music, at)),
    playing: !!music.playing,
    at,
    volume: musicVolume(music),
  };
  if (Array.isArray(music && music.tracks)) {
    const playable = playableTracks(music.tracks) || [];
    const tracks = [];
    for (let i = 0; i < playable.length; i++) tracks.push({ file: playable[i].file, ms: playable[i].ms });
    view.tracks = tracks;
  }
  return view;
}

export function musicDesk(music) {
  const raw = music && Array.isArray(music.tracks) ? music.tracks : [];
  const tracks = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || !row.file) continue;
    tracks.push({ file: row.file, ms: row.ms, on: row.on !== false });
  }
  return {
    volume: musicVolume(music),
    tracks,
  };
}

// 先按旧曲目折住进度，再换成新顺序，避免保存时把时钟清零。
export function applyMusicDesk(music, body, now) {
  if (!music || !body || typeof body !== "object") return null;
  const volume = readVolume(body.volume);
  const tracks = asPlaylist(body.tracks);
  if (volume < 0 || !tracks) return null;
  const at = Number(now) || Date.now();
  foldMusic(music, at);
  music.volume = volume;
  music.tracks = tracks;
  music.pos = wrapScore(music.pos, scoreTotal(tracks));
  music.at = at;
  return musicView(music, at);
}

export function foldMusic(music, now) {
  const at = Number(now) || Date.now();
  music.pos = musicPos(music, at);
  music.at = at;
  return music;
}

export function restoreMusic(saved, now) {
  const at = Number(now) || Date.now();
  const music = blankMusic(at);
  if (!saved || typeof saved !== "object") return music;
  const tracks = asPlaylist(saved.tracks);
  if (tracks) music.tracks = tracks;
  const volume = readVolume(saved.volume);
  if (volume >= 0) music.volume = volume;
  const pos = Number(saved.pos);
  const stamp = Number(saved.at);
  if (Number.isFinite(pos)) music.pos = wrapScore(pos, scoreTotal(music.tracks));
  if (Number.isFinite(stamp) && stamp > 0) music.at = stamp;
  music.playing = saved.playing === true;
  return music;
}

function hallCrowd(people, solo) {
  let n = 0;
  if (people) {
    for (const person of people.values()) {
      if (!person || !person.named || person.away || person.gone) continue;
      if (occupiesHall(person.x, person.z)) n++;
    }
  }
  if (solo) {
    for (const row of solo.values()) {
      if (!row || row.away) continue;
      if (occupiesHall(row.x, row.z)) n++;
    }
  }
  return n;
}

// 有人在展厅里才播放。停的时候把进度折进 pos，再来的人从这里接着放。
export function syncMusic(music, people, solo, now) {
  if (!music) return null;
  const at = Number(now) || Date.now();
  if (!music.at) music.at = at;
  const want = hallCrowd(people, solo) > 0;
  if (want === !!music.playing) return null;
  if (music.playing) music.pos = musicPos(music, at);
  music.playing = want;
  music.at = at;
  return musicView(music, at);
}

export function attachMusic(events, music, now) {
  if (!events || !music) return;
  const view = musicView(music, now);
  for (let i = 0; i < events.length; i++) {
    const obj = events[i] && events[i].obj;
    if (obj && obj.t === "welcome") obj.music = view;
  }
}

function withSeat(item, person) {
  if (person.seat) item.seat = person.seat;
  return item;
}

function snapshot(people, exceptId) {
  const list = [];
  for (const person of people.values()) {
    if (person.id === exceptId || !person.named || person.away || person.gone) continue;
    list.push(withSeat({ id: person.id, name: person.name, x: person.x, y: person.y || 0, z: person.z, yaw: person.yaw }, person));
  }
  return list;
}

function present(person, people) {
  return withSeat({
    t: "join",
    id: person.id,
    name: person.name,
    x: person.x,
    y: person.y || 0,
    z: person.z,
    yaw: person.yaw,
    n: namedCount(people),
  }, person);
}

// 同一个标签页重连时沿用旧身份。返回被替换的连接，调用方负责关掉，不要再广播离开。
export function adoptSeat(people, person, seat) {
  const clean = cleanSeat(seat);
  if (!clean) return [];
  person.seat = clean;
  const prevs = [];
  for (const other of people.values()) {
    if (other.gone || other.id === person.id) continue;
    if (other.seat !== clean) continue;
    prevs.push(other);
  }
  if (!prevs.length) return [];
  let prev = prevs[0];
  for (let i = 1; i < prevs.length; i++) {
    const other = prevs[i];
    const namedWins = !!other.named !== !!prev.named && other.named;
    const newer = !!other.named === !!prev.named && (other.seen || 0) >= (prev.seen || 0);
    if (namedWins || newer) prev = other;
  }
  people.delete(person.id);
  for (let i = 0; i < prevs.length; i++) {
    prevs[i].gone = true;
    people.delete(prevs[i].id);
  }
  person.id = prev.id;
  person.name = prev.name;
  person.named = !!prev.named;
  person.x = prev.x;
  person.y = prev.y || 0;
  person.z = prev.z;
  person.yaw = prev.yaw || 0;
  person.away = !!prev.away;
  person.lastMove = prev.lastMove || 0;
  person.lastSay = prev.lastSay || 0;
  person.lastName = prev.lastName || 0;
  person.entered = prev.entered || person.entered || 0;
  person.seen = Math.max(person.seen || 0, prev.seen || 0);
  person.seat = clean;
  person.gone = false;
  people.set(person.id, person);
  return prevs;
}

function uniqueName(people, name, exceptId) {
  const used = new Set();
  for (const person of people.values()) {
    if (person.id === exceptId || !person.named || person.gone) continue;
    used.add(person.name);
  }
  if (!used.has(name)) return name;
  for (let i = 2; i < 100; i++) {
    const next = (name + i).slice(0, 12);
    if (!used.has(next)) return next;
  }
  return name.slice(0, 8) + "客";
}

export function onLeave(people, person) {
  if (!person || person.gone) return [];
  person.gone = true;
  people.delete(person.id);
  if (person.named && !person.away) {
    return [{ who: "all", obj: { t: "bye", id: person.id, name: person.name, n: namedCount(people) } }];
  }
  return [];
}

export const NOTE_MAX = 200;

export function cleanNote(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
}

export function blankRobot() {
  const home = receptionHome();
  return {
    x: home.x,
    z: home.z,
    yaw: home.yaw,
    driver: "",
    moving: false,
    poseAt: 0,
    sign: cleanSign(),
    speed: DEFAULT_SIGN_SPEED,
  };
}

export function cleanRobotPose(msg) {
  if (!msg) return null;
  const x = Number(msg.x);
  const z = Number(msg.z);
  let yaw = Number(msg.yaw);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return null;
  if (x < RECEPTION.minX + 0.2 || x > RECEPTION.maxX - 0.2) return null;
  if (z < RECEPTION.minZ + 0.2 || z > RECEPTION.maxZ - 0.2) return null;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return {
    x: Math.round(x * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    yaw: Math.round(yaw * 1000) / 1000,
  };
}

export function restoreRobot(saved) {
  const robot = blankRobot();
  const pose = cleanRobotPose(saved);
  if (pose) {
    robot.x = pose.x;
    robot.z = pose.z;
    robot.yaw = pose.yaw;
  }
  robot.sign = cleanSign(saved && saved.sign);
  robot.speed = signSpeed(saved && saved.speed);
  return robot;
}

export function signState(robot) {
  return {
    sign: cleanSign(robot && robot.sign),
    speed: signSpeed(robot && robot.speed),
  };
}

export function clearRobotFace(robot, id) {
  if (!robot || !robot.faceBy || robot.faceBy !== id) return null;
  robot.faceBy = "";
  robot.faceX = 0;
  robot.faceZ = 0;
  return { t: "robot-face", id, off: 1 };
}

export function takeRobotFace(robot, person, msg, now) {
  if (!robot || !person || person.away) return null;
  if (msg && msg.off) {
    const note = clearRobotFace(robot, person.id);
    return note ? { who: "others", obj: note } : null;
  }
  const x = Number(msg && msg.x);
  const z = Number(msg && msg.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < -80 || x > 80 || z < -80 || z > 80) return null;
  if (now - (person.lastFace || 0) < 80) return null;
  const rx = Math.round(x * 100) / 100;
  const rz = Math.round(z * 100) / 100;
  if (robot.faceBy === person.id && robot.faceX === rx && robot.faceZ === rz) return null;
  person.lastFace = now;
  robot.faceBy = person.id;
  robot.faceX = rx;
  robot.faceZ = rz;
  return { who: "others", obj: { t: "robot-face", id: person.id, x: rx, z: rz } };
}

export function robotView(robot) {
  return {
    t: "robot",
    x: robot.x,
    z: robot.z,
    yaw: robot.yaw,
    driver: robot.driver || "",
    moving: !!robot.moving,
    sign: cleanSign(robot && robot.sign),
    speed: signSpeed(robot && robot.speed),
  };
}

// 速度缺了或不是 0 到 100 的整数时不改，调用方按没保存处理。
export function setRobotSign(robot, value, speed) {
  if (!robot) return null;
  const level = readSignSpeed(speed);
  if (level < 0) return null;
  robot.sign = cleanSign(value);
  robot.speed = level;
  return signState(robot);
}

export function electDriver(people) {
  let best = null;
  for (const person of people.values()) {
    if (!person || !person.named || person.away || person.gone) continue;
    const earlier = !best || (person.entered || 0) < (best.entered || 0);
    const tie = best && (person.entered || 0) === (best.entered || 0) && String(person.id) < String(best.id);
    if (earlier || tie) best = person;
  }
  return best ? best.id : "";
}

// 有人在线才走。司机是最早进来、还没离开页面的那一位。位置只留这一份。
export function syncRobot(robot, people) {
  if (!robot) return null;
  const driver = electDriver(people);
  const moving = driver !== "";
  if (robot.driver === driver && !!robot.moving === moving) return null;
  robot.driver = driver;
  robot.moving = moving;
  return robotView(robot);
}

export function takeRobotPose(robot, person, msg, now) {
  if (!robot || !person || person.id !== robot.driver || !robot.moving) return null;
  if (now - (person.lastRobot || 0) < 80) return null;
  const pose = cleanRobotPose(msg);
  if (!pose) return null;
  person.lastRobot = now;
  robot.x = pose.x;
  robot.z = pose.z;
  robot.yaw = pose.yaw;
  robot.poseAt = now;
  return { who: "others", obj: robotView(robot) };
}

export function restoreNotes(saved) {
  const out = [];
  const raw = Array.isArray(saved) ? saved : [];
  for (let i = 0; i < raw.length && out.length < NOTE_MAX; i++) {
    const row = raw[i];
    if (!row) continue;
    const text = cleanNote(row.text);
    const at = Number(row.at);
    if (!text || !Number.isFinite(at)) continue;
    const kept = {
      id: String(row.id || at).slice(0, 48),
      name: cleanName(row.name),
      text,
      at,
    };
    const parent = String(row.parent || "").slice(0, 48);
    if (parent) kept.parent = parent;
    out.push(kept);
  }
  return out;
}

export function addNote(notes, person, text, now, parent) {
  if (!notes || !person || person.away) return null;
  if (now - (person.lastNote || 0) < 2500) return null;
  const clean = cleanNote(text);
  if (!clean) return null;
  person.lastNote = now;
  let parentId = String(parent || "").slice(0, 48);
  if (parentId) {
    let found = false;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i] && String(notes[i].id) === parentId) {
        found = true;
        break;
      }
    }
    if (!found) parentId = "";
  }
  const note = {
    id: String(person.id) + "-" + now,
    name: person.name,
    text: clean,
    at: now,
  };
  if (parentId) note.parent = parentId;
  notes.push(note);
  while (notes.length > NOTE_MAX) notes.shift();
  const out = { t: "note", id: note.id, name: note.name, text: note.text, at: note.at };
  if (parentId) out.parent = parentId;
  return out;
}

export function deskView(log, notes) {
  const chat = [];
  const lines = Array.isArray(log) ? log : [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.t !== "say" || !line.text) continue;
    chat.push({
      id: String(line.id || ""),
      name: line.name || "",
      text: line.text || "",
      at: Number(line.at) || 0,
    });
  }
  const board = [];
  const rows = Array.isArray(notes) ? notes : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const note = rows[i];
    if (!note || !note.text) continue;
    const row = {
      id: String(note.id || ""),
      name: note.name || "",
      text: note.text || "",
      at: Number(note.at) || 0,
    };
    if (note.parent) row.parent = String(note.parent);
    board.push(row);
  }
  return { chat, notes: board };
}

export function dropSay(log, spec) {
  if (!Array.isArray(log) || !spec) return null;
  const id = typeof spec.id === "string" ? spec.id.slice(0, 16) : "";
  const at = Number(spec.at);
  if (!id || !Number.isFinite(at)) return null;
  for (let i = 0; i < log.length; i++) {
    const line = log[i];
    if (!line || String(line.id || "") !== id || Number(line.at) !== at) continue;
    log.splice(i, 1);
    return { t: "say-drop", id, at };
  }
  return null;
}

export function dropNote(notes, spec) {
  if (!Array.isArray(notes) || !spec) return null;
  const id = typeof spec.id === "string" ? spec.id.slice(0, 48) : "";
  if (!id) return null;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!note || String(note.id || "") !== id) continue;
    notes.splice(i, 1);
    return { t: "note-drop", id };
  }
  return null;
}

export function attachDesk(events, robot, notes) {
  if (!events) return;
  for (let i = 0; i < events.length; i++) {
    const obj = events[i] && events[i].obj;
    if (!obj || obj.t !== "welcome") continue;
    if (robot) obj.robot = robotView(robot);
    if (notes) obj.notes = notes.slice();
  }
}

function welcome(person, people, log, resume) {
  const obj = {
    t: "welcome",
    id: person.id,
    name: person.name,
    away: person.away,
    n: namedCount(people),
    people: snapshot(people, person.id),
    log: log.slice(),
  };
  if (resume) obj.resume = true;
  return { who: "self", obj };
}

export function rememberSolo(solo, msg, now, ip) {
  const seat = cleanSeat(msg && msg.seat);
  if (!seat) return { error: "seat" };
  let row = solo.get(seat);
  if (!row) {
    row = { seat, name: "", ip: "", entered: now, seen: now, away: false };
    solo.set(seat, row);
  }
  row.name = cleanName(msg.name);
  row.seen = now;
  row.away = msg.away === true;
  if (ip) row.ip = ip;
  if (!row.entered) row.entered = now;
  const y = cleanHeight(msg.y);
  if (y != null) row.y = y;
  const plan = cleanPlan(msg);
  if (plan) {
    row.x = plan.x;
    row.z = plan.z;
  }
  return { ok: true, row };
}

export function forgetSolo(solo, seat) {
  const clean = cleanSeat(seat);
  if (!clean) return false;
  return solo.delete(clean);
}

export function pruneSolo(solo, now, expired) {
  for (const [seat, row] of solo) {
    if (!row || now - (row.seen || 0) > SOLO_MS) {
      solo.delete(seat);
      if (row && expired) expired.push(row);
    }
  }
}

export function shanghaiDay(ms) {
  const shifted = new Date(Number(ms) + 8 * 60 * 60 * 1000);
  if (Number.isNaN(shifted.getTime())) return "";
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function cleanDay(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const y = Number(text.slice(0, 4));
  const m = Number(text.slice(5, 7));
  const d = Number(text.slice(8, 10));
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return text;
}

export function dayBounds(day) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const start = Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export function visitLeftAt(seen, now) {
  const at = Number(now) || Date.now();
  const last = Number(seen) || 0;
  if (last > 0 && at - last > VISIT_IDLE_MS) return last;
  return at;
}

export function createVisitBook() {
  return { open: new Map(), closed: [], seq: 1 };
}

// 同一个座位还开着时只改最后的昵称、模式和地址，不另起一行。
export function beginVisit(book, row) {
  const seat = cleanSeat(row && row.seat);
  if (!seat) return null;
  const now = Number(row.now) || Date.now();
  const name = cleanName(row.name);
  const mode = row.mode === "solo" ? "solo" : "online";
  const ip = cleanIp(row.ip);
  const prev = book.open.get(seat);
  if (prev) {
    let changed = false;
    if (name && name !== prev.nameLast) {
      prev.nameLast = name;
      changed = true;
    }
    if (ip && ip !== prev.ip) {
      prev.ip = ip;
      changed = true;
    }
    if (mode !== prev.mode) {
      prev.mode = mode;
      changed = true;
    }
    if (now - (prev.seen || 0) >= 15000) {
      prev.seen = now;
      changed = true;
    }
    return { created: false, changed, visit: prev };
  }
  const visit = {
    id: book.seq++,
    seat,
    mode,
    nameIn: name,
    nameLast: name,
    ip: ip || "",
    entered: now,
    seen: now,
    leftAt: 0,
  };
  book.open.set(seat, visit);
  return { created: true, changed: true, visit };
}

export function finishVisit(book, seat, leftAt, remember) {
  const clean = cleanSeat(seat);
  if (!clean) return null;
  const visit = book.open.get(clean);
  if (!visit) return null;
  book.open.delete(clean);
  let at = Number(leftAt) || Date.now();
  if (at < visit.entered) at = visit.entered;
  visit.leftAt = at;
  if (remember !== false && book.closed) book.closed.push(visit);
  return visit;
}

export function pruneBook(book, now) {
  const cut = (Number(now) || Date.now()) - VISIT_KEEP_MS;
  if (!book.closed || !book.closed.length) return;
  const next = [];
  for (let i = 0; i < book.closed.length; i++) {
    const row = book.closed[i];
    if ((row.leftAt || row.entered) >= cut) next.push(row);
  }
  book.closed = next;
}

export function visitView(row) {
  const nameIn = row.nameIn || row.name_in || "";
  return {
    mode: row.mode === "solo" ? "solo" : "online",
    nameIn,
    nameLast: row.nameLast || row.name_last || nameIn,
    ip: row.ip || "",
    entered: Number(row.entered) || 0,
    leftAt: Number(row.leftAt != null ? row.leftAt : row.left_at) || 0,
  };
}

export function visitsOnDay(book, day, limit) {
  const clean = cleanDay(day);
  if (!clean) return { visits: [], truncated: false };
  const cap = limit || VISIT_LIMIT;
  const { start, end } = dayBounds(clean);
  const all = [];
  if (book.closed) {
    for (let i = 0; i < book.closed.length; i++) all.push(book.closed[i]);
  }
  for (const row of book.open.values()) all.push(row);
  const list = [];
  for (let i = 0; i < all.length; i++) {
    const row = all[i];
    if (row.entered >= start && row.entered < end) list.push(row);
  }
  list.sort((a, b) => b.entered - a.entered || (b.id || 0) - (a.id || 0));
  const sliced = list.length > cap ? list.slice(0, cap) : list;
  const visits = [];
  for (let i = 0; i < sliced.length; i++) visits.push(visitView(sliced[i]));
  return { visits, truncated: list.length > cap };
}

// 近 30 天按入馆的北京时间计次。没有来访的日子也占一格，次数是 0。
export const VISIT_TREND_DAYS = 30;

export function emptyVisitTrend(now, days) {
  const span = days || VISIT_TREND_DAYS;
  const today = shanghaiDay(now);
  const end = dayBounds(today).end;
  const start = end - span * 24 * 60 * 60 * 1000;
  const step = 24 * 60 * 60 * 1000;
  const points = [];
  for (let i = 0; i < span; i++) {
    points.push({ day: shanghaiDay(start + i * step + 12 * 60 * 60 * 1000), count: 0 });
  }
  return { start, end, points };
}

export function addVisitTrend(trend, entered) {
  const at = Number(entered) || 0;
  if (at < trend.start || at >= trend.end) return;
  const index = Math.floor((at - trend.start) / (24 * 60 * 60 * 1000));
  if (trend.points[index]) trend.points[index].count += 1;
}

export function visitTrend(book, now, days) {
  const trend = emptyVisitTrend(now, days);
  if (book && book.closed) {
    for (let i = 0; i < book.closed.length; i++) addVisitTrend(trend, book.closed[i].entered);
  }
  if (book && book.open) {
    for (const row of book.open.values()) addVisitTrend(trend, row.entered);
  }
  return trend.points;
}

export function adminPeople(people, solo, now) {
  pruneSolo(solo, now);
  const onlineSeats = new Set();
  const list = [];
  for (const person of people.values()) {
    if (!person || !person.named || person.gone) continue;
    if (person.seat) onlineSeats.add(person.seat);
    list.push({
      mode: "online",
      id: person.id,
      seat: person.seat || "",
      name: person.name || "",
      ip: person.ip || "",
      entered: person.entered || person.seen || now,
      seen: person.seen || now,
      away: !!person.away,
      y: person.y || 0,
    });
  }
  for (const row of solo.values()) {
    if (onlineSeats.has(row.seat)) continue;
    list.push({
      mode: "solo",
      id: "",
      seat: row.seat,
      name: row.name || "",
      ip: row.ip || "",
      entered: row.entered || row.seen || now,
      seen: row.seen || now,
      away: !!row.away,
      y: cleanHeight(row.y),
    });
  }
  list.sort((a, b) => a.entered - b.entered);
  return list;
}

// 楼层够用即可。馆内实际层数更少，页面也不会呼叫超出自己那栋楼的层。
const LIFT_FLOORS = 64;
const LIFT_SEND_MS = 80;

export function createSharedLift(now) {
  return {
    sim: createLift(LIFT_FLOORS, STORY),
    at: Number(now) || Date.now(),
    key: "",
    phase: "",
    sentAt: 0,
  };
}

export function restoreSharedLift(saved, now) {
  const at = Number(now) || Date.now();
  const shared = createSharedLift(at);
  if (!saved || typeof saved !== "object") return shared;
  const stamp = Number(saved.at) || 0;
  if (!stamp || at - stamp > 120000) {
    const y = Number(saved.y);
    const floor = Number.isFinite(y) ? Math.round(y / STORY) : 0;
    shared.sim.place(floor);
    return shared;
  }
  shared.sim.adopt(saved);
  shared.at = stamp;
  return shared;
}

function liftKey(view) {
  return view.phase + "|" + view.dir + "|" + view.current + "|" + view.dest + "|" + view.y + "|" + view.door + "|" + view.stops.join(",");
}

export function liftView(shared) {
  const sim = shared.sim;
  return {
    t: "lift",
    y: Math.round(sim.y * 1000) / 1000,
    door: Math.round(sim.door * 1000) / 1000,
    vel: Math.round(sim.vel * 1000) / 1000,
    phase: sim.phase,
    dir: sim.dir,
    current: sim.current,
    dest: sim.dest,
    stops: sim.list(),
    at: shared.at,
  };
}

export function liftBusy(shared) {
  if (!shared || !shared.sim) return false;
  const sim = shared.sim;
  return sim.phase !== "idle" || sim.door > 0.001 || sim.list().length > 0;
}

function liftBlocked(people, cabY) {
  if (!people) return false;
  for (const person of people.values()) {
    if (!person || person.gone || person.away || !person.named) continue;
    if (blocksLiftDoor(person.x, person.z, person.y || 0, cabY)) return true;
  }
  return false;
}

export function advanceLift(shared, people, now) {
  if (!shared || !shared.sim) return;
  const at = Number(now) || Date.now();
  let gap = (at - (Number(shared.at) || at)) / 1000;
  if (gap < 0) gap = 0;
  if (gap > 70) gap = 70;
  shared.at = at;
  let left = gap;
  let steps = 0;
  while (left > 0.0001 && steps < 2200) {
    const sim = shared.sim;
    if (sim.phase === "idle" && sim.door <= 0.001 && !sim.list().length) break;
    sim.tick(Math.min(left, 1 / 30), liftBlocked(people, sim.y));
    left -= 1 / 30;
    steps += 1;
  }
}

function publishLift(shared, view, force) {
  const key = liftKey(view);
  const phaseChanged = view.phase !== shared.phase;
  const stopsChanged = key.slice(key.lastIndexOf("|")) !== String(shared.key || "").slice(String(shared.key || "").lastIndexOf("|"));
  if (!force && key === shared.key) return null;
  if (!force && !phaseChanged && !stopsChanged && (Number(view.at) || 0) - (shared.sentAt || 0) < LIFT_SEND_MS) return null;
  shared.key = key;
  shared.phase = view.phase;
  shared.sentAt = Number(view.at) || 0;
  return view;
}

export function pumpLift(shared, people, now) {
  if (!shared) return null;
  advanceLift(shared, people, now);
  return publishLift(shared, liftView(shared), false);
}

export function takeLiftCall(shared, people, person, msg, now) {
  if (!shared || !shared.sim || !person || person.away) return null;
  if ((Number(now) || 0) - (person.lastLift || 0) < 50) return null;
  const floor = Math.floor(Number(msg && msg.floor));
  if (!Number.isFinite(floor) || floor < 0 || floor >= LIFT_FLOORS) return null;
  person.lastLift = now;
  advanceLift(shared, people, now);
  if (msg.on === 0 || msg.on === false) shared.sim.cancel(floor);
  else shared.sim.call(floor);
  const view = liftView(shared);
  return publishLift(shared, view, true);
}

export function attachLift(events, shared) {
  if (!events || !shared) return;
  const view = liftView(shared);
  for (let i = 0; i < events.length; i++) {
    const obj = events[i] && events[i].obj;
    if (!obj || obj.t !== "welcome") continue;
    obj.lift = view;
  }
}

export function onClientMessage(people, log, person, msg, now, room) {
  const limit = cleanMax(room && room.maxPeople) || MAX_PEOPLE;
  const out = [];
  if (msg.t === "pong") {
    if (person.named) {
      person.seen = now;
      person.pings = true;
    }
    return { close: false, out };
  }
  person.seen = now;
  if (msg.t === "hi") {
    const dropped = adoptSeat(people, person, msg.seat);
    for (let i = 0; i < dropped.length; i++) {
      const prev = dropped[i];
      if (prev.id === person.id || !prev.named || prev.away) continue;
      out.push({ who: "all", obj: { t: "bye", id: prev.id, name: prev.name, n: namedCount(people) } });
    }
    const until = kickUntil(room && room.kicks, person.seat, now);
    if (until) {
      return { close: true, out: [{ who: "self", obj: { t: "kick", until } }], drop: dropped };
    }
    if (person.named) {
      if (!person.entered) person.entered = now;
      const wasAway = person.away;
      person.away = msg.away === true;
      out.push(welcome(person, people, log, true));
      if (wasAway && !person.away) out.push({ who: "others", obj: present(person, people) });
      else if (!wasAway && person.away) {
        out.push({ who: "others", obj: { t: "bye", id: person.id, name: person.name, n: namedCount(people) } });
      }
      return { close: false, out, drop: dropped };
    }
    if (namedCount(people) >= limit) {
      return { close: true, out: [{ who: "self", obj: { t: "full" } }], drop: dropped };
    }
    person.name = uniqueName(people, cleanName(msg.name), person.id);
    person.named = true;
    if (!person.entered) person.entered = now;
    person.away = msg.away === true;
    out.push(welcome(person, people, log, false));
    if (!person.away) out.push({ who: "others", obj: present(person, people) });
    return { close: false, out, drop: dropped };
  }
  if (!person.named) return { close: false, out };
  if (msg.t === "away") {
    if (person.away) return { close: false, out };
    person.away = true;
    out.push({ who: "others", obj: { t: "bye", id: person.id, name: person.name, n: namedCount(people) } });
    return { close: false, out };
  }
  if (msg.t === "back") {
    if (!person.away) return { close: false, out };
    person.away = false;
    out.push({ who: "others", obj: present(person, people) });
    return { close: false, out };
  }
  if (msg.t === "name") {
    if (now - person.lastName < 400) return { close: false, out };
    const next = uniqueName(people, cleanName(msg.name), person.id);
    if (next === person.name) return { close: false, out };
    person.lastName = now;
    person.name = next;
    const note = { t: "name", id: person.id, name: person.name };
    out.push({ who: person.away ? "self" : "all", obj: note });
    return { close: false, out };
  }
  if (msg.t === "move") {
    if (now - person.lastMove < 45) return { close: false, out };
    const pose = cleanPose(msg);
    if (!pose) return { close: false, out };
    person.lastMove = now;
    person.x = pose.x;
    person.y = pose.y;
    person.z = pose.z;
    person.yaw = pose.yaw;
    if (person.away) return { close: false, out };
    out.push({ who: "others", obj: { t: "move", id: person.id, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw } });
    return { close: false, out };
  }
  if (msg.t === "say") {
    if (person.away) return { close: false, out };
    if (now - person.lastSay < 450) return { close: false, out };
    const text = cleanText(msg.text);
    if (!text) return { close: false, out };
    person.lastSay = now;
    const line = { t: "say", id: person.id, name: person.name, text, at: now };
    log.push(line);
    if (log.length > LOG_MAX) log.shift();
    out.push({ who: "all", obj: line });
    return { close: false, out };
  }
  if (msg.t === "robot") {
    const ev = room && room.robot ? takeRobotPose(room.robot, person, msg, now) : null;
    if (ev) out.push(ev);
    return { close: false, out };
  }
  if (msg.t === "robot-face") {
    const ev = room && room.robot ? takeRobotFace(room.robot, person, msg, now) : null;
    if (ev) out.push(ev);
    return { close: false, out };
  }
  if (msg.t === "note") {
    const note = room && room.notes ? addNote(room.notes, person, msg.text, now, msg.parent) : null;
    if (note) out.push({ who: "all", obj: note });
    return { close: false, out };
  }
  if (msg.t === "lift-call") {
    const view = room && room.lift ? takeLiftCall(room.lift, people, person, msg, now) : null;
    if (view) out.push({ who: "all", obj: view });
    return { close: false, out };
  }
  return { close: false, out };
}
