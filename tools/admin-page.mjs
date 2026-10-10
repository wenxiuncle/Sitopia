import { HALLS, PIN_CAP } from "../js/layout.js";

const hallBoot = JSON.stringify(HALLS.map((hall) => ({ id: hall.id, name: hall.name })));

export const adminHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>趣站博物馆后台</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font: 15px/1.5 "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #2c2926;
      background: #f4f0ea;
    }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 20px 48px; }
    h1 { font-size: 22px; font-weight: 650; margin: 0; }
    h2 { font-size: 18px; font-weight: 650; margin: 28px 0 0; }
    button, input, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; }
    #login {
      max-width: 360px;
      margin: 12vh auto 0;
      padding: 22px 22px 18px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #login p { margin: 8px 0 0; color: #8a4b32; min-height: 1.4em; }
    label { display: block; margin: 14px 0 8px; }
    input[type="password"], input[type="number"], input[type="date"], select {
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid rgba(44, 41, 38, 0.16);
      background: #fff;
    }
    input[type="password"] { width: 100%; }
    button.solid, button.line, #login button {
      border: 1px solid #2c2926;
      background: #2c2926;
      color: #fffcf8;
      padding: 8px 14px;
    }
    button.line {
      background: transparent;
      color: #2c2926;
    }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    #max-form, #kick-form, #visit-form, #frame-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 18px 0;
      padding: 12px 14px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #arrange-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      margin: 18px 0;
    }
    .arrange-card {
      min-width: 0;
      padding: 12px 14px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #arrange-order-card { display: flex; flex-direction: column; }
    #arrange-order-card .hint { display: block; margin-top: auto; padding-top: 12px; }
    #arrange-pin { display: flex; flex-direction: column; }
    #arrange-pin > label {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin: 0;
    }
    #arrange-pin .solid { align-self: flex-start; margin-top: 12px; }
    @media (max-width: 720px) {
      #arrange-form { grid-template-columns: 1fr; }
    }
    #max { width: 5em; }
    #halls { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    #halls li { display: flex; align-items: center; gap: 8px; }
    #halls button { padding: 4px 8px; border: 1px solid #2c2926; background: transparent; }
    #arrange-pins {
      display: block;
      box-sizing: border-box;
      width: 100%;
      flex: 1;
      min-height: 12em;
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px solid rgba(44, 41, 38, 0.16);
      background: #fff;
      resize: vertical;
    }
    #frame-status, #arrange-status { min-height: 1.4em; color: #6f6a64; }
    #visit-status { min-height: 1.4em; color: #6f6a64; }
    #visit-pager {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0 0;
    }
    #visit-pager button { padding: 4px 10px; min-width: 2.4em; }
    #visit-pager button:disabled { cursor: default; }
    #visit-trend {
      margin: 18px 0;
      padding: 12px 14px 8px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #visit-trend figcaption { margin: 0 0 4px; font-size: 13px; font-weight: 650; color: #6f6a64; }
    #visit-chart { position: relative; }
    #visit-chart svg { display: block; width: 100%; height: auto; cursor: crosshair; }
    #visit-tip {
      position: absolute;
      z-index: 2;
      padding: 6px 8px;
      background: #2c2926;
      color: #fffcf8;
      font-size: 13px;
      line-height: 1.45;
      pointer-events: none;
      white-space: nowrap;
    }
    .hint { color: #6f6a64; }
    #status { min-height: 1.4em; color: #6f6a64; }
    table { width: 100%; border-collapse: collapse; background: rgba(255, 252, 248, 0.94); }
    #visit-table { width: auto; table-layout: auto; }
    #visit-table .nick { text-align: center; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(44, 41, 38, 0.08); vertical-align: top; }
    th { font-size: 13px; color: #6f6a64; font-weight: 650; }
    td button { padding: 4px 8px; border: 1px solid #2c2926; background: transparent; }
    #empty { padding: 16px 10px; color: #6f6a64; }
  </style>
</head>
<body>
  <section id="login">
    <h1>趣站博物馆后台</h1>
    <form id="login-form">
      <label>口令<input id="token" type="password" autocomplete="current-password"></label>
      <button type="submit">进入</button>
      <p id="login-error"></p>
    </form>
  </section>
  <main id="app" hidden>
    <header>
      <h1>趣站博物馆后台</h1>
      <button id="logout" type="button">退出</button>
    </header>
    <h2>此刻在馆</h2>
    <form id="max-form">
      <label>最大在线人数 <input id="max" type="number" min="1" max="24" step="1"></label>
      <button class="solid" type="submit">保存</button>
      <span class="hint">硬顶 24。只限制正在馆里的联机人数，单人和把页面藏到后台的人不占名额。</span>
    </form>
    <form id="kick-form">
      <label>踢出时长
        <select id="kick-span">
          <option value="10">10 分钟</option>
          <option value="1440">24 小时</option>
        </select>
      </label>
      <span class="hint">踢的是这一次打开的标签页。对方新开一个标签会换成新座位，需要再踢一次。</span>
    </form>
    <p id="status">正在读取…</p>
    <table>
      <thead>
        <tr>
          <th>昵称</th>
          <th>模式</th>
          <th>状态</th>
          <th>楼层</th>
          <th>入馆</th>
          <th>停留</th>
          <th>IP</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
    <p id="empty" hidden>现在没有人。</p>
    <h2>来访记录</h2>
    <figure id="visit-trend">
      <figcaption>近 30 天 <span class="hint">按入馆的北京时间，含今天。停在某一天看当天访问量。</span></figcaption>
      <div id="visit-chart"></div>
    </figure>
    <form id="visit-form">
      <label>日期 <input id="visit-day" type="date"></label>
      <button class="solid" type="submit">查看</button>
      <span class="hint">按入馆的北京时间，保留 90 天。同一个标签页记一次，新开一个标签再记一次。</span>
    </form>
    <p id="visit-status">正在读取…</p>
    <table id="visit-table">
      <thead>
        <tr>
          <th class="nick">昵称</th>
          <th>模式</th>
          <th>入馆</th>
          <th>离开</th>
          <th>停留</th>
          <th>IP</th>
        </tr>
      </thead>
      <tbody id="visit-rows"></tbody>
    </table>
    <nav id="visit-pager" hidden></nav>
    <p id="visit-empty" hidden>这一天没有来访。</p>
    <h2>画框</h2>
    <form id="frame-form">
      <button class="solid" type="submit">立即更新</button>
      <button class="line" id="frame-full" type="button">全部重抓</button>
      <span class="hint">每天上午 9:07 抓一次新文章。这次已经成功，9:41 就不再抓；只有上午没成功才会补一次。立即更新只抓上次清单之后新发布的文章。全部重抓会重读四个分类，旧文改过的标题、已挂和已删除会一起更新。有变化才会换成新画框，已经打开的展厅要刷新才看得到。</span>
    </form>
    <p id="frame-status">正在读取…</p>
    <h2>默认排列</h2>
    <form id="arrange-form">
      <div class="arrange-card" id="arrange-order-card">
        <ol id="halls"></ol>
        <label>厅内顺序
          <select id="arrange-order">
            <option value="new">从新到旧</option>
            <option value="old">从旧到新</option>
          </select>
        </label>
        <span class="hint">下次进馆生效。厅的先后决定先看到哪一类；一篇文章进了多个分类时，归到更靠前的厅。最多 ${PIN_CAP} 篇置顶，按填写顺序挂在进门那面墙。墙上几行几列不变。</span>
      </div>
      <div class="arrange-card" id="arrange-pin">
        <label>进门置顶
          <textarea id="arrange-pins" rows="10" inputmode="numeric" autocomplete="off" placeholder="文章编号，用逗号或空格分开"></textarea>
        </label>
        <button class="solid" type="submit">保存排列</button>
      </div>
    </form>
    <p id="arrange-status"></p>
  </main>
  <script>
    const login = document.getElementById("login");
    const app = document.getElementById("app");
    const loginError = document.getElementById("login-error");
    const rows = document.getElementById("rows");
    const empty = document.getElementById("empty");
    const status = document.getElementById("status");
    const maxInput = document.getElementById("max");
    const visitDay = document.getElementById("visit-day");
    const visitRows = document.getElementById("visit-rows");
    const visitEmpty = document.getElementById("visit-empty");
    const visitStatus = document.getElementById("visit-status");
    const visitPager = document.getElementById("visit-pager");
    const VISIT_PAGE = 20;
    let visitPage = 1;
    let visitCache = null;
    const frameStatus = document.getElementById("frame-status");
    const arrangeStatus = document.getElementById("arrange-status");
    const arrangeOrder = document.getElementById("arrange-order");
    const arrangePins = document.getElementById("arrange-pins");
    const HALL_LIST = ${hallBoot};
    const PIN_CAP = ${PIN_CAP};
    let timer = 0;
    let shownVisitDay = "";
    let deskLoaded = false;
    let hallIds = HALL_LIST.map((hall) => hall.id);

    function shanghaiToday() {
      return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    function clock(ms) {
      return new Date(ms).toLocaleString("zh-CN", {
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Shanghai",
      });
    }

    function dwell(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h) return h + " 小时 " + (m % 60) + " 分";
      if (m) return m + " 分 " + (s % 60) + " 秒";
      return s + " 秒";
    }

    function floorOf(y) {
      if (y == null || !Number.isFinite(Number(y))) return "—";
      return (Math.floor(Number(y) / 5.4 + 1e-6) + 1) + "F";
    }

    function showLogin(message) {
      window.clearInterval(timer);
      app.hidden = true;
      login.hidden = false;
      loginError.textContent = message || "";
    }

    function showApp() {
      login.hidden = true;
      app.hidden = false;
    }

    async function readJson(res) {
      try { return await res.json(); } catch { return null; }
    }

    function paint(data) {
      const people = data.people || [];
      const now = data.now || Date.now();
      maxInput.max = String(data.cap || 24);
      if (document.activeElement !== maxInput) maxInput.value = String(data.max || 24);
      let solo = 0;
      let away = 0;
      for (let i = 0; i < people.length; i++) {
        if (people[i].mode === "solo") solo += 1;
        if (people[i].away) away += 1;
      }
      status.textContent = "联机在馆 " + (data.inHall || 0) + " / " + (data.max || 24)
        + " · 单人 " + solo + " · 页面在后台 " + away + " · 每 5 秒刷新";
      rows.replaceChildren();
      empty.hidden = people.length > 0;
      for (let i = 0; i < people.length; i++) {
        const person = people[i];
        const tr = document.createElement("tr");
        const cells = [
          person.name || "访客",
          person.mode === "solo" ? "单人" : "联机",
          person.away ? "页面在后台" : "在馆",
          floorOf(person.y),
          clock(person.entered),
          dwell(now - person.entered),
          person.ip || "—",
        ];
        for (let c = 0; c < cells.length; c++) {
          const td = document.createElement("td");
          td.textContent = cells[c];
          tr.appendChild(td);
        }
        const op = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "踢出";
        button.addEventListener("click", () => kick(person, button));
        op.appendChild(button);
        tr.appendChild(op);
        rows.appendChild(tr);
      }
    }

    async function refresh() {
      const res = await fetch("/admin/api/state", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        showLogin("");
        return;
      }
      const data = await readJson(res);
      if (!res.ok || !data) {
        status.textContent = "房间没有返回名单";
        return;
      }
      showApp();
      paint(data);
      if (!visitDay.value) visitDay.value = shanghaiToday();
      if (visitDay.value === shanghaiToday() || visitDay.value !== shownVisitDay) refreshVisits();
      if (!deskLoaded) {
        deskLoaded = true;
        refreshFrames();
        refreshArrange();
      }
    }

    function hallName(id) {
      for (let i = 0; i < HALL_LIST.length; i++) if (HALL_LIST[i].id === id) return HALL_LIST[i].name;
      return id;
    }

    function paintHalls() {
      const list = document.getElementById("halls");
      list.replaceChildren();
      for (let i = 0; i < hallIds.length; i++) {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = hallName(hallIds[i]);
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "上移";
        up.disabled = i === 0;
        up.addEventListener("click", () => moveHall(i, -1));
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "下移";
        down.disabled = i === hallIds.length - 1;
        down.addEventListener("click", () => moveHall(i, 1));
        li.append(name, up, down);
        list.appendChild(li);
      }
    }

    function moveHall(index, step) {
      const next = index + step;
      if (next < 0 || next >= hallIds.length) return;
      const swap = hallIds[index];
      hallIds[index] = hallIds[next];
      hallIds[next] = swap;
      paintHalls();
    }

    function parsePins(text) {
      const parts = String(text || "").split(/[\s,，]+/);
      const pins = [];
      const seen = new Set();
      for (let i = 0; i < parts.length && pins.length < PIN_CAP; i++) {
        if (!parts[i]) continue;
        const id = Math.floor(Number(parts[i]));
        if (!Number.isFinite(id) || id < 1 || seen.has(id)) continue;
        seen.add(id);
        pins.push(id);
      }
      return pins;
    }

    function when(iso) {
      const ms = Date.parse(iso);
      if (!iso || Number.isNaN(ms)) return "";
      return clock(ms);
    }

    function paintFrames(data) {
      if (!data) {
        frameStatus.textContent = "没有读到抓取记录";
        return;
      }
      if (data.reason === "missing" && data.status === "none") {
        frameStatus.textContent = "仓库里还没有这次抓取的工作流";
        return;
      }
      if (data.reason === "github" || data.reason === "network") {
        frameStatus.textContent = "没有读到抓取记录";
        return;
      }
      const count = data.count == null ? "" : " · 展品 " + data.count;
      const at = when(data.at);
      const title = data.title ? " · " + data.title : "";
      if (data.status === "queued" || data.status === "running") {
        frameStatus.textContent = "正在抓取" + title + (at ? " · " + at : "");
        return;
      }
      if (data.status === "success") {
        frameStatus.textContent = "上次成功" + (at ? " " + at : "") + count;
        return;
      }
      if (data.status === "failure") {
        frameStatus.textContent = "上次失败" + (at ? " " + at : "") + (data.reason ? " · " + data.reason : "") + count;
        return;
      }
      if (data.status === "cancelled") {
        frameStatus.textContent = "上次取消" + (at ? " " + at : "") + count;
        return;
      }
      frameStatus.textContent = data.token ? "还没有抓过" : "还没有抓过。按钮要等 GitHub 令牌写进反代";
    }

    async function refreshFrames() {
      try {
        const res = await fetch("/admin/api/frames", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) {
          showLogin("口令已失效");
          return;
        }
        paintFrames(await readJson(res));
      } catch {
        frameStatus.textContent = "没有读到抓取记录";
      }
    }

    function paintArrange(data) {
      const clean = data && Array.isArray(data.halls) ? data.halls : HALL_LIST.map((hall) => hall.id);
      hallIds = [];
      for (let i = 0; i < clean.length; i++) if (hallIds.indexOf(clean[i]) < 0) hallIds.push(clean[i]);
      for (let i = 0; i < HALL_LIST.length; i++) if (hallIds.indexOf(HALL_LIST[i].id) < 0) hallIds.push(HALL_LIST[i].id);
      arrangeOrder.value = data && data.order === "old" ? "old" : "new";
      arrangePins.value = data && Array.isArray(data.pins) ? data.pins.join(", ") : "";
      paintHalls();
    }

    async function refreshArrange() {
      try {
        const res = await fetch("/admin/api/arrange", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) {
          showLogin("口令已失效");
          return;
        }
        const data = await readJson(res);
        if (!res.ok || !data) {
          arrangeStatus.textContent = "没有读到排列";
          paintArrange(null);
          return;
        }
        paintArrange(data);
        arrangeStatus.textContent = "";
      } catch {
        arrangeStatus.textContent = "没有读到排列";
      }
    }

    function paintVisitRows() {
      const data = visitCache || { visits: [] };
      const list = data.visits || [];
      const now = data.now || Date.now();
      const pages = Math.max(1, Math.ceil(list.length / VISIT_PAGE));
      if (visitPage > pages) visitPage = pages;
      if (visitPage < 1) visitPage = 1;
      const start = (visitPage - 1) * VISIT_PAGE;
      const slice = list.slice(start, start + VISIT_PAGE);
      visitRows.replaceChildren();
      visitEmpty.hidden = list.length > 0;
      for (let i = 0; i < slice.length; i++) {
        const visit = slice[i];
        const tr = document.createElement("tr");
        const cells = [
          visit.nameLast || visit.nameIn || "访客",
          visit.mode === "solo" ? "单人" : "联机",
          clock(visit.entered),
          visit.leftAt ? clock(visit.leftAt) : "还在",
          dwell((visit.leftAt || now) - visit.entered),
          visit.ip || "—",
        ];
        for (let c = 0; c < cells.length; c++) {
          const td = document.createElement("td");
          if (c === 0) td.className = "nick";
          td.textContent = cells[c];
          tr.appendChild(td);
        }
        visitRows.appendChild(tr);
      }
      visitPager.replaceChildren();
      visitPager.hidden = list.length <= VISIT_PAGE;
      for (let p = 1; p <= pages && !visitPager.hidden; p++) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(p);
        button.dataset.page = String(p);
        button.className = p === visitPage ? "solid" : "line";
        if (p === visitPage) {
          button.disabled = true;
          button.setAttribute("aria-current", "page");
        }
        visitPager.appendChild(button);
      }
    }

    function paintVisits(data) {
      const list = data.visits || [];
      const day = data.day || visitDay.value;
      if (day !== shownVisitDay) visitPage = 1;
      shownVisitDay = day;
      visitCache = data;
      let text = day + " · " + list.length + " 次";
      if (data.truncated) text += " · 只列出最近 500 次";
      text += " · 保留 " + (data.keepDays || 90) + " 天";
      if (list.length > VISIT_PAGE) text += " · 每页 " + VISIT_PAGE + " 条";
      visitStatus.textContent = text;
      paintVisitRows();
      paintTrend(data.trend);
    }

    function paintTrend(days) {
      const host = document.getElementById("visit-chart");
      const list = Array.isArray(days) ? days : [];
      if (!list.length) {
        host.dataset.sig = "";
        host.replaceChildren();
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = "还没有近 30 天的访问";
        host.appendChild(note);
        return;
      }
      const parts = [];
      for (let i = 0; i < list.length; i++) parts.push((list[i].day || "") + ":" + (Number(list[i].count) || 0));
      const sig = parts.join(",");
      if (host.dataset.sig === sig && host.querySelector("svg")) return;
      host.dataset.sig = sig;
      host.replaceChildren();

      const svgNS = "http://www.w3.org/2000/svg";
      const width = 640;
      const height = 168;
      const padL = 36;
      const padR = 12;
      const padT = 16;
      const padB = 26;
      const plotW = width - padL - padR;
      const plotH = height - padT - padB;
      const colW = plotW / list.length;
      let peak = 0;
      const counts = [];
      for (let i = 0; i < list.length; i++) {
        const n = Number(list[i].count) || 0;
        counts.push(n);
        if (n > peak) peak = n;
      }
      const max = peak > 0 ? peak : 1;
      const base = padT + plotH;

      function xAt(i) { return padL + colW * i + colW / 2; }
      function yAt(count) { return base - (plotH * count) / max; }
      function el(name) { return document.createElementNS(svgNS, name); }

      const svg = el("svg");
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "近30天访问趋势");

      const coords = [];
      for (let i = 0; i < list.length; i++) coords.push(xAt(i) + "," + yAt(counts[i]));
      const area = el("polygon");
      area.setAttribute("fill", "rgba(44,41,38,0.08)");
      area.setAttribute("points", xAt(0) + "," + base + " " + coords.join(" ") + " " + xAt(list.length - 1) + "," + base);
      svg.appendChild(area);

      const line = el("polyline");
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "#2c2926");
      line.setAttribute("stroke-width", "1.75");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("points", coords.join(" "));
      svg.appendChild(line);

      const axis = el("line");
      axis.setAttribute("x1", String(padL));
      axis.setAttribute("x2", String(padL + plotW));
      axis.setAttribute("y1", String(base));
      axis.setAttribute("y2", String(base));
      axis.setAttribute("stroke", "rgba(44,41,38,0.16)");
      svg.appendChild(axis);

      function textAt(content, x, y, anchor) {
        const node = el("text");
        node.textContent = content;
        node.setAttribute("x", String(x));
        node.setAttribute("y", String(y));
        node.setAttribute("text-anchor", anchor);
        node.setAttribute("dominant-baseline", "middle");
        node.setAttribute("fill", "#6f6a64");
        node.setAttribute("font-size", "11");
        return node;
      }
      svg.appendChild(textAt(String(peak), padL - 6, yAt(peak), "end"));
      if (peak > 0) svg.appendChild(textAt("0", padL - 6, base, "end"));

      const marks = [];
      for (let i = 0; i < list.length; i++) {
        if (i === 0 || i === list.length - 1 || i % 5 === 0) marks.push(i);
      }
      const kept = [];
      for (let i = 0; i < marks.length; i++) {
        const index = marks[i];
        if (!kept.length || index - kept[kept.length - 1] >= 4) kept.push(index);
        else if (index === list.length - 1) {
          kept.pop();
          kept.push(index);
        }
      }
      for (let i = 0; i < kept.length; i++) {
        const index = kept[i];
        svg.appendChild(textAt(String(list[index].day || "").slice(5), xAt(index), height - 10, "middle"));
      }

      const guide = el("line");
      guide.setAttribute("y1", String(padT));
      guide.setAttribute("y2", String(base));
      guide.setAttribute("stroke", "rgba(44,41,38,0.35)");
      guide.setAttribute("visibility", "hidden");
      svg.appendChild(guide);

      const dot = el("circle");
      dot.setAttribute("r", "3.5");
      dot.setAttribute("fill", "#2c2926");
      dot.setAttribute("visibility", "hidden");
      svg.appendChild(dot);

      const tip = document.createElement("div");
      tip.id = "visit-tip";
      tip.hidden = true;

      function hide() {
        tip.hidden = true;
        guide.setAttribute("visibility", "hidden");
        dot.setAttribute("visibility", "hidden");
      }

      function show(index) {
        const x = xAt(index);
        const y = yAt(counts[index]);
        guide.setAttribute("x1", String(x));
        guide.setAttribute("x2", String(x));
        guide.setAttribute("visibility", "visible");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("visibility", "visible");
        tip.replaceChildren();
        const dateLine = document.createElement("div");
        dateLine.textContent = "日期 " + (list[index].day || "");
        const countLine = document.createElement("div");
        countLine.textContent = "访问量 " + counts[index];
        tip.append(dateLine, countLine);
        tip.hidden = false;
        const svgBox = svg.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        const px = svgBox.left - hostBox.left + (x / width) * svgBox.width;
        const py = svgBox.top - hostBox.top + (y / height) * svgBox.height;
        let left = px + 12;
        let top = py - tip.offsetHeight - 10;
        if (top < 0) top = py + 12;
        if (left + tip.offsetWidth > host.clientWidth) left = Math.max(0, px - tip.offsetWidth - 12);
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      }

      function hit(event) {
        const box = svg.getBoundingClientRect();
        if (!box.width) return;
        const x = ((event.clientX - box.left) / box.width) * width;
        const index = Math.floor((x - padL) / colW);
        if (x < padL || x > padL + plotW || index < 0 || index >= list.length) hide();
        else show(index);
      }

      svg.addEventListener("pointermove", hit);
      svg.addEventListener("pointerdown", hit);
      svg.addEventListener("pointerleave", hide);
      host.append(svg, tip);
    }

    async function refreshVisits() {
      if (!visitDay.value) visitDay.value = shanghaiToday();
      try {
        const res = await fetch("/admin/api/visits?day=" + encodeURIComponent(visitDay.value), {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (res.status === 401) {
          showLogin("口令已失效");
          return;
        }
        const data = await readJson(res);
        if (!res.ok || !data) {
          visitStatus.textContent = "没有返回这一天的来访";
          return;
        }
        paintVisits(data);
      } catch {
        visitStatus.textContent = "没有返回这一天的来访";
      }
    }

    async function kick(person, button) {
      button.disabled = true;
      const minutes = Number(document.getElementById("kick-span").value);
      const res = await fetch("/admin/api/kick", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat: person.seat, id: person.id, minutes: minutes }),
      });
      button.disabled = false;
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      if (!res.ok) {
        status.textContent = "没有踢出去";
        return;
      }
      refresh();
    }

    document.getElementById("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      loginError.textContent = "";
      const res = await fetch("/admin/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: document.getElementById("token").value }),
      });
      if (res.status === 503) {
        loginError.textContent = "线上口令还没设置";
        return;
      }
      if (!res.ok) {
        loginError.textContent = "口令不对";
        return;
      }
      refresh();
      window.clearInterval(timer);
      timer = window.setInterval(refresh, 5000);
    });

    document.getElementById("max-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const res = await fetch("/admin/api/max", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: Number(maxInput.value) }),
      });
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      if (!res.ok) {
        status.textContent = "人数要在 1 到 24 之间";
        return;
      }
      refresh();
    });

    document.getElementById("visit-form").addEventListener("submit", (event) => {
      event.preventDefault();
      visitPage = 1;
      refreshVisits();
    });

    visitPager.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const page = Number(button.dataset.page);
      if (!page || page === visitPage) return;
      visitPage = page;
      paintVisitRows();
    });

    async function queueFrames(full) {
      frameStatus.textContent = "正在排队…";
      const res = await fetch("/admin/api/frames", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full: !!full }),
      });
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      const data = await readJson(res);
      const error = data && data.error;
      if (error === "unset") {
        frameStatus.textContent = "还没设置 GitHub 令牌。抓取按钮要等令牌写进反代的 GITHUB_DISPATCH_TOKEN";
        return;
      }
      if (error === "denied") {
        frameStatus.textContent = "GitHub 令牌不能触发这次抓取";
        return;
      }
      if (error === "missing") {
        frameStatus.textContent = "仓库里还没有这次抓取的工作流";
        return;
      }
      if (!data || !data.ok) {
        frameStatus.textContent = "没有排上这次抓取";
        return;
      }
      frameStatus.textContent = full
        ? "已经排队。正在重读四个分类的全部文章，旧文的标题、已挂和删除会一起更新"
        : "已经排队。只抓上次清单之后新发布的文章";
      window.setTimeout(refreshFrames, 4000);
    }

    document.getElementById("frame-form").addEventListener("submit", (event) => {
      event.preventDefault();
      queueFrames(false);
    });
    document.getElementById("frame-full").addEventListener("click", () => queueFrames(true));

    document.getElementById("arrange-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const pins = parsePins(arrangePins.value);
      const res = await fetch("/admin/api/arrange", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ halls: hallIds, order: arrangeOrder.value, pins: pins }),
      });
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      const data = await readJson(res);
      if (!res.ok || !data) {
        arrangeStatus.textContent = "没有保存";
        return;
      }
      paintArrange(data);
      arrangeStatus.textContent = "已保存。下次进馆生效";
    });

    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/admin/api/logout", { method: "POST", credentials: "same-origin" });
      showLogin("");
    });

    visitDay.value = shanghaiToday();
    refresh().then(() => {
      if (!app.hidden) {
        window.clearInterval(timer);
        timer = window.setInterval(refresh, 5000);
      }
    });
  </script>
</body>
</html>
`;
