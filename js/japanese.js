// Japanese readings (hiragana + romaji) for words that contain kanji. Kana-only words are handled offline by Words.jaInfo;
// kanji go through kuroshiro/kuromoji, loaded lazily from a CDN the first time they are needed.
(function (root) {
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const cache = {};
  let kuro = null, failed = false;
  // kuromoji joins the dictionary path with a Node-style path.join, which turns "https://" into "https:/" in the browser (-> 404). Repair those URLs.
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url, ...rest) { return xhrOpen.call(this, m, typeof url === "string" ? url.replace(/^(https?):\/(?!\/)/, "$1://") : url, ...rest); };
  const load = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
  async function engine() {
    if (!kuro) kuro = (async () => {
      await load(CDN + "kuroshiro@1.2.0/dist/kuroshiro.min.js");
      await load(CDN + "kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js");
      const K = root.Kuroshiro.default || root.Kuroshiro, An = root.KuromojiAnalyzer;
      const k = new K();
      await k.init(new An({ dictPath: CDN + "kuromoji@0.1.2/dict/" }));
      return k;
    })().catch((e) => { failed = true; throw e; });
    return kuro;
  }
  // -> {k, r} (either may be missing if no reading could be produced)
  async function reading(text) {
    const W = root.Words, t = String(text).trim();
    if (W.isKana(t)) return W.jaInfo({ w: t });
    if (cache[t]) return cache[t];
    if (failed) return {};
    try {
      const k = await Promise.race([engine(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000))]);
      const hira = await k.convert(t, { to: "hiragana" });
      return (cache[t] = { k: hira, r: W.kanaToRomaji(hira) });
    } catch (e) { return {}; }
  }
  root.Japanese = { reading };
})(window);
