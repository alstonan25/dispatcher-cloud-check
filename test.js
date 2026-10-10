// Run: node test.js
const assert = require('assert');
const R = require('./rules.js');
const S = require('./samples.js');

const legacy = R.validate(S.legacy);
const ids = new Set(legacy.map((f) => f.id));
['CS002','CS003', 'CS004', 'CS005', 'CS006', 'CS007', 'CS008', 'CS009', 'CS010', 'CS011', 'CS012', 'CS013', 'CS015'].forEach((id) =>
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

// Regressions found by running the validator on a real archetype-based project:
// archetype-provided files must not be flagged, and README/*.conf/farms.any are not symlink candidates.
const archetype = R.validate([
  { path: 'conf.d/dispatcher_vhost.conf', content: '# provided by the runtime environment\nServerName dispatcher\n' },
  { path: 'conf.dispatcher.d/enabled_farms/farms.any', content: '$include "./*.farm"\n' },
  { path: 'conf.dispatcher.d/enabled_farms/README', content: '# Enabled farms\n' },
  { path: 'conf.d/enabled_vhosts/vhosts.conf', content: 'Include conf.d/enabled_vhosts/*.vhost\n' },
  { path: 'conf.d/enabled_vhosts/default.vhost', content: '../available_vhosts/default.vhost' },
]);
assert.deepStrictEqual(archetype.filter((f) => f.severity === 'error').map((f) => f.id), [], 'archetype files must not produce errors');
assert(!archetype.some((f) => f.file.endsWith('README') || f.file.endsWith('vhosts.conf') || f.file.endsWith('farms.any')), 'non-symlink files must not be flagged');
assert.strictEqual(archetype.find((f) => f.id === 'CS013').severity, 'warning', 'pseudo-symlink is ambiguous, so a warning');
assert(R.validate([{ path: 'conf.d/custom.conf', content: 'x' }]).some((f) => f.id === 'CS007'), 'user .conf files are still flagged');

// Noise control, found by running the validator on a real legacy AMS project (318 findings, mostly repeats):
// line-level findings inside a file that must be deleted are suppressed, and repeats are grouped per file.
const noisy = R.validate([
  { path: 'conf.modules.d/00-base.conf', content: 'LoadModule a a.so\nLoadModule b b.so\n' },
  { path: 'conf.d/available_vhosts/x.vhost', content: 'LoadModule c c.so\nInclude /etc/httpd/a\nInclude /etc/httpd/b\n' },
]);
assert(!noisy.some((f) => f.id === 'CS001' && f.file === 'conf.modules.d/00-base.conf'), 'no line findings inside a file that is deleted anyway');
assert(noisy.some((f) => f.id === 'CS001' && f.file === 'conf.d/available_vhosts/x.vhost'), 'LoadModule is still flagged elsewhere');
const abs = noisy.filter((f) => f.id === 'CS005');
assert.strictEqual(abs.length, 1, 'repeats grouped into one finding per file');
assert.deepStrictEqual(abs[0].lines, [2, 3]);

const s = R.summarize(legacy);
console.log('legacy:', s, '| clean notes:', clean.length);
console.log('all tests passed');
