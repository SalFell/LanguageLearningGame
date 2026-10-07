// Vocabulary + learning logic (pure, usable in browser and Node).
(function (root) {
  const LANGUAGES = { en: "English", es: "Español", ja: "日本語" };
  // w: word, r: accepted romanized spelling (ja), s: sentence with {} blank
  const OBJECTS = [
    { id: "car", e: "🚗", en: { w: "car", s: "I drive my {} to work." }, es: { w: "coche", s: "Mi {} es rojo." }, ja: { w: "くるま", r: "kuruma", s: "{}で会社に行きます。" } },
    { id: "tree", e: "🌳", en: { w: "tree", s: "The bird sits in the {}." }, es: { w: "árbol", s: "El {} es muy alto." }, ja: { w: "き", r: "ki", s: "大きな{}があります。" } },
    { id: "house", e: "🏠", en: { w: "house", s: "We live in a small {}." }, es: { w: "casa", s: "Mi {} está cerca." }, ja: { w: "いえ", r: "ie", s: "私の{}は小さいです。" } },
    { id: "bus", e: "🚌", en: { w: "bus", s: "I take the {} to school." }, es: { w: "autobús", s: "El {} llega tarde." }, ja: { w: "バス", r: "basu", s: "{}を待っています。" } },
    { id: "bicycle", e: "🚲", en: { w: "bicycle", s: "She rides a {} every day." }, es: { w: "bicicleta", s: "Tengo una {} nueva." }, ja: { w: "じてんしゃ", r: "jitensha", s: "{}に乗ります。" } },
    { id: "dog", e: "🐕", en: { w: "dog", s: "The {} barks loudly." }, es: { w: "perro", s: "El {} corre rápido." }, ja: { w: "いぬ", r: "inu", s: "{}が走ります。" } },
    { id: "cat", e: "🐈", en: { w: "cat", s: "The {} sleeps on the sofa." }, es: { w: "gato", s: "El {} duerme mucho." }, ja: { w: "ねこ", r: "neko", s: "{}が寝ています。" } },
    { id: "flower", e: "🌸", en: { w: "flower", s: "This {} smells sweet." }, es: { w: "flor", s: "La {} es bonita." }, ja: { w: "はな", r: "hana", s: "きれいな{}ですね。" } },
    { id: "bench", e: "🪑", en: { w: "chair", s: "Please sit on the {}." }, es: { w: "silla", s: "Siéntate en la {}." }, ja: { w: "いす", r: "isu", s: "{}に座ってください。" } },
    { id: "sun", e: "☀️", en: { w: "sun", s: "The {} is bright today." }, es: { w: "sol", s: "Hoy hace {}." }, ja: { w: "たいよう", r: "taiyou", s: "{}が明るいです。" } },
    { id: "bird", e: "🐦", en: { w: "bird", s: "A {} sings in the morning." }, es: { w: "pájaro", s: "El {} vuela alto." }, ja: { w: "とり", r: "tori", s: "{}が歌います。" } },
    { id: "lamp", e: "💡", en: { w: "light", s: "Turn on the {}." }, es: { w: "luz", s: "Apaga la {}." }, ja: { w: "でんき", r: "denki", s: "{}をつけてください。" } },
  ];
  const STEPS = ["recognize", "spell", "sentence"];
  const POINTS_PER_WORD = 100;

  const norm = (s) => String(s).trim().toLowerCase().normalize("NFC");
  const stripAccents = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /* ---- Japanese helpers: kana <-> hiragana <-> romaji ---- */
  const toHiragana = (s) => String(s).replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const isKana = (s) => /^[\u3040-\u309f\u30a0-\u30ffー]+$/.test(s);
  const BASE = { あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko", が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to", だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo", ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo", ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゔ: "vu" };
  const SMALL = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
  function kanaToRomaji(input) {
    const s = [...toHiragana(input)], out = [];
    let sokuon = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      let r;
      if (c === "っ") { sokuon = true; continue; }
      if (c === "ー") { const prev = out.join("").slice(-1); if (/[aiueo]/.test(prev)) out.push(prev); continue; }
      if (!BASE[c]) { out.push(c); continue; }
      r = BASE[c];
      if (SMALL[s[i + 1]] && r.endsWith("i") && r !== "i") {
        const stem = r.slice(0, -1), sm = SMALL[s[i + 1]];
        r = ["sh", "ch", "j"].includes(stem) ? stem + sm.slice(1) : stem + sm; i++;
      }
      if (r === "n" && /^[あいうえおやゆよ]/.test(s[i + 1] || "")) r = "n'";
      if (sokuon) { r = (r.startsWith("ch") ? "t" : r[0]) + r; sokuon = false; }
      out.push(r);
    }
    return out.join("");
  }
  // Reading info for a Japanese word entry: hiragana (k) and romaji (r) when known or derivable from kana.
  function jaInfo(t) {
    const k = t.k || (isKana(t.w) ? toHiragana(t.w) : undefined);
    return { k, r: t.r || (k ? kanaToRomaji(k) : undefined) };
  }
  const squash = (s) => norm(s).replace(/[\s'’-]/g, "");
  function checkSpelling(obj, lang, input) {
    const t = obj[lang], a = norm(input);
    if (!a) return false;
    if (a === norm(t.w)) return true;
    if (lang === "es" && stripAccents(a) === stripAccents(t.w)) return true;
    if (lang === "ja") { const i = jaInfo(t); return (!!i.r && squash(a) === squash(i.r)) || (!!i.k && toHiragana(a) === i.k); }
    return false;
  }
  // Display label: Japanese words get hiragana (when the word contains kanji) and romaji.
  function labelFor(o, lang) {
    const t = o[lang];
    if (lang !== "ja") return t.w;
    const i = jaInfo(t);
    return t.w + (i.k && i.k !== t.w ? "（" + i.k + "）" : "") + (i.r ? " · " + i.r : "");
  }
  const progressKey = (objId, lang) => objId + ":" + lang;
  function newProgress() { return { learned: {}, steps: {}, score: 0 }; }
  // Marks a step done; when all three are done the word is learned and points awarded. Returns true if newly learned.
  function completeStep(p, objId, lang, step) {
    const k = progressKey(objId, lang);
    if (p.learned[k]) return false;
    const s = (p.steps[k] = p.steps[k] || {});
    s[step] = true;
    if (STEPS.every((x) => s[x])) { p.learned[k] = true; p.score += POINTS_PER_WORD; return true; }
    return false;
  }
  const isLearned = (p, objId, lang) => !!p.learned[progressKey(objId, lang)];
  function fillSentence(obj, lang) { return obj[lang].s.replace("{}", "＿＿＿"); }
  function seededRandom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function optionObjects(obj, lang, rnd) {
    const others = OBJECTS.filter((o) => o.id !== obj.id && norm(o[lang].w) !== norm(obj[lang].w)).sort(() => rnd() - 0.5).slice(0, 3);
    return [obj, ...others].sort(() => rnd() - 0.5);
  }
  const options = (obj, lang, rnd) => optionObjects(obj, lang, rnd).map((o) => o[lang].w);
  // Build a learnable object from an identified English word and its translations. Reuses a built-in object when one matches.
  const TEMPLATES = { en: "Look at the {}.", es: "Mira: {}.", ja: "{}を見てください。" };
  // words: {en, es, ja, jaReading?:{k,r}}; text: optional {original, locale} read from the object (sign, logo...)
  function fromWords(words, thumb, text) {
    const en = norm(words.en);
    const known = OBJECTS.find((o) => norm(o.en.w) === en);
    if (known) return Object.assign({}, known, { thumb, text });
    const o = { id: "x_" + (en.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "thing"), e: "📷", thumb, text, dynamic: true };
    for (const l of Object.keys(LANGUAGES)) o[l] = { w: norm(words[l] || words.en), s: TEMPLATES[l] };
    if (words.jaReading) { o.ja.k = words.jaReading.k; o.ja.r = words.jaReading.r; }
    return o;
  }
  const api = { toHiragana, isKana, kanaToRomaji, jaInfo, labelFor, optionObjects, fromWords, LANGUAGES, OBJECTS, STEPS, POINTS_PER_WORD, checkSpelling, newProgress, completeStep, isLearned, fillSentence, seededRandom, hash, options };
  if (typeof module !== "undefined") module.exports = api; else root.Words = api;
})(typeof window !== "undefined" ? window : globalThis);
