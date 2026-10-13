// 后台登录的挡刀：同一个来源在一段时间内错太多次，就先不让试了。
// 计数放在内存里，Worker 有多个 isolate，各自算各自的，
// 所以这是“抬高成本”而不是严格熔断，够挡住脚本乱撞就行。
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 4096;
const SLOW_MS = 250;

export function createLoginGuard(options) {
  const opt = options || {};
  const maxFails = opt.maxFails || MAX_FAILS;
  const windowMs = opt.windowMs || WINDOW_MS;
  const maxKeys = opt.maxKeys || MAX_KEYS;
  const fails = new Map();

  function now(at) {
    return typeof at === "number" ? at : Date.now();
  }

  // 只留窗口内的失败记录，过期的连键一起删掉，免得表越长越大。
  function prune(at) {
    for (const [key, list] of fails) {
      const kept = list.filter((t) => at - t < windowMs);
      if (kept.length) fails.set(key, kept);
      else fails.delete(key);
    }
  }

  function listFor(key) {
    const list = fails.get(key);
    if (!list) return [];
    return list;
  }

  return {
    // 现在还能不能试。被挡住时给出还要等多少秒。
    blocked(key, at) {
      const when = now(at);
      const name = String(key);
      const kept = listFor(name).filter((t) => when - t < windowMs);
      if (!kept.length) {
        fails.delete(name);
        return { blocked: false };
      }
      fails.set(name, kept);
      const newest = kept[kept.length - 1];
      if (kept.length >= maxFails) {
        return { blocked: true, fails: kept.length, retryAfter: Math.max(1, Math.ceil((windowMs - (when - newest)) / 1000)) };
      }
      return { blocked: false, fails: kept.length };
    },

    // 记一次失败。返回记完之后的状态，好让调用方决定回 401 还是 429。
    recordFailure(key, at) {
      const when = now(at);
      if (fails.size > maxKeys) prune(when);
      const name = String(key);
      const list = (fails.get(name) || []).filter((t) => when - t < windowMs);
      list.push(when);
      fails.set(name, list);
      const state = list.length >= maxFails
        ? { blocked: true, fails: list.length, retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) }
        : { blocked: false, fails: list.length, retryAfter: 0 };
      return state;
    },

    // 登录成功就把这个来源的记录清掉。
    clear(key) {
      fails.delete(String(key));
    },
  };
}

// 错一次就多等一会儿，让脚本撞不快。
export function pause(ms) {
  const wait = typeof ms === "number" && ms > 0 ? ms : SLOW_MS;
  return new Promise((resolve) => setTimeout(resolve, wait));
}
