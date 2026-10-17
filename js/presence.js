import { STORY, occupiesHall, zoneAt } from "./layout.js";
import { createCrowd } from "./avatar.js";

// 线上页面经 lobby.youquhome.com 转到 Cloudflare 房间。本机仍走自己的 /lobby。
const PUBLIC_LOBBY = "wss://lobby.youquhome.com/lobby";

function lobbyBase() {
  const host = location.hostname;
  if (host === "127.0.0.1" || host === "localhost") {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/lobby";
  }
  const custom = new URLSearchParams(location.search).get("lobby");
  if (custom && /^(https?|wss?):\/\//.test(custom)) return custom;
  return PUBLIC_LOBBY;
}

const NAME_KEY = "quzhan-museum-name";
const NAMED_KEY = "quzhan-museum-named";
const MAP_KEY = "quzhan-museum-map";
const ONLINE_KEY = "quzhan-museum-online";
const SOLO_KEY = "quzhan-museum-solo";
const SORT_KEY = "quzhan-museum-sort";
const TAB_HINT_KEY = "quzhan-museum-tab-hint";

function readToggle(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    return saved !== "0";
  } catch {
    return fallback;
  }
}

export function readSortMode() {
  try {
    return localStorage.getItem(SORT_KEY) === "time" ? "time" : "cat";
  } catch {
    return "cat";
  }
}

function writeSortMode(mode) {
  try {
    localStorage.setItem(SORT_KEY, mode === "time" ? "time" : "cat");
  } catch {
    /* 记不住就这次先按选中的来。 */
  }
}

const KICK_KEY = "quzhan-museum-kicked";
const BEAT_MS = 30000;
const BUBBLE_LIFE = 6000;
// 左下角只留五行。每一行从显示起算一分钟，最下面到点就去掉，上面各行下降一档。
const CHATTER_MAX = 5;
const CHATTER_LIFE = 60 * 1000;
// 点画框白卡上的链接，或把这一页放到后台：人先留在在线名单里。十分钟后还没回来，再从馆里请出。
// 关掉页面不等这十分钟。
const HOLD_MS = 10 * 60 * 1000;
const SEAT_KEY = "quzhan-museum-seat";
// 同座位被顶掉后，连接活过这么久才算稳定，之前的顶替计数才清零。
// 按 1.5 秒固定回抢会一直互顶，所以要等一条连接真正站住。
const SEAT_STABLE_MS = 60000;

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

export function hasEnteredName() {
  return readConfirmed();
}

export function mountPresence(options) {
  const {
    scene,
    material,
    shadowMaterial,
    getPose,
    paintPlan,
    planHeight,
    zones,
    onTyping,
    onNav,
    onExclusive,
    onReleaseLook,
    onGate,
    onKick,
    onMusic,
    onSign,
    onRobot,
    onRobotFace,
    onNotes,
    onUnlink,
    onSort,
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
  const tabHint = document.getElementById("tab-hint");
  const sortCat = document.getElementById("sort-cat");
  const sortTime = document.getElementById("sort-time");
  if (sortCat && sortTime) {
    const savedSort = readSortMode();
    sortCat.checked = savedSort !== "time";
    sortTime.checked = savedSort === "time";
  }
  // Tab 只开关汉堡菜单。浮层里的输入、按钮和链接不进 Tab 序，点过排序后也不会落到「项目」。
  if (drawer) {
    const skip = drawer.querySelectorAll("a, button, input, textarea, select");
    for (let i = 0; i < skip.length; i++) skip[i].tabIndex = -1;
  }

  const crowd = createCrowd(scene, material, shadowMaterial);
  const roster = new Map();
  const seat = readSeat();
  const ctx = mapCanvas.getContext("2d");
  let me = null;
  let myName = readStoredName();
  let confirmed = readConfirmed();
  let linked = false;
  let socket = null;
  let http = null;
  let retry = 0;
  // 被别人顶掉座位（close 4000）后连着被顶了几次，用来把重连间隔逐次拉长。
  let seatRetry = 0;
  // 这一条连接是什么时候被接纳的，用来判断它活够久没有。
  let connAt = 0;
  let dead = false;
  let publishAt = 0;
  let sentX = NaN;
  let sentY = NaN;
  let sentZ = NaN;
  let sentYaw = NaN;
  let selfBubbleUntil = 0;
  let composing = false;
  let showMap = false;
  let showOnline = false;
  let freshHint = false;
  try {
    freshHint = !readConfirmed() && localStorage.getItem(TAB_HINT_KEY) !== "1";
  } catch {
    freshHint = !readConfirmed();
  }
  let solo = false;
  let kickedUntil = 0;
  let beatTimer = 0;
  let kickClock = 0;
  let peopleAt = 0;
  let holdUntil = 0;
  let holdTimer = 0;
  let holdToken = 0;
  let shelved = false;
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
    return { t: "hi", name: myName, away: document.hidden && !(holdUntil > Date.now()), seat };
  }

  function takeSign(value) {
    if (typeof value === "string" && onSign) onSign(value);
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
    if (shelved || dead || !solo || !confirmed || !myName || stillKicked()) return;
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
      else if (data) {
        takeSign(data.sign);
        if (data.music && onMusic) onMusic(data.music);
      }
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
        if (!data) return;
        takeSign(data.sign);
        if (data.t === "music" && onMusic) onMusic(data);
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

  function stampSay(li, msg, stamp) {
    li.dataset.sayId = msg.id || "";
    li.dataset.sayAt = String(stamp);
  }

  function setFade(li, level) {
    li.dataset.fade = String(level);
    li.className = "fade-" + level;
  }

  // 现有各行下降一档。落到第五档下面的删掉。
  function shiftChatter() {
    const items = chatterEl.children;
    for (let i = items.length - 1; i >= 0; i--) {
      const level = Number(items[i].dataset.fade || 0) + 1;
      if (level >= CHATTER_MAX) items[i].remove();
      else setFade(items[i], level);
    }
  }

  // 删掉中间某行后，按第一行所在的档把下面排紧，不额外再降一档。
  function packChatter() {
    const items = chatterEl.children;
    if (!items.length) return;
    let level = Number(items[0].dataset.fade || 0);
    for (let i = 0; i < items.length; i++) {
      if (level >= CHATTER_MAX) {
        while (items.length > i) items[i].remove();
        break;
      }
      setFade(items[i], level);
      level += 1;
    }
  }

  function pushChatter(msg, stamp, shownAt) {
    if (!chatterEl || !msg || !msg.text) return;
    const first = chatterEl.firstChild;
    const topTaken = first && Number(first.dataset.fade || 0) === 0;
    if (topTaken) shiftChatter();
    const li = document.createElement("li");
    li.textContent = msg.name + "：" + msg.text;
    stampSay(li, msg, stamp);
    li.dataset.shownAt = String(shownAt == null ? performance.now() : shownAt);
    setFade(li, 0);
    chatterEl.prepend(li);
    while (chatterEl.children.length > CHATTER_MAX) chatterEl.lastChild.remove();
    const second = chatterEl.children[1];
    if (second && Number(second.dataset.fade || 0) > 1) packChatter();
  }

  function sweepChatter(now) {
    if (!chatterEl) return;
    while (chatterEl.lastChild) {
      const born = Number(chatterEl.lastChild.dataset.shownAt || 0);
      if (!born || now - born < CHATTER_LIFE) break;
      chatterEl.lastChild.remove();
      shiftChatter();
    }
  }

  function removeSay(msg) {
    const id = msg.id || "";
    const at = String(msg.at);
    const roots = [logEl, chatterEl];
    let chatterChanged = false;
    for (let r = 0; r < roots.length; r++) {
      const root = roots[r];
      if (!root) continue;
      const items = root.children;
      for (let i = items.length - 1; i >= 0; i--) {
        const li = items[i];
        if (li.dataset.sayId !== id || li.dataset.sayAt !== at) continue;
        li.remove();
        if (root === chatterEl) chatterChanged = true;
      }
    }
    if (chatterChanged) packChatter();
  }

  function sayStamp(msg) {
    return typeof msg.at === "number" && Number.isFinite(msg.at) ? msg.at : Date.now();
  }

  function appendLogged(msg, stamp) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "chat-meta";
    const who = document.createElement("b");
    who.textContent = msg.name || "";
    const when = document.createElement("time");
    when.className = "chat-time";
    when.dateTime = new Date(stamp).toISOString();
    when.textContent = formatWhen(stamp);
    meta.append(who, when);
    const body = document.createElement("div");
    body.className = "chat-text";
    body.textContent = msg.text || "";
    li.append(meta, body);
    stampSay(li, msg, stamp);
    appendLine(li);
  }

  function appendSay(msg) {
    const stamp = sayStamp(msg);
    appendLogged(msg, stamp);
    pushChatter(msg, stamp);
  }

  // 进馆带回的旧记录：满一分钟的不再进左下角。还没满的只显示剩下的时间。
  function appendHistory(msg) {
    const hasAt = typeof msg.at === "number" && Number.isFinite(msg.at);
    const stamp = hasAt ? msg.at : sayStamp(msg);
    appendLogged(msg, stamp);
    if (!hasAt || !msg || !msg.text) return;
    const age = Date.now() - stamp;
    if (!(age >= 0 && age < CHATTER_LIFE)) return;
    pushChatter(msg, stamp, performance.now() - age);
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
      takeSign(msg.sign);
      if (onMusic) onMusic(msg);
      return;
    }
    if (msg.t === "sign") {
      takeSign(msg.text);
      return;
    }
    if (msg.t === "welcome") {
      const quiet = msg.resume === true && !!me;
      me = { id: msg.id, name: msg.name };
      rememberName(msg.name);
      syncNameInputs(msg.name);
      linked = true;
      connAt = Date.now();
      roster.clear();
      crowd.clear();
      roster.set(msg.id, { id: msg.id, name: msg.name, x: 0, y: 0, z: 0 });
      const others = msg.people || [];
      for (let i = 0; i < others.length; i++) rememberOther(others[i], true);
      setCount(roster.size);
      renderPeople();
      if (!quiet) {
        logEl.replaceChildren();
        if (chatterEl) chatterEl.replaceChildren();
        const history = msg.log || [];
        for (let i = 0; i < history.length; i++) appendHistory(history[i]);
        if (!document.hidden) {
          if (others.length) toast("你进入了展厅，馆里已有 " + others.length + " 人");
          else toast("你进入了展厅");
        }
      }
      if (document.hidden && !(holdUntil > Date.now())) send({ t: "away" });
      else if (msg.away) send({ t: "back" });
      takeSign(msg.sign);
      if (msg.music && onMusic) onMusic(msg.music);
      if (msg.robot && onRobot) {
        takeSign(msg.robot.sign);
        onRobot(msg.robot);
      }
      if (msg.notes && onNotes) onNotes(msg.notes);
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
    if (msg.t === "robot") {
      takeSign(msg.sign);
      if (onRobot) onRobot(msg);
      return;
    }
    if (msg.t === "robot-face") {
      if (onRobotFace) onRobotFace(msg);
      return;
    }
    if (msg.t === "note" || msg.t === "note-drop") {
      if (onNotes) onNotes(msg);
      return;
    }
    if (msg.t === "say-drop") {
      removeSay(msg);
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
    return lobbyBase();
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
    if (stillKicked() || dead || !confirmed || solo) return;
    if (document.hidden && !(holdUntil > Date.now())) return;
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
    if (stillKicked() || solo || dead || !confirmed || !myName || socketLive()) return;
    if (document.hidden && !(holdUntil > Date.now())) return;
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
      if (dead || !confirmed || solo) return;
      if (document.hidden && !(holdUntil > Date.now())) return;
      // 4000 是同一个座位被另一条连接接管，多半是同一个浏览器里又开了一页。
      // 只有这条连接活够久才算稳定，稳定过才清零；否则逐次拉长间隔，避免一直互顶。
      if (Date.now() - connAt >= SEAT_STABLE_MS) seatRetry = 0;
      const wait = event.code === 4000 ? Math.min(1500 * 2 ** seatRetry, 30000) : 1500;
      retry = window.setTimeout(arm, wait);
    });
  }

  let gateLeaving = false;

  function showNameGate() {
    syncNameInputs(myName);
    nameGate.classList.remove("is-shown");
    nameGate.hidden = false;
    if (onGate) onGate(true);
  }

  function afterName(wasGate, changed) {
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
    if (changed) send({ t: "name", name: myName });
  }

  function dismissNameGate(done) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      nameGate.classList.remove("is-shown");
      nameGate.hidden = true;
      done();
      return;
    }
    nameGate.classList.remove("is-shown");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      nameGate.hidden = true;
      done();
    };
    const timer = window.setTimeout(finish, 800);
    nameGate.addEventListener("transitionend", function onEnd(event) {
      if (event.target !== nameGate || event.propertyName !== "opacity") return;
      window.clearTimeout(timer);
      nameGate.removeEventListener("transitionend", onEnd);
      finish();
    });
  }

  function commitName(raw) {
    if (composing || gateLeaving) return;
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
    if (!wasGate) {
      afterName(false, changed);
      return;
    }
    gateLeaving = true;
    dismissNameGate(() => {
      gateLeaving = false;
      afterName(true, changed);
    });
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

  function syncTabHint() {
    if (!tabHint) return;
    const opening = document.body.classList.contains("opening");
    const gating = nameGate && !nameGate.hidden;
    tabHint.hidden = !(freshHint && !opening && !gating);
  }

  function dismissTabHint() {
    if (!freshHint) return;
    freshHint = false;
    if (tabHint) tabHint.hidden = true;
    try {
      localStorage.setItem(TAB_HINT_KEY, "1");
    } catch {
      /* 记不住就这次先收起。 */
    }
  }

  function setRoster(open) {
    rosterEl.hidden = !open;
    online.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function shelve() {
    if (dead || stillKicked() || !document.hidden) return;
    shelved = true;
    window.clearTimeout(retry);
    holdUntil = 0;
    if (solo) {
      stopBeat();
      sendLeave();
      online.textContent = "未连接";
      return;
    }
    dropLink();
    online.textContent = confirmed && myName ? "未连接" : "先起个名字";
  }

  function holdPresence(ms) {
    const wait = ms > 0 ? ms : HOLD_MS;
    const token = ++holdToken;
    holdUntil = Date.now() + wait;
    shelved = false;
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
      shelve();
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
    holdPresence(HOLD_MS);
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
    if (onUnlink) onUnlink();
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

  showMap = readToggle(MAP_KEY, false);
  applyMap(showMap);
  showOnline = readToggle(ONLINE_KEY, false);
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
  if (sortCat && sortTime) {
    const pickSort = () => {
      const mode = sortTime.checked ? "time" : "cat";
      writeSortMode(mode);
      if (onSort) onSort(mode);
    };
    sortCat.addEventListener("change", pickSort);
    sortTime.addEventListener("change", pickSort);
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
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!nameGate.hidden || (kickGate && !kickGate.hidden) || event.repeat) return;
    const el = event.target;
    const inDrawer = !!(el && drawer && drawer.contains(el));
    if (event.shiftKey && !inDrawer) return;
    if (!inDrawer && el && el.closest && el.closest("input, textarea")) return;
    event.preventDefault();
    event.stopPropagation();
    setDrawer(!corner.classList.contains("nav-open"));
    dismissTabHint();
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
    if (document.hidden) {
      window.clearTimeout(retry);
      if (!(holdUntil > Date.now() + HOLD_MS - 1000)) holdPresence(HOLD_MS);
      if (solo && confirmed && myName && !shelved) {
        if (!beatTimer) startBeat();
        else sendBeat();
      }
      return;
    }
    holdToken += 1;
    window.clearTimeout(holdTimer);
    holdUntil = 0;
    shelved = false;
    if (dead || !confirmed || !myName || !nameGate.hidden) return;
    if (solo) {
      online.textContent = "单人";
      if (!beatTimer) startBeat();
      else sendBeat();
      return;
    }
    if ((socket && socket.readyState === WebSocket.OPEN) || (http && !http.stopped)) {
      if (linked) send({ t: "back" });
      return;
    }
    arm();
  });

  window.addEventListener("pagehide", () => {
    dead = true;
    holdToken += 1;
    window.clearTimeout(holdTimer);
    holdUntil = 0;
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
  const openingSearch = new URLSearchParams(location.search);
  const poseSkip = openingSearch.has("selftest") || openingSearch.has("preview") || openingSearch.has("x") || openingSearch.has("z") || openingSearch.has("y") || openingSearch.has("yaw") || openingSearch.has("car");
  if (kickedUntil) {
    showKick(kickedUntil);
  } else if (openingSearch.has("noname") || (confirmed && myName && poseSkip)) {
    nameGate.hidden = true;
    if (confirmed && myName) {
      if (solo) {
        online.textContent = "单人";
        startBeat();
        pollMusic();
      } else if (document.hidden) online.textContent = "未连接";
      else arm();
    } else online.textContent = "先起个名字";
  } else {
    online.textContent = "先起个名字";
    showNameGate();
  }

  function drawPlan() {
    if (!paintPlan) return;
    const w = mapCanvas.clientWidth || 180;
    const h = planHeight ? planHeight(w) : Math.round(w * 0.46);
    const pxH = h + "px";
    if (mapCanvas.style.height !== pxH) mapCanvas.style.height = pxH;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    if (mapCanvas.width !== bw || mapCanvas.height !== bh) {
      mapCanvas.width = bw;
      mapCanvas.height = bh;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paintPlan(ctx, w, h);
  }

  musicTimer = window.setInterval(pollMusic, 4000);

  let robotSentAt = 0;
  let faceSentAt = 0;
  let faceSentX = NaN;
  let faceSentZ = NaN;

  return {
    others() { return crowd.list(); },
    linked() { return linked; },
    solo() { return solo; },
    myId() { return me ? me.id : ""; },
    name() { return myName || ""; },
    sendRobot(pose) {
      if (!linked || !pose) return;
      const now = performance.now();
      if (now < robotSentAt) return;
      robotSentAt = now + 100;
      send({ t: "robot", x: pose.x, z: pose.z, yaw: pose.yaw });
    },
    sendRobotFace(x, z) {
      if (!linked) return;
      const now = performance.now();
      const moved = Math.hypot(x - faceSentX, z - faceSentZ) > 0.04;
      if (Number.isFinite(faceSentX) && !moved) return;
      if (now < faceSentAt) return;
      faceSentAt = now + 120;
      faceSentX = x;
      faceSentZ = z;
      send({ t: "robot-face", x, z });
    },
    sendRobotFaceOff() {
      faceSentAt = 0;
      faceSentX = NaN;
      faceSentZ = NaN;
      if (!linked) return;
      send({ t: "robot-face", off: 1 });
    },
    postNote(text, parent) {
      if (!linked) return false;
      const msg = { t: "note", text };
      if (parent) msg.parent = String(parent).slice(0, 48);
      send(msg);
      return true;
    },
    closeRoster() { setRoster(false); },
    syncTabHint,
    dismiss(keepRoster) {
      if (!keepRoster) setRoster(false);
      if (corner.classList.contains("nav-open")) setDrawer(false);
      closeChat();
    },
    update(dt, now) {
      crowd.update(dt, now);
      const pose = getPose();
      if (!document.hidden) watchHall(pose);
      // 跟人每一帧的位置走。原先约 140 毫秒才重画，人标会一跳一跳。
      if (showMap) drawPlan();
      sweepChatter(now);
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
