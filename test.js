// Run: node test.js
const assert = require('assert');
const R = require('./rules.js');
const S = require('./samples.js');

const legacy = R.validate(S.legacy);
const ids = new Set(legacy.map((f) => f.id));
['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006', 'CS007', 'CS008', 'CS009', 'CS010', 'CS011', 'CS012', 'CS013', 'CS015'].forEach((id) =>
  assert(ids.has(id), 'legacy sample should trigger ' + id));
assert(legacy.every((f) => f.fix && f.detail && f.file), 'every finding needs detail/fix/file');

const clean = R.validate(S.clean);
const bad = clean.filter((f) => f.severity !== 'info');
assert.deepStrictEqual(bad, [], 'clean sample must have no errors/warnings, got: ' + JSON.stringify(bad));

assert.strictEqual(R.normalizePath('C:\\proj\\dispatcher\\src\\conf.d\\a.vhost'), 'conf.d/a.vhost');
assert(R.validate([]).some((f) => f.id === 'CS000'), 'empty upload should be flagged');

// /glob is fine in cache rules, only flagged in filters
const cacheGlob = R.validate([{ path: 'conf.dispatcher.d/cache/rules.any', content: '/0000 { /glob "*" /type "allow" }' }]);
assert(!cacheGlob.some((f) => f.id === 'CS002'), '/glob in cache rules must not be flagged');

const s = R.summarize(legacy);
console.log('legacy:', s, '| clean notes:', clean.length);
console.log('all tests passed');
