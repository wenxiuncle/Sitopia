import crypto from "node:crypto";
import { blankPerson, onClientMessage, onLeave } from "./room.mjs";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

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

  function deliver(person, result) {
    for (let i = 0; i < result.out.length; i++) {
      const ev = result.out[i];
      if (ev.who === "self") send(person.socket, ev.obj);
      else if (ev.who === "others") broadcast(ev.obj, person.id);
      else broadcast(ev.obj);
    }
    if (result.close) person.socket.end();
  }

  function drop(person) {
    if (!person || person.gone) return;
    const out = onLeave(people, person);
    for (let i = 0; i < out.length; i++) broadcast(out[i].obj);
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
    deliver(person, onClientMessage(people, log, person, msg, Date.now()));
  }

  function adopt(socket) {
    const person = blankPerson(crypto.randomBytes(3).toString("hex"), Date.now());
    person.socket = socket;
    person.buf = null;
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
