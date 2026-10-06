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

  function checkSpelling(obj, lang, input) {
    const t = obj[lang], a = norm(input);
    if (!a) return false;
    if (a === norm(t.w)) return true;
    if (lang === "es" && stripAccents(a) === stripAccents(t.w)) return true;
    return lang === "ja" && a === t.r;
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
  function options(obj, lang, rnd) {
    const others = OBJECTS.filter((o) => o.id !== obj.id && norm(o[lang].w) !== norm(obj[lang].w)).sort(() => rnd() - 0.5).slice(0, 3);
    return [obj, ...others].sort(() => rnd() - 0.5).map((o) => o[lang].w);
  }
  // Build a learnable object from an identified English word and its translations. Reuses a built-in object when one matches.
  const TEMPLATES = { en: "Look at the {}.", es: "Mira: {}.", ja: "{}を見てください。" };
  function fromWords(words, thumb) {
    const en = norm(words.en);
    const known = OBJECTS.find((o) => norm(o.en.w) === en);
    if (known) return Object.assign({}, known, { thumb });
    const o = { id: "x_" + (en.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "thing"), e: "📷", thumb, dynamic: true };
    for (const l of Object.keys(LANGUAGES)) o[l] = { w: norm(words[l] || words.en), s: TEMPLATES[l] };
    return o;
  }
  const api = { fromWords, LANGUAGES, OBJECTS, STEPS, POINTS_PER_WORD, checkSpelling, newProgress, completeStep, isLearned, fillSentence, seededRandom, hash, options };
  if (typeof module !== "undefined") module.exports = api; else root.Words = api;
})(typeof window !== "undefined" ? window : globalThis);
