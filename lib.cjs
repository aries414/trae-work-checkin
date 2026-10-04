"use strict";
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
function storageCandidates() {
  const home = os.homedir();
  const roots = [
    path.join(home, "Library", "Application Support"),
    process.env.APPDATA || path.join(home, "AppData", "Roaming"),
  ];
  const names = ["Trae CN", "TRAE SOLO CN", "Trae", "TRAE SOLO"];
  const out = [];
  for (const root of roots) for (const n of names) out.push(path.join(root, n, "User", "globalStorage", "storage.json"));
  return out;
}
function candidateOrder() {
  return storageCandidates()
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}
const SALT_A = Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const SALT_B = Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);
function xor(a, b, n) { const r = new Uint8Array(n); for (let i = 0; i < n; i++) r[i] = a[i] ^ b[i]; return r; }
function decryptAuthValue(b64) {
  const buf = Buffer.from(b64, "base64");
  const hd = buf.slice(0, 6), rb = buf.slice(6, 38), enc = buf.slice(38);
  if (!(hd[0] === 0x74 && hd[1] === 0x63 && hd[2] === 0x05 && hd[3] === 0x10 && hd[4] === 0 && hd[5] === 0)) {
    throw new Error("未知的登录态加密格式（header 不匹配）");
  }
  const salt = xor(SALT_A, SALT_B, 64);
  const finalHash = crypto.createHash("sha512")
    .update(Buffer.concat([crypto.createHash("sha512").update(rb).digest(), Buffer.from(salt)]))
    .digest();
  const dc = crypto.createDecipheriv("aes-128-cbc", finalHash.slice(0, 16), finalHash.slice(16, 32));
  const plain = Buffer.concat([dc.update(enc), dc.final()]);
  const stored = plain.slice(0, 64);
  const payload = plain.slice(64);
  const computed = crypto.createHash("sha512").update(payload).digest();
  if (!stored.equals(computed)) throw new Error("解密校验失败（SHA-512 不符）");
  return JSON.parse(payload.toString("utf8"));
}
function loadAuth() {
  // 1. 优先从环境变量读取（云端部署用，如 GitHub Secrets -> TRAE_AUTH_JSON）
  const envJson = process.env.TRAE_AUTH_JSON;
  if (envJson && envJson.trim()) {
    try { return JSON.parse(envJson); } catch (e) {
      throw new Error("TRAE_AUTH_JSON 环境变量不是合法 JSON: " + e.message);
    }
  }
  // 2. 回退到本地 storage.json（本地开发/手动运行用）
  for (const p of candidateOrder()) {
    if (!fs.existsSync(p)) continue;
    const storage = JSON.parse(fs.readFileSync(p, "utf8"));
    const enc = storage["iCubeAuthInfo://icube.cloudide"];
    if (!enc) continue;
    if (String(enc).trim().startsWith("{")) return JSON.parse(enc);
    return decryptAuthValue(String(enc));
  }
  throw new Error("未找到 Trae 登录态。本地需 storage.json；云端需设置 TRAE_AUTH_JSON 环境变量。");
}
function devId() {
  return crypto.createHash("sha256").update(crypto.randomBytes(32).toString("hex")).digest("hex").substring(0, 32);
}
function readDeviceIds() {
  const out = {};
  for (const p of candidateOrder()) {
    if (!fs.existsSync(p)) continue;
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    const machineId = s["telemetry.machineId"];
    if (typeof machineId === "string" && machineId) out.machineId = machineId;
    for (const k of Object.keys(s)) {
      const m = /^iCubeAuthInfo:\/\/icube-dc:(\d+)$/.exec(k);
      if (m && m[1]) { out.deviceId = m[1]; break; }
    }
    break;
  }
  return out;
}
function readClientVersion() {
  let version = null;
  for (const p of candidateOrder()) {
    if (!fs.existsSync(p)) continue;
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    const v = s["iCubeLastVersion"];
    if (typeof v === "string" && v.trim()) { version = v.trim(); }
    break;
  }
  if (!version) return null;
  return {
    ideVersion: version,
    ideVersionCode: version.replace(/\./g, "") || version,
  };
}
function detectOs() {
  const platform = process.platform;
  const release = os.release();
  let deviceType = "unknown";
  let osVersion = platform;
  if (platform === "darwin") { deviceType = "mac"; osVersion = `Darwin ${release}`; }
  else if (platform === "win32") { deviceType = "windows"; osVersion = `Windows ${release}`; }
  else if (platform === "linux") { deviceType = "linux"; osVersion = `Linux ${release}`; }
  return { deviceType, osVersion };
}
function buildHeaders(token, uid, fp = {}) {
  const osInfo = detectOs();
  return {
    "Authorization": `Cloud-IDE-JWT ${token}`,
    "X-Cloudide-Token": token,
    "x-uid": String(uid),
    "x-app-id": "6eefa01c-1036-4c7e-9ca5-d891f63bfcd8",
    "x-device-id": fp.deviceId || devId(),
    "x-machine-id": fp.machineId || crypto.randomBytes(32).toString("hex"),
    "x-request-id": crypto.randomUUID(),
    "x-ide-version": fp.ideVersion || "3.3.67",
    "x-ide-version-code": fp.ideVersionCode || "20260401",
    "x-device-type": osInfo.deviceType,
    "x-os-version": osInfo.osVersion,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}
async function createClient() {
  const auth = loadAuth();
  const host = auth.host || "https://api.trae.cn";
  const uid = String(auth.userId || "");
  const device = readDeviceIds();
  const ver = readClientVersion();
  const fingerprint = {
    deviceId: device.deviceId,
    machineId: device.machineId,
    ideVersion: ver && ver.ideVersion,
    ideVersionCode: ver && ver.ideVersionCode,
  };
  let token = auth.token;
  let refreshing = null;
  async function refresh() {
    if (!auth.refreshToken) return false;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const r = await fetch(`${host}/cloudide/api/v3/trae/oauth/ExchangeToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ClientID: "ono9krqynydwx5",
          RefreshToken: auth.refreshToken,
          ClientSecret: "-",
          UserID: uid,
        }),
      });
      const j = await r.json();
      if (j && j.Result && j.Result.Token) { token = j.Result.Token; return true; }
      return false;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  if (!auth.expiredAt || (new Date(auth.expiredAt).getTime() - Date.now()) < 30 * 60 * 1000) {
    await refresh();
  }
  return {
    lib: auth,
    host,
    userId: uid,
    async post(p, body) {
      const doFetch = () =>
        fetch(`${host}${p}`, { method: "POST", headers: buildHeaders(token, uid, fingerprint), body: JSON.stringify(body) });
      let resp = await doFetch();
      if (resp.status === 401) { await refresh(); resp = await doFetch(); }
      return resp.json().then((j) => ({ status: resp.status, json: j })).catch(() => ({ status: resp.status, json: {} }));
    },
  };
}
module.exports = { loadAuth, createClient, buildHeaders, decryptAuthValue };
