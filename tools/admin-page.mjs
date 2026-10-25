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
    input[type="password"], input[type="number"], input[type="date"], input[type="text"], select {
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
    #max-form, #kick-form, #visit-form, #frame-form, #sign-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 18px 0;
      padding: 12px 14px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #arrange-form, #music-form {
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
    #arrange-order-card, #music-order-card { display: flex; flex-direction: column; }
    #arrange-order-card .hint, #music-order-card .hint { display: block; margin-top: auto; padding-top: 12px; }
    #music-volume-card { display: flex; flex-direction: column; }
    #music-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    #music-volume { width: 5em; }
    #music-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    #music-list li { display: flex; align-items: center; gap: 8px; }
    #music-list label { display: flex; align-items: center; gap: 4px; margin: 0; flex: none; }
    #music-list .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    #music-list .time { color: #6f6a64; flex: none; }
    #music-list button { padding: 4px 8px; border: 1px solid #2c2926; background: transparent; flex: none; }
    #arrange-pin { display: flex; flex-direction: column; }
    #arrange-pin > label {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin: 0;
    }
    #arrange-pin .solid { align-self: flex-start; margin-top: 12px; }
    @media (max-width: 720px) {
      #arrange-form, #music-form { grid-template-columns: 1fr; }
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
    #frame-status, #arrange-status, #music-status, #sign-status, #video-status { min-height: 1.4em; color: #6f6a64; }
    #video-form {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin: 18px 0;
      padding: 12px 14px;
      background: rgba(255, 252, 248, 0.94);
      border: 1px solid rgba(44, 41, 38, 0.1);
    }
    #video-form > label {
      display: flex;
      flex-direction: column;
      width: 100%;
      margin: 0;
    }
    #video-links {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-height: 12em;
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px solid rgba(44, 41, 38, 0.16);
      background: #fff;
      resize: vertical;
    }
    #sign-text { width: 18em; max-width: 100%; }
    #sign-speed { width: 5em; }
    #page-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 22px 0 0;
    }
    #page-tabs button { font-size: 16px; font-weight: 650; }
    #visit-status { min-height: 1.4em; color: #6f6a64; }
    #visit-pager, #chat-pager, #note-pager {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0 0;
    }
    #visit-pager button, #chat-pager button, #note-pager button { padding: 4px 10px; min-width: 2.4em; }
    #visit-pager button:disabled, #chat-pager button:disabled, #note-pager button:disabled { cursor: default; }
    #board-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 28px 0 0;
    }
    #board-tabs button { font-size: 16px; font-weight: 650; }
    #panel-chat .hint, #panel-note .hint { margin: 12px 0 0; }
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
    #visit-table .nick { text-align: center; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(44, 41, 38, 0.08); vertical-align: top; }
    th { font-size: 13px; color: #6f6a64; font-weight: 650; }
    td button { padding: 4px 8px; border: 1px solid #2c2926; background: transparent; }
    #empty, #chat-empty, #note-empty { padding: 16px 10px; color: #6f6a64; }
    #chat-status, #note-status { min-height: 1.4em; color: #6f6a64; }
    td.board-text { word-break: break-word; }
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
    <div id="page-tabs" role="tablist">
      <button type="button" id="tab-page-visit" class="solid" role="tab" aria-selected="true" aria-controls="page-visit">访问数据</button>
      <button type="button" id="tab-page-board" class="line" role="tab" aria-selected="false" aria-controls="page-board">互动数据</button>
      <button type="button" id="tab-page-frames" class="line" role="tab" aria-selected="false" aria-controls="page-frames">画框设置</button>
      <button type="button" id="tab-page-museum" class="line" role="tab" aria-selected="false" aria-controls="page-museum">博物馆设置</button>
    </div>
    <section id="page-visit" role="tabpanel" aria-labelledby="tab-page-visit">
    <h2>此刻在馆</h2>
    <form id="max-form">
      <label>最大在线人数 <input id="max" type="number" min="1" max="24" step="1"></label>
      <button class="solid" type="submit">保存</button>
      <span class="hint">硬顶 24。只限制正在馆里的联机人数。点开画框链接或把页面放到后台，十分钟内仍算在馆；关掉页面马上离开。单人不占名额。</span>
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
    </section>
    <section id="page-board" role="tabpanel" aria-labelledby="tab-page-board" hidden>
    <div id="board-tabs" role="tablist">
      <button type="button" id="tab-chat" class="solid" role="tab" aria-selected="true" aria-controls="panel-chat" data-kind="chat">聊天记录</button>
      <button type="button" id="tab-note" class="line" role="tab" aria-selected="false" aria-controls="panel-note" data-kind="note">访客留言</button>
    </div>
    <section id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
      <p class="hint">馆里还留着的最近聊天。删掉后，正在逛的人那边也会消失。</p>
      <p id="chat-status">正在读取…</p>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>昵称</th>
            <th>内容</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="chat-rows"></tbody>
      </table>
      <nav id="chat-pager" hidden></nav>
      <p id="chat-empty" hidden>没有聊天记录。</p>
    </section>
    <section id="panel-note" role="tabpanel" aria-labelledby="tab-note" hidden>
      <p class="hint">留言簿上大家都能看见的话。删掉后，展厅里也会拿掉这一条。</p>
      <p id="note-status">正在读取…</p>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>昵称</th>
            <th>内容</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="note-rows"></tbody>
      </table>
      <nav id="note-pager" hidden></nav>
      <p id="note-empty" hidden>没有留言。</p>
    </section>
    </section>
    <section id="page-frames" role="tabpanel" aria-labelledby="tab-page-frames" hidden>
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
    </section>
    <section id="page-museum" role="tabpanel" aria-labelledby="tab-page-museum" hidden>
    <h2>展厅音乐</h2>
    <form id="music-form">
      <div class="arrange-card" id="music-order-card">
        <ol id="music-list"></ol>
        <span class="hint">自动读 audio 文件夹里的曲子。上移、下移调整循环顺序。勾上「播放」的才会在展厅里放，没勾的留在名单里。馆里有人时才放，没人就停在刚才的进度。广场和观景台仍会把声音放轻，菜单里的音乐开关也还在。</span>
      </div>
      <div class="arrange-card" id="music-volume-card">
        <label>音量
          <input id="music-volume" type="number" min="0" max="100" step="1" inputmode="numeric" autocomplete="off" value="100">
        </label>
        <span class="hint">填 0 到 100 的整数。100 和现在馆里一样响，数字越小越轻。</span>
        <div id="music-actions">
          <button class="line" id="music-rescan" type="button">重新识别</button>
          <button class="solid" id="music-save" type="submit">保存音乐</button>
        </div>
      </div>
    </form>
    <p id="music-status"></p>
    <h2>胸前屏幕</h2>
    <form id="sign-form">
      <label>滚动文字 <input id="sign-text" type="text" maxlength="32" autocomplete="off" value="欢迎光临"></label>
      <label>滚动速度 <input id="sign-speed" type="number" min="0" max="100" step="1" inputmode="numeric" autocomplete="off" value="20"></label>
      <button class="solid" type="submit">保存</button>
      <span class="hint">一楼接待机器人胸前，字从右往左循环滚。最多 32 个字。留空就回到「欢迎光临」。速度填 0 到 100 的整数，0 是字停住，20 是现在这一档，100 最快，大约是现在的 5 倍。比 20 大就更快。正在馆里的人会跟着换。</span>
    </form>
    <p id="sign-status"></p>
    <h2>大屏幕</h2>
    <form id="video-form">
      <label>视频链接
        <textarea id="video-links" rows="12" autocomplete="off" spellcheck="false" placeholder="https://www.bilibili.com/video/BV...&#10;https://www.youtube.com/watch?v=..."></textarea>
      </label>
      <button class="solid" type="submit">保存</button>
      <span class="hint">一行一条，最多 20 条。B 站请贴完整的 BV 地址，YouTube 贴 watch、youtu.be 或 shorts。留空就不预填。保存后，正在馆里、还没改过大屏幕卡片的人，输入框会换成这份链接。</span>
    </form>
    <p id="video-status"></p>
    </section>
  </main>
  <script>
    const login = document.getElementById("login");
    const app = document.getElementById("app");
    const loginError = document.getElementById("login-error");
    const rows = document.getElementById("rows");
    const empty = document.getElementById("empty");
    const status = document.getElementById("status");
    const chatRows = document.getElementById("chat-rows");
    const chatEmpty = document.getElementById("chat-empty");
    const chatStatus = document.getElementById("chat-status");
    const chatPager = document.getElementById("chat-pager");
    const noteRows = document.getElementById("note-rows");
    const noteEmpty = document.getElementById("note-empty");
    const noteStatus = document.getElementById("note-status");
    const notePager = document.getElementById("note-pager");
    const BOARD_PAGE = 10;
    let chatPage = 1;
    let notePage = 1;
    let chatList = [];
    let noteList = [];
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
    const musicStatus = document.getElementById("music-status");
    const signStatus = document.getElementById("sign-status");
    const videoStatus = document.getElementById("video-status");
    const videoInput = document.getElementById("video-links");
    let videoStamp = 0;
    let videoDirty = false;
    videoInput.addEventListener("input", () => { videoDirty = true; });
    const signInput = document.getElementById("sign-text");
    const signSpeedInput = document.getElementById("sign-speed");
    let signStamp = 0;
    let signDirty = false;
    signInput.addEventListener("input", () => { signDirty = true; });
    signSpeedInput.addEventListener("input", () => { signDirty = true; });
    const musicVolumeInput = document.getElementById("music-volume");
    const musicSave = document.getElementById("music-save");
    let musicOrder = [];
    const arrangeOrder = document.getElementById("arrange-order");
    const arrangePins = document.getElementById("arrange-pins");
    const HALL_LIST = ${hallBoot};
    const PIN_CAP = ${PIN_CAP};
    let timer = 0;
    let shownVisitDay = "";
    let deskLoaded = false;
    let boardLoaded = false;
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
      boardLoaded = false;
      chatPage = 1;
      notePage = 1;
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

    function paint(data, stamp) {
      const people = data.people || [];
      const now = data.now || Date.now();
      maxInput.max = String(data.cap || 24);
      if (document.activeElement !== maxInput) maxInput.value = String(data.max || 24);
      // 名单每 5 秒拉一次。改字或改速度之后，旧的那一响不能把输入盖回保存前的值。
      if (!signDirty && stamp === signStamp) {
        if (typeof data.sign === "string" && document.activeElement !== signInput) signInput.value = data.sign;
        if (Number.isInteger(data.speed) && document.activeElement !== signSpeedInput) signSpeedInput.value = String(data.speed);
      }
      if (!videoDirty && stamp === videoStamp && Array.isArray(data.videos) && document.activeElement !== videoInput) {
        videoInput.value = data.videos.join("\\n");
      }
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
      const stamp = signStamp;
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
      paint(data, stamp);
      if (!boardLoaded) {
        boardLoaded = true;
        refreshBoard();
      }
      if (!visitDay.value) visitDay.value = shanghaiToday();
      if (visitDay.value === shanghaiToday() || visitDay.value !== shownVisitDay) refreshVisits();
      if (!deskLoaded) {
        deskLoaded = true;
        refreshFrames();
        refreshArrange();
        refreshMusic();
      }
    }

    function boardPage(kind) {
      return kind === "chat" ? chatPage : notePage;
    }

    function setBoardPage(kind, page) {
      if (kind === "chat") chatPage = page;
      else notePage = page;
    }

    function paintBoardRows(body, emptyEl, statusEl, pager, rows, kind) {
      const pages = Math.max(1, Math.ceil(rows.length / BOARD_PAGE));
      let page = boardPage(kind);
      if (page > pages) page = pages;
      if (page < 1) page = 1;
      setBoardPage(kind, page);
      const start = (page - 1) * BOARD_PAGE;
      const slice = rows.slice(start, start + BOARD_PAGE);
      body.replaceChildren();
      emptyEl.hidden = rows.length > 0;
      let text = "共 " + rows.length + " 条";
      if (rows.length > BOARD_PAGE) text += " · 每页 " + BOARD_PAGE + " 条";
      statusEl.textContent = text;
      for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        const tr = document.createElement("tr");
        const when = document.createElement("td");
        when.textContent = row.at ? clock(row.at) : "—";
        const who = document.createElement("td");
        who.textContent = row.name || "访客";
        const textCell = document.createElement("td");
        textCell.className = "board-text";
        textCell.textContent = row.text || "";
        const op = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "删除";
        button.addEventListener("click", () => dropBoard(kind, row, button));
        op.appendChild(button);
        tr.append(when, who, textCell, op);
        body.appendChild(tr);
      }
      pager.replaceChildren();
      pager.hidden = rows.length <= BOARD_PAGE;
      for (let p = 1; p <= pages && !pager.hidden; p++) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(p);
        button.dataset.page = String(p);
        button.dataset.kind = kind;
        button.className = p === page ? "solid" : "line";
        if (p === page) {
          button.disabled = true;
          button.setAttribute("aria-current", "page");
        }
        pager.appendChild(button);
      }
    }

    function paintOneBoard(kind) {
      if (kind === "chat") paintBoardRows(chatRows, chatEmpty, chatStatus, chatPager, chatList, "chat");
      else paintBoardRows(noteRows, noteEmpty, noteStatus, notePager, noteList, "note");
    }

    function paintBoard(data) {
      chatList = data.chat || [];
      noteList = data.notes || [];
      paintOneBoard("chat");
      paintOneBoard("note");
    }

    function showPage(name) {
      const names = ["visit", "board", "frames", "museum"];
      for (let i = 0; i < names.length; i++) {
        const id = names[i];
        const on = id === name;
        document.getElementById("page-" + id).hidden = !on;
        const button = document.getElementById("tab-page-" + id);
        button.className = on ? "solid" : "line";
        button.setAttribute("aria-selected", on ? "true" : "false");
      }
    }

    document.getElementById("page-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !button.id || button.id.indexOf("tab-page-") !== 0) return;
      showPage(button.id.slice("tab-page-".length));
    });

    function showBoardTab(kind) {
      const chatOn = kind !== "note";
      document.getElementById("panel-chat").hidden = !chatOn;
      document.getElementById("panel-note").hidden = chatOn;
      const chatBtn = document.getElementById("tab-chat");
      const noteBtn = document.getElementById("tab-note");
      chatBtn.className = chatOn ? "solid" : "line";
      noteBtn.className = chatOn ? "line" : "solid";
      chatBtn.setAttribute("aria-selected", chatOn ? "true" : "false");
      noteBtn.setAttribute("aria-selected", chatOn ? "false" : "true");
    }

    async function refreshBoard() {
      try {
        const res = await fetch("/admin/api/board", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) {
          showLogin("");
          return;
        }
        const data = await readJson(res);
        if (!res.ok || !data) {
          chatStatus.textContent = "没有读到聊天和留言";
          noteStatus.textContent = "没有读到聊天和留言";
          return;
        }
        paintBoard(data);
      } catch {
        chatStatus.textContent = "没有读到聊天和留言";
        noteStatus.textContent = "没有读到聊天和留言";
      }
    }

    async function dropBoard(kind, row, button) {
      const label = kind === "chat" ? "这条聊天" : "这条留言";
      if (!window.confirm("删掉" + label + "？删掉后展厅里也看不到。")) return;
      button.disabled = true;
      const res = await fetch("/admin/api/board", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: kind, id: row.id, at: row.at }),
      });
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      if (!res.ok && res.status !== 404) {
        button.disabled = false;
        const statusEl = kind === "chat" ? chatStatus : noteStatus;
        statusEl.textContent = "没有删掉";
        return;
      }
      refreshBoard();
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
      const parts = String(text || "").split(/[\\s,，]+/);
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
        loginError.textContent = "后台口令还没设置";
        return;
      }
      if (res.status === 429) {
        loginError.textContent = "试得太频繁，过一会儿再来";
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

    document.getElementById("board-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || !button.dataset.kind) return;
      showBoardTab(button.dataset.kind);
    });

    function onBoardPager(event) {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const page = Number(button.dataset.page);
      const kind = button.dataset.kind;
      if (!page || (kind !== "chat" && kind !== "note") || page === boardPage(kind)) return;
      setBoardPage(kind, page);
      paintOneBoard(kind);
    }
    chatPager.addEventListener("click", onBoardPager);
    notePager.addEventListener("click", onBoardPager);

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

    function durationLabel(ms) {
      const s = Math.max(0, Math.round(Number(ms) / 1000));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + ":" + (r < 10 ? "0" : "") + r;
    }

    function paintMusicList() {
      const list = document.getElementById("music-list");
      list.replaceChildren();
      for (let i = 0; i < musicOrder.length; i++) {
        const row = musicOrder[i];
        const li = document.createElement("li");
        const play = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = row.on !== false;
        box.addEventListener("change", () => {
          row.on = box.checked;
        });
        play.append(box, document.createTextNode("播放"));
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = row.file;
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = durationLabel(row.ms);
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "上移";
        up.disabled = i === 0;
        up.addEventListener("click", () => moveMusic(i, -1));
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "下移";
        down.disabled = i === musicOrder.length - 1;
        down.addEventListener("click", () => moveMusic(i, 1));
        li.append(play, name, time, up, down);
        list.appendChild(li);
      }
      musicSave.disabled = musicOrder.length === 0;
    }

    function moveMusic(index, step) {
      const next = index + step;
      if (next < 0 || next >= musicOrder.length) return;
      const swap = musicOrder[index];
      musicOrder[index] = musicOrder[next];
      musicOrder[next] = swap;
      paintMusicList();
    }

    function paintMusic(data) {
      const files = data && Array.isArray(data.files) ? data.files : [];
      musicOrder = [];
      for (let i = 0; i < files.length; i++) {
        const row = files[i];
        if (!row || !row.file) continue;
        musicOrder.push({ file: row.file, ms: row.ms, on: row.on !== false });
      }
      if (document.activeElement !== musicVolumeInput) {
        const volume = data && Number.isInteger(data.volume) ? data.volume : 100;
        musicVolumeInput.value = String(volume);
      }
      paintMusicList();
      const notes = [];
      const pending = data && Array.isArray(data.pending) ? data.pending : [];
      const dropped = data && Array.isArray(data.dropped) ? data.dropped : [];
      if (!musicOrder.length && !pending.length) notes.push("audio 文件夹里没有曲子");
      if (pending.length) notes.push("这几首读不出时长，先不放进循环：" + pending.join("、"));
      if (dropped.length) notes.push("这几首已经不在文件夹里，保存后会从循环拿掉：" + dropped.join("、"));
      musicStatus.textContent = notes.join("。");
    }

    async function refreshMusic(done) {
      try {
        const res = await fetch("/admin/api/music", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) {
          showLogin("口令已失效");
          return;
        }
        const data = await readJson(res);
        if (!res.ok || !data) {
          musicStatus.textContent = data && data.error === "catalog" ? "没有读到 audio 文件夹" : "没有读到曲目";
          return;
        }
        paintMusic(data);
        if (done && !musicStatus.textContent) musicStatus.textContent = done;
      } catch {
        musicStatus.textContent = "没有读到曲目";
      }
    }

    document.getElementById("music-rescan").addEventListener("click", () => {
      refreshMusic("已重新读取文件夹");
    });

    document.getElementById("music-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const raw = musicVolumeInput.value.trim();
      if (!/^[0-9]{1,3}$/.test(raw) || Number(raw) > 100) {
        musicStatus.textContent = "音量要填 0 到 100 的整数";
        return;
      }
      const order = [];
      for (let i = 0; i < musicOrder.length; i++) {
        order.push({ file: musicOrder[i].file, on: musicOrder[i].on !== false });
      }
      musicSave.disabled = true;
      try {
        const res = await fetch("/admin/api/music", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order: order, volume: Number(raw) }),
        });
        if (res.status === 401) {
          showLogin("口令已失效");
          return;
        }
        const data = await readJson(res);
        if (!res.ok || !data || !Array.isArray(data.files)) {
          if (data && data.error === "volume") musicStatus.textContent = "音量要填 0 到 100 的整数";
          else if (data && data.error === "catalog") musicStatus.textContent = "没有读到 audio 文件夹";
          else if (data && data.error === "empty") musicStatus.textContent = "audio 文件夹里没有可以排进循环的曲子";
          else musicStatus.textContent = "没有保存";
          return;
        }
        paintMusic(data);
        const note = musicStatus.textContent;
        musicStatus.textContent = note ? "已保存。" + note : "已保存。正在馆里的人会按勾上的曲子和音量接着放";
      } catch {
        musicStatus.textContent = "没有保存";
      } finally {
        musicSave.disabled = musicOrder.length === 0;
      }
    });

    document.getElementById("sign-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const raw = signSpeedInput.value.trim();
      if (!/^[0-9]{1,3}$/.test(raw) || Number(raw) > 100) {
        signStatus.textContent = "速度要填 0 到 100 的整数";
        return;
      }
      const text = signInput.value.trim();
      const speed = Number(raw);
      signStamp += 1;
      const stamp = signStamp;
      signDirty = true;
      signStatus.textContent = "正在保存…";
      const res = await fetch("/admin/api/sign", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text, speed: speed }),
      });
      if (stamp !== signStamp) return;
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      const data = await readJson(res);
      if (!res.ok || !data || typeof data.sign !== "string" || !Number.isInteger(data.speed)) {
        if (data && data.error === "speed") signStatus.textContent = "速度要填 0 到 100 的整数";
        else signStatus.textContent = "没有保存";
        return;
      }
      signInput.value = data.sign;
      signSpeedInput.value = String(data.speed);
      signStamp += 1;
      signDirty = false;
      signStatus.textContent = data.speed === 0
        ? "已保存。正在馆里的人胸前这行字会停住"
        : "已保存。正在馆里的人胸前会按这个速度滚";
    });

    document.getElementById("video-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      videoStamp += 1;
      const stamp = videoStamp;
      videoDirty = true;
      videoStatus.textContent = "正在保存…";
      const res = await fetch("/admin/api/videos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: videoInput.value }),
      });
      if (stamp !== videoStamp) return;
      if (res.status === 401) {
        showLogin("口令已失效");
        return;
      }
      const data = await readJson(res);
      if (!res.ok || !data || !Array.isArray(data.urls)) {
        videoStatus.textContent = data && typeof data.error === "string" && data.error.length > 8
          ? data.error
          : "没有保存";
        return;
      }
      videoInput.value = data.urls.join("\\n");
      videoStamp += 1;
      videoDirty = false;
      videoStatus.textContent = data.urls.length
        ? "已保存。正在馆里、还没改过卡片的人，大屏幕输入框会换成这份链接。"
        : "已保存。大屏幕卡片里先不填链接。";
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
