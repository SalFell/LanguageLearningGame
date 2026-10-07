const assert = require("assert"), os = require("os"), path = require("path");
process.env.DATA_FILE = path.join(os.tmpdir(), "llg-test-" + process.pid + ".json");
process.env.JWT_SECRET = "test";
const { server } = require("../server/server.js");
server.listen(0, async () => {
  const base = "http://localhost:" + server.address().port;
  const call = async (m, p, b, t) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json() }; };
  try {
    let r = await call("POST", "/api/register", { email: "a@b.co", password: "secret1" }); assert.strictEqual(r.s, 200);
    const t = r.j.token;
    assert.strictEqual((await call("POST", "/api/register", { email: "a@b.co", password: "secret1" })).s, 409);
    assert.strictEqual((await call("POST", "/api/login", { email: "a@b.co", password: "wrong!!" })).s, 401);
    assert.strictEqual((await call("POST", "/api/login", { email: "a@b.co", password: "secret1" })).s, 200);
    assert.strictEqual((await call("GET", "/api/me")).s, 401);
    r = await call("PUT", "/api/me", { progress: { learned: { "car:es": true }, steps: {}, score: 999999 }, settings: { lang: "ja", native: "es" } }, t);
    assert.strictEqual(r.j.user.settings.native, "es");
    assert.strictEqual(r.j.user.progress.score, 100); // server computes score
    assert.strictEqual((await call("GET", "/api/leaderboard")).j.leaderboard[0].score, 100);
    assert.strictEqual((await call("POST", "/api/misidentified", { wrong: "tree", candidates: ["plant"], lang: "es" }, t)).s, 200);
    assert.strictEqual((await call("POST", "/api/oauth", { provider: "google", token: "x" })).s, 401);
    assert.strictEqual((await call("DELETE", "/api/me/progress", null, t)).j.user.progress.score, 0);
    assert.strictEqual((await call("DELETE", "/api/me", null, t)).s, 200);
    assert.strictEqual((await call("GET", "/api/me", null, t)).s, 401);
    assert.strictEqual((await fetch(base + "/server/server.js")).status, 404);
    assert.strictEqual((await fetch(base + "/")).status, 200);
    console.log("server ok");
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close(); setTimeout(() => process.exit(), 300);
});
