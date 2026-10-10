// 一台轿厢。门外呼叫和轿内选层都进同一组停靠，先沿当前方向走完，再折返。
// 门没关严、或门口有人，轿厢不动。

// 巡航比原来快半倍。加速度一起加上，单层行程才跟着缩短，不会只把最高速度写高、起步仍慢。
const CRUISE = 2.025;
const ACCEL = 1.725;
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

  function arrive(floor) {
    current = floor;
    y = floor * story;
    vel = 0;
    stops.delete(floor);
    dir = 0;
    dest = floor;
    phase = "opening";
  }

  function nextStop() {
    if (!stops.size) return null;
    const ups = [];
    const downs = [];
    for (const floor of stops) {
      if (floor > current) ups.push(floor);
      else if (floor < current) downs.push(floor);
    }
    ups.sort((a, b) => a - b);
    downs.sort((a, b) => b - a);
    if (dir >= 0 && ups.length) {
      dir = 1;
      return ups[0];
    }
    if (dir <= 0 && downs.length) {
      dir = -1;
      return downs[0];
    }
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

  return {
    get y() { return y; },
    place(level) {
      y = level * story;
      vel = 0;
      current = Math.max(0, Math.min(floors - 1, Math.round(level)));
      dest = current;
      dir = 0;
      phase = "idle";
      door = 0;
    },
    get door() { return door; },
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
      const goal = target * story;
      const dist = goal - y;
      const adist = Math.abs(dist);
      // 帧间隔较小时，提前刹车会把速度收到 0，轿厢停在楼层前一两厘米，门就不再开。
      if (adist < 0.03 || (target === current && adist < 0.02)) {
        arrive(target);
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
        arrive(target);
        return;
      }
      y += step;
    },
  };
}
