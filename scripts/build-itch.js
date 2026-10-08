// Packages the client-only game into dist/vocab-venture-itch.zip (index.html at the zip root). Requires the `zip` CLI.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const root = path.join(__dirname, ".."), out = path.join(root, "dist"), stage = path.join(out, "game");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const f of ["index.html", "style.css", "config.js", "LICENSE"]) fs.copyFileSync(path.join(root, f), path.join(stage, f));
fs.cpSync(path.join(root, "js"), path.join(stage, "js"), { recursive: true });
const html = fs.readFileSync(path.join(stage, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^":]+)"/g)) if (!fs.existsSync(path.join(stage, m[1]))) throw new Error("index.html references missing file: " + m[1]);
if (/JWT_SECRET|jwtSecret/i.test(fs.readdirSync(stage).map((f) => (fs.statSync(path.join(stage, f)).isFile() ? fs.readFileSync(path.join(stage, f), "utf8") : "")).join(""))) throw new Error("Secret reference found in client files");
const zip = path.join(out, "vocab-venture-itch.zip");
cp.execFileSync("zip", ["-r", "-q", zip, "."], { cwd: stage });
console.log("Built " + zip + " (" + Math.round(fs.statSync(zip).size / 1024) + " KB)");
