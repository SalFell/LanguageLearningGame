const assert = require("assert");
const W = require("../js/words.js");
const car = W.OBJECTS[0];
assert(W.checkSpelling(car, "es", " COCHE "));
assert(W.checkSpelling(W.OBJECTS[1], "es", "arbol"));
assert(W.checkSpelling(car, "ja", "kuruma") && W.checkSpelling(car, "ja", "くるま"));
assert(!W.checkSpelling(car, "en", "cart"));
const p = W.newProgress();
assert(!W.completeStep(p, "car", "en", "recognize"));
assert(!W.completeStep(p, "car", "en", "spell"));
assert(!W.isLearned(p, "car", "en"));
assert(W.completeStep(p, "car", "en", "sentence"));
assert(W.isLearned(p, "car", "en") && !W.isLearned(p, "car", "es"));
assert.strictEqual(p.score, W.POINTS_PER_WORD);
assert(!W.completeStep(p, "car", "en", "spell")); // no double points
assert.strictEqual(p.score, W.POINTS_PER_WORD);
assert(W.options(car, "en", W.seededRandom(1)).includes("car"));
console.log("ok");
