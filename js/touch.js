// 手机走动。左摇杆给出前后左右，画面上拖动转视角，右下圆钮跳跃。
// 情境按钮由展厅按当前目标填进来，这里只负责摆放和点按。

const stick = { x: 0, y: 0 };
let jumpQueued = false;
let stickId = -1;
let lookId = -1;
let lookX = 0;
let lookY = 0;
let actionKey = "";

const ORBIT = {
  1: [{ x: -96, y: -30 }],
  2: [{ x: -102, y: -20 }, { x: -2, y: -78 }],
  3: [{ x: -108, y: 2 }, { x: -92, y: -56 }, { x: 0, y: -90 }],
};

function lookBlocked(target) {
  if (!target || !target.closest) return true;
  if (target.closest("#touch-pad")) return true;
  if (target.closest("button, a, input, textarea, select, label")) return true;
  return !!target.closest("#panel, #guestbook, #screen-gate, #drawer, #roster, #name-gate, #kick-gate, #chat-bar, #lift-pad, #day, #hud-row, #map-card");
}

function scrollable(target) {
  if (!target || !target.closest) return false;
  return !!target.closest("#guestbook, #panel, #screen-gate, #drawer, #roster, #lift-list, #chat-bar, #name-gate, textarea");
}

function placeKnob(dx, dy) {
  const knob = document.getElementById("stick-knob");
  if (!knob) return;
  knob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
}

export function releaseStick() {
  stick.x = 0;
  stick.y = 0;
  stickId = -1;
  placeKnob(0, 0);
}

function setStick(dx, dy, maxR) {
  const mag = Math.hypot(dx, dy);
  const clamped = mag > maxR && mag > 0 ? maxR / mag : 1;
  const vx = dx * clamped;
  const vy = dy * clamped;
  placeKnob(vx, vy);
  const nx = maxR > 0 ? vx / maxR : 0;
  const ny = maxR > 0 ? -vy / maxR : 0;
  const m = Math.min(1, Math.hypot(nx, ny));
  if (m < 0.16) {
    stick.x = 0;
    stick.y = 0;
    return;
  }
  const u = (m - 0.16) / 0.84;
  stick.x = (nx / m) * u;
  stick.y = (ny / m) * u;
}

export function touchStick() {
  return stick;
}

export function takeTouchJump() {
  if (!jumpQueued) return false;
  jumpQueued = false;
  return true;
}

export function setTouchActions(list) {
  const orbit = document.getElementById("touch-orbit");
  if (!orbit) return;
  const next = list || [];
  const key = next.map((item) => item.id + "\n" + item.label).join("|");
  if (key === actionKey) return;
  actionKey = key;
  orbit.replaceChildren();
  const slots = ORBIT[next.length] || ORBIT[3];
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const slot = slots[Math.min(i, slots.length - 1)];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "touch-act";
    button.dataset.act = item.id;
    button.textContent = item.label;
    button.style.left = "50%";
    button.style.top = "50%";
    button.style.transform = "translate(calc(-50% + " + slot.x + "px), calc(-50% + " + slot.y + "px))";
    orbit.appendChild(button);
  }
}

export function enableTouch() {
  if (!document.body.classList.contains("touch-play")) return false;
  const pad = document.getElementById("touch-pad");
  if (pad) pad.hidden = false;
  return true;
}

export function mountTouch(hooks) {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  if (!coarse && !noHover) return;
  document.documentElement.classList.add("touch-play");
  document.body.classList.add("touch-play");
  const hint = document.getElementById("loading-hint");
  if (hint) hint.textContent = "免费在线玩 · 无需安装 · 左侧摇杆走动，滑动画面转视角";

  const stickEl = document.getElementById("stick");
  const jump = document.getElementById("touch-jump");
  const orbit = document.getElementById("touch-orbit");
  const onLook = hooks && hooks.onLook;
  const onAction = hooks && hooks.onAction;

  if (stickEl) {
    stickEl.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      stickId = event.pointerId;
      stickEl.setPointerCapture(event.pointerId);
      const rect = stickEl.getBoundingClientRect();
      const knob = document.getElementById("stick-knob");
      const maxR = Math.max(16, (rect.width - (knob ? knob.offsetWidth : 54)) / 2 - 4);
      setStick(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2), maxR);
    });
    const moveStick = (event) => {
      if (event.pointerId !== stickId) return;
      event.preventDefault();
      const rect = stickEl.getBoundingClientRect();
      const knob = document.getElementById("stick-knob");
      const maxR = Math.max(16, (rect.width - (knob ? knob.offsetWidth : 54)) / 2 - 4);
      setStick(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2), maxR);
    };
    stickEl.addEventListener("pointermove", moveStick);
    const endStick = (event) => {
      if (event.pointerId !== stickId) return;
      releaseStick();
    };
    stickEl.addEventListener("pointerup", endStick);
    stickEl.addEventListener("pointercancel", endStick);
  }

  if (jump) {
    jump.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      jumpQueued = true;
    });
  }

  if (orbit) {
    orbit.addEventListener("pointerdown", (event) => {
      if (!event.target.closest || !event.target.closest("button")) return;
      event.stopPropagation();
    });
    orbit.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("button");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (onAction) onAction(button.dataset.act || "");
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!document.body.classList.contains("touch-play")) return;
    if (!document.body.classList.contains("walking")) return;
    if (event.button !== 0 || lookId >= 0) return;
    if (lookBlocked(event.target)) return;
    lookId = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (event.pointerId !== lookId) return;
    const dx = event.clientX - lookX;
    const dy = event.clientY - lookY;
    lookX = event.clientX;
    lookY = event.clientY;
    if (onLook) onLook(dx, dy);
  });
  const endLook = (event) => {
    if (event.pointerId !== lookId) return;
    lookId = -1;
  };
  document.addEventListener("pointerup", endLook);
  document.addEventListener("pointercancel", endLook);

  document.addEventListener("touchmove", (event) => {
    if (!document.body.classList.contains("touch-play")) return;
    if (scrollable(event.target)) return;
    event.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", (event) => {
    if (document.body.classList.contains("touch-play")) event.preventDefault();
  });
  document.addEventListener("contextmenu", (event) => {
    if (document.body.classList.contains("touch-play")) event.preventDefault();
  });
  if (window.visualViewport && hooks && hooks.onResize) {
    const fit = () => hooks.onResize();
    window.visualViewport.addEventListener("resize", fit);
    // 地址栏收放时可见区域先挪，布局视口没变，不一定发 resize。
    window.visualViewport.addEventListener("scroll", fit);
    fit();
  }
}
