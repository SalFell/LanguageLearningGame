// Pure geometry helpers (browser + Node).
(function (root) {
  const R = 6371000, rad = Math.PI / 180;
  // Point `dist` metres from (lat,lng) along compass `bearing` degrees.
  function destination(lat, lng, bearing, dist) {
    const d = dist / R, b = bearing * rad, p1 = lat * rad, l1 = lng * rad;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
  }
  // Street View horizontal field of view (degrees) for a zoom level.
  const hfov = (zoom) => 180 / Math.pow(2, zoom);
  // Direction (yaw offset, absolute pitch) of a viewport click. fx/fy in 0..1, aspect = width/height.
  function clickDirection(fx, fy, aspect, heading, pitch, zoom) {
    const th = Math.tan((hfov(zoom) / 2) * rad);
    return { heading: (heading + Math.atan((fx - 0.5) * 2 * th) / rad + 360) % 360, pitch: pitch + Math.atan(-(fy - 0.5) * 2 * th / aspect) / rad };
  }
  // Distance along the ground to a click that points `pitch` degrees below the horizon (camera ~2.5 m high); null if not at the ground.
  function groundDistance(pitch, camHeight) {
    if (pitch > -3) return null;
    return Math.max(3, Math.min(80, (camHeight || 2.5) / Math.tan(-pitch * rad)));
  }
  // Map zoom level -> how far out the player is.
  function zoomLevel(z) {
    return z >= 16 ? "Street" : z >= 11 ? "City" : z >= 7 ? "Province" : z >= 4 ? "Country" : "World";
  }
  const api = { destination, hfov, clickDirection, groundDistance, zoomLevel };
  if (typeof module !== "undefined") module.exports = api; else root.Geo = api;
})(typeof window !== "undefined" ? window : globalThis);
