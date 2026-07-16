const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const {isMutatingSql, prepareLocalDatabase, quoteIdent, sqlLiteral, withLimit} = require('../dist/databaseInspector.js');

test('read queries receive a safety limit without duplicating an existing limit', () => {
  assert.match(withLimit('SELECT * FROM records;'), /LIMIT 200;$/);
  assert.equal(withLimit('SELECT * FROM records LIMIT 5;'), 'SELECT * FROM records LIMIT 5;');
});

test('SQL classification and quoting handle common edge cases', () => {
  assert.equal(isMutatingSql(' UPDATE records SET label = 1'), true);
  assert.equal(isMutatingSql('WITH rows AS (SELECT 1) SELECT * FROM rows'), false);
  assert.equal(quoteIdent('records_2026'), '"records_2026"');
  assert.throws(() => quoteIdent('odd " name'), /Unsafe SQL identifier/);
  assert.equal(sqlLiteral(null), 'NULL');
  assert.equal(sqlLiteral("O'Reilly"), "'O''Reilly'");
});

test('missing SQLite reports the required setting instead of a raw spawn error', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'android-cli-missing-sqlite-'));
  t.after(() => fsp.rm(root, {recursive: true, force: true}));
  await assert.rejects(prepareLocalDatabase('/not-installed/sqlite3', path.join(root, 'fixture.db')), /Install SQLite 3 or set androidCli\.sqliteExecutable/);
});

test('WAL-mode device copies are prepared for read-only inspection', async (t) => {
  const version = spawnSync('sqlite3', ['-version'], {encoding: 'utf8'});
  if (version.error?.code === 'ENOENT') return t.skip('sqlite3 is not installed');
  assert.equal(version.status, 0, version.stderr);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'android-cli-db-test-'));
  const database = path.join(root, 'fixture.db');
  t.after(() => fsp.rm(root, {recursive: true, force: true}));
  const created = spawnSync('sqlite3', [database, 'PRAGMA journal_mode=WAL; CREATE TABLE records(label TEXT); INSERT INTO records VALUES (\'ready\');'], {encoding: 'utf8'});
  assert.equal(created.status, 0, created.stderr);
  for (const suffix of ['-wal', '-shm']) if (fs.existsSync(`${database}${suffix}`)) fs.rmSync(`${database}${suffix}`);

  await prepareLocalDatabase('sqlite3', database);
  const queried = spawnSync('sqlite3', ['-json', '-readonly', database, 'SELECT label FROM records;'], {encoding: 'utf8'});
  assert.equal(queried.status, 0, queried.stderr);
  assert.deepEqual(JSON.parse(queried.stdout), [{label: 'ready'}]);
});
