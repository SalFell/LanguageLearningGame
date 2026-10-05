// Account, progress, settings and leaderboard storage (localStorage; optional remote leaderboard).
(function (root) {
  const DB = "llg_db", SESSION = "llg_session";
  const defaultSettings = () => ({ highContrast: false, largeText: false, reduceMotion: false, lang: "es" });
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || { users: {} }; } catch (e) { return { users: {} }; } };
  const save = (db) => localStorage.setItem(DB, JSON.stringify(db));
  const bytes = (a) => Array.from(new Uint8Array(a)).map((b) => b.toString(16).padStart(2, "0")).join("");
  async function hashPw(pw, salt) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
    return bytes(d);
  }
  const mk = (id, name, extra) => Object.assign({ id, name, progress: { learned: {}, steps: {}, score: 0 }, settings: defaultSettings() }, extra);

  const Accounts = {
    current() { const id = localStorage.getItem(SESSION); return id ? load().users[id] || null : null; },
    async register(email, password) {
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
    logout() { localStorage.removeItem(SESSION); },
    update(fn) { const u = this.current(); if (!u) return; const db = load(); fn(db.users[u.id]); save(db); },
    resetProgress() { this.update((u) => { u.progress = { learned: {}, steps: {}, score: 0 }; }); },
    deleteAccount() { const u = this.current(); if (!u) return; const db = load(); delete db.users[u.id]; save(db); this.logout(); },
    async leaderboard() {
      const url = root.GAME_CONFIG && root.GAME_CONFIG.leaderboardUrl;
      if (url) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* fall back to local */ } }
      return Object.values(load().users).map((u) => ({ name: u.name, score: u.progress.score })).sort((a, b) => b.score - a.score).slice(0, 20);
    },
    async submitScore(score) {
      const url = root.GAME_CONFIG && root.GAME_CONFIG.leaderboardUrl, u = this.current();
      if (!url || !u) return;
      try { await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: u.name, score }) }); } catch (e) { /* ignore */ }
    },
  };
  root.Accounts = Accounts;
})(window);
