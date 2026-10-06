// Identify the object under a click in Street View: crop the view, run Cloud Vision, translate with Cloud Translation.
(function (root) {
  const key = () => (root.GAME_CONFIG || {}).googleMapsApiKey;
  const SKIP = new Set(["photograph", "sky", "cloud", "image", "snapshot", "property", "asphalt", "road surface", "daytime", "morning", "nature", "line", "urban area", "infrastructure"]);

  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Could not fetch the Street View image (enable the Street View Static API for your key).")); i.src = url; });
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j.error)) throw new Error((j.error && j.error.message) || "Request failed (" + r.status + ")");
    return j;
  }
  // The crop is the player's selection, so prefer the most prominent object in it, else the best generic label.
  function choose(resp) {
    const objs = (resp.localizedObjectAnnotations || []).filter((o) => o.score > 0.4 && !SKIP.has(o.name.toLowerCase())).map((o) => {
      const v = o.boundingPoly.normalizedVertices, xs = v.map((p) => p.x || 0), ys = v.map((p) => p.y || 0);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      return { name: o.name, rank: w * h * o.score };
    }).sort((a, b) => b.rank - a.rank);
    if (objs[0]) return objs[0].name;
    const label = (resp.labelAnnotations || []).find((l) => l.score > 0.6 && !SKIP.has(l.description.toLowerCase()));
    return label && label.description;
  }
  const trKey = "llg_tr";
  async function translate(text, target) {
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(trKey)) || {}; } catch (e) { /* ignore */ }
    const ck = text + ">" + target;
    if (cache[ck]) return cache[ck];
    const j = await post("https://translation.googleapis.com/language/translate/v2?key=" + encodeURIComponent(key()), { q: text, source: "en", target, format: "text" });
    const out = j.data.translations[0].translatedText.replace(/&#39;/g, "'");
    cache[ck] = out; try { localStorage.setItem(trKey, JSON.stringify(cache)); } catch (e) { /* full */ }
    return out;
  }
  // opts: pano, heading, pitch, box {x0,y0,x1,y1} (selection, 0..1 of the viewport), aspect (viewport w/h)
  async function identify(o) {
    const W = 640, H = Math.max(240, Math.min(640, Math.round(W / o.aspect)));
    const img = await loadImage("https://maps.googleapis.com/maps/api/streetview?size=" + W + "x" + H + "&pano=" + encodeURIComponent(o.pano) + "&heading=" + o.heading.toFixed(1) + "&pitch=" + o.pitch.toFixed(1) + "&fov=90&key=" + encodeURIComponent(key()));
    // crop the player's selection box (fractions 0..1 of the viewport), with a little padding
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
    const resp = (await post("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(key()), { requests: [{ image: { content: b64 }, features: [{ type: "OBJECT_LOCALIZATION", maxResults: 10 }, { type: "LABEL_DETECTION", maxResults: 8 }] }] })).responses[0] || {};
    if (resp.error) throw new Error(resp.error.message);
    const en = choose(resp);
    if (!en) throw new Error("Nothing recognizable there. Try clicking on an object.");
    const [es, ja] = await Promise.all([translate(en.toLowerCase(), "es"), translate(en.toLowerCase(), "ja")]);
    return { words: { en: en.toLowerCase(), es, ja }, thumb };
  }
  root.Vision = { identify };
})(window);
