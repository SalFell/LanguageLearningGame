(function () {
  const W = window.Words, A = window.Accounts, CFG = window.GAME_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const panel = $("panel"), overlay = $("overlay");
  const guest = { progress: W.newProgress(), settings: { highContrast: false, largeText: false, reduceMotion: false, lang: "es" } };
  let state = "menu"; // menu | playing | paused | learning
  let loc = { key: "0,0", heading: 0 }, sv = null, svReady = false, lastMove = 0;

  const user = () => A.current();
  const progress = () => (user() || guest).progress;
  const settings = () => (user() || guest).settings;
  const persist = (fn) => (user() ? A.update(fn) : fn(guest));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function applySettings() {
    const s = settings();
    document.body.classList.toggle("high-contrast", !!s.highContrast);
    document.body.classList.toggle("large-text", !!s.largeText);
    document.body.classList.toggle("reduce-motion", !!s.reduceMotion);
  }
  function show(html) { panel.innerHTML = html; overlay.hidden = false; }
  function hide() { overlay.hidden = true; panel.innerHTML = ""; }
  function langSelect(id, cur) {
    return `<select id="${id}" aria-label="Language">${Object.entries(W.LANGUAGES).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("")}</select>`;
  }
  const anyLearned = (id) => Object.keys(W.LANGUAGES).some((l) => W.isLearned(progress(), id, l));

  /* ---------- menus ---------- */
  function mainMenu() {
    state = "menu"; $("hud").hidden = true; $("touch").hidden = true;
    show(`<h1>🌍 Vocab Venture</h1><button id="play">PLAY</button><button id="settings" class="secondary">SETTINGS</button><button id="lb" class="secondary">LEADERBOARD</button><p>${user() ? "Signed in as " + esc(user().name) : "Playing as guest"}</p>`);
    $("play").onclick = langPrompt; $("settings").onclick = () => settingsMenu(mainMenu); $("lb").onclick = () => leaderboard(mainMenu);
  }
  function langPrompt() {
    show(`<h2>Which language do you want to learn?</h2>${langSelect("lang", settings().lang)}<button id="go">START</button><button id="back" class="secondary">Back</button>`);
    $("go").onclick = () => { persist((u) => { (u.settings || u).lang = $("lang").value; }); startGame(); };
    $("back").onclick = mainMenu;
  }
  function pauseMenu() {
    state = "paused";
    show(`<h2>Paused</h2><button id="cont">CONTINUE</button><button id="settings" class="secondary">SETTINGS</button><button id="lb" class="secondary">LEADERBOARD</button><button id="quit" class="danger">QUIT</button>`);
    $("cont").onclick = resume; $("settings").onclick = () => settingsMenu(pauseMenu); $("lb").onclick = () => leaderboard(pauseMenu);
    $("quit").onclick = () => { hide(); mainMenu(); };
  }
  function resume() { hide(); state = "playing"; }
  function settingsMenu(back) {
    const s = settings();
    const cb = (k, t) => `<label class="row"><input type="checkbox" data-k="${k}"${s[k] ? " checked" : ""}> ${t}</label>`;
    show(`<h2>Settings</h2><h3>Accessibility</h3>${cb("highContrast", "High contrast menus")}${cb("largeText", "Large text")}${cb("reduceMotion", "Reduce motion")}<button id="acct">ACCOUNT MANAGEMENT</button><button id="back" class="secondary">Back</button>`);
    panel.querySelectorAll("input[data-k]").forEach((i) => (i.onchange = () => { persist((u) => { (u.settings || u)[i.dataset.k] = i.checked; }); applySettings(); }));
    $("acct").onclick = () => accountMenu(() => settingsMenu(back)); $("back").onclick = back;
  }
  function accountMenu(back) {
    const u = user();
    if (u) {
      show(`<h2>Account</h2><p>Signed in as <b>${esc(u.name)}</b> (${esc(u.id)})<br>Score: ${u.progress.score}</p><button id="out">Sign out</button><button id="rp" class="danger">Delete game progress</button><button id="da" class="danger">Delete account</button><p class="msg" id="msg"></p><button id="back" class="secondary">Back</button>`);
      $("out").onclick = () => { A.logout(); applySettings(); accountMenu(back); };
      $("rp").onclick = () => { if (confirm("Delete all game progress?")) { A.resetProgress().then(() => accountMenu(back)); } };
      $("da").onclick = () => { if (confirm("Permanently delete this account?")) { A.deleteAccount().then(() => { applySettings(); accountMenu(back); }).catch((e) => ($("msg").textContent = e.message)); } };
    } else {
      show(`<h2>Account</h2><input id="em" type="email" placeholder="Email" autocomplete="email"><input id="pw" type="password" placeholder="Password (6+ chars)" autocomplete="current-password"><button id="login">Sign in</button><button id="reg" class="secondary">Create account</button><p class="msg" id="msg"></p><button data-p="google" class="secondary">Continue with Google</button><button data-p="apple" class="secondary">Continue with Apple</button><button data-p="amazon" class="secondary">Continue with Amazon</button><button id="back" class="secondary">Back</button>`);
      const run = (fn) => async () => { try { await fn(); applySettings(); accountMenu(back); } catch (e) { $("msg").textContent = e.message; } };
      $("login").onclick = run(() => A.login($("em").value, $("pw").value));
      $("reg").onclick = run(() => A.register($("em").value, $("pw").value));
      panel.querySelectorAll("[data-p]").forEach((b) => (b.onclick = async () => {
        try {
          if (A.remote()) await A.oauthLogin(b.dataset.p);
          else { const n = prompt("Display name for your " + b.dataset.p + " profile (offline demo, stored on this device):"); if (!n || !n.trim()) return; A.socialLogin(b.dataset.p, n); }
          applySettings(); accountMenu(back);
        } catch (e) { $("msg").textContent = e.message; }
      }));
    }
    $("back").onclick = back;
  }
  async function leaderboard(back) {
    show(`<h2>🏆 Leaderboard</h2><p>Loading…</p>`);
    const rows = await A.leaderboard();
    show(`<h2>🏆 Leaderboard</h2><table>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${Number(r.score) | 0}</td></tr>`).join("") || "<tr><td>No scores yet</td></tr>"}</table><button id="back" class="secondary">Back</button>`);
    $("back").onclick = back;
  }

  /* ---------- learning screen ---------- */
  function learn(obj, lang) {
    state = "learning";
    const p = progress(), t = obj[lang];
    const done = W.isLearned(p, obj.id, lang);
    const head = `${langSelect("lang", lang)}<div class="big">${obj.e}</div>`;
    const bind = () => { $("lang").onchange = () => learn(obj, $("lang").value); };
    const close = `<button id="close" class="secondary">Close</button>`;
    const wire = () => { bind(); $("close").onclick = () => { hide(); state = "playing"; }; };
    const complete = (step, next) => {
      let newly = false;
      persist((u) => { newly = W.completeStep(u.progress || u, obj.id, lang, step); });
      if (newly) { $("score").textContent = progress().score + " pts"; renderObjects(); }
      next(newly);
    };
    if (done) { show(`${head}<h2>${esc(t.w)}</h2><p class="ok">✔ Learned! (+${W.POINTS_PER_WORD} pts)</p>${close}`); return wire(); }
    const steps = (progress().steps || {})[W.OBJECTS && obj.id + ":" + lang] || {};
    const stage = W.STEPS.find((s) => !steps[s]);
    const rnd = W.seededRandom(W.hash(obj.id + lang + stage));
    const mark = W.STEPS.map((s) => (steps[s] ? "✔" : "○") + " " + s).join(" · ");
    const choices = (q, msgId) => `${q}${W.options(obj, lang, rnd).map((o) => `<button class="secondary" data-o="${esc(o)}">${esc(o)}</button>`).join("")}<p class="msg" id="${msgId}"></p>`;
    const finish = (newly) => (newly ? (show(`${head}<h2>${esc(t.w)}</h2><p class="ok">🎉 Learned! +${W.POINTS_PER_WORD} pts</p>${close}`), wire()) : learn(obj, lang));
    if (stage === "recognize") {
      show(`${head}<h2>${esc(t.w)}</h2><small>${mark}</small>${choices("<p>Which word means this object?</p>", "msg")}${close}`); wire();
      panel.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => (b.dataset.o === t.w ? complete("recognize", finish) : ($("msg").textContent = "Try again!"))));
    } else if (stage === "spell") {
      show(`${head}<small>${mark}</small><p>Type the word for this object${lang === "ja" ? " (kana or romaji)" : ""}. Hint: <b>${esc(t.w[0])}</b> + ${[...t.w].length - 1} more</p><input id="ans" autocomplete="off" autocapitalize="off"><button id="chk">Check</button><p class="msg" id="msg"></p>${close}`); wire();
      const chk = () => (W.checkSpelling(obj, lang, $("ans").value) ? complete("spell", finish) : ($("msg").textContent = "Not quite — it was " + t.w + (lang === "ja" ? " (" + t.r + ")" : "") + ". Try again!"));
      $("chk").onclick = chk; $("ans").onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") chk(); };
    } else {
      show(`${head}<small>${mark}</small>${choices(`<p>Complete the sentence:</p><h3>${esc(W.fillSentence(obj, lang))}</h3>`, "msg")}${close}`); wire();
      panel.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => (b.dataset.o === t.w ? complete("sentence", finish) : ($("msg").textContent = "Try again!"))));
    }
  }

  /* ---------- world ---------- */
  const FOV = 100;
  function renderObjects() {
    const box = $("objects"), r = W.seededRandom(W.hash(loc.key));
    box.innerHTML = "";
    $("sky").style.backgroundPositionX = -loc.heading * 4 + "px";
    const count = 5 + Math.floor(r() * 3), h = innerHeight, w = innerWidth;
    for (let i = 0; i < count; i++) {
      const o = W.OBJECTS[Math.floor(r() * W.OBJECTS.length)], bearing = r() * 360, depth = 0.4 + r() * 0.6;
      const rel = ((bearing - loc.heading + 540) % 360) - 180;
      if (Math.abs(rel) > FOV / 2) continue;
      const b = document.createElement("button");
      b.className = "obj" + (anyLearned(o.id) ? " learned" : "");
      b.textContent = o.e; b.setAttribute("aria-label", o.en.w);
      b.style.left = (50 + (rel / FOV) * 100) + "%"; b.style.top = (55 + depth * 35) + "%";
      b.style.fontSize = Math.max(32, Math.min(w, h) * 0.18 * depth) + "px";
      b.onclick = () => state === "playing" && learn(o, settings().lang);
      box.appendChild(b);
    }
  }
  // Google calls this when the key is rejected (e.g. ApiNotActivatedMapError): fall back to the offline scene.
  window.gm_authFailure = () => {
    console.warn("Google Maps rejected the API key; using the offline street scene. Enable 'Maps JavaScript API' (and billing) for the key's project.");
    svReady = false; CFG.googleMapsApiKey = "";
    $("pano").style.display = "none"; $("scene").style.display = ""; $("scene").style.background = "";
    $("sky").style.display = $("ground").style.display = ""; renderObjects();
  };
  function loadMaps() {
    if (!CFG.googleMapsApiKey) return Promise.resolve(false);
    if (window.google && google.maps && google.maps.importLibrary) return Promise.resolve(true);
    return new Promise((res) => {
      window.__mapsReady = () => res(true);
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.googleMapsApiKey) + "&loading=async&callback=__mapsReady&libraries=streetView";
      s.async = true; s.defer = true; s.onerror = () => res(false); document.head.appendChild(s);
    });
  }
  const CITIES = [[35.6595, 139.7005], [40.4168, -3.7038], [51.5074, -0.1278], [19.4326, -99.1332], [34.6937, 135.5023], [41.3851, 2.1734], [40.7128, -74.006], [-34.6037, -58.3816]];
  async function startGame() {
    hide(); state = "playing"; $("hud").hidden = false; $("touch").hidden = false;
    $("score").textContent = progress().score + " pts";
    loc = { key: Math.floor(Math.random() * 1e6) + "," + Math.floor(Math.random() * 1e6), heading: Math.random() * 360 };
    $("pano").style.display = "none"; $("scene").style.display = ""; svReady = false;
    renderObjects();
    if (!(await loadMaps())) return;
    try { await google.maps.importLibrary("streetView"); } catch (e) { return; }
    const c = CITIES[Math.floor(Math.random() * CITIES.length)];
    new google.maps.StreetViewService().getPanorama({ location: { lat: c[0] + (Math.random() - 0.5) * 0.02, lng: c[1] + (Math.random() - 0.5) * 0.02 }, radius: 2000 }, (data, status) => {
      if (status !== "OK") return;
      $("pano").style.display = ""; $("scene").style.background = "none"; $("sky").style.display = $("ground").style.display = "none";
      sv = sv || new google.maps.StreetViewPanorama($("pano"), { disableDefaultUI: true, keyboardShortcuts: false, clickToGo: false, scrollwheel: false, linksControl: false });
      sv.setPano(data.location.pano); sv.setPov({ heading: loc.heading, pitch: 0 }); svReady = true;
      loc.key = data.location.pano; renderObjects();
      if (!sv.__bound) { sv.__bound = true; sv.addListener("pano_changed", () => { loc.key = sv.getPano(); renderObjects(); }); }
    });
  }
  function turn(d) {
    loc.heading = (loc.heading + d + 360) % 360;
    if (svReady) sv.setPov({ heading: loc.heading, pitch: 0 });
    renderObjects();
  }
  function move(dir) {
    const now = Date.now(); if (now - lastMove < 350) return; lastMove = now;
    const h = (loc.heading + (dir < 0 ? 180 : 0)) % 360;
    if (svReady) {
      const links = (sv.getLinks() || []).map((l) => ({ l, d: Math.abs(((l.heading - h + 540) % 360) - 180) })).sort((a, b) => a.d - b.d);
      if (links[0] && links[0].d < 60) sv.setPano(links[0].l.pano);
    } else {
      const [x, z] = loc.key.split(",").map(Number), r = (h * Math.PI) / 180;
      loc.key = x + Math.round(Math.sin(r) * 3) + "," + (z + Math.round(Math.cos(r) * 3)); renderObjects();
    }
  }
  function press(k) {
    if (state !== "playing") return;
    if (k === "w") move(1); else if (k === "s") move(-1); else if (k === "a") turn(-10); else if (k === "d") turn(10);
  }
  addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "tab") { e.preventDefault(); if (state === "playing") pauseMenu(); else if (state === "paused") resume(); }
    else press(k);
  });
  document.querySelectorAll("#touch button").forEach((b) => {
    let t; const stop = () => clearInterval(t);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(b.dataset.key); t = setInterval(() => press(b.dataset.key), 120); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, stop));
  });
  $("gear").onclick = () => state === "playing" && pauseMenu();
  addEventListener("resize", renderObjects);
  applySettings(); mainMenu(); A.probe().then(() => A.refresh()).then(() => { applySettings(); if (state === "menu") mainMenu(); });
})();
