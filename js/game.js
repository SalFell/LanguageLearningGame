(function () {
  const W = window.Words, A = window.Accounts, CFG = window.GAME_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const panel = $("panel"), overlay = $("overlay");
  // Accounts + leaderboard are on hold (single-player). Set enableAccounts: true in config.js to bring them back.
  const ACCOUNTS = CFG.enableAccounts === true;
  const GUEST_KEY = "llg_guest";
  const guest = (() => {
    const d = { progress: W.newProgress(), settings: { highContrast: false, largeText: false, reduceMotion: false, lang: "es", native: "en", minutes: 3 } };
    try { const s = JSON.parse(localStorage.getItem(GUEST_KEY)); if (s) { Object.assign(d.settings, s.settings); Object.assign(d.progress, s.progress); } } catch (e) { /* fresh */ }
    return d;
  })();
  let state = "menu"; // menu | playing | paused | learning
  let loc = { key: "0,0", heading: 0 }, sv = null, svReady = false;

  const user = () => (ACCOUNTS ? A.current() : null);
  const progress = () => (user() || guest).progress;
  const settings = () => (user() || guest).settings;
  const persist = (fn) => { if (user()) return A.update(fn); fn(guest); try { localStorage.setItem(GUEST_KEY, JSON.stringify(guest)); } catch (e) { /* full */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function applySettings() {
    const s = settings();
    document.body.classList.toggle("high-contrast", !!s.highContrast);
    document.body.classList.toggle("large-text", !!s.largeText);
    document.body.classList.toggle("reduce-motion", !!s.reduceMotion);
  }
  function show(html) { panel.innerHTML = html; overlay.hidden = false; }
  function hide() { overlay.hidden = true; panel.innerHTML = ""; }
  /* ---------- round: timer, score, game over ---------- */
  const round = { id: 0, active: false, started: false, left: 0, total: 0, startScore: 0, identified: 0, learned: 0, timer: null };
  const roundScore = () => progress().score - round.startScore;
  const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  function updateHud() { $("score").textContent = roundScore() + " pts"; $("timer").textContent = round.started ? "⏱ " + fmt(round.left) : "⏱ loading…"; }
  function beginRound(minutes) {
    clearInterval(round.timer);
    Object.assign(round, { id: round.id + 1, active: true, started: false, total: minutes * 60, left: minutes * 60, startScore: progress().score, identified: 0, learned: 0 });
    updateHud();
  }
  // The clock starts when Street View (or the offline scene) is ready and runs through learning screens, but not the pause menu.
  function startClock(id) {
    if (!round.active || round.started || id !== round.id) return;
    round.started = true; updateHud();
    round.timer = setInterval(() => {
      if (state === "paused" || state === "menu") return;
      round.left -= 1; updateHud();
      if (round.left <= 0) gameOver();
    }, 1000);
  }
  function endRound() { clearInterval(round.timer); round.active = false; }
  function gameOver() {
    endRound(); state = "gameover";
    $("globe").hidden = true; $("wordpop").hidden = true; $("selbox").hidden = true; $("toast").hidden = true;
    show(`<h1>⏱ Time's up!</h1><h2>Score: ${roundScore()}</h2><p>Objects identified: <b>${round.identified}</b><br>Words learned: <b>${round.learned}</b></p><button id="again">PLAY AGAIN</button><button id="quit" class="secondary">QUIT TO MAIN MENU</button>`);
    $("again").onclick = () => startGame();
    $("quit").onclick = () => { hide(); mainMenu(); };
  }
  const nativeLang = () => settings().native || "en";
  function langSelect(id, cur, label) {
    return `<select id="${id}" aria-label="${label || "Language"}">${Object.entries(W.LANGUAGES).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("")}</select>`;
  }

  /* ---------- menus ---------- */
  function mainMenu() {
    state = "menu"; endRound(); $("hud").hidden = true; $("globe").hidden = true;
    show(`<h1>🌍 Vocab Venture</h1><button id="play">PLAY</button><button id="settings" class="secondary">SETTINGS</button>${ACCOUNTS ? `<button id="lb" class="secondary">LEADERBOARD</button><p>${user() ? "Signed in as " + esc(user().name) : "Playing as guest"}</p>` : ""}`);
    $("play").onclick = langPrompt; $("settings").onclick = () => settingsMenu(mainMenu); if ($("lb")) $("lb").onclick = () => leaderboard(mainMenu);
  }
  const MINUTES = [1, 2, 3, 5, 10, 15];
  const minutesSelect = (cur) => `<select id="minutes" aria-label="Time limit">${MINUTES.map((m) => `<option value="${m}"${m === (cur || 3) ? " selected" : ""}>${m} minute${m > 1 ? "s" : ""}</option>`).join("")}</select>`;
  function langPrompt() {
    show(`<h2>Language to Learn</h2><label>I want to learn:</label>${langSelect("lang", settings().lang, "Language to learn")}<label>My native language:</label>${langSelect("native", nativeLang(), "Native language")}<label>Time limit:</label>${minutesSelect(settings().minutes)}<button id="go">START</button><button id="back" class="secondary">Back</button>`);
    $("go").onclick = () => { persist((u) => { const s = u.settings || u; s.lang = $("lang").value; s.native = $("native").value; s.minutes = +$("minutes").value; }); startGame(); };
    $("back").onclick = mainMenu;
  }
  function pauseMenu() {
    state = "paused";
    show(`<h2>Paused</h2><button id="cont">CONTINUE</button><button id="settings" class="secondary">SETTINGS</button>${ACCOUNTS ? `<button id="lb" class="secondary">LEADERBOARD</button>` : ""}<button id="quit" class="danger">QUIT</button>`);
    $("cont").onclick = resume; $("settings").onclick = () => settingsMenu(pauseMenu); if ($("lb")) $("lb").onclick = () => leaderboard(pauseMenu);
    $("quit").onclick = () => { endRound(); hide(); mainMenu(); };
  }
  function resume() { hide(); state = "playing"; }
  function settingsMenu(back) {
    const s = settings();
    const cb = (k, t) => `<label class="row"><input type="checkbox" data-k="${k}"${s[k] ? " checked" : ""}> ${t}</label>`;
    show(`<h2>Settings</h2><h3>Accessibility</h3>${cb("highContrast", "High contrast menus")}${cb("largeText", "Large text")}${cb("reduceMotion", "Reduce motion")}<h3>Languages</h3><label>My native language:</label>${langSelect("native", nativeLang(), "Native language")}${ACCOUNTS ? `<button id="acct">ACCOUNT MANAGEMENT</button>` : ""}<button id="back" class="secondary">Back</button>`);
    panel.querySelectorAll("input[data-k]").forEach((i) => (i.onchange = () => { persist((u) => { (u.settings || u)[i.dataset.k] = i.checked; }); applySettings(); }));
    $("native").onchange = () => persist((u) => { (u.settings || u).native = $("native").value; });
    if ($("acct")) $("acct").onclick = () => accountMenu(() => settingsMenu(back));
    $("back").onclick = back;
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
  const wordLabel = (o, l) => W.labelFor(o, l);
  // Intro: just the object's name (in the language being learned and in the player's native language). "Learn" starts the exercises.
  function learn(obj, lang, note) {
    state = "learning";
    const done = W.isLearned(progress(), obj.id, lang), nat = nativeLang();
    const thumb = obj.thumb ? `<img class="thumb" alt="" src="${obj.thumb}">` : `<div class="big">${obj.e}</div>`;
    const textBlock = obj.text ? `<div class="signtext"><h3>Text found</h3><p id="txt" class="words">${wordsHtml(obj.text)}</p><p id="txtTr" class="msg">Translating…</p><small>Tap a word to see what it means.</small></div>` : "";
    show(`${langSelect("lang", lang)}${thumb}${note ? `<p class="ok">${esc(note)}</p>` : ""}<h2>${esc(wordLabel(obj, lang))}</h2>${nat !== lang ? `<p class="native">${esc(wordLabel(obj, nat))} <small>(${esc(W.LANGUAGES[nat])})</small></p>` : ""}${done ? `<p class="ok">✔ Learned! (+${W.POINTS_PER_WORD} pts)</p>` : ""}${textBlock}${done ? "" : `<button id="learn">Learn</button>`}${obj.dynamic ? `<button id="mis" class="secondary">Misidentified</button>` : ""}<button id="close" class="secondary">Close</button>`);
    $("lang").onchange = () => learn(obj, $("lang").value);
    $("close").onclick = () => { hide(); state = "playing"; };
    if ($("learn")) $("learn").onclick = () => exercise(obj, lang);
    if ($("mis")) $("mis").onclick = () => misidentified(obj, lang);
    if (obj.text) wireText(obj, lang);
  }
  // A highlighted object first asks the player to name it (3 attempts, or REVEAL), then shows the name and offers the exercises.
  function encounter(obj) {
    const lang = settings().lang;
    if (W.isLearned(progress(), obj.id, lang)) return learn(obj, lang, "You already know this one!");
    guess(obj, lang, 0);
  }
  function guess(obj, lang, tries) {
    state = "learning";
    const t = obj[lang], left = W.GUESS_ATTEMPTS - tries;
    const thumb = obj.thumb ? `<img class="thumb" alt="" src="${obj.thumb}">` : `<div class="big">${obj.e}</div>`;
    const hint = tries ? ` Hint: it starts with <b>${esc([...(lang === "ja" ? W.jaInfo(t).r || t.w : t.w)][0])}</b>.` : "";
    show(`${thumb}<h2>What is this?</h2><p>Type its name in ${esc(W.LANGUAGES[lang])}. ${left} attempt${left > 1 ? "s" : ""} left.${hint}</p><input id="ans" autocomplete="off" autocapitalize="off"><button id="chk">Guess</button><p class="msg" id="msg"></p><button id="reveal" class="secondary">REVEAL</button><button id="close" class="secondary">Close</button>`);
    $("close").onclick = () => { hide(); state = "playing"; };
    $("reveal").onclick = () => learn(obj, lang, "Revealed!");
    const chk = () => {
      if (W.checkSpelling(obj, lang, $("ans").value)) {
        persist((u) => W.addPoints(u.progress || u, W.GUESS_BONUS)); round.identified++; updateHud();
        learn(obj, lang, "✔ Correct! +" + W.GUESS_BONUS + " bonus points");
      } else if (tries + 1 >= W.GUESS_ATTEMPTS) learn(obj, lang, "Not quite. Here is the answer:");
      else guess(obj, lang, tries + 1);
    };
    $("chk").onclick = chk; $("ans").onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") chk(); };
    $("ans").focus();
  }
  function exercise(obj, lang) {
    state = "learning";
    const t = obj[lang], nat = nativeLang();
    const thumb = obj.thumb ? `<img class="thumb" alt="" src="${obj.thumb}">` : `<div class="big">${obj.e}</div>`;
    // the word in the language being learned stays hidden here; the native word is the prompt
    const head = `${langSelect("lang", lang)}${thumb}${nat !== lang ? `<h2>${esc(wordLabel(obj, nat))}</h2>` : ""}`;
    const close = `<button id="close" class="secondary">Close</button>`;
    const wire = () => { $("lang").onchange = () => learn(obj, $("lang").value); $("close").onclick = () => { hide(); state = "playing"; }; };
    const complete = (step, next) => {
      let newly = false;
      persist((u) => { newly = W.completeStep(u.progress || u, obj.id, lang, step); });
      if (newly && obj.spot) Spots.add(Object.assign({ words: { en: obj.en.w, es: obj.es.w, ja: obj.ja.w, jaReading: W.jaInfo(obj.ja) }, thumb: obj.thumb, text: obj.text }, obj.spot));
      if (newly) { round.learned++; updateHud(); renderObjects(); }
      next(newly);
    };
    const steps = (progress().steps || {})[obj.id + ":" + lang] || {};
    const stage = W.STEPS.find((s) => !steps[s]);
    const rnd = W.seededRandom(W.hash(obj.id + lang + stage));
    const mark = W.STEPS.map((s) => (steps[s] ? "✔" : "○") + " " + s).join(" · ");
    const choices = (q) => `${q}${W.optionObjects(obj, lang, rnd).map((o) => `<button class="secondary" data-o="${esc(o[lang].w)}">${esc(wordLabel(o, lang))}</button>`).join("")}<p class="msg" id="msg"></p>`;
    const finish = (newly) => { if (newly) { show(`${langSelect("lang", lang)}${thumb}<h2>${esc(wordLabel(obj, lang))}</h2><p class="ok">🎉 Learned! +${W.POINTS_PER_WORD} pts</p>${close}`); wire(); } else exercise(obj, lang); };
    const pick = (step) => panel.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => (b.dataset.o === t.w ? complete(step, finish) : ($("msg").textContent = "Try again!"))));
    if (stage === "recognize") {
      show(`${head}<small>${mark}</small>${choices("<p>Which word means this object?</p>")}${close}`); wire(); pick("recognize");
    } else if (stage === "spell") {
      const ji = lang === "ja" ? W.jaInfo(t) : {};
      show(`${head}<small>${mark}</small><p>Type the word for this object${lang === "ja" ? " (romaji, hiragana or kanji)" : ""}. Hint: starts with <b>${esc(lang === "ja" && ji.r ? ji.r[0] : t.w[0])}</b></p><input id="ans" autocomplete="off" autocapitalize="off"><button id="chk">Check</button><p class="msg" id="msg"></p>${close}`); wire();
      const chk = () => (W.checkSpelling(obj, lang, $("ans").value) ? complete("spell", finish) : ($("msg").textContent = "Not quite — it was " + wordLabel(obj, lang) + ". Try again!"));
      $("chk").onclick = chk; $("ans").onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") chk(); };
    } else {
      show(`${head}<small>${mark}</small><p>Write your own sentence using <b>${esc(wordLabel(obj, lang))}</b>. Longer, richer sentences earn more points (up to ${W.MAX_SENTENCE_POINTS}).</p><small>Example: ${esc(t.s.replace("{}", t.w))}</small><textarea id="sent" rows="3" autocomplete="off"></textarea><button id="chk">Submit</button><p class="msg" id="msg"></p>${close}`); wire();
      const chk = () => {
        const r = W.scoreSentence($("sent").value, obj, lang);
        if (!r.ok) return ($("msg").textContent = r.reason);
        persist((u) => W.addPoints(u.progress || u, r.points)); updateHud();
        complete("sentence", (newly) => { show(`${langSelect("lang", lang)}${thumb}<h2>${esc(wordLabel(obj, lang))}</h2><p class="ok">+${r.points} sentence points${newly ? " · 🎉 Learned! +" + W.POINTS_PER_WORD : ""}</p>${close}`); wire(); });
      };
      $("chk").onclick = chk; $("sent").onkeydown = (e) => e.stopPropagation();
    }
  }
  /* ---- text found on the object: translation + clickable words ---- */
  function segments(text, locale) {
    const out = [];
    try {
      const seg = new Intl.Segmenter(locale || undefined, { granularity: "word" });
      for (const s of seg.segment(text)) out.push({ s: s.segment, i: s.index, w: !!s.isWordLike });
    } catch (e) { const re = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu; let m, last = 0; while ((m = re.exec(text))) { if (m.index > last) out.push({ s: text.slice(last, m.index), i: last, w: false }); out.push({ s: m[0], i: m.index, w: true }); last = m.index + m[0].length; } if (last < text.length) out.push({ s: text.slice(last), i: last, w: false }); }
    return out;
  }
  const wordsHtml = (t) => segments(t.original, t.locale).map((s) => (s.w ? `<span class="w" data-i="${s.i}" data-n="${s.s.length}" tabindex="0">${esc(s.s)}</span>` : esc(s.s))).join("");
  async function wireText(obj, lang) {
    const t = obj.text;
    panel.querySelectorAll("#txt .w").forEach((el) => {
      const go = () => showWord(t, +el.dataset.i, +el.dataset.n, lang);
      el.onclick = go; el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    try {
      const r = await Vision.translateSmart(t.original, nativeLang(), lang);
      t.src = r.src || t.locale;
      if ($("txtTr")) $("txtTr").innerHTML = `<b>${esc(W.LANGUAGES[r.dest] || r.dest)}:</b> ${esc(r.t)}`;
    } catch (e) { if ($("txtTr")) $("txtTr").textContent = "Couldn't translate the text (enable the Cloud Translation API)."; }
  }
  async function showWord(t, start, len, lang) {
    const pop = $("wordpop"), body = $("wordpopBody");
    body.innerHTML = "<p>Loading…</p>"; pop.hidden = false;
    $("wordpopClose").onclick = () => (pop.hidden = true);
    try {
      const i = await Vision.wordInfo(t.original, start, len, t.src || t.locale, nativeLang(), lang);
      const row = (k, v) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "");
      body.innerHTML = `<h2>${esc(i.word)}</h2><table class="info">${row("Translation (" + (W.LANGUAGES[i.dest] || i.dest) + ")", i.translation)}${row("Meaning", i.definition || (i.lemmaTranslation ? "“" + i.lemma + "” = " + i.lemmaTranslation : i.translation && "“" + i.word + "” = " + i.translation))}${row("Type", i.pos)}${row("How it's used here", i.explanation)}</table>`;
    } catch (e) { body.innerHTML = `<p class="msg">Couldn't look that word up: ${esc(e.message)}</p>`; }
  }

  /* ---- "Misidentified": remember the mistake, report it, and try the next best guess ---- */
  async function misidentified(obj, lang) {
    const wrong = obj.en.w;
    Vision.reject(wrong);
    A.report({ wrong, candidates: obj.candidates || [], thumb: obj.thumb, spot: obj.spot, text: obj.text && obj.text.original, lang: settings().lang });
    flash("Thanks — reported. Trying another guess…", 4000);
    let next = (obj.candidates || []).slice((obj.candIdx || 0) + 1)[0], idx = (obj.candIdx || 0) + 1;
    if (!next) { next = (prompt("Sorry about that! What is this object? (type its English name)") || "").trim(); idx = (obj.candidates || []).length; if (!next) return learn(obj, lang); }
    try {
      const o2 = W.fromWords(await Vision.wordsFor(next), obj.thumb, obj.text);
      o2.spot = obj.spot; o2.candidates = (obj.candidates || []).concat(next === obj.candidates?.[idx] ? [] : [next]); o2.candIdx = Math.min(idx, o2.candidates.length - 1);
      learn(o2, lang);
    } catch (e) { flash("Couldn't look that up: " + e.message, 5000); learn(obj, lang); }
  }

  /* ---------- world ---------- */
  const FOV = 100;
  const Spots = {
    key: () => "llg_spots_" + (user() ? user().id : "guest"),
    all() { try { return JSON.parse(localStorage.getItem(this.key())) || []; } catch (e) { return []; } },
    add(s) { const a = this.all(); if (a.some((x) => x.pano === s.pano && x.words.en === s.words.en && Math.abs(x.heading - s.heading) < 10)) return; a.push(s); try { localStorage.setItem(this.key(), JSON.stringify(a.slice(-100))); } catch (e) { /* storage full */ } },
  };
  const tan = Math.tan, rad = Math.PI / 180;
  function renderSpots(box) {
    const w = innerWidth, h = innerHeight, pitch = svReady ? sv.getPov().pitch : 0;
    for (const s of Spots.all()) {
      if (s.pano !== loc.key) continue;
      const rel = ((s.heading - loc.heading + 540) % 360) - 180;
      if (Math.abs(rel) > 80) continue;
      const x = 0.5 + tan(rel * rad) / 2, y = 0.5 - (tan((s.pitch - pitch) * rad) / 2) * (w / h);
      const b = document.createElement("button");
      b.className = "spot"; b.setAttribute("aria-label", s.words.en);
      b.style.left = x * 100 + "%"; b.style.top = y * 100 + "%";
      b.innerHTML = `<img alt="" src="${s.thumb}">`;
      b.onclick = () => state === "playing" && encounter(W.fromWords(s.words, s.thumb, s.text));
      box.appendChild(b);
    }
  }
  function renderObjects() {
    const box = $("objects"), r = W.seededRandom(W.hash(loc.key));
    box.innerHTML = "";
    if (svReady) return renderSpots(box);
    $("sky").style.backgroundPositionX = -loc.heading * 4 + "px";
    const count = 5 + Math.floor(r() * 3), h = innerHeight, w = innerWidth;
    for (let i = 0; i < count; i++) {
      const o = W.OBJECTS[Math.floor(r() * W.OBJECTS.length)], bearing = r() * 360, depth = 0.4 + r() * 0.6;
      const rel = ((bearing - loc.heading + 540) % 360) - 180;
      if (Math.abs(rel) > FOV / 2) continue;
      const b = document.createElement("button");
      b.className = "obj";
      b.textContent = o.e; b.setAttribute("aria-label", o.en.w);
      b.style.left = (50 + (rel / FOV) * 100) + "%"; b.style.top = (55 + depth * 35) + "%";
      b.style.fontSize = Math.max(32, Math.min(w, h) * 0.18 * depth) + "px";
      b.onclick = () => state === "playing" && encounter(o);
      box.appendChild(b);
    }
  }
  // Google calls this when the key is rejected (e.g. ApiNotActivatedMapError): fall back to the offline scene.
  window.gm_authFailure = () => {
    console.warn("Google Maps rejected the API key; using the offline street scene. Enable 'Maps JavaScript API' (and billing) for the key's project.");
    svReady = false; CFG.googleMapsApiKey = ""; startClock(round.id);
    $("pano").style.display = "none"; $("scene").style.display = ""; $("scene").style.background = "";
    $("sky").style.display = $("ground").style.display = ""; renderObjects();
  };
  function loadMaps() {
    if (!CFG.googleMapsApiKey) return Promise.resolve(false);
    if (window.google && google.maps && google.maps.importLibrary) return Promise.resolve(true);
    return new Promise((res) => {
      window.__mapsReady = () => res(true);
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.googleMapsApiKey) + "&loading=async&callback=__mapsReady&libraries=streetView,maps";
      s.async = true; s.defer = true; s.onerror = () => res(false); document.head.appendChild(s);
    });
  }
  const CITIES = [[35.6595, 139.7005], [40.4168, -3.7038], [51.5074, -0.1278], [19.4326, -99.1332], [34.6937, 135.5023], [41.3851, 2.1734], [40.7128, -74.006], [-34.6037, -58.3816]];
  async function startGame() {
    hide(); state = "playing"; $("hud").hidden = false;
    beginRound(settings().minutes || 3); const rid = round.id;
    loc = { key: Math.floor(Math.random() * 1e6) + "," + Math.floor(Math.random() * 1e6), heading: Math.random() * 360 };
    $("pano").style.display = "none"; $("scene").style.display = ""; svReady = false;
    renderObjects();
    if (!(await loadMaps())) return startClock(rid);
    try { await google.maps.importLibrary("streetView"); } catch (e) { return startClock(rid); }
    const c = CITIES[Math.floor(Math.random() * CITIES.length)];
    await dropIn({ lat: c[0] + (Math.random() - 0.5) * 0.02, lng: c[1] + (Math.random() - 0.5) * 0.02 }, 2000);
    startClock(rid);
  }
  // Drop into the nearest Street View panorama to a position; resolves true on success.
  function dropIn(pos, radius) {
    return new Promise((res) => new google.maps.StreetViewService().getPanorama({ location: pos, radius }, (data, status) => {
      if (status !== "OK") return res(false);
      $("pano").style.display = ""; $("scene").style.background = "none"; $("sky").style.display = $("ground").style.display = "none";
      sv = sv || new google.maps.StreetViewPanorama($("pano"), { clickToGo: false, linksControl: true, panControl: true, zoomControl: true, addressControl: false, fullscreenControl: false, enableCloseButton: false, showRoadLabels: true, keyboardShortcuts: true, scrollwheel: false, disableDoubleClickZoom: true, zoom: 1 });
      sv.setPano(data.location.pano); sv.setPov({ heading: loc.heading, pitch: 0 }); svReady = true;
      loc.key = data.location.pano; renderObjects();
      if (!sv.__bound) { sv.__bound = true; sv.addListener("pano_changed", () => { loc.key = sv.getPano(); renderObjects(); }); sv.addListener("pov_changed", () => { loc.heading = (sv.getPov().heading + 360) % 360; renderObjects(); }); }
      sv.focus(); res(true);
    }));
  }

  /* ---------- global view: zoom out, pick anywhere, drop into Street View ---------- */
  let map = null, marker = null;
  const OVERHEAD = 18, DROP_ZOOM = 19;
  const updateLevel = () => { if (map && state === "globe") $("globeMsg").textContent = Geo.zoomLevel(map.getZoom()) + " view — scroll to zoom, click to drop into Street View"; };
  async function openGlobe() {
    if (state !== "playing") return;
    if (!CFG.googleMapsApiKey || !(await loadMaps())) { flash("The globe needs Google Maps (add an API key in config.js)."); return; }
    try { await google.maps.importLibrary("maps"); await google.maps.importLibrary("streetView"); } catch (e) { flash("Could not load Google Maps."); return; }
    state = "globe"; $("globe").hidden = false;
    const at = svReady && sv.getPosition();
    if (!map) {
      map = new google.maps.Map($("globeMap"), { center: { lat: 20, lng: 0 }, zoom: 2, minZoom: 2, maxZoom: 21, mapTypeId: "hybrid", streetViewControl: false, fullscreenControl: false, keyboardShortcuts: false, gestureHandling: "greedy" });
      map.addListener("click", (e) => pick(e.latLng));
      map.addListener("zoom_changed", updateLevel);
    }
    // zooming out from street level starts at an overhead view of the current street, then city, province, country, world
    if (at) { marker = marker || new google.maps.Marker({ map }); marker.setMap(map); marker.setPosition(at); map.setCenter(at); map.setZoom(OVERHEAD); }
    else { map.setZoom(2); map.setCenter({ lat: 20, lng: 0 }); }
    updateLevel();
  }
  function closeGlobe() { $("globe").hidden = true; if (state === "globe") state = "playing"; }
  async function pick(latLng) {
    $("globeMsg").textContent = "Searching for Street View…";
    const pos = { lat: latLng.lat(), lng: latLng.lng() };
    // widen the search as needed, since Street View coverage is not everywhere
    for (const r of [1000, 10000, 50000, 200000]) {
      if (await dropIn(pos, r)) { loc.heading = Math.random() * 360; sv.setPov({ heading: loc.heading, pitch: 0 }); closeGlobe(); return; }
    }
    $("globeMsg").textContent = "No Street View coverage near there. Try another spot!"; setTimeout(updateLevel, 2500);
  }
  let flashTimer = null;
  function flash(t, ms) { const m = $("toast"); m.textContent = t; m.hidden = false; clearTimeout(flashTimer); flashTimer = setTimeout(() => (m.hidden = true), ms || 3000); }
  // Wheel: gradually zooms Street View out, then continues through the overhead map (street > city > province > country > world).
  // Scrolling back in past street level of the map drops back into Street View at the map center.
  let wheelAcc = 0;
  addEventListener("wheel", (e) => {
    if (!overlay.hidden) return;
    if (state === "globe") {
      if (e.deltaY < 0 && map.getZoom() >= DROP_ZOOM) { const c = map.getCenter(); closeGlobe(); dropIn({ lat: c.lat(), lng: c.lng() }, 60).then((ok) => { if (!ok) flash("No Street View here."); }); }
      return;
    }
    if (state !== "playing") return;
    const z = svReady ? sv.getZoom() : 0;
    if (e.deltaY < 0) { wheelAcc = 0; if (svReady) sv.setZoom(Math.min(4, z - e.deltaY / 300)); return; }
    if (svReady && z > 0.05) { wheelAcc = 0; sv.setZoom(Math.max(0, z - e.deltaY / 300)); return; }
    wheelAcc += e.deltaY;
    if (wheelAcc > 120) { wheelAcc = 0; openGlobe(); }
  }, { passive: true });
  $("globeBtn").onclick = openGlobe; $("globeBack").onclick = closeGlobe;
  addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "escape" && state === "globe") closeGlobe();
    else if (k === "tab") { e.preventDefault(); if (state === "playing" || state === "globe") { closeGlobe(); state = "playing"; pauseMenu(); } else if (state === "paused") resume(); }
    else if (k === "g" && state === "playing") openGlobe();
  });
  /* ---------- camera + selection box ---------- */
  // Left-drag rotates the camera (natively in Street View, manually in the offline scene).
  // Right-drag (or the 🔍 select toggle for touch/trackpads) draws a box around the object to identify.
  let down = null, busy = false, selectMode = false, sel = null;
  const wd = $("world"), selBox = $("selbox");
  const inBox = (e) => { const r = wd.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  const wantsSelect = (e) => e.button === 2 || selectMode;
  function paintSel() {
    const x0 = Math.min(sel.a.x, sel.b.x), x1 = Math.max(sel.a.x, sel.b.x), y0 = Math.min(sel.a.y, sel.b.y), y1 = Math.max(sel.a.y, sel.b.y);
    Object.assign(selBox.style, { left: x0 * 100 + "%", top: y0 * 100 + "%", width: (x1 - x0) * 100 + "%", height: (y1 - y0) * 100 + "%" });
    return { x0, y0, x1, y1 };
  }
  wd.addEventListener("contextmenu", (e) => e.preventDefault());
  wd.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || e.target.closest(".obj,.spot")) return;
    if (wantsSelect(e) && svReady) {
      e.preventDefault(); e.stopPropagation(); wd.setPointerCapture(e.pointerId);
      sel = { a: inBox(e), b: inBox(e) }; selBox.hidden = false; paintSel(); return;
    }
    if (e.button === 0) down = { lx: e.clientX, x: e.clientX, y: e.clientY };
  }, true);
  wd.addEventListener("pointermove", (e) => {
    if (sel) { e.stopPropagation(); sel.b = inBox(e); paintSel(); return; }
    if (down && state === "playing" && !svReady) { loc.heading = (loc.heading - (e.clientX - down.lx) * 0.2 + 360) % 360; renderObjects(); }
    if (down) down.lx = e.clientX;
  }, true);
  // Free movement: a click on the ground walks to the nearest panorama at that spot, even where there is no link arrow.
  wd.addEventListener("pointerup", (e) => {
    const d = down; down = null;
    if (!sel) { if (d && svReady && state === "playing" && e.button === 0 && !selectMode && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && !e.target.closest(".spot,button,a,.gmnoprint,.gm-svpc,.gm-control-active")) walkToClick(e); return; }
    e.stopPropagation(); const box = paintSel(); sel = null; selBox.hidden = true;
    if (box.x1 - box.x0 < 0.03 || box.y1 - box.y0 < 0.03) return flash("Drag a larger box around the object.");
    identifyBox(box);
  }, true);
  function walkTo(bearing, dist) {
    const p = sv.getPosition(); if (!p) return Promise.resolve(false);
    const t = Geo.destination(p.lat(), p.lng(), bearing, dist), cur = sv.getPano();
    return new Promise((res) => new google.maps.StreetViewService().getPanorama({ location: t, radius: Math.max(12, dist * 0.6), preference: google.maps.StreetViewPreference.NEAREST, sources: [google.maps.StreetViewSource.OUTDOOR] }, (data, st) => {
      if (st === "OK" && data.location.pano !== cur) { sv.setPano(data.location.pano); sv.focus(); res(true); } else res(false);
    }));
  }
  function walkToClick(e) {
    const r = wd.getBoundingClientRect(), pov = sv.getPov();
    const dir = Geo.clickDirection((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r.width / r.height, pov.heading, pov.pitch, sv.getZoom());
    const dist = Geo.groundDistance(dir.pitch);
    if (dist) walkTo(dir.heading, dist);
  }
  // Arrow keys: Street View handles them where a link exists; otherwise step to the nearest panorama in that direction.
  addEventListener("keydown", (e) => {
    if (state !== "playing" || !svReady || !/^Arrow(Up|Down)$/.test(e.key) || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const h = (sv.getPov().heading + (e.key === "ArrowDown" ? 180 : 0)) % 360;
    const near = (sv.getLinks() || []).some((l) => Math.abs(((l.heading - h + 540) % 360) - 180) < 45);
    if (!near) { e.preventDefault(); walkTo(h, 15).then((ok) => ok || walkTo(h, 30)); }
  }, true);
  wd.addEventListener("pointercancel", () => { down = null; sel = null; selBox.hidden = true; }, true);
  $("selectBtn").onclick = () => { selectMode = !selectMode; $("selectBtn").classList.toggle("on", selectMode); document.body.classList.toggle("selecting", selectMode); flash(selectMode ? "Select mode: drag a box around an object" : "Select mode off"); };
  async function identifyBox(box) {
    if (busy || !window.Vision) return; busy = true;
    const r = wd.getBoundingClientRect(), pov = sv.getPov(), pano = sv.getPano();
    flash("🔍 Identifying…", 20000);
    try {
      const res = await Vision.identify({ pano, heading: pov.heading, pitch: pov.pitch, box, aspect: r.width / r.height });
      const obj = W.fromWords(res.words, res.thumb, res.text), cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
      obj.candidates = res.candidates; obj.candIdx = 0;
      obj.spot = { pano, heading: (pov.heading + Math.atan((cx - 0.5) * 2) / rad + 360) % 360, pitch: pov.pitch + Math.atan(-(cy - 0.5) * 2 * (r.height / r.width)) / rad };
      $("toast").hidden = true;
      if (state === "playing") encounter(obj);
    } catch (err) { flash("Couldn't identify that: " + err.message, 6000); }
    busy = false;
  }
  $("gear").onclick = () => { if (state === "globe") closeGlobe(); if (state === "playing") pauseMenu(); };
  addEventListener("resize", renderObjects);
  applySettings(); mainMenu(); if (ACCOUNTS) A.probe().then(() => A.refresh()).then(() => { applySettings(); if (state === "menu") mainMenu(); });
})();
