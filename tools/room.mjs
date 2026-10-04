// 线上同一套规则在 server/youqu-lobby/index.php。改这里时那份一起改。
// 人数硬顶是 PEOPLE_CAP。后台可以把当前上限调低，不能再调高。
export const PEOPLE_CAP = 24;
export const MAX_PEOPLE = PEOPLE_CAP;
export const LOG_MAX = 40;
export const SOLO_MS = 45000;

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
    entered: 0,
    gone: false,
  };
}

export function namedCount(people) {
  let n = 0;
  for (const person of people.values()) if (person.named && !person.away && !person.gone) n++;
  return n;
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
  return { ok: true, row };
}

export function forgetSolo(solo, seat) {
  const clean = cleanSeat(seat);
  if (!clean) return false;
  return solo.delete(clean);
}

export function pruneSolo(solo, now) {
  for (const [seat, row] of solo) {
    if (!row || now - (row.seen || 0) > SOLO_MS) solo.delete(seat);
  }
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
      y: null,
    });
  }
  list.sort((a, b) => a.entered - b.entered);
  return list;
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
  }
  return { close: false, out };
}
