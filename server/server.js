// Zero-dependency backend: email + Google/Apple/Amazon sign-in, per-user progress sync, global leaderboard.
// Also serves the static game. Run: node server/server.js   (see README for env vars)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const SECRET = process.env.JWT_SECRET || (console.warn("JWT_SECRET not set: using a random secret; sessions reset on restart."), crypto.randomBytes(32).toString("hex"));
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID, APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID, AMAZON_CLIENT_ID = process.env.AMAZON_CLIENT_ID;
const ROOT = path.join(__dirname, "..");
const STATIC = new Set(["index.html", "style.css", "config.js", "js"]);

/* ---------- storage ---------- */
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { /* new db */ }
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DATA_FILE + ".tmp", JSON.stringify(db), (e) => { if (!e) fs.rename(DATA_FILE + ".tmp", DATA_FILE, () => {}); }), 100); };
const emptyProgress = () => ({ learned: {}, steps: {}, score: 0 });
const defaultSettings = () => ({ highContrast: false, largeText: false, reduceMotion: false, lang: "es", native: "en" });
const publicUser = (u) => ({ id: u.id, name: u.name, provider: u.provider, progress: u.progress, settings: u.settings });

/* ---------- tokens (HS256 JWT) ---------- */
const b64u = (b) => Buffer.from(b).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
function issue(id) { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub: id, exp: Date.now() + 30 * 864e5 })); return `${h}.${p}.${sign(h + "." + p)}`; }
function verifyToken(t) {
  const [h, p, s] = String(t || "").split(".");
  if (!s) return null;
  const good = Buffer.from(sign(h + "." + p)), got = Buffer.from(s);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  const c = JSON.parse(Buffer.from(p, "base64url")); return c.exp > Date.now() ? c.sub : null;
}

/* ---------- passwords ---------- */
const hashPw = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k.toString("hex")))));

/* ---------- OAuth verification ---------- */
const getJSON = async (url, opts) => { const r = await fetch(url, opts); if (!r.ok) throw new Error("provider rejected token"); return r.json(); };
const jwksCache = {};
async function verifyJwt(token, jwksUrl, issuers, aud) {
  const [h, p, s] = token.split(".");
  if (!s) throw new Error("bad token");
  const header = JSON.parse(Buffer.from(h, "base64url")), claims = JSON.parse(Buffer.from(p, "base64url"));
  let jwks = jwksCache[jwksUrl];
  if (!jwks || jwks.t < Date.now() - 36e5 || !jwks.keys.some((k) => k.kid === header.kid)) jwks = jwksCache[jwksUrl] = { t: Date.now(), keys: (await getJSON(jwksUrl)).keys };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") throw new Error("unknown signing key");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(h + "." + p), crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok || !issuers.includes(claims.iss) || claims.aud !== aud || claims.exp * 1000 < Date.now()) throw new Error("invalid token");
  return claims;
}
const providers = {
  // token = Google ID token (credential from Google Identity Services)
  async google(token) {
    if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in is not configured on the server.");
    const c = await verifyJwt(token, "https://www.googleapis.com/oauth2/v3/certs", ["https://accounts.google.com", "accounts.google.com"], GOOGLE_CLIENT_ID);
    return { sub: c.sub, name: c.name || (c.email || "").split("@")[0] || "Google user" };
  },
  // token = Apple identity token (Sign in with Apple JS)
  async apple(token, name) {
    if (!APPLE_CLIENT_ID) throw new Error("Apple sign-in is not configured on the server.");
    const c = await verifyJwt(token, "https://appleid.apple.com/auth/keys", ["https://appleid.apple.com"], APPLE_CLIENT_ID);
    return { sub: c.sub, name: name || (c.email || "").split("@")[0] || "Apple user" };
  },
  // token = Login with Amazon access token
  async amazon(token) {
    if (!AMAZON_CLIENT_ID) throw new Error("Amazon sign-in is not configured on the server.");
    const info = await getJSON("https://api.amazon.com/auth/o2/tokeninfo?access_token=" + encodeURIComponent(token));
    if (info.aud !== AMAZON_CLIENT_ID) throw new Error("token was issued for another app");
    const prof = await getJSON("https://api.amazon.com/user/profile", { headers: { Authorization: "Bearer " + token } });
    return { sub: prof.user_id, name: prof.name || "Amazon user" };
  },
};

/* ---------- http helpers ---------- */
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((res, rej) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e5) { rej(new Error("too large")); req.destroy(); } }); req.on("end", () => { try { res(d ? JSON.parse(d) : {}); } catch (e) { rej(new Error("bad json")); } }); });
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const bearer = (req) => { const h = req.headers.authorization || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; };
const authed = (req) => { const id = verifyToken(bearer(req)); const u = id && db.users[id]; if (!u) throw fail(401, "Not signed in."); return u; };
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

// Basic sanitizers so clients can't store arbitrary junk.
function cleanProgress(p) {
  const out = emptyProgress(); if (!p || typeof p !== "object") return out;
  for (const k of Object.keys(p.learned || {}).slice(0, 2000)) if (/^[a-z0-9_]+:[a-z]{2}$/.test(k)) out.learned[k] = true;
  for (const k of Object.keys(p.steps || {}).slice(0, 2000)) if (/^[a-z0-9_]+:[a-z]{2}$/.test(k) && typeof p.steps[k] === "object") out.steps[k] = { recognize: !!p.steps[k].recognize, spell: !!p.steps[k].spell, sentence: !!p.steps[k].sentence };
  out.score = Object.keys(out.learned).length * 100; // score derived server-side from learned words
  return out;
}
function cleanSettings(s) { const d = defaultSettings(); s = s || {}; return { highContrast: !!s.highContrast, largeText: !!s.largeText, reduceMotion: !!s.reduceMotion, lang: ["en", "es", "ja"].includes(s.lang) ? s.lang : d.lang, native: ["en", "es", "ja"].includes(s.native) ? s.native : d.native }; }

const routes = {
  "POST /api/register": async (req) => {
    const { email, password } = await readBody(req), id = "email:" + String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(id.slice(6))) throw fail(400, "Enter a valid email.");
    if (String(password).length < 6) throw fail(400, "Password must be at least 6 characters.");
    if (db.users[id]) throw fail(409, "An account with that email already exists.");
    const salt = crypto.randomBytes(16).toString("hex");
    const u = db.users[id] = { id, name: id.slice(6).split("@")[0], provider: "email", salt, hash: await hashPw(String(password), salt), progress: emptyProgress(), settings: defaultSettings() };
    save(); return { token: issue(id), user: publicUser(u) };
  },
  "POST /api/login": async (req) => {
    const { email, password } = await readBody(req), u = db.users["email:" + String(email).trim().toLowerCase()];
    if (!u || (await hashPw(String(password), u.salt)) !== u.hash) throw fail(401, "Invalid email or password.");
    return { token: issue(u.id), user: publicUser(u) };
  },
  "POST /api/oauth": async (req) => {
    const { provider, token, name } = await readBody(req);
    if (!providers[provider]) throw fail(400, "Unknown provider.");
    let info; try { info = await providers[provider](String(token), name); } catch (e) { throw fail(401, e.message); }
    const id = provider + ":" + info.sub;
    const u = db.users[id] = db.users[id] || { id, name: String(info.name).slice(0, 40), provider, progress: emptyProgress(), settings: defaultSettings() };
    save(); return { token: issue(id), user: publicUser(u) };
  },
  // Player reports that the image recognizer got an object wrong. Stored for review / building a correction set.
  "POST /api/misidentified": async (req) => {
    const b = await readBody(req), str = (v, n) => String(v == null ? "" : v).slice(0, n);
    let uid = null; try { uid = verifyToken(bearer(req)); } catch (e) { /* anonymous */ }
    db.reports = db.reports || [];
    db.reports.push({ at: Date.now(), user: uid, wrong: str(b.wrong, 100), candidates: (Array.isArray(b.candidates) ? b.candidates : []).slice(0, 10).map((c) => str(c, 100)), thumb: /^data:image\/jpeg;base64,/.test(b.thumb || "") ? str(b.thumb, 20000) : undefined, text: str(b.text, 500), lang: str(b.lang, 5) });
    if (db.reports.length > 5000) db.reports.shift();
    save(); return { ok: true };
  },
  "GET /api/me": async (req) => ({ user: publicUser(authed(req)) }),
  "PUT /api/me": async (req) => {
    const u = authed(req), b = await readBody(req);
    if (b.progress) { const np = cleanProgress(b.progress); // merge: never lose learned words
      for (const k of Object.keys(u.progress.learned)) np.learned[k] = true; np.score = Object.keys(np.learned).length * 100; u.progress = np; }
    if (b.settings) u.settings = cleanSettings(b.settings);
    save(); return { user: publicUser(u) };
  },
  "DELETE /api/me/progress": async (req) => { const u = authed(req); u.progress = emptyProgress(); save(); return { user: publicUser(u) }; },
  "DELETE /api/me": async (req) => { const u = authed(req); delete db.users[u.id]; save(); return { ok: true }; },
  "GET /api/leaderboard": async () => ({ leaderboard: Object.values(db.users).filter((u) => u.progress.score > 0).map((u) => ({ name: u.name, score: u.progress.score })).sort((a, b) => b.score - a.score).slice(0, 50) }),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, {});
  const route = routes[req.method + " " + p];
  if (p.startsWith("/api/")) {
    if (!route) return send(res, 404, { error: "Not found" });
    try { send(res, 200, await route(req)); } catch (e) { send(res, e.code || 500, { error: e.code ? e.message : "Server error" }); if (!e.code) console.error(e); }
    return;
  }
  const rel = p === "/" ? "index.html" : decodeURIComponent(p).replace(/^\/+/, "");
  const file = path.join(ROOT, rel);
  if (!STATIC.has(rel.split("/")[0]) || !file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(404); return res.end("Not found"); } res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }); res.end(d); });
});
if (require.main === module) server.listen(PORT, () => console.log("Listening on http://localhost:" + PORT));
module.exports = { server };
