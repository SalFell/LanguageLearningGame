const assert = require("assert"), G = require("../js/geo.js");
const p = G.destination(0, 0, 90, 111195); // ~1 degree east
assert(Math.abs(p.lng - 1) < 0.01 && Math.abs(p.lat) < 0.01);
assert.strictEqual(G.groundDistance(0), null);
assert(Math.abs(G.groundDistance(-30) - 4.33) < 0.01);
assert.strictEqual(G.groundDistance(-89), 3); // clamped
assert.strictEqual(G.groundDistance(-1.5), null);
const d = G.clickDirection(0.5, 0.5, 1.5, 90, -10, 1);
assert(Math.abs(d.heading - 90) < 1e-9 && Math.abs(d.pitch + 10) < 1e-9);
assert(G.clickDirection(1, 0.5, 1, 0, 0, 1).heading > 40); // right edge at zoom 1 = +45 degrees
assert.deepStrictEqual([18, 13, 8, 5, 2].map(G.zoomLevel), ["Street", "City", "Province", "Country", "World"]);
console.log("geo ok");
