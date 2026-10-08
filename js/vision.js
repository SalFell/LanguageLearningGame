// Identify the object in a Street View selection: crop it, run Cloud Vision (objects, labels, text), translate with Cloud Translation,
// and analyse sign text with Cloud Natural Language. All calls use the game's Google API key.
(function (root) {
  const key = () => (root.GAME_CONFIG || {}).googleMapsApiKey;
  const SKIP = new Set(["photograph", "sky", "cloud", "image", "snapshot", "property", "asphalt", "road surface", "daytime", "morning", "nature", "line", "urban area", "infrastructure"]);

  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); setTimeout(() => rej(new Error("Timed out fetching the Street View image.")), 15000); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Could not fetch the Street View image (enable the Street View Static API for your key).")); i.src = url; });
  }
  async function post(url, body) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    let r;
    try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { throw new Error(e.name === "AbortError" ? "The request timed out. Check your connection and that the API is enabled for your key." : e.message); }
    finally { clearTimeout(timer); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j.error)) throw new Error((j.error && j.error.message) || "Request failed (" + r.status + ")");
    return j;
  }
  const REJ = "llg_rejects";
  const rejects = () => { try { return JSON.parse(localStorage.getItem(REJ)) || {}; } catch (e) { return {}; } };
  // Remember that a label was wrong on this device so it is ranked lower next time.
  function reject(label) { const r = rejects(); r[label.toLowerCase()] = (r[label.toLowerCase()] || 0) + 1; try { localStorage.setItem(REJ, JSON.stringify(r)); } catch (e) { /* full */ } }

  // Ranked, de-duplicated English candidate names for the selection.
  function candidates(resp) {
    const rj = rejects(), seen = new Set(), out = [];
    const add = (name, rank) => { const n = name.toLowerCase(); if (!seen.has(n)) { seen.add(n); out.push({ name: n, rank: rank / (1 + 3 * (rj[n] || 0)) }); } };
    for (const o of resp.localizedObjectAnnotations || []) {
      if (o.score < 0.4 || SKIP.has(o.name.toLowerCase())) continue;
      const v = o.boundingPoly.normalizedVertices, xs = v.map((p) => p.x || 0), ys = v.map((p) => p.y || 0);
      add(o.name, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * o.score);
    }
    for (const l of resp.labelAnnotations || []) if (l.score > 0.6 && !SKIP.has(l.description.toLowerCase())) add(l.description, 0.001 * l.score);
    return out.sort((a, b) => b.rank - a.rank).map((c) => c.name);
  }

  /* ---- translation ---- */
  const trKey = "llg_tr2";
  const decode = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };
  // -> {t: translated text, src: detected source language}
  async function translate(text, target, source) {
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(trKey)) || {}; } catch (e) { /* ignore */ }
    const ck = (source || "?") + ">" + target + ":" + text;
    if (cache[ck]) return cache[ck];
    const body = { q: text, target, format: "text" }; if (source) body.source = source;
    const j = await post("https://translation.googleapis.com/language/translate/v2?key=" + encodeURIComponent(key()), body);
    const tr = j.data.translations[0], out = { t: decode(tr.translatedText), src: tr.detectedSourceLanguage || source };
    cache[ck] = out; try { localStorage.setItem(trKey, JSON.stringify(cache)); } catch (e) { /* full */ }
    return out;
  }
  // Translate into the player's native language; if the text is already in it, translate into the language being learned instead.
  async function translateSmart(text, native, learn) {
    let r = await translate(text, native);
    if (r.src && r.src.split("-")[0] === native) { const l = await translate(text, learn, native); return { t: l.t, src: native, dest: learn }; }
    return { t: r.t, src: r.src, dest: native };
  }
  // English name -> {en, es, ja, jaReading}
  async function wordsFor(en) {
    const [es, ja] = await Promise.all([translate(en, "es", "en"), translate(en, "ja", "en")]);
    // kanji readings need a large dictionary download; never let that hold up the answer (it keeps loading in the background)
    const jaReading = root.Japanese ? await Promise.race([root.Japanese.reading(ja.t), new Promise((r) => setTimeout(() => r({}), 2500))]) : {};
    return { en: en.toLowerCase(), es: es.t.toLowerCase(), ja: ja.t, jaReading };
  }

  // opts: pano, heading, pitch, box {x0,y0,x1,y1} (selection, 0..1 of the viewport), aspect (viewport w/h)
  async function identify(o) {
    const W = 640, H = Math.max(240, Math.min(640, Math.round(W / o.aspect)));
    const img = await loadImage("https://maps.googleapis.com/maps/api/streetview?size=" + W + "x" + H + "&pano=" + encodeURIComponent(o.pano) + "&heading=" + o.heading.toFixed(1) + "&pitch=" + o.pitch.toFixed(1) + "&fov=90&key=" + encodeURIComponent(key()));
    const bx = o.box, padx = (bx.x1 - bx.x0) * 0.08, pady = (bx.y1 - bx.y0) * 0.08;
    const sx = Math.max(0, Math.round((bx.x0 - padx) * W)), sy = Math.max(0, Math.round((bx.y0 - pady) * H));
    const sw = Math.max(16, Math.min(W - sx, Math.round((bx.x1 - bx.x0 + 2 * padx) * W))), sh = Math.max(16, Math.min(H - sy, Math.round((bx.y1 - bx.y0 + 2 * pady) * H)));
    const k = Math.min(512 / Math.max(sw, sh), 4), c = document.createElement("canvas");
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const t = document.createElement("canvas"); t.width = t.height = 96;
    const m = Math.min(sw, sh), tx = sx + (sw - m) / 2, ty = sy + (sh - m) / 2;
    t.getContext("2d").drawImage(img, tx, ty, m, m, 0, 0, 96, 96);
    const b64 = c.toDataURL("image/jpeg", 0.85).split(",")[1], thumb = t.toDataURL("image/jpeg", 0.7);
    const resp = (await post("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(key()), { requests: [{ image: { content: b64 }, features: [{ type: "OBJECT_LOCALIZATION", maxResults: 10 }, { type: "LABEL_DETECTION", maxResults: 8 }, { type: "TEXT_DETECTION", maxResults: 1 }] }] })).responses[0] || {};
    if (resp.error) throw new Error(resp.error.message);
    const ta = (resp.textAnnotations || [])[0];
    const raw = ta && ta.description ? ta.description.trim() : "";
    const text = /\p{L}{2,}|[\u3040-\u30ff\u4e00-\u9fff]/u.test(raw) ? { original: raw.replace(/\s*\n\s*/g, " "), locale: ta.locale } : null;
    const names = candidates(resp);
    if (!names.length && text) names.push("sign");
    if (!names.length) throw new Error("Nothing recognizable there. Try drawing the box around an object.");
    return { candidates: names, words: await wordsFor(names[0]), thumb, text };
  }

  /* ---- sign text: word details ---- */
  const POS = { NOUN: "noun", VERB: "verb", ADJ: "adjective", ADV: "adverb", PRT: "particle", ADP: "adposition (preposition/postposition)", PRON: "pronoun", DET: "determiner", CONJ: "conjunction", NUM: "numeral", PUNCT: "punctuation", AFFIX: "affix", X: "other" };
  const REL = { NSUBJ: "the subject of", NSUBJPASS: "the subject of", CSUBJ: "the subject of", DOBJ: "the direct object of", IOBJ: "the indirect object of", POBJ: "the object of", AMOD: "an adjective describing", ADVMOD: "an adverb modifying", DET: "a determiner for", PREP: "a preposition linking", POSS: "showing possession for", NN: "a noun modifying", NUM: "a number counting", AUX: "a helping verb for", AUXPASS: "a helping verb for", CC: "a conjunction joining", CONJ: "joined (as an alternative or addition) to", ROOT: "the main word of the phrase", PRT: "a particle attached to", MARK: "a marker introducing", ATTR: "describing", ACOMP: "completing the meaning of", ADVCL: "an adverbial clause modifying", NEG: "negating", APPOS: "renaming", RCMOD: "a relative clause describing", PARTMOD: "a participle describing", INFMOD: "an infinitive describing", COP: "linking verb for", TMOD: "a time expression modifying", P: "punctuation for", SUFF: "a suffix of", MWE: "part of a multi-word expression with", DISCOURSE: "a discourse marker for", VMOD: "a verb phrase modifying", PCOMP: "the complement of", XCOMP: "an open complement of", CCOMP: "a clause complement of", GOBJ: "the object of", DEP: "related to" };
  const NL_LANGS = new Set(["en", "es", "ja", "de", "fr", "it", "pt", "ko", "zh", "ru", "ar"]);
  const nlCache = {};
  async function syntax(text, lang) {
    const ck = lang + ":" + text;
    if (!nlCache[ck]) nlCache[ck] = post("https://language.googleapis.com/v1/documents:analyzeSyntax?key=" + encodeURIComponent(key()), { document: Object.assign({ type: "PLAIN_TEXT", content: text }, lang ? { language: lang } : {}), encodingType: "UTF16" }).catch((e) => { delete nlCache[ck]; throw e; });
    return nlCache[ck];
  }
  // text: whole sign text; start/len: the clicked word's UTF-16 offsets in it; lang: source language; native/learn: languages for the translation
  async function wordInfo(text, start, len, lang, native, learn) {
    const word = text.substr(start, len), base = (lang || "").split("-")[0];
    const dest = base === native ? learn : native;
    const info = { word, dest, lang: base };
    const [tr, an] = await Promise.all([
      translate(word, dest, base || undefined).catch(() => null),
      NL_LANGS.has(base) || !base ? syntax(text, NL_LANGS.has(base) ? base : undefined).catch(() => null) : Promise.resolve(null),
    ]);
    info.translation = tr && tr.t;
    const toks = (an && an.tokens) || [];
    const i = toks.findIndex((t) => t.text.beginOffset <= start && start < t.text.beginOffset + t.text.content.length);
    const tok = toks[i];
    if (tok) {
      const pos = tok.partOfSpeech || {};
      info.pos = POS[pos.tag] || "word";
      info.lemma = tok.lemma && tok.lemma !== "-" ? tok.lemma : word;
      const feats = [pos.tense, pos.number, pos.mood, pos.person, pos.case].filter((x) => x && !/UNKNOWN/.test(x)).map((x) => x.toLowerCase());
      const head = toks[tok.dependencyEdge && tok.dependencyEdge.headTokenIndex], rel = tok.dependencyEdge && tok.dependencyEdge.label;
      const relText = REL[rel] || (rel ? "related (" + rel.toLowerCase() + ") to" : "");
      info.explanation = "In this text “" + word + "” is used as a " + info.pos + (feats.length ? " (" + feats.join(", ") + ")" : "") + (info.lemma !== word ? "; its dictionary form is “" + info.lemma + "”" : "") + ". " +
        (head && relText ? (head === tok ? "It is the main word of the phrase." : "Here it acts as " + relText + " “" + head.text.content + "”.") : "") +
        (pos.tag === "PRT" && base === "ja" ? " Japanese particles mark the grammatical role of the word before them." : "");
      if (info.lemma !== word) { const lt = await translate(info.lemma, dest, base || undefined).catch(() => null); info.lemmaTranslation = lt && lt.t; }
      if (base === "en" && ["NOUN", "VERB", "ADJ", "ADV"].includes(pos.tag)) {
        try { const d = await (await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(info.lemma.toLowerCase()))).json(); const df = d[0].meanings[0].definitions[0].definition; if (df) info.definition = df; } catch (e) { /* optional */ }
      }
    } else info.explanation = "Detailed grammar isn't available for this word (the Cloud Natural Language API may be disabled or the language unsupported).";
    return info;
  }
  root.Vision = { identify, wordsFor, translateSmart, wordInfo, reject };
})(window);
