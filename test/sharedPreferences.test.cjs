const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countLabel,
  formatPrefValue,
  normalizePrefValue,
  parseSharedPreferencesXml,
  serializeSharedPreferencesXml,
  shellSingleQuote,
} = require('../dist/sharedPreferencesInspector.js');

const SAMPLE_XML = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="greeting">Hello &amp; welcome</string>
    <boolean name="enabled" value="true" />
    <int name="count" value="42" />
    <long name="big" value="9007199254740993" />
    <float name="ratio" value="1.5" />
    <set name="tags">
        <string>alpha</string>
        <string>beta</string>
    </set>
    <string name="empty"></string>
</map>
`;

test('count labels use singular and plural nouns correctly', () => {
  assert.equal(countLabel(0, 'key'), '0 keys');
  assert.equal(countLabel(1, 'key'), '1 key');
  assert.equal(countLabel(2, 'app'), '2 apps');
});

test('SharedPreferences XML round-trips typed values and entity escaping', () => {
  const entries = parseSharedPreferencesXml(SAMPLE_XML);
  assert.deepEqual(entries.map((entry) => entry.key), ['big', 'count', 'empty', 'enabled', 'greeting', 'ratio', 'tags']);
  assert.equal(entries.find((entry) => entry.key === 'greeting')?.value, 'Hello & welcome');
  assert.equal(entries.find((entry) => entry.key === 'enabled')?.value, 'true');
  assert.equal(entries.find((entry) => entry.key === 'count')?.value, '42');
  assert.equal(entries.find((entry) => entry.key === 'big')?.value, '9007199254740993');
  assert.equal(entries.find((entry) => entry.key === 'ratio')?.value, '1.5');
  assert.equal(entries.find((entry) => entry.key === 'tags')?.value, 'alpha\nbeta');
  assert.equal(entries.find((entry) => entry.key === 'empty')?.value, '');

  const serialized = serializeSharedPreferencesXml(entries);
  const again = parseSharedPreferencesXml(serialized);
  assert.deepEqual(again, entries);
  assert.match(serialized, /Hello &amp; welcome/);
  assert.match(serialized, /<boolean name="enabled" value="true" \/>/);
  assert.match(serialized, /<set name="tags">/);
});

test('preference value normalization validates types', () => {
  assert.equal(normalizePrefValue('boolean', 'TRUE'), true);
  assert.equal(normalizePrefValue('boolean', '0'), false);
  assert.equal(normalizePrefValue('int', '-3'), -3);
  assert.equal(normalizePrefValue('long', '9007199254740993'), '9007199254740993');
  assert.equal(normalizePrefValue('float', '2'), 2);
  assert.deepEqual(normalizePrefValue('set', 'a, b, c'), ['a', 'b', 'c']);
  assert.deepEqual(normalizePrefValue('set', '["x","y"]'), ['x', 'y']);
  assert.throws(() => normalizePrefValue('boolean', 'maybe'), /true or false/);
  assert.throws(() => normalizePrefValue('int', '1.5'), /whole number/);
  assert.equal(formatPrefValue('float', 2), '2.0');
  assert.equal(formatPrefValue('set', ['one', 'two']), 'one\ntwo');
});

test('run-as shell commands remain one quoted argument through adb shell', () => {
  const command = "mkdir -p shared_prefs && cat > 'shared_prefs/fixture.xml'";
  const quoted = shellSingleQuote(command);
  assert.equal(quoted[0], "'");
  assert.equal(quoted.at(-1), "'");
  assert.match(quoted, /mkdir -p shared_prefs && cat >/);
  assert.match(quoted, /'\\''shared_prefs\/fixture\.xml'\\'''/);
});
