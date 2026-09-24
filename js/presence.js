import { PLAZA } from "./layout.js";
import { forwardFromYaw } from "./basis.js";
import { createCrowd } from "./avatar.js";

const PUBLIC_LOBBY = "wss://sitopia-lobby.adhesive-quarter.workers.dev/lobby";

const NAME_KEY = "quzhan-museum-name";
const NAMED_KEY = "quzhan-museum-named";
const MAP_KEY = "quzhan-museum-map";
const BUBBLE_LIFE = 6000;
const HOLD_MS = 30000;

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
    onTyping,
    onNav,
  } = options;
  const corner = document.getElementById("corner");
  const mapCard = document.getElementById("map-card");
  const mapCanvas = document.getElementById("map");
  const mapToggle = document.getElementById("map-visible");
  const online = document.getElementById("online");
  const rosterEl = document.getElementById("roster");
  const toggle = document.getElementById("drawer-toggle");
  const drawer = document.getElementById("drawer");
  const peopleEl = document.getElementById("people");
  const logEl = document.getElementById("chat-log");
  const toasts = document.getElementById("toasts");
  const chatBar = document.getElementById("chat-bar");
  const chatInput = document.getElementById("chat-input");
  const selfBubble = document.getElementById("self-bubble");
  const nameGate = document.getElementById("name-gate");
  const nameInput = document.getElementById("name-input");
  const nameForm = document.getElementById("name-form");
  const navName = document.getElementById("nav-name");

  const crowd = createCrowd(scene, material, shadowMaterial);
  const roster = new Map();
  const planFwd = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, x: 0, y: 0, z: -1 };
  const ctx = mapCanvas.getContext("2d");
  let me = null;
  let myName = readStoredName();
  let confirmed = readConfirmed();
  let linked = false;
  let socket = null;
  let retry = 0;
  let dead = false;
  let publishAt = 0;
  let sentX = NaN;
  let sentZ = NaN;
  let sentYaw = NaN;
  let selfBubbleUntil = 0;
  let composing = false;
  let showMap = true;
  let holdUntil = 0;
  let holdTimer = 0;
  let holdToken = 0;

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
      li.textContent = me && row.id === me.id ? row.name + " · 你" : row.name;
      if (me && row.id === me.id) li.className = "me";
      peopleEl.append(li);
    }
  }

  function appendLine(node) {
    logEl.append(node);
    while (logEl.children.length > 80) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  function appendSay(msg) {
    const li = document.createElement("li");
    const who = document.createElement("b");
    who.textContent = msg.name;
    li.append(who, document.createTextNode(" " + msg.text));
    appendLine(li);
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
    if (msg.t === "welcome") {
      me = { id: msg.id, name: msg.name };
      rememberName(msg.name);
      syncNameInputs(msg.name);
      linked = true;
      roster.clear();
      crowd.clear();
      roster.set(msg.id, { id: msg.id, name: msg.name });
      const others = msg.people || [];
      for (let i = 0; i < others.length; i++) {
        roster.set(others[i].id, others[i]);
        crowd.upsert(others[i], true);
      }
      setCount(roster.size);
      renderPeople();
      logEl.replaceChildren();
      const history = msg.log || [];
      for (let i = 0; i < history.length; i++) appendSay(history[i]);
      if (!document.hidden) {
        if (others.length) toast("你进入了展厅，馆里已有 " + others.length + " 人");
        else toast("你进入了展厅");
      }
      if (document.hidden) send({ t: "away" });
      else if (msg.away) send({ t: "back" });
      publishAt = 0;
      sentX = NaN;
      return;
    }
    if (msg.t === "join") {
      roster.set(msg.id, msg);
      crowd.upsert(msg, true);
      setCount(roster.size);
      renderPeople();
      toast(msg.name + " 进入了展厅");
      appendSys(msg.name + " 进入了展厅");
      return;
    }
    if (msg.t === "bye") {
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
      crowd.upsert({
        id: msg.id,
        name: row ? row.name : "",
        x: msg.x,
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
    if (msg.t === "full") toast("展厅人满了");
  }

  function socketLive() {
    return socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }

  function lobbyAddress() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return proto + "//" + location.host + "/lobby";
    }
    const custom = new URLSearchParams(location.search).get("lobby");
    if (custom && /^wss?:\/\//.test(custom)) return custom;
    return PUBLIC_LOBBY;
  }

  function arm() {
    if (dead || document.hidden || !confirmed || !myName || socketLive()) return;
    const address = lobbyAddress();
    if (!address) {
      online.textContent = "未连接";
      return;
    }
    window.clearTimeout(retry);
    const ws = new WebSocket(address);
    socket = ws;
    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      online.textContent = "连接中";
      send({ t: "hi", name: myName, away: document.hidden });
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
    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      socket = null;
      linked = false;
      online.textContent = confirmed ? "未连接" : "先起个名字";
      window.clearTimeout(retry);
      if (dead || document.hidden || !confirmed) return;
      retry = window.setTimeout(arm, 1500);
    });
  }

  function showNameGate() {
    syncNameInputs(myName);
    nameGate.hidden = false;
    nameInput.focus();
  }

  function commitName(raw) {
    if (composing) return;
    const name = String(raw || "").trim().slice(0, 12);
    if (!name) {
      nameInput.focus();
      return;
    }
    const changed = !me || me.name !== name;
    rememberName(name);
    syncNameInputs(name);
    nameGate.hidden = true;
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
    if (document.pointerLockElement) document.exitPointerLock();
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

  function holdPresence() {
    const token = ++holdToken;
    holdUntil = Date.now() + HOLD_MS;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (token !== holdToken) return;
      holdUntil = 0;
      if (document.hidden && linked) send({ t: "away" });
    }, HOLD_MS);
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
    holdPresence();
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

  try {
    showMap = localStorage.getItem(MAP_KEY) !== "0";
  } catch {
    showMap = true;
  }
  applyMap(showMap);

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setDrawer(!corner.classList.contains("nav-open"));
  });

  online.addEventListener("click", (event) => {
    event.stopPropagation();
    setRoster(rosterEl.hidden);
  });

  document.addEventListener("click", outboundLink);
  document.addEventListener("auxclick", outboundLink);

  mapToggle.addEventListener("change", () => {
    applyMap(mapToggle.checked);
  });

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
    send({ t: "say", text });
    closeChat();
  });

  document.addEventListener("keydown", (event) => {
    const el = event.target;
    if (el === chatInput && event.key === "Escape") {
      event.preventDefault();
      closeChat();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!nameGate.hidden || event.repeat) return;
      if (el && el.closest && el.closest("input, textarea, select, #drawer, #roster, #panel")) return;
      event.preventDefault();
      setDrawer(!corner.classList.contains("nav-open"));
      return;
    }
    if (el && el.closest && el.closest("input, textarea, button, select, #drawer, #roster, #name-gate, #day, #panel")) return;
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
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (linked) send({ t: "back" });
      return;
    }
    arm();
  });

  window.addEventListener("pagehide", () => {
    dead = true;
    window.clearTimeout(retry);
    if (socket) socket.close();
  });

  syncNameInputs(myName);
  if (confirmed && myName) {
    nameGate.hidden = true;
    if (document.hidden) online.textContent = "未连接";
    else arm();
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
    for (let i = 0; i < others.length; i++) {
      const person = others[i];
      drawDot(X(person.x), Y(person.z), person.yaw, false, person.name);
    }
    drawDot(X(pose.x), Y(pose.z), pose.yaw, true, "你");
  }

  return {
    update(dt, now) {
      crowd.update(dt, now);
      const pose = getPose();
      if (showMap) drawPlan(pose);
      if (selfBubbleUntil && now > selfBubbleUntil) {
        selfBubble.hidden = true;
        selfBubbleUntil = 0;
      }
      if (!linked || document.hidden) return;
      const turn = Math.atan2(Math.sin(pose.yaw - sentYaw), Math.cos(pose.yaw - sentYaw));
      const moved = !Number.isFinite(sentX)
        || Math.hypot(pose.x - sentX, pose.z - sentZ) > 0.03
        || Math.abs(turn) > 0.04;
      if (!moved && now < publishAt) return;
      publishAt = now + (moved ? 100 : 2000);
      sentX = pose.x;
      sentZ = pose.z;
      sentYaw = pose.yaw;
      send({ t: "move", x: pose.x, z: pose.z, yaw: pose.yaw });
    },
  };
}
