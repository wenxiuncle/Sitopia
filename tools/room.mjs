export const MAX_PEOPLE = 24;
export const LOG_MAX = 40;

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
  let yaw = Number(msg.yaw);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return null;
  if (x < -40 || x > 40 || z < -50 || z > 40) return null;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return {
    x: Math.round(x * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    yaw: Math.round(yaw * 1000) / 1000,
  };
}

export function blankPerson(id, now) {
  return {
    id,
    name: "",
    named: false,
    x: 0,
    z: 15.5,
    yaw: 0,
    away: false,
    seen: now,
    lastMove: 0,
    lastSay: 0,
    lastName: 0,
    gone: false,
  };
}

function namedCount(people) {
  let n = 0;
  for (const person of people.values()) if (person.named && !person.away && !person.gone) n++;
  return n;
}

function snapshot(people, exceptId) {
  const list = [];
  for (const person of people.values()) {
    if (person.id === exceptId || !person.named || person.away || person.gone) continue;
    list.push({ id: person.id, name: person.name, x: person.x, z: person.z, yaw: person.yaw });
  }
  return list;
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

export function onClientMessage(people, log, person, msg, now) {
  const out = [];
  person.seen = now;
  if (msg.t === "hi" && !person.named) {
    if (namedCount(people) >= MAX_PEOPLE) {
      return { close: true, out: [{ who: "self", obj: { t: "full" } }] };
    }
    person.name = uniqueName(people, cleanName(msg.name), person.id);
    person.named = true;
    person.away = msg.away === true;
    const n = namedCount(people);
    out.push({
      who: "self",
      obj: {
        t: "welcome",
        id: person.id,
        name: person.name,
        away: person.away,
        n,
        people: snapshot(people, person.id),
        log: log.slice(),
      },
    });
    if (!person.away) {
      out.push({
        who: "others",
        obj: {
          t: "join",
          id: person.id,
          name: person.name,
          x: person.x,
          z: person.z,
          yaw: person.yaw,
          n,
        },
      });
    }
    return { close: false, out };
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
    out.push({
      who: "others",
      obj: {
        t: "join",
        id: person.id,
        name: person.name,
        x: person.x,
        z: person.z,
        yaw: person.yaw,
        n: namedCount(people),
      },
    });
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
    person.z = pose.z;
    person.yaw = pose.yaw;
    if (person.away) return { close: false, out };
    out.push({ who: "others", obj: { t: "move", id: person.id, x: pose.x, z: pose.z, yaw: pose.yaw } });
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
