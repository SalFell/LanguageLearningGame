// Account, progress, settings and leaderboard storage (localStorage; optional remote leaderboard).
(function (root) {
  const DB = "llg_db", SESSION = "llg_session";
  const defaultSettings = () => ({ highContrast: false, largeText: false, reduceMotion: false, lang: "es", native: "en" });
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || { users: {} }; } catch (e) { return { users: {} }; } };
  const save = (db) => localStorage.setItem(DB, JSON.stringify(db));
  const bytes = (a) => Array.from(new Uint8Array(a)).map((b) => b.toString(16).padStart(2, "0")).join("");
  async function hashPw(pw, salt) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
    return bytes(d);
  }
  const mk = (id, name, extra) => Object.assign({ id, name, progress: { learned: {}, steps: {}, score: 0 }, settings: defaultSettings() }, extra);

  const CFG = root.GAME_CONFIG || {};
  let backendDown = false; // set when the API isn't reachable (e.g. page served by a plain static server)
  const remote = () => !backendDown && typeof CFG.apiUrl === "string" && (CFG.apiUrl !== "" || /^https?:/.test(root.location.protocol));
  const TOKEN = "llg_token";
  async function call(method, path, body) {
    const t = localStorage.getItem(TOKEN);
    const r = await fetch(CFG.apiUrl + path, { method, headers: Object.assign({ "Content-Type": "application/json" }, t ? { Authorization: "Bearer " + t } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
    return j;
  }
  function adopt(res) { // cache the server's user locally so the rest of the game can stay synchronous
    const db = load(); db.users[res.user.id] = res.user; save(db);
    localStorage.setItem(TOKEN, res.token || localStorage.getItem(TOKEN)); localStorage.setItem(SESSION, res.user.id); return res.user;
  }
  let pushTimer = null;
  function push(u) { clearTimeout(pushTimer); pushTimer = setTimeout(() => call("PUT", "/api/me", { progress: u.progress, settings: u.settings }).catch(() => {}), 400); }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); }); }
  const oauth = {
    async google() {
      if (!CFG.googleClientId) throw new Error("Google sign-in is not configured.");
      await loadScript("https://accounts.google.com/gsi/client");
      return new Promise((res, rej) => { google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: (r) => res({ token: r.credential }) }); google.accounts.id.prompt((n) => { if (n.isNotDisplayed() || n.isSkippedMoment()) rej(new Error("Google sign-in was blocked or dismissed.")); }); });
    },
    async apple() {
      if (!CFG.appleClientId) throw new Error("Apple sign-in is not configured.");
      await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
      AppleID.auth.init({ clientId: CFG.appleClientId, scope: "name email", redirectURI: CFG.appleRedirectUri || root.location.origin, usePopup: true });
      const r = await AppleID.auth.signIn(), n = r.user && r.user.name;
      return { token: r.authorization.id_token, name: n ? (n.firstName + " " + n.lastName).trim() : undefined };
    },
    async amazon() {
      if (!CFG.amazonClientId) throw new Error("Amazon sign-in is not configured.");
      await loadScript("https://assets.loginwithamazon.com/sdk/na/login1.js");
      amazon.Login.setClientId(CFG.amazonClientId);
      return new Promise((res, rej) => amazon.Login.authorize({ scope: "profile" }, (r) => (r.error ? rej(new Error(r.error)) : res({ token: r.access_token }))));
    },
  };

  const Accounts = {
    current() { const id = localStorage.getItem(SESSION); return id ? load().users[id] || null : null; },
    async register(email, password) {
      if (remote()) return adopt(await call("POST", "/api/register", { email, password }));
      email = String(email).trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email.");
      if (String(password).length < 6) throw new Error("Password must be at least 6 characters.");
      const db = load();
      if (db.users[email]) throw new Error("An account with that email already exists.");
      const salt = bytes(crypto.getRandomValues(new Uint8Array(16)));
      db.users[email] = mk(email, email.split("@")[0], { salt, hash: await hashPw(password, salt) });
      save(db); localStorage.setItem(SESSION, email); return db.users[email];
    },
    async login(email, password) {
      if (remote()) return adopt(await call("POST", "/api/login", { email, password }));
      email = String(email).trim().toLowerCase();
      const u = load().users[email];
      if (!u || !u.hash || (await hashPw(password, u.salt)) !== u.hash) throw new Error("Invalid email or password.");
      localStorage.setItem(SESSION, email); return u;
    },
    // Provider sign-in. Real OAuth for Google/Apple/Amazon needs client IDs + a backend; this stores a local profile per provider.
    socialLogin(provider, name) {
      const id = provider + ":" + String(name).trim().toLowerCase();
      const db = load();
      db.users[id] = db.users[id] || mk(id, name.trim(), { provider });
      save(db); localStorage.setItem(SESSION, id); return db.users[id];
    },
    // Real provider sign-in via the backend (provider: "google" | "apple" | "amazon").
    async oauthLogin(provider) {
      if (!remote()) throw new Error("Provider sign-in needs the backend (see README).");
      const t = await oauth[provider]();
      return adopt(await call("POST", "/api/oauth", { provider, token: t.token, name: t.name }));
    },
    remote,
    // Misidentified-object report: sent to the backend when available, otherwise kept on this device.
    report(r) {
      if (remote()) { call("POST", "/api/misidentified", r).catch(() => {}); return; }
      try { const a = JSON.parse(localStorage.getItem("llg_reports")) || []; a.push(Object.assign({ at: Date.now() }, r)); localStorage.setItem("llg_reports", JSON.stringify(a.slice(-100))); } catch (e) { /* full */ }
    },
    async probe() { if (!remote()) return; try { const r = await fetch(CFG.apiUrl + "/api/leaderboard"); if (!r.ok || !(await r.json()).leaderboard) backendDown = true; } catch (e) { backendDown = true; } },
    logout() { localStorage.removeItem(SESSION); localStorage.removeItem(TOKEN); },
    update(fn) { const u = this.current(); if (!u) return; const db = load(); fn(db.users[u.id]); save(db); if (remote() && localStorage.getItem(TOKEN)) push(db.users[u.id]); },
    async resetProgress() { this.update((u) => { u.progress = { learned: {}, steps: {}, score: 0 }; }); if (remote()) { clearTimeout(pushTimer); try { await call("DELETE", "/api/me/progress"); } catch (e) { /* offline */ } } },
    async deleteAccount() { const u = this.current(); if (!u) return; if (remote()) await call("DELETE", "/api/me"); const db = load(); delete db.users[u.id]; save(db); this.logout(); },
    async refresh() { if (remote() && localStorage.getItem(TOKEN)) { try { adopt(await call("GET", "/api/me")); } catch (e) { if (/Not signed/.test(e.message)) this.logout(); } } },
    async leaderboard() {
      if (remote()) { try { return (await call("GET", "/api/leaderboard")).leaderboard; } catch (e) { /* fall back to local */ } }
      return Object.values(load().users).map((u) => ({ name: u.name, score: u.progress.score })).sort((a, b) => b.score - a.score).slice(0, 20);
    },
  };
  root.Accounts = Accounts;
})(window);
