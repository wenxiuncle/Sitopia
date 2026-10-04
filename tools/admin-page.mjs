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
    button, input, select { font: inherit; color: inherit; }
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
    button.solid, #login button {
      border: 1px solid #2c2926;
      background: #2c2926;
      color: #fffcf8;
      padding: 8px 14px;
    }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    #max-form, #kick-form, #visit-form, #frame-form, #arrange-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 18px 0;
      padding: 12px 14px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #max { width: 5em; }
    #halls { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    #halls li { display: flex; align-items: center; gap: 8px; }
    #halls button { padding: 4px 8px; border: 1px solid #2c2926; background: transparent; }
    #arrange-pins { width: min(100%, 28em); }
    #frame-status, #arrange-status { min-height: 1.4em; color: #6f6a64; }
    #visit-status { min-height: 1.4em; color: #6f6a64; }
    .hint { color: #6f6a64; }
    #status { min-height: 1.4em; color: #6f6a64; }
    table { width: 100%; border-collapse: collapse; background: rgba(255, 252, 248, 0.94); }
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
    <form id="visit-form">
      <label>日期 <input id="visit-day" type="date"></label>
      <button class="solid" type="submit">查看</button>
      <span class="hint">按入馆的北京时间，保留 90 天。同一个标签页记一次，新开一个标签再记一次。</span>
    </form>
    <p id="visit-status">正在读取…</p>
    <table>
      <thead>
        <tr>
          <th>进馆昵称</th>
          <th>最后昵称</th>
          <th>模式</th>
          <th>入馆</th>
          <th>离开</th>
          <th>停留</th>
          <th>IP</th>
        </tr>
      </thead>
      <tbody id="visit-rows"></tbody>
    </table>
    <p id="visit-empty" hidden>这一天没有来访。</p>
    <h2>画框</h2>
    <form id="frame-form">
      <button class="solid" type="submit">立即更新</button>
      <span class="hint">向 GitHub 要一次抓取。有变化才会换成新画框，已经打开的展厅要刷新才看得到。</span>
    </form>
    <p id="frame-status">正在读取…</p>
    <h2>默认排列</h2>
    <form id="arrange-form">
      <ol id="halls"></ol>
      <label>厅内顺序
        <select id="arrange-order">
          <option value="new">从新到旧</option>
          <option value="old">从旧到新</option>
        </select>
      </label>
      <label>进门置顶 <input id="arrange-pins" type="text" inputmode="numeric" autocomplete="off" placeholder="文章编号，用逗号或空格分开"></label>
      <button class="solid" type="submit">保存排列</button>
      <span class="hint">下次进馆生效。厅的先后决定先看到哪一类；一篇文章进了多个分类时，归到更靠前的厅。最多 ${PIN_CAP} 篇置顶，按填写顺序挂在进门那面墙。墙上几行几列不变。</span>
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
      if (data.status === "queued" || data.status === "running") {
        frameStatus.textContent = "正在抓取" + (at ? " · " + at : "");
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

    function paintVisits(data) {
      const list = data.visits || [];
      const now = data.now || Date.now();
      shownVisitDay = data.day || visitDay.value;
      let text = (data.day || "") + " · " + list.length + " 次";
      if (data.truncated) text += " · 只列出最近 500 次";
      text += " · 保留 " + (data.keepDays || 90) + " 天";
      visitStatus.textContent = text;
      visitRows.replaceChildren();
      visitEmpty.hidden = list.length > 0;
      for (let i = 0; i < list.length; i++) {
        const visit = list[i];
        const tr = document.createElement("tr");
        const cells = [
          visit.nameIn || "访客",
          visit.nameLast || visit.nameIn || "访客",
          visit.mode === "solo" ? "单人" : "联机",
          clock(visit.entered),
          visit.leftAt ? clock(visit.leftAt) : "还在",
          dwell((visit.leftAt || now) - visit.entered),
          visit.ip || "—",
        ];
        for (let c = 0; c < cells.length; c++) {
          const td = document.createElement("td");
          td.textContent = cells[c];
          tr.appendChild(td);
        }
        visitRows.appendChild(tr);
      }
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
      refreshVisits();
    });

    document.getElementById("frame-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      frameStatus.textContent = "正在排队…";
      const res = await fetch("/admin/api/frames", {
        method: "POST",
        credentials: "same-origin",
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
      frameStatus.textContent = "已经排队。抓完有变化才会换成新画框，打开着的展厅要刷新才看得到";
      window.setTimeout(refreshFrames, 4000);
    });

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
