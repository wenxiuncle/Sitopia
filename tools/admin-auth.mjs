export const COOKIE = "sitopia_admin";

export async function adminMac(token) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(token)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("sitopia-admin-v1"),
  );
  const bytes = new Uint8Array(mac);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function readCookie(header, name) {
  const parts = String(header || "").split(";");
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    const eq = item.indexOf("=");
    if (eq < 0) continue;
    if (item.slice(0, eq) !== name) continue;
    return item.slice(eq + 1);
  }
  return "";
}

export function cookieHeader(value, options) {
  const parts = [
    COOKIE + "=" + value,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/admin",
    "Max-Age=" + options.maxAge,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
