// 一楼接待机器人胸前的滚动字，以及这行字滚多快。房间、后台和画屏幕都读这一份。

export const DEFAULT_SIGN = "欢迎光临";
// 20 是原来每毫秒 0.04 像素。0 停住，100 最快，大约是现在的 5 倍。
export const DEFAULT_SIGN_SPEED = 20;
export const SIGN_SPEED_MAX = 100;
const SIGN_PX_AT_DEFAULT = 0.04;

export function cleanSign(value) {
  const text = String(value == null ? "" : value).replace(/[\u0000-\u001f]/g, "").trim();
  const chars = Array.from(text).slice(0, 32);
  return chars.join("") || DEFAULT_SIGN;
}

// 合法是 0 到 100 的整数。不合规则返回 -1，调用方自己决定退回默认还是拒绝保存。
export function readSignSpeed(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d{1,3}$/.test(text)) return -1;
    value = Number(text);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= SIGN_SPEED_MAX) return value;
  return -1;
}

export function signSpeed(value) {
  const n = readSignSpeed(value);
  return n < 0 ? DEFAULT_SIGN_SPEED : n;
}

// 从开页算起滚过的像素。速度 0 时一直是 0。20 与原来的 0.04 像素/毫秒相同。
export function signTravel(now, speed) {
  const level = signSpeed(speed);
  if (!level) return 0;
  return (Number(now) || 0) * SIGN_PX_AT_DEFAULT * (level / DEFAULT_SIGN_SPEED);
}
