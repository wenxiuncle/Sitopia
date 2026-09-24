import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_PEOPLE = 24;
const LOG_MAX = 40;

function cleanName(value) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 12);
  return text || "访客";
}

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
}

function cleanPose(msg) {
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

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeText(text) {
  return encodeFrame(0x1, Buffer.from(text));
}

export function attachLobby(server) {
  const people = new Map();
  const log = [];

  function send(socket, obj) {
    if (socket.destroyed) return;
    try {
      socket.write(encodeText(JSON.stringify(obj)));
    } catch {
      socket.destroy();
    }
  }

  function broadcast(obj, exceptId) {
    const frame = encodeText(JSON.stringify(obj));
    for (const person of people.values()) {
      if (person.id === exceptId || person.socket.destroyed) continue;
      try {
        person.socket.write(frame);
      } catch {
        person.socket.destroy();
      }
    }
  }

  function uniqueName(name, exceptId) {
    const used = new Set();
    for (const person of people.values()) {
      if (person.id === exceptId || !person.named) continue;
      used.add(person.name);
    }
    if (!used.has(name)) return name;
    for (let i = 2; i < 100; i++) {
      const next = (name + i).slice(0, 12);
      if (!used.has(next)) return next;
    }
    return name.slice(0, 8) + "客";
  }

  function namedCount() {
    let n = 0;
    for (const person of people.values()) if (person.named && !person.away) n++;
    return n;
  }

  function snapshot(exceptId) {
    const list = [];
    for (const person of people.values()) {
      if (person.id === exceptId || !person.named || person.away) continue;
      list.push({ id: person.id, name: person.name, x: person.x, z: person.z, yaw: person.yaw });
    }
    return list;
  }

  function drop(person) {
    if (!person || person.gone) return;
    person.gone = true;
    people.delete(person.id);
    if (person.named && !person.away) {
      broadcast({ t: "bye", id: person.id, name: person.name, n: namedCount() });
    }
    if (!person.socket.destroyed) person.socket.destroy();
  }

  function onText(person, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== "string") return;
    person.seen = Date.now();
    if (msg.t === "hi" && !person.named) {
      if (namedCount() >= MAX_PEOPLE) {
        send(person.socket, { t: "full" });
        person.socket.end();
        return;
      }
      person.name = uniqueName(cleanName(msg.name), person.id);
      person.named = true;
      person.away = msg.away === true;
      const n = namedCount();
      send(person.socket, {
        t: "welcome",
        id: person.id,
        name: person.name,
        away: person.away,
        n,
        people: snapshot(person.id),
        log: log.slice(),
      });
      if (!person.away) {
        broadcast({
          t: "join",
          id: person.id,
          name: person.name,
          x: person.x,
          z: person.z,
          yaw: person.yaw,
          n,
        }, person.id);
      }
      return;
    }
    if (!person.named) return;
    if (msg.t === "away") {
      if (person.away) return;
      person.away = true;
      broadcast({ t: "bye", id: person.id, name: person.name, n: namedCount() }, person.id);
      return;
    }
    if (msg.t === "back") {
      if (!person.away) return;
      person.away = false;
      broadcast({
        t: "join",
        id: person.id,
        name: person.name,
        x: person.x,
        z: person.z,
        yaw: person.yaw,
        n: namedCount(),
      }, person.id);
      return;
    }
    if (msg.t === "name") {
      const now = Date.now();
      if (now - person.lastName < 400) return;
      const next = uniqueName(cleanName(msg.name), person.id);
      if (next === person.name) return;
      person.lastName = now;
      person.name = next;
      const note = { t: "name", id: person.id, name: person.name };
      if (person.away) send(person.socket, note);
      else broadcast(note);
      return;
    }
    if (msg.t === "move") {
      const now = Date.now();
      if (now - person.lastMove < 45) return;
      const pose = cleanPose(msg);
      if (!pose) return;
      person.lastMove = now;
      person.x = pose.x;
      person.z = pose.z;
      person.yaw = pose.yaw;
      if (person.away) return;
      broadcast({ t: "move", id: person.id, x: pose.x, z: pose.z, yaw: pose.yaw }, person.id);
      return;
    }
    if (msg.t === "say") {
      if (person.away) return;
      const now = Date.now();
      if (now - person.lastSay < 450) return;
      const text = cleanText(msg.text);
      if (!text) return;
      person.lastSay = now;
      const line = { t: "say", id: person.id, name: person.name, text, at: now };
      log.push(line);
      if (log.length > LOG_MAX) log.shift();
      broadcast(line);
    }
  }

  function adopt(socket) {
    const person = {
      id: crypto.randomBytes(3).toString("hex"),
      name: "",
      named: false,
      x: 0,
      z: 15.5,
      yaw: 0,
      away: false,
      socket,
      buf: null,
      seen: Date.now(),
      lastMove: 0,
      lastSay: 0,
      lastName: 0,
      gone: false,
    };
    socket.on("data", (chunk) => {
      person.buf = person.buf ? Buffer.concat([person.buf, chunk]) : chunk;
      if (person.buf.length > 65536) {
        socket.destroy();
        return;
      }
      for (;;) {
        if (!person.buf || person.buf.length < 2) return;
        const b0 = person.buf[0];
        const b1 = person.buf[1];
        if ((b0 & 0x70) !== 0 || (b0 & 0x80) === 0) {
          socket.destroy();
          return;
        }
        const opcode = b0 & 0x0f;
        let len = b1 & 0x7f;
        let off = 2;
        if (len === 126) {
          if (person.buf.length < 4) return;
          len = person.buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (person.buf.length < 10) return;
          const big = person.buf.readBigUInt64BE(2);
          if (big > 16384n) {
            socket.destroy();
            return;
          }
          len = Number(big);
          off = 10;
        }
        if (len > 16384) {
          socket.destroy();
          return;
        }
        const masked = (b1 & 0x80) !== 0;
        if (!masked) {
          socket.destroy();
          return;
        }
        if (person.buf.length < off + 4 + len) return;
        const mask = person.buf.subarray(off, off + 4);
        const payload = Buffer.from(person.buf.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        person.buf = person.buf.subarray(off + 4 + len);
        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode === 0x9) {
          person.seen = Date.now();
          try {
            socket.write(encodeFrame(0xa, payload));
          } catch {
            socket.destroy();
          }
          continue;
        }
        if (opcode === 0xa) {
          // 页面在后台时走动停了，浏览器仍会回 pong。算作还在，免得掐线重连，别人看见离开又进入。
          person.seen = Date.now();
          continue;
        }
        if (opcode === 0x1) onText(person, payload.toString("utf8"));
      }
    });
    socket.on("close", () => drop(person));
    socket.on("error", () => drop(person));
    people.set(person.id, person);
    return person;
  }

  function onUpgrade(req, socket) {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://127.0.0.1").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/lobby") {
      socket.destroy();
      return;
    }
    const key = req.headers["sec-websocket-key"];
    if (!key || Array.isArray(key)) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    adopt(socket);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept + "\r\n\r\n",
    );
  }

  server.on("upgrade", onUpgrade);
  const timer = setInterval(() => {
    const now = Date.now();
    const ping = encodeFrame(0x9, Buffer.alloc(0));
    for (const person of people.values()) {
      if (now - person.seen > 45000) {
        person.socket.destroy();
        continue;
      }
      if (person.socket.destroyed) continue;
      try {
        person.socket.write(ping);
      } catch {
        person.socket.destroy();
      }
    }
  }, 20000);
  timer.unref();

  return {
    close() {
      clearInterval(timer);
      server.off("upgrade", onUpgrade);
      for (const person of Array.from(people.values())) person.socket.destroy();
    },
  };
}
