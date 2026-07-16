const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const panel = fs.readFileSync('media/panel.js', 'utf8');
const extension = fs.readFileSync('src/extension.ts', 'utf8');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const launch = JSON.parse(fs.readFileSync('.vscode/launch.json', 'utf8'));

test('Section state survives backend rerenders without forcing Toolchain open', () => {
  assert.match(panel, /!testOpenSectionsApplied&&Array\.isArray\(state\.testOpenSections\)/);
  assert.match(panel, /testOpenSectionsApplied=true/);
  const realTools = launch.configurations.find(({name}) => name.includes('real tools'));
  assert.equal(realTools?.env?.ANDROID_CLI_TEST_OPEN_SECTIONS, undefined);
});

test('Database renders a reachable refresh action and targets the selected database device', () => {
  assert.match(panel, /actionButton\('db-refresh','Refresh'/);
  assert.match(panel, /action==='db-refresh'\)send\('db-refresh',\{serial:document\.getElementById\('db-device'\)\?\.value\|\|''\}\)/);
});

test('Initial load renders the real UI with a loading toast instead of a skeleton', () => {
  assert.match(panel, /render\(\);\s*send\('ready'\)/);
  assert.match(panel, /class="loading-toast"/);
  assert.doesNotMatch(panel, /class="skeleton/);
  assert.doesNotMatch(extension, /class="skeleton/);
});

test('Database tables use a select and Database and App Data auto scan', () => {
  assert.match(panel, /selectWrap\('db-table',tableOptions/);
  assert.match(panel, /getElementById\('db-table'\)\?\.addEventListener\('change'/);
  assert.doesNotMatch(panel, /data-db-table/);
  assert.match(extension, /await this\.autoScanSections\(true\)/);
  assert.match(extension, /this\.autoRefreshAppPackages\(serial\)/);
  assert.match(extension, /this\.autoRefreshDatabase\(serial\)/);
});

test('Database renders one result message instead of repeating the row count', () => {
  assert.match(panel, /databaseResult\(db\.result,db\.selectedTable,db\.message\)/);
  assert.match(panel, /const resultMessage=message\|\|result\.message\|\|\(rows\.length\+' row\(s\)'\)/);
  assert.doesNotMatch(panel, /\+\(db\.message\?'<div class="db-message">'/);
});

test('Clean and Sync use Gradle-only availability while Run still requires Android CLI', () => {
  assert.match(panel, /const availability=buildAvailability\(cliReady\)/);
  assert.match(panel, /actionButton\('clean','Clean','secondary compact',!availability\.clean\)/);
  assert.match(panel, /actionButton\('clean'.*actionButton\('gradle-sync'/s);
  assert.doesNotMatch(panel, /actionButton\('build','Build'/);
  assert.doesNotMatch(extension, /case 'build': await this\.build\(\); return;/);
  assert.match(panel, /actionButton\('gradle-sync','Sync','secondary compact',!availability\.sync\)/);
  assert.match(extension, /case 'gradle-sync': await this\.gradleSync\(\); return;/);
  assert.match(extension, /\['help', '--refresh-dependencies', '--console=plain'\]/);
});

test('Route playback requires a selected emulator in the live panel', () => {
  assert.match(panel, /const routeReady=canPlayRoute\(adbReady,locationState\.serial\)/);
  assert.match(panel, /id="play-location"'\+\(routeReady\?'':' disabled'\)/);
  assert.match(panel, /updateLocationButton\(\).*canPlayRoute\(state\.adbStatus==='ready',locationState\.serial\)/);
});

test('Canceling the APK picker exits without reporting launch success', () => {
  assert.match(extension, /if \(!picked\) throw new UserCancelledError\(\)/);
  assert.match(extension, /if \(error instanceof UserCancelledError\)/);
});

test('SQLite is configurable and represented in toolchain state', () => {
  assert.equal(manifest.contributes.configuration.properties['androidCli.sqliteExecutable'].default, 'sqlite3');
  assert.match(panel, /dependencyRow\('SQLite',state\.sqliteStatus,state\.sqliteVersion,state\.sqliteMessage\)/);
  assert.match(extension, /run\(sqlite\(\), \['-version'\], undefined, REFRESH_CHECK_TIMEOUT_MS\)/);
});
