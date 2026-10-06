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
  // Pick the localized object around the click point, else the best generic label.
  function choose(resp) {
    const objs = (resp.localizedObjectAnnotations || []).filter((o) => o.score > 0.4 && !SKIP.has(o.name.toLowerCase())).map((o) => {
      const v = o.boundingPoly.normalizedVertices, xs = v.map((p) => p.x || 0), ys = v.map((p) => p.y || 0);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return { name: o.name, inside: 0.5 >= x0 && 0.5 <= x1 && 0.5 >= y0 && 0.5 <= y1, area: (x1 - x0) * (y1 - y0), d: Math.hypot((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5) };
    });
    const inside = objs.filter((o) => o.inside).sort((a, b) => a.area - b.area)[0];
    if (inside) return inside.name;
    const near = objs.sort((a, b) => a.d - b.d)[0];
    if (near) return near.name;
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
  // opts: pano, heading, pitch, fx, fy (click position 0..1 in the viewport), aspect (viewport w/h)
  async function identify(o) {
    const W = 640, H = Math.max(240, Math.min(640, Math.round(W / o.aspect)));
    const img = await loadImage("https://maps.googleapis.com/maps/api/streetview?size=" + W + "x" + H + "&pano=" + encodeURIComponent(o.pano) + "&heading=" + o.heading.toFixed(1) + "&pitch=" + o.pitch.toFixed(1) + "&fov=90&key=" + encodeURIComponent(key()));
    const cs = Math.round(Math.min(W, H) * 0.5);
    const sx = Math.max(0, Math.min(W - cs, Math.round(o.fx * W - cs / 2))), sy = Math.max(0, Math.min(H - cs, Math.round(o.fy * H - cs / 2)));
    const c = document.createElement("canvas"); c.width = c.height = 384;
    c.getContext("2d").drawImage(img, sx, sy, cs, cs, 0, 0, 384, 384);
    const t = document.createElement("canvas"); t.width = t.height = 96;
    t.getContext("2d").drawImage(c, 0, 0, 96, 96);
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
