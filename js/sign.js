// 一楼接待机器人胸前的滚动字。房间、后台和画屏幕都读这一份。

export const DEFAULT_SIGN = "欢迎光临";

export function cleanSign(value) {
  const text = String(value == null ? "" : value).replace(/[\u0000-\u001f]/g, "").trim();
  const chars = Array.from(text).slice(0, 32);
  return chars.join("") || DEFAULT_SIGN;
}
