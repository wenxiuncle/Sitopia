// 一台轿厢。门外呼叫和轿内选层都进同一组停靠。
// 上行先接上面的人，从近到远；上面没有了才掉头。下行先接下面的人，同样从近到远。
// 门没关严、或门口有人，轿厢不动。联机时房间按这份往前算，各页只跟着显示。
// 房间高度大约每 80 毫秒到一次。直接套上时，到达时刻一抖，轿厢就退一下再追。画面改看稍早的两拍之间。

// 巡航和加速度一起加四分之一。只抬最高速度的话，单层行程仍被起步拖住。
const CRUISE = 2.53125;
const ACCEL = 2.15625;
const DOOR_SPEED = 1 / 1.2;
const DWELL = 3.1;

export function createLift(floors, story) {
  const stops = new Set();
  let y = 0;
  let vel = 0;
  let door = 0;
  let phase = "idle";
  let dir = 0;
  let dwell = 0;
  let current = 0;
  let dest = 0;
  // 联机画面用的样本。shown 为空时，外面读到的仍是房间那一份。
  // 样本时刻跟房间的 at 走，不跟数据包到达的时刻走，不然抖动会让轿厢忽快忽慢。
  let trail = null;
  let shownY = null;
  let shownDoor = null;
  let anchorServer = null;
  let anchorLocal = 0;

  function clearFollow() {
    trail = null;
    shownY = null;
    shownDoor = null;
    anchorServer = null;
    anchorLocal = 0;
  }

  function coast(sample, extra) {
    let next = sample.y + sample.vel * extra;
    const goal = dest * story;
    const going = goal - sample.y;
    if (sample.vel * going > 0 && (next - goal) * going > 0) return goal;
    return next;
  }

  function arrive(floor) {
    current = floor;
    y = floor * story;
    vel = 0;
    stops.delete(floor);
    dest = floor;
    phase = "opening";
  }

  // 以轿厢现在的高度分上下，已经走过的楼层不算在前进方向里。
  function nextStop() {
    if (!stops.size) return null;
    const ups = [];
    const downs = [];
    let here = null;
    for (const floor of stops) {
      const delta = floor * story - y;
      if (Math.abs(delta) <= 0.08) here = floor;
      else if (delta > 0) ups.push(floor);
      else downs.push(floor);
    }
    ups.sort((a, b) => a - b);
    downs.sort((a, b) => b - a);
    if (here != null) return here;
    if (dir > 0 && ups.length) return ups[0];
    if (dir < 0 && downs.length) return downs[0];
    if (dir === 0) {
      if (ups.length) {
        dir = 1;
        return ups[0];
      }
      if (downs.length) {
        dir = -1;
        return downs[0];
      }
      return null;
    }
    if (dir > 0 && downs.length) {
      dir = -1;
      return downs[0];
    }
    if (dir < 0 && ups.length) {
      dir = 1;
      return ups[0];
    }
    dir = 0;
    return null;
  }

  // finish 为假时只滑动，不自己到站。到站由房间那一份宣布，各页才不会各开一次门。
  function glide(dt, finish) {
    const goal = dest * story;
    const dist = goal - y;
    const adist = Math.abs(dist);
    if (adist < 0.03 || (dest === current && adist < 0.02)) {
      if (finish) arrive(dest);
      return;
    }
    const sign = dist < 0 ? -1 : 1;
    const brake = (vel * vel) / (2 * ACCEL + 1e-6);
    if (adist <= brake) vel -= sign * ACCEL * dt;
    else vel += sign * ACCEL * dt;
    const cap = Math.min(CRUISE, Math.sqrt(2 * ACCEL * adist));
    if (vel > cap) vel = cap;
    if (vel < -cap) vel = -cap;
    if (vel * sign < 0) vel = 0;
    const step = vel * dt;
    if (Math.abs(step) >= adist - 1e-4 || vel === 0) {
      if (finish) arrive(dest);
      return;
    }
    y += step;
  }

  return {
    get y() { return shownY == null ? y : shownY; },
    place(level) {
      y = level * story;
      vel = 0;
      current = Math.max(0, Math.min(floors - 1, Math.round(level)));
      dest = current;
      dir = 0;
      phase = "idle";
      door = 0;
      stops.clear();
      clearFollow();
    },
    get vel() { return vel; },
    get door() { return shownDoor == null ? door : shownDoor; },
    get phase() { return phase; },
    get dir() { return dir; },
    get current() { return current; },
    get dest() { return dest; },
    floors,
    story,
    has(floor) {
      const target = floor < 0 ? 0 : floor >= floors ? floors - 1 : floor | 0;
      return stops.has(target);
    },
    cancel(floor) {
      const target = floor < 0 ? 0 : floor >= floors ? floors - 1 : floor | 0;
      return stops.delete(target);
    },
    call(floor) {
      const target = floor < 0 ? 0 : floor >= floors ? floors - 1 : floor | 0;
      // 人就在这一层时，只负责把门打开。停靠表里若留下本层，门关严后又会被当成新的一趟，再开再关一次。
      if (target === current && phase !== "moving") {
        if (phase === "closing" || phase === "idle") phase = "opening";
        if (phase === "open") dwell = Math.max(dwell, DWELL);
        return;
      }
      stops.add(target);
      if (phase === "open" || phase === "opening") phase = "closing";
      else if (phase === "idle") phase = "moving";
    },
    tick(dt, doorBlocked) {
      if (phase === "opening") {
        door += dt * DOOR_SPEED;
        if (door >= 1) {
          door = 1;
          phase = "open";
          dwell = DWELL;
        }
        return;
      }
      if (phase === "open") {
        // 人还站在门口时不计时。完全进了轿厢，或离开门口，才开始关门。
        if (doorBlocked) {
          dwell = DWELL;
          return;
        }
        dwell -= dt;
        if (dwell <= 0) phase = "closing";
        return;
      }
      if (phase === "closing") {
        if (doorBlocked) {
          phase = "opening";
          return;
        }
        door -= dt * DOOR_SPEED;
        if (door <= 0) {
          door = 0;
          stops.delete(current);
          if (stops.size) phase = "moving";
          else {
            phase = "idle";
            dir = 0;
          }
        }
        return;
      }
      if (phase === "idle") {
        if (stops.size) phase = "moving";
        return;
      }
      let target = nextStop();
      if (target == null) {
        // 选层被取消时，不要停在两层楼之间。刚起步就回到出发层，已经走开就落到前方最近一层。
        const level = y / story;
        const goingUp = dir > 0 || vel > 0.02;
        const goingDown = !goingUp && (dir < 0 || vel < -0.02);
        if (!goingUp && !goingDown) {
          y = current * story;
          vel = 0;
          dir = 0;
          dest = current;
          phase = "idle";
          return;
        }
        const ahead = goingUp
          ? Math.min(floors - 1, Math.ceil(level - 1e-4))
          : Math.max(0, Math.floor(level + 1e-4));
        const progressed = goingUp ? level - current : current - level;
        if (ahead === current || progressed < 0.12) {
          y = current * story;
          vel = 0;
          dir = 0;
          dest = current;
          phase = "opening";
          return;
        }
        target = ahead;
      }
      dest = target;
      glide(dt, true);
    },
    list() {
      const out = [];
      for (const floor of stops) out.push(floor);
      out.sort((a, b) => a - b);
      return out;
    },
    // 房间广播的轿厢。停靠和阶段以这一份为准，本页不再自己改路线。
    // at 是这一页收到的时刻。带了它，画面才在两拍之间走，不把新高度立刻套上。
    adopt(view, at) {
      if (!view) return;
      const nextY = Number(view.y);
      const nextDoor = Number(view.door);
      if (!Number.isFinite(nextY) || !Number.isFinite(nextDoor)) return;
      y = nextY;
      door = nextDoor < 0 ? 0 : nextDoor > 1 ? 1 : nextDoor;
      const nextVel = Number(view.vel);
      vel = Number.isFinite(nextVel) ? nextVel : 0;
      const known = view.phase;
      if (known === "idle" || known === "opening" || known === "open" || known === "closing" || known === "moving") {
        phase = known;
      }
      dir = view.dir > 0 ? 1 : view.dir < 0 ? -1 : 0;
      const cur = Math.floor(Number(view.current));
      const dst = Math.floor(Number(view.dest));
      if (Number.isFinite(cur)) current = cur < 0 ? 0 : cur >= floors ? floors - 1 : cur;
      if (Number.isFinite(dst)) dest = dst < 0 ? 0 : dst >= floors ? floors - 1 : dst;
      stops.clear();
      const list = Array.isArray(view.stops) ? view.stops : [];
      for (let i = 0; i < list.length; i++) {
        const floor = Math.floor(Number(list[i]));
        if (floor >= 0 && floor < floors) stops.add(floor);
      }
      if (!Number.isFinite(at)) {
        clearFollow();
        return;
      }
      if (!trail) trail = [];
      let stamp = at;
      const serverAt = Number(view.at);
      if (Number.isFinite(serverAt)) {
        if (anchorServer == null) {
          anchorServer = serverAt;
          anchorLocal = at;
        }
        stamp = anchorLocal + (serverAt - anchorServer);
        // 第一包若来得晚，后面的时刻会排到「现在」之后。整条时间线往回拉，间隔仍按房间的。
        if (stamp > at) {
          const shift = stamp - at;
          anchorLocal -= shift;
          for (let i = 0; i < trail.length; i++) trail[i].t -= shift;
          stamp = at;
        }
      }
      const sample = { t: stamp, y, door, vel };
      const last = trail.length ? trail[trail.length - 1] : null;
      if (last && stamp < last.t) return;
      if (last && stamp === last.t) trail[trail.length - 1] = sample;
      else trail.push(sample);
      const horizon = stamp - 2000;
      while (trail.length > 2 && trail[1].t < horizon) trail.shift();
    },
    // 画面落在收到时刻往前 120 毫秒。两拍之间匀速，轿厢不再被新包拽回去。
    present(at) {
      if (!trail || !trail.length || !Number.isFinite(at)) {
        shownY = null;
        shownDoor = null;
        return;
      }
      const show = at - 120;
      const first = trail[0];
      const last = trail[trail.length - 1];
      if (trail.length === 1 || show <= first.t) {
        shownY = first.y;
        shownDoor = first.door;
        return;
      }
      if (show >= last.t) {
        shownY = coast(last, Math.min(0.08, (show - last.t) / 1000));
        shownDoor = last.door;
        return;
      }
      let older = first;
      let newer = trail[1];
      for (let i = 1; i < trail.length; i++) {
        if (trail[i].t >= show) {
          older = trail[i - 1];
          newer = trail[i];
          break;
        }
      }
      const span = newer.t - older.t;
      const u = span > 0 ? (show - older.t) / span : 1;
      shownY = older.y + (newer.y - older.y) * u;
      shownDoor = older.door + (newer.door - older.door) * u;
    },
    releaseFollow() {
      clearFollow();
    },
    predict(dt) {
      if (!(dt > 0)) return;
      if (dt > 0.1) dt = 0.1;
      if (phase === "opening") {
        door = Math.min(1, door + dt * DOOR_SPEED);
        return;
      }
      if (phase === "closing") {
        door = Math.max(0, door - dt * DOOR_SPEED);
        return;
      }
      if (phase === "moving") glide(dt, false);
    },
  };
}
