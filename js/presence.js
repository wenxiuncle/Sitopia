import { PLAZA, STORY, occupiesHall, zoneAt } from "./layout.js";
import { forwardFromYaw } from "./basis.js";
import { createCrowd } from "./avatar.js";

// 线上页面经 lobby.youquhome.com 转到 Cloudflare 房间。本机仍走自己的 /lobby。
const PUBLIC_LOBBY = "wss://lobby.youquhome.com/lobby";

const NAME_KEY = "quzhan-museum-name";
const NAMED_KEY = "quzhan-museum-named";
const MAP_KEY = "quzhan-museum-map";
const ONLINE_KEY = "quzhan-museum-online";
const SOLO_KEY = "quzhan-museum-solo";
const KICK_KEY = "quzhan-museum-kicked";
const BEAT_MS = 30000;
const BUBBLE_LIFE = 6000;
const HOLD_MS = 30000;
// 点画框白卡上的链接跳出去时，人先留在在线名单里，十分钟后仍没回来再离开。
const CARD_HOLD_MS = 10 * 60 * 1000;
const SEAT_KEY = "quzhan-museum-seat";

function readSeat() {
  let saved = "";
  try {
    saved = sessionStorage.getItem(SEAT_KEY) || "";
  } catch {
    saved = "";
  }
  if (/^[0-9a-f]{16}$/.test(saved)) return saved;
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let seat = "";
  for (let i = 0; i < bytes.length; i++) seat += bytes[i].toString(16).padStart(2, "0");
  try {
    sessionStorage.setItem(SEAT_KEY, seat);
  } catch {
    /* 这一页里照样沿用。 */
  }
  return seat;
}

function readStoredName() {
  try {
    return (localStorage.getItem(NAME_KEY) || "").trim().slice(0, 12);
  } catch {
    return "";
  }
}

function readConfirmed() {
  try {
    return localStorage.getItem(NAMED_KEY) === "1" && readStoredName().length > 0;
  } catch {
    return false;
  }
}

export function mountPresence(options) {
  const {
    scene,
    material,
    shadowMaterial,
    bounds,
    interior,
    getPose,
    zones,
    onTyping,
    onNav,
    onExclusive,
    onReleaseLook,
    onGate,
    onKick,
    onMusic,
  } = options;
  const corner = document.getElementById("corner");
  const mapCard = document.getElementById("map-card");
  const mapCanvas = document.getElementById("map");
  const mapToggle = document.getElementById("map-visible");
  const onlineToggle = document.getElementById("online-visible");
  const soloToggle = document.getElementById("solo-mode");
  const online = document.getElementById("online");
  const rosterEl = document.getElementById("roster");
  const toggle = document.getElementById("drawer-toggle");
  const drawer = document.getElementById("drawer");
  const peopleEl = document.getElementById("people");
  const logEl = document.getElementById("chat-log");
  const chatterEl = document.getElementById("chatter");
  const toasts = document.getElementById("toasts");
  const chatBar = document.getElementById("chat-bar");
  const chatInput = document.getElementById("chat-input");
  const selfBubble = document.getElementById("self-bubble");
  const nameGate = document.getElementById("name-gate");
  const kickGate = document.getElementById("kick-gate");
  const kickUntilEl = document.getElementById("kick-until");
  const kickBack = document.getElementById("kick-back");
  const nameInput = document.getElementById("name-input");
  const nameForm = document.getElementById("name-form");
  const navName = document.getElementById("nav-name");

  const crowd = createCrowd(scene, material, shadowMaterial);
  const roster = new Map();
  const seat = readSeat();
  const planFwd = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, x: 0, y: 0, z: -1 };
  const ctx = mapCanvas.getContext("2d");
  let me = null;
  let myName = readStoredName();
  let confirmed = readConfirmed();
  let linked = false;
  let socket = null;
  let http = null;
  let retry = 0;
  let dead = false;
  let publishAt = 0;
  let sentX = NaN;
  let sentY = NaN;
  let sentZ = NaN;
  let sentYaw = NaN;
  let selfBubbleUntil = 0;
  let composing = false;
  let showMap = true;
  let showOnline = true;
  let solo = false;
  let kickedUntil = 0;
  let beatTimer = 0;
  let kickClock = 0;
  let planAt = 0;
  let peopleAt = 0;
  let holdUntil = 0;
  let holdTimer = 0;
  let holdToken = 0;
  let sawHall = false;
  let wasInHall = false;
  let musicTimer = 0;

  corner.hidden = false;

  function rememberName(name) {
    myName = name;
    confirmed = true;
    try {
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(NAMED_KEY, "1");
    } catch {
      /* 记不住就这次先用着。 */
    }
  }

  function syncNameInputs(name) {
    nameInput.value = name;
    navName.value = name;
  }

  function send(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
    else if (http && !http.stopped) httpEnqueue(obj);
  }

  function hello() {
    return { t: "hi", name: myName, away: document.hidden, seat };
  }

  function beatAddress() {
    const address = lobbyAddress();
    if (!address) return "";
    if (address.startsWith("ws://") || address.startsWith("wss://")) {
      return address.replace(/^ws/, "http").replace(/\/lobby$/, "/lobby/beat");
    }
    if (address.startsWith("http://") || address.startsWith("https://")) {
      return address.replace(/\/lobby$/, "/lobby/beat");
    }
    return "";
  }

  function stillKicked() {
    return kickedUntil > Date.now();
  }

  function paintKick() {
    if (!kickUntilEl) return;
    if (kickedUntil <= Date.now()) {
      kickUntilEl.textContent = "可以重新进入了。";
      if (kickBack) kickBack.hidden = false;
      window.clearInterval(kickClock);
      kickClock = 0;
      return;
    }
    if (kickBack) kickBack.hidden = true;
    const when = new Date(kickedUntil).toLocaleString("zh-CN", {
      hour12: false,
      timeZone: "Asia/Shanghai",
    });
    kickUntilEl.textContent = "请在 " + when + " 之后再来。";
  }

  function stopBeat() {
    window.clearInterval(beatTimer);
    beatTimer = 0;
  }

  function showKick(until) {
    kickedUntil = Number(until) || (Date.now() + 10 * 60 * 1000);
    try {
      sessionStorage.setItem(KICK_KEY, String(kickedUntil));
    } catch {
      /* 这一页里照样停着。 */
    }
    stopBeat();
    if (kickGate) kickGate.hidden = false;
    if (onKick) onKick(true);
    if (onReleaseLook) onReleaseLook();
    online.textContent = "已请出";
    paintKick();
    window.clearInterval(kickClock);
    kickClock = window.setInterval(paintKick, 1000);
  }

  function applyKick(until) {
    dropLink();
    showKick(until);
  }

  function sendLeave() {
    const url = beatAddress().replace(/\/lobby\/beat$/, "/lobby/leave");
    if (!url || !seat || typeof navigator.sendBeacon !== "function") return;
    const body = new Blob(
      [JSON.stringify({ seat })],
      { type: "text/plain;charset=UTF-8" },
    );
    try {
      navigator.sendBeacon(url, body);
    } catch {
      /* 页面正在关。 */
    }
  }

  function sendBeat() {
    if (!solo || !confirmed || !myName || stillKicked()) return;
    const url = beatAddress();
    if (!url) return;
    const pose = getPose();
    const y = Number(pose.y);
    fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        name: myName,
        seat,
        away: document.hidden && !(holdUntil > Date.now()),
        y: Number.isFinite(y) ? y : 0,
        x: pose.x,
        z: pose.z,
      }),
    }).then(async (res) => {
      if (res.status === 403) {
        try {
          return await res.json();
        } catch {
          return null;
        }
      }
      if (!res.ok) return null;
      try {
        return await res.json();
      } catch {
        return null;
      }
    }).then((data) => {
      if (data && data.t === "kick") applyKick(data.until);
      else if (data && data.music && onMusic) onMusic(data.music);
    }).catch(() => {
      /* 下一轮心跳再试。 */
    });
  }

  function startBeat() {
    stopBeat();
    if (!solo || !confirmed || !myName || stillKicked()) return;
    sendBeat();
    beatTimer = window.setInterval(sendBeat, BEAT_MS);
  }

  function musicAddress() {
    const beat = beatAddress();
    if (!beat) return "";
    return beat.replace(/\/lobby\/beat$/, "/lobby/music");
  }

  function pollMusic() {
    if (!solo || dead || document.hidden || !confirmed || !myName || stillKicked()) return;
    const url = musicAddress();
    if (!url) return;
    fetch(url, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.t === "music" && onMusic) onMusic(data);
      })
      .catch(() => {});
  }

  function watchHall(pose) {
    const inside = occupiesHall(pose.x, pose.z);
    if (!sawHall) {
      sawHall = true;
      wasInHall = inside;
      return;
    }
    if (inside === wasInHall) return;
    wasInHall = inside;
    if (solo && confirmed && myName && !stillKicked()) sendBeat();
  }

  function rememberOther(person, snap) {
    if (!person || !person.id || (me && person.id === me.id)) return;
    if (person.seat) {
      for (const row of Array.from(roster.values())) {
        if (row.id !== person.id && row.seat === person.seat) {
          roster.delete(row.id);
          crowd.remove(row.id);
        }
      }
    }
    roster.set(person.id, person);
    crowd.upsert(person, snap);
  }

  function toast(text) {
    const el = document.createElement("p");
    el.className = "toast";
    el.textContent = text;
    toasts.append(el);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    window.setTimeout(() => el.remove(), 4200);
  }

  function setCount(n) {
    online.textContent = n + " 人在线";
  }

  function placeShort(x, z, y) {
    const zone = zones ? zoneAt(x, z, zones, y || 0) : null;
    if (zone && zone.name === "广场") return "广场";
    let floor = Math.round((y || 0) / STORY);
    if (floor < 0) floor = 0;
    return (floor + 1) + "楼";
  }

  function renderPeople() {
    const rows = Array.from(roster.values());
    rows.sort((a, b) => {
      if (me && a.id === me.id) return -1;
      if (me && b.id === me.id) return 1;
      return a.name.localeCompare(b.name, "zh");
    });
    peopleEl.replaceChildren();
    for (let i = 0; i < rows.length; i++) {
      const li = document.createElement("li");
      const row = rows[i];
      const pose = me && row.id === me.id ? getPose() : row;
      const where = placeShort(pose.x || 0, pose.z || 0, pose.y || 0);
      li.textContent = where + " · " + row.name + (me && row.id === me.id ? " · 你" : "");
      if (me && row.id === me.id) li.className = "me";
      peopleEl.append(li);
    }
  }

  function formatWhen(at) {
    const date = new Date(typeof at === "number" && Number.isFinite(at) ? at : Date.now());
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const clock = hh + ":" + mm;
    const now = new Date();
    if (
      date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
    ) {
      return clock;
    }
    return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + clock;
  }

  function appendLine(node) {
    logEl.prepend(node);
    while (logEl.children.length > 80) logEl.lastChild.remove();
    logEl.scrollTop = 0;
  }

  function pushChatter(msg) {
    if (!chatterEl || !msg || !msg.text) return;
    const li = document.createElement("li");
    li.textContent = msg.name + "：" + msg.text;
    chatterEl.prepend(li);
    while (chatterEl.children.length > 5) chatterEl.lastChild.remove();
  }

  function appendSay(msg) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "chat-meta";
    const who = document.createElement("b");
    who.textContent = msg.name || "";
    const when = document.createElement("time");
    when.className = "chat-time";
    const stamp = typeof msg.at === "number" && Number.isFinite(msg.at) ? msg.at : Date.now();
    when.dateTime = new Date(stamp).toISOString();
    when.textContent = formatWhen(stamp);
    meta.append(who, when);
    const body = document.createElement("div");
    body.className = "chat-text";
    body.textContent = msg.text || "";
    li.append(meta, body);
    appendLine(li);
    pushChatter(msg);
  }

  function appendSys(text) {
    const li = document.createElement("li");
    li.className = "sys";
    li.textContent = text;
    appendLine(li);
  }

  function showSelfBubble(text, now) {
    selfBubble.textContent = "你：" + text;
    selfBubble.hidden = false;
    selfBubbleUntil = now + BUBBLE_LIFE;
  }

  function onMessage(msg) {
    if (msg.t === "ping") {
      send({ t: "pong" });
      if (msg.music && onMusic) onMusic(msg.music);
      return;
    }
    if (msg.t === "music") {
      if (onMusic) onMusic(msg);
      return;
    }
    if (msg.t === "welcome") {
      const quiet = msg.resume === true && !!me;
      me = { id: msg.id, name: msg.name };
      rememberName(msg.name);
      syncNameInputs(msg.name);
      linked = true;
      roster.clear();
      crowd.clear();
      roster.set(msg.id, { id: msg.id, name: msg.name, x: 0, y: 0, z: 0 });
      const others = msg.people || [];
      for (let i = 0; i < others.length; i++) rememberOther(others[i], true);
      setCount(roster.size);
      renderPeople();
      if (!quiet) {
        logEl.replaceChildren();
        const history = msg.log || [];
        for (let i = 0; i < history.length; i++) appendSay(history[i]);
        if (!document.hidden) {
          if (others.length) toast("你进入了展厅，馆里已有 " + others.length + " 人");
          else toast("你进入了展厅");
        }
      }
      if (document.hidden) send({ t: "away" });
      else if (msg.away) send({ t: "back" });
      if (msg.music && onMusic) onMusic(msg.music);
      publishAt = 0;
      sentX = NaN;
      sentY = NaN;
      return;
    }
    if (msg.t === "join") {
      if (me && msg.id === me.id) return;
      const known = roster.has(msg.id);
      rememberOther(msg, true);
      setCount(roster.size);
      renderPeople();
      if (!known) {
        toast(msg.name + " 进入了展厅");
        appendSys(msg.name + " 进入了展厅");
      }
      return;
    }
    if (msg.t === "bye") {
      if (!roster.has(msg.id) || (me && msg.id === me.id)) return;
      roster.delete(msg.id);
      crowd.remove(msg.id);
      setCount(roster.size);
      renderPeople();
      if (msg.name) {
        toast(msg.name + " 离开了展厅");
        appendSys(msg.name + " 离开了展厅");
      }
      return;
    }
    if (msg.t === "name") {
      if (me && msg.id === me.id) {
        me.name = msg.name;
        rememberName(msg.name);
        syncNameInputs(msg.name);
      }
      const row = roster.get(msg.id);
      if (row) row.name = msg.name;
      crowd.rename(msg.id, msg.name);
      renderPeople();
      return;
    }
    if (msg.t === "move") {
      const row = roster.get(msg.id);
      if (!row || (me && msg.id === me.id)) return;
      row.x = msg.x;
      row.y = msg.y || 0;
      row.z = msg.z;
      crowd.upsert({
        id: msg.id,
        name: row.name || "",
        x: msg.x,
        y: msg.y || 0,
        z: msg.z,
        yaw: msg.yaw,
      }, false);
      return;
    }
    if (msg.t === "say") {
      appendSay(msg);
      const now = performance.now();
      if (me && msg.id === me.id) showSelfBubble(msg.text, now);
      else crowd.say(msg.id, msg.text, now);
      return;
    }
    if (msg.t === "kick") {
      applyKick(msg.until);
      return;
    }
    if (msg.t === "full") toast("展厅人满了");
  }

  function socketLive() {
    if (http && !http.stopped) return true;
    return socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }

  function lobbyAddress() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return proto + "//" + location.host + "/lobby";
    }
    const custom = new URLSearchParams(location.search).get("lobby");
    if (custom && /^(https?|wss?):\/\//.test(custom)) return custom;
    return PUBLIC_LOBBY;
  }

  function scheduleHttp(session) {
    window.clearTimeout(session.timer);
    if (session.stopped || session.inflight || http !== session) return;
    const urgent = session.queue.some((item) => item.t !== "move");
    const wait = session.queue.length ? (urgent ? 0 : 50) : (document.hidden ? 15000 : 200);
    session.timer = window.setTimeout(() => pumpHttp(session), wait);
  }

  function httpEnqueue(obj) {
    if (!http || http.stopped) return;
    if (obj.t === "move") {
      const idx = http.queue.findIndex((item) => item.t === "move");
      if (idx >= 0) http.queue[idx] = obj;
      else http.queue.push(obj);
    } else {
      http.queue.push(obj);
    }
    scheduleHttp(http);
  }

  function stopHttp(session) {
    session.stopped = true;
    window.clearTimeout(session.timer);
    if (http === session) http = null;
  }

  function beaconLeave(address, id) {
    if (!id || typeof navigator.sendBeacon !== "function") return;
    const body = new Blob(
      [JSON.stringify({ id, msgs: [{ t: "leave" }] })],
      { type: "text/plain;charset=UTF-8" },
    );
    try {
      navigator.sendBeacon(address, body);
    } catch {
      /* 页面正在关，留下的人等超时。 */
    }
  }

  function failHttp(session) {
    const id = session.id;
    const address = session.address;
    stopHttp(session);
    linked = false;
    if (id) beaconLeave(address, id);
    online.textContent = solo ? "单人" : (confirmed ? "未连接" : "先起个名字");
    window.clearTimeout(retry);
    if (stillKicked() || dead || document.hidden || !confirmed || solo) return;
    retry = window.setTimeout(arm, 1500);
  }

  function pumpHttp(session) {
    if (!session || session.stopped || session.inflight || http !== session) return;
    session.inflight = true;
    window.clearTimeout(session.timer);
    const msgs = session.queue.splice(0, 6);
    fetch(session.address, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ id: session.id, seat, msgs }),
    }).then(async (res) => {
      if (session.stopped || http !== session) return null;
      if (res.status === 429) {
        session.inflight = false;
        session.queue = msgs.concat(session.queue);
        session.timer = window.setTimeout(() => pumpHttp(session), 800);
        return null;
      }
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }).then((data) => {
      if (!data || session.stopped || http !== session) return;
      session.inflight = false;
      if (typeof data.id === "string" && data.id) session.id = data.id;
      const events = data.events || [];
      for (let i = 0; i < events.length; i++) onMessage(events[i]);
      if (data.close) {
        failHttp(session);
        return;
      }
      scheduleHttp(session);
    }).catch(() => {
      if (session.stopped || http !== session) return;
      session.inflight = false;
      failHttp(session);
    });
  }

  function startHttp(address) {
    const session = {
      address,
      id: "",
      queue: [],
      stopped: false,
      inflight: false,
      timer: 0,
    };
    http = session;
    online.textContent = "连接中";
    session.queue.push(hello());
    pumpHttp(session);
  }

  function arm() {
    if (stillKicked() || solo || dead || document.hidden || !confirmed || !myName || socketLive()) return;
    const address = lobbyAddress();
    if (!address) {
      online.textContent = "未连接";
      return;
    }
    window.clearTimeout(retry);
    online.textContent = "连接中";
    if (address.startsWith("http://") || address.startsWith("https://")) {
      startHttp(address);
      return;
    }
    const ws = new WebSocket(address);
    socket = ws;
    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      online.textContent = "连接中";
      send(hello());
    });
    ws.addEventListener("message", (event) => {
      if (socket !== ws) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg && typeof msg.t === "string") onMessage(msg);
    });
    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      linked = false;
      if (stillKicked()) {
        online.textContent = "已请出";
        return;
      }
      if (event.code === 4001) {
        applyKick(0);
        return;
      }
      online.textContent = solo ? "单人" : (confirmed ? "未连接" : "先起个名字");
      window.clearTimeout(retry);
      if (dead || document.hidden || !confirmed || solo) return;
      retry = window.setTimeout(arm, 1500);
    });
  }

  function showNameGate() {
    syncNameInputs(myName);
    nameGate.hidden = false;
    nameInput.focus();
    if (onGate) onGate(true);
  }

  function commitName(raw) {
    if (composing) return;
    const name = String(raw || "").trim().slice(0, 12);
    if (!name) {
      if (!nameGate.hidden) nameInput.focus();
      else navName.focus();
      return;
    }
    const changed = !me || me.name !== name;
    const wasGate = !nameGate.hidden;
    rememberName(name);
    syncNameInputs(name);
    nameGate.hidden = true;
    if (wasGate && onGate) onGate(false);
    if (solo) {
      online.textContent = stillKicked() ? "已请出" : "单人";
      startBeat();
      return;
    }
    if (!linked) {
      if (document.hidden) online.textContent = "未连接";
      else arm();
      return;
    }
    if (changed) send({ t: "name", name });
  }

  function openChat() {
    chatBar.hidden = false;
    document.body.classList.add("chatting");
    if (onTyping) onTyping(true);
    if (onReleaseLook) onReleaseLook();
    else if (document.pointerLockElement) document.exitPointerLock();
    chatInput.focus();
  }

  function closeChat() {
    chatBar.hidden = true;
    chatInput.value = "";
    document.body.classList.remove("chatting");
    if (onTyping) onTyping(false);
    if (document.activeElement === chatInput) chatInput.blur();
  }

  function setDrawer(open) {
    const changed = corner.classList.contains("nav-open") !== open;
    if (!open) {
      const el = document.activeElement;
      if (el && el.blur && (el === toggle || drawer.contains(el))) el.blur();
    }
    corner.classList.toggle("nav-open", open);
    drawer.inert = !open;
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "收起导航" : "导航");
    if (changed && onNav) onNav(open);
  }

  function setRoster(open) {
    rosterEl.hidden = !open;
    online.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function holdPresence(ms) {
    const wait = ms > 0 ? ms : HOLD_MS;
    const token = ++holdToken;
    holdUntil = Date.now() + wait;
    window.clearTimeout(holdTimer);
    const tick = () => {
      if (token !== holdToken) return;
      const left = holdUntil - Date.now();
      // 后台页把很长的一次定时拖慢。拆成短间隔，到点再看人还在不在。
      if (left > 0) {
        holdTimer = window.setTimeout(tick, left > 20000 ? 15000 : left);
        return;
      }
      holdUntil = 0;
      if (!document.hidden) return;
      if (linked) send({ t: "away" });
      else if (solo) sendBeat();
    };
    tick();
  }

  function outboundLink(event) {
    const raw = event.target;
    if (!raw || !raw.closest) return;
    const link = raw.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (link.target !== "_blank" && url.origin === location.origin) return;
    holdPresence(link.closest("#panel") ? CARD_HOLD_MS : HOLD_MS);
  }

  function applyOnline(show) {
    showOnline = show;
    online.hidden = !show;
    if (onlineToggle) onlineToggle.checked = show;
    if (!show) setRoster(false);
    try {
      localStorage.setItem(ONLINE_KEY, show ? "1" : "0");
    } catch {
      /* 记不住就这次先按按钮上的来。 */
    }
  }

  function applyMap(show) {
    showMap = show;
    mapCard.classList.toggle("map-off", !show);
    mapToggle.checked = show;
    try {
      localStorage.setItem(MAP_KEY, show ? "1" : "0");
    } catch {
      /* 记不住就这次先按按钮上的来。 */
    }
  }

  function dropLink() {
    window.clearTimeout(retry);
    linked = false;
    const ws = socket;
    socket = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* 已经在关。 */
      }
    }
    if (http) {
      const leaving = http;
      const id = leaving.id;
      const address = leaving.address;
      stopHttp(leaving);
      beaconLeave(address, id);
    }
    me = null;
    roster.clear();
    crowd.clear();
    renderPeople();
  }

  function applySolo(on) {
    solo = on;
    if (soloToggle) soloToggle.checked = on;
    try {
      localStorage.setItem(SOLO_KEY, on ? "1" : "0");
    } catch {
      /* 记不住就这次先按勾选来。 */
    }
    if (on) {
      dropLink();
      online.textContent = stillKicked() ? "已请出" : (confirmed ? "单人" : "先起个名字");
      startBeat();
      pollMusic();
      return;
    }
    stopBeat();
    sendLeave();
    if (!confirmed || !myName) {
      online.textContent = "先起个名字";
      return;
    }
    if (document.hidden) {
      online.textContent = "未连接";
      return;
    }
    arm();
  }

  try {
    showMap = localStorage.getItem(MAP_KEY) !== "0";
  } catch {
    showMap = true;
  }
  applyMap(showMap);
  try {
    showOnline = localStorage.getItem(ONLINE_KEY) !== "0";
  } catch {
    showOnline = true;
  }
  applyOnline(showOnline);
  try {
    solo = localStorage.getItem(SOLO_KEY) === "1";
  } catch {
    solo = false;
  }
  if (soloToggle) soloToggle.checked = solo;

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setDrawer(!corner.classList.contains("nav-open"));
  });

  online.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = rosterEl.hidden;
    if (opening && onExclusive) onExclusive("roster");
    setRoster(opening);
  });

  document.addEventListener("click", outboundLink);
  document.addEventListener("auxclick", outboundLink);

  mapToggle.addEventListener("change", () => {
    applyMap(mapToggle.checked);
  });
  if (onlineToggle) {
    onlineToggle.addEventListener("change", () => {
      applyOnline(onlineToggle.checked);
    });
  }
  if (soloToggle) {
    soloToggle.addEventListener("change", () => {
      applySolo(soloToggle.checked);
    });
  }

  nameGate.addEventListener("submit", (event) => {
    event.preventDefault();
    commitName(nameInput.value);
  });
  nameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitName(navName.value);
  });

  function watchCompose(input) {
    input.addEventListener("compositionstart", () => {
      composing = true;
    });
    input.addEventListener("compositionend", () => {
      window.setTimeout(() => {
        composing = false;
      }, 40);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.isComposing || event.keyCode === 229 || composing) event.preventDefault();
    });
  }
  watchCompose(nameInput);
  watchCompose(navName);
  watchCompose(chatInput);

  chatBar.addEventListener("submit", (event) => {
    event.preventDefault();
    if (composing) return;
    const text = chatInput.value.trim();
    if (!text) {
      closeChat();
      return;
    }
    if (solo) {
      toast("单人模式，没有连上");
      closeChat();
      return;
    }
    send({ t: "say", text });
    closeChat();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!nameGate.hidden || (kickGate && !kickGate.hidden) || event.repeat) return;
    const el = event.target;
    if (el && el.closest && el.closest("input, textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    setDrawer(!corner.classList.contains("nav-open"));
  }, true);

  document.addEventListener("keydown", (event) => {
    const el = event.target;
    if (el === chatInput && event.key === "Escape") {
      event.preventDefault();
      closeChat();
      return;
    }
    if (kickGate && !kickGate.hidden) return;
    if (el && el.closest && el.closest("input, textarea, button, select, #drawer, #roster, #name-gate, #kick-gate, #day, #panel")) return;
    if (!nameGate.hidden && event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      nameInput.focus();
      return;
    }
    if (event.key === "Enter" && !event.repeat && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      openChat();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (stillKicked()) return;
    if (solo) sendBeat();
    if (document.hidden) {
      window.clearTimeout(retry);
      if (Date.now() < holdUntil) return;
      holdPresence();
      return;
    }
    holdToken += 1;
    window.clearTimeout(holdTimer);
    holdUntil = 0;
    if (dead || !confirmed || !myName) return;
    if ((socket && socket.readyState === WebSocket.OPEN) || (http && !http.stopped)) {
      if (linked) send({ t: "back" });
      return;
    }
    arm();
  });

  window.addEventListener("pagehide", () => {
    dead = true;
    window.clearTimeout(retry);
    stopBeat();
    window.clearInterval(musicTimer);
    if (solo) sendLeave();
    if (http) {
      const leaving = http;
      stopHttp(leaving);
      beaconLeave(leaving.address, leaving.id);
    }
    if (socket) socket.close();
  });

  try {
    kickedUntil = Number(sessionStorage.getItem(KICK_KEY) || 0);
  } catch {
    kickedUntil = 0;
  }
  if (!(kickedUntil > Date.now())) kickedUntil = 0;

  if (kickBack) {
    kickBack.addEventListener("click", () => {
      if (stillKicked()) return;
      kickedUntil = 0;
      try {
        sessionStorage.removeItem(KICK_KEY);
      } catch {
        /* 这一页里先放行。 */
      }
      window.clearInterval(kickClock);
      if (kickGate) kickGate.hidden = true;
      if (onKick) onKick(false);
      if (solo) {
        online.textContent = confirmed ? "单人" : "先起个名字";
        startBeat();
        pollMusic();
        return;
      }
      if (confirmed && myName && !document.hidden) arm();
    });
  }

  syncNameInputs(myName);
  if (kickedUntil) {
    showKick(kickedUntil);
  } else if (confirmed && myName) {
    nameGate.hidden = true;
    if (solo) {
      online.textContent = "单人";
      startBeat();
      pollMusic();
    } else if (document.hidden) online.textContent = "未连接";
    else arm();
  } else if (new URLSearchParams(location.search).has("noname")) {
    nameGate.hidden = true;
    online.textContent = "先起个名字";
  } else {
    online.textContent = "先起个名字";
    showNameGate();
  }

  function drawDot(x, y, yaw, self, name) {
    forwardFromYaw(yaw, planFwd);
    ctx.save();
    ctx.translate(x, y);
    if (self) {
      const len = 8;
      const dx = planFwd.x * len;
      const dy = planFwd.z * len;
      const px = -planFwd.z;
      const py = planFwd.x;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(-dx * 0.45 + px * 4.5, -dy * 0.45 + py * 4.5);
      ctx.lineTo(-dx * 0.45 - px * 4.5, -dy * 0.45 - py * 4.5);
      ctx.closePath();
      ctx.fillStyle = "#c4552a";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#2c2926";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(planFwd.x * 9, planFwd.z * 9);
      ctx.strokeStyle = "#2c2926";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.restore();
    if (name) {
      ctx.font = "11px Microsoft YaHei, PingFang SC, sans-serif";
      ctx.fillStyle = "#6f6a64";
      ctx.fillText(name, x + 6, y - 4);
    }
  }

  function drawPlan(pose) {
    const w = mapCanvas.clientWidth || 180;
    const h = mapCanvas.clientHeight || 210;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    if (mapCanvas.width !== bw || mapCanvas.height !== bh) {
      mapCanvas.width = bw;
      mapCanvas.height = bh;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 12;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const ox = pad + ((w - pad * 2) - s * spanX) / 2;
    const oy = pad + ((h - pad * 2) - s * spanZ) / 2;
    const X = (x) => ox + (x - bounds.minX) * s;
    const Y = (z) => oy + (z - bounds.minZ) * s;

    ctx.fillStyle = "#e6e1d8";
    ctx.fillRect(X(PLAZA.minX), Y(PLAZA.minZ), (PLAZA.maxX - PLAZA.minX) * s, (PLAZA.maxZ - PLAZA.minZ) * s);
    ctx.fillStyle = "#d4c6b4";
    ctx.fillRect(
      X(interior.minX),
      Y(interior.minZ),
      (interior.maxX - interior.minX) * s,
      (interior.maxZ - interior.minZ) * s,
    );

    const others = crowd.list();
    const myFloor = Math.round((pose.y || 0) / STORY);
    for (let i = 0; i < others.length; i++) {
      const person = others[i];
      if (Math.round((person.y || 0) / STORY) !== myFloor) continue;
      drawDot(X(person.x), Y(person.z), person.yaw, false, person.name);
    }
    drawDot(X(pose.x), Y(pose.z), pose.yaw, true, "你");
  }

  musicTimer = window.setInterval(pollMusic, 4000);

  return {
    others() { return crowd.list(); },
    closeRoster() { setRoster(false); },
    dismiss(keepRoster) {
      if (!keepRoster) setRoster(false);
      if (corner.classList.contains("nav-open")) setDrawer(false);
      closeChat();
    },
    update(dt, now) {
      crowd.update(dt, now);
      const pose = getPose();
      if (!document.hidden) watchHall(pose);
      if (showMap && (!planAt || now - planAt > 140)) {
        planAt = now;
        drawPlan(pose);
      }
      if (showOnline && !rosterEl.hidden && (!peopleAt || now - peopleAt > 280)) {
        peopleAt = now;
        renderPeople();
      }
      if (selfBubbleUntil && now > selfBubbleUntil) {
        selfBubble.hidden = true;
        selfBubbleUntil = 0;
      }
      if (!linked || document.hidden) return;
      const turn = Math.atan2(Math.sin(pose.yaw - sentYaw), Math.cos(pose.yaw - sentYaw));
      const moved = !Number.isFinite(sentX)
        || Math.hypot(pose.x - sentX, pose.z - sentZ) > 0.03
        || Math.abs((pose.y || 0) - sentY) > 0.03
        || Math.abs(turn) > 0.04;
      if (!moved && now < publishAt) return;
      publishAt = now + (moved ? 100 : 2000);
      sentX = pose.x;
      sentZ = pose.z;
      sentY = pose.y || 0;
      sentYaw = pose.yaw;
      send({ t: "move", x: pose.x, y: pose.y || 0, z: pose.z, yaw: pose.yaw });
    },
  };
}
