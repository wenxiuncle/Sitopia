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
    input[type="password"], input[type="number"], select {
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
    #max-form, #kick-form {
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
      <h1>此刻在馆</h1>
      <button id="logout" type="button">退出</button>
    </header>
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
  </main>
  <script>
    const login = document.getElementById("login");
    const app = document.getElementById("app");
    const loginError = document.getElementById("login-error");
    const rows = document.getElementById("rows");
    const empty = document.getElementById("empty");
    const status = document.getElementById("status");
    const maxInput = document.getElementById("max");
    let timer = 0;

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

    document.getElementById("logout").addEventListener("click", async () => {
      await fetch("/admin/api/logout", { method: "POST", credentials: "same-origin" });
      showLogin("");
    });

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
