// Offline interoperability check against the private native drawing engine.
// Does not open the app, capture the screen, or call any model/provider.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const engine = path.join(__dirname, '../client/Assets/Engine/clicky-draw-engine.js');
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(engine, 'utf8'), context, { filename: engine, timeout: 5000 });
const program = `
step(1);
say("Codex or Claude can supply the drawing program.");
circle(220, 300, 60, {tone: 'orange'});
arrow([[300,300],[420,300]], {tone: 'ink'});
text(440, 300, "Ally study", {size: 24});
`;
context.program = program;
const marks = vm.runInContext('ClickyDraw.runCode(program, 1280, 720, {budgetMs: 1000})', context, { timeout: 3000 });
assert.equal(marks.error, null);
assert.deepEqual(Array.from(marks, mark => mark.do), ['circle', 'arrow', 'text']);
assert.equal(marks.says.length, 1);
assert.equal(marks.says[0].step, 1);
console.log(JSON.stringify({ engineVersion: context.ClickyDraw.version, marks: marks.length, kinds: Array.from(marks, mark => mark.do), speechCues: marks.says.length, error: marks.error }, null, 2));
