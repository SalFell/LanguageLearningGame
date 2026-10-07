// Japanese readings (hiragana + romaji) for words that contain kanji. Kana-only words are handled offline by Words.jaInfo;
// kanji go through kuroshiro/kuromoji, loaded lazily from a CDN the first time they are needed.
(function (root) {
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const cache = {};
  let kuro = null;
  const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
  async function engine() {
    if (!kuro) kuro = (async () => {
      await load(CDN + "kuroshiro@1.2.0/dist/kuroshiro.min.js");
      await load(CDN + "kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js");
      const K = root.Kuroshiro.default || root.Kuroshiro, An = root.KuromojiAnalyzer;
      const k = new K();
      await k.init(new An({ dictPath: CDN + "kuromoji@0.1.2/dict/" }));
      return k;
    })().catch((e) => { kuro = null; throw e; });
    return kuro;
  }
  // -> {k, r} (either may be missing if no reading could be produced)
  async function reading(text) {
    const W = root.Words, t = String(text).trim();
    if (W.isKana(t)) return W.jaInfo({ w: t });
    if (cache[t]) return cache[t];
    try {
      const k = await Promise.race([engine(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000))]);
      const hira = await k.convert(t, { to: "hiragana" });
      return (cache[t] = { k: hira, r: W.kanaToRomaji(hira) });
    } catch (e) { return {}; }
  }
  root.Japanese = { reading };
})(window);
