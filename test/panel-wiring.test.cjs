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

test('Panel rerenders preserve page and nested scroll positions', () => {
  assert.match(panel, /const scrollState=captureScrollState\(\)/);
  assert.match(panel, /restoreScrollState\(scrollState\)/);
  assert.match(panel, /data-preserve-scroll="deeplink-prefixes"/);
  assert.match(panel, /data-preserve-scroll="database-result"/);
  assert.match(panel, /data-preserve-scroll="preferences-result"/);
  assert.match(panel, /data-preserve-scroll="run-target-menu"/);
  assert.match(panel, /data-preserve-scroll="toolchain"/);
});

test('Database renders a reachable refresh action and targets the selected database device', () => {
  assert.match(panel, /sectionFooter\(footerMessage,'db-refresh'/);
  assert.match(panel, /action==='db-refresh'\)send\('db-refresh',\{serial:document\.getElementById\('db-device'\)\?\.value\|\|''\}\)/);
  assert.match(panel, /countLabel\(processes\.length,'app'\)/);
  assert.match(panel, /countLabel\(db\.result\.rows\?\.length\|\|0,'row'\)/);
  assert.doesNotMatch(panel, /row\(s\)|processes\.length\+' apps'/);
});

test('App data and Database refresh actions share bottom footers with their status messages', () => {
  assert.match(panel, /sectionFooter\(footerMessage,'db-refresh'/);
  assert.match(panel, /sectionFooter\(footerMessage,'prefs-refresh'/);
  assert.match(panel, /sectionFooter\(state\.appDataMessage,'app-packages'/);
  assert.match(panel, /class="section-footer"/);
  assert.match(panel, /class="section-footer-message"/);
  assert.match(panel, /class="section-refresh action-button"/);
  assert.match(panel, /<span>Refresh<\/span>/);
  assert.doesNotMatch(panel, /row\('Refresh'/);
  assert.doesNotMatch(panel, /section-body-action/);
});

test('Failed action icons and error toasts exit after a timed hold', () => {
  assert.match(panel, /status==='error-exit'/);
  assert.match(panel, /state\.errorExiting\?' exiting':''/);
  assert.match(extension, /status: 'error-exit'/);
  assert.match(extension, /this\.showOperationError\(id, messageOf\(error\)\)/);
  assert.match(extension, /ERROR_HOLD_MS/);
  assert.match(extension, /this\.state\.errorExiting = true/);
});

test('Initial load renders the real UI with a loading toast instead of a skeleton', () => {
  assert.match(panel, /render\(\);\s*send\('ready'\)/);
  assert.match(panel, /class="loading-toast"/);
  assert.doesNotMatch(panel, /class="skeleton/);
  assert.doesNotMatch(extension, /class="skeleton/);
});

test('Database tables use a select and startup database scans stay metadata-only', () => {
  assert.match(panel, /selectWrap\('db-table',tableOptions/);
  assert.match(panel, /getElementById\('db-table'\)\?\.addEventListener\('change'/);
  assert.doesNotMatch(panel, /data-db-table/);
  assert.match(extension, /await this\.autoScanSections\(true\)/);
  assert.match(extension, /this\.autoRefreshAppPackages\(serial\)/);
  assert.match(extension, /this\.autoRefreshDatabase\(serial\)/);
  assert.match(extension, /this\.autoRefreshPreferences\(serial\)/);
  assert.match(extension, /refreshProcesses\(serial, this\.state\.applicationId, false, false\)/);
  assert.match(panel, /el\.dataset\.section==='database'.*send\('db-open'\)/);
  assert.match(panel, /el\.dataset\.section==='preferences'.*send\('prefs-open'\)/);
});

test('SharedPreferences inspector mirrors Database device → app → file flow', () => {
  assert.match(panel, /section\('preferences','Preferences'/);
  assert.match(panel, /sectionFooter\(footerMessage,'prefs-refresh'/);
  assert.match(panel, /selectWrap\('prefs-device'/);
  assert.match(panel, /selectWrap\('prefs-package'/);
  assert.match(panel, /selectWrap\('prefs-file'/);
  assert.match(panel, /action==='prefs-refresh'\)send\('prefs-refresh'/);
  assert.match(panel, /send\('prefs-set',\{key,valueType:type,value:next\}\)/);
  assert.match(panel, /send\('prefs-delete',\{key\}\)/);
  assert.match(panel, /data-preserve-scroll="preferences-result"/);
  assert.match(extension, /new SharedPreferencesInspector\(adb, \(\) => this\.privateStorageUri\(\)\.fsPath\)/);
  assert.match(extension, /case 'prefs-refresh': await this\.prefsRefresh/);
  assert.match(extension, /case 'prefs-set': await this\.prefsSetEntry/);
  assert.match(extension, /case 'prefs-delete': await this\.prefsDeleteEntry/);
  assert.match(extension, /autoRefreshPreferences\(serial\)/);
});

test('Runtime artifacts use private extension storage instead of the project', () => {
  assert.match(extension, /this\.context\.storageUri \?\? vscode\.Uri\.joinPath\(this\.context\.globalStorageUri, 'workspace-less'\)/);
  assert.match(extension, /new DatabaseInspector\(adb, sqlite, \(\) => this\.privateStorageUri\(\)\.fsPath\)/);
  assert.match(extension, /new SharedPreferencesInspector\(adb, \(\) => this\.privateStorageUri\(\)\.fsPath\)/);
  assert.match(extension, /vscode\.Uri\.joinPath\(this\.privateStorageUri\(\), 'screenshot-previews'\)/);
});

test('Screenshots preview privately before the user chooses a save destination', () => {
  assert.match(extension, /vscode\.window\.showSaveDialog/);
  assert.match(extension, /SCREENSHOT_SAVE_DIR_KEY/);
  assert.doesNotMatch(extension, /executeCommand\('vscode\.open', file\)/);
  assert.match(panel, /state\.screenshotSaved\?'Saved copy':'Not saved'/);
  assert.match(panel, /actionButton\('screenshot-save','Save as…'/);
  assert.match(panel, /action==='screenshot-save'\)send\('screenshot-save'\)/);
});

test('Database renders one result message in its footer instead of repeating the row count', () => {
  assert.match(panel, /const footerMessage=db\.result\?\(db\.message\|\|db\.result\.message/);
  assert.match(panel, /sectionFooter\(footerMessage,'db-refresh'/);
  assert.doesNotMatch(panel, /class="db-result-meta"/);
});

test('Clean and Sync use Gradle-only availability while Run still requires Android CLI', () => {
  assert.match(panel, /const availability=buildAvailability\(cliReady,adbReady,selectedTargets\.length,projectReady\)/);
  assert.match(panel, /actionButton\('clean','Clean','secondary compact',!availability\.clean\)/);
  assert.match(panel, /actionButton\('clean'.*actionButton\('gradle-sync'/s);
  assert.doesNotMatch(panel, /actionButton\('build','Build'/);
  assert.doesNotMatch(extension, /case 'build': await this\.build\(\); return;/);
  assert.match(panel, /actionButton\('gradle-sync','Sync','secondary compact',!availability\.sync\)/);
  assert.match(extension, /case 'gradle-sync': await this\.gradleSync\(\); return;/);
  assert.match(extension, /\['help', '--refresh-dependencies', '--console=plain'\]/);
});

test('Project root is configurable and refreshes when the setting changes', () => {
  assert.equal(manifest.contributes.configuration.properties['androidCli.projectRoot'].default, '');
  assert.match(extension, /resolveProjectRootPath/);
  assert.match(extension, /onDidChangeConfiguration/);
  assert.match(extension, /affectsConfiguration\('androidCli\.projectRoot'\)/);
  assert.match(extension, /onProjectRootSettingChanged/);
  assert.match(extension, /clearProjectDerivedState/);
  assert.match(extension, /new vscode\.RelativePattern\(root,/);
  assert.match(panel, /const rootHint=['"]Project root['"]/);
  assert.match(panel, /row\(\s*['"]Project['"]/);
  assert.match(panel, /data-setup="project-root-settings"/);
  assert.match(extension, /case 'project-root-settings': await this\.chooseProjectRoot\(\)/);
  assert.match(extension, /title: 'Choose Android project root'/);
  assert.match(extension, /canSelectFolders: true/);
  assert.match(extension, /fs\.existsSync\(gradleWrapperPath\(selected\)\)/);
  assert.match(extension, /projectRootSettingValue\(selected\.fsPath, workspace\?\.fsPath\)/);
  assert.match(extension, /update\('projectRoot', value, vscode\.ConfigurationTarget\.Workspace\)/);
  assert.doesNotMatch(extension, /openSettings', 'androidCli\.projectRoot'/);
  assert.match(panel, /project-root-message/);
});

test('Build exposes a persisted multi-target dropdown before Run', () => {
  assert.match(panel, /row\('Run on',runTargetPicker/);
  assert.match(panel, /row\('Run on'.*row\('Run app'/s);
  assert.match(panel, /class="run-target-checkbox" type="checkbox"/);
  assert.match(panel, /send\('run-targets',\{ids:state\.selectedRunTargets\}\)/);
  assert.match(panel, /runTargetMenuOpen=Boolean\(savedUi\.runTargetMenuOpen\)/);
  assert.match(extension, /RUN_TARGETS_KEY = 'androidCli\.selectedRunTargets\.v1'/);
  assert.match(extension, /case 'run-targets': await this\.selectRunTargets/);
});

test('Run targets are active-only and the picker links to Devices', () => {
  assert.match(panel, /const active=targets\.filter\(\(target\)=>target\.status==='online'\)/);
  assert.match(panel, /Only active devices can be selected\./);
  assert.match(panel, /id="open-devices-from-targets"/);
  assert.match(panel, /openSections\.add\('device'\).*scrollIntoView/s);
  assert.match(extension, /reconcileRunTargetSelection\(this\.state\.runTargets/);
  assert.doesNotMatch(extension, /prepareRunTargets|RUN_TARGET_READY_TIMEOUT_MS|RUN_TARGET_POLL_MS/);
  assert.match(extension, /const args = \['run', `--apks=\$\{picked\.fsPath\}`, `--device=\$\{target\.serial\}`, `--activity=\$\{activity\}`\]/);
  assert.match(extension, /parseManifestLaunchInfo/);
  assert.match(panel, /selected\.length===1\?selected\[0\]\.label/);
  assert.match(extension, /for \(let index = 0; index < ready\.length; index \+= 1\)/);
  assert.match(extension, /Launched on \$\{result\.launched\.length\} of \$\{result\.total\}/);
  assert.match(panel, /actionButton\('build-run','Run','primary compact'/);
  assert.doesNotMatch(panel, /runLabel/);
});

test('Stream selects and explicitly targets an online Logcat device', () => {
  assert.match(panel, /selectWrap\(\s*["']stream-device["'],\s*optionsFor\(streamSerial\)/);
  assert.match(panel, /let streamSerial = savedUi\.streamSerial \|\| ["']["']/);
  assert.match(panel, /streamSerial = e\.target\.value;\s*saveUi\(\)/);
  assert.match(panel, /action === ["']logcat["']\)\s*send\(["']logcat["'], \{\s*serial: document\.getElementById\(["']stream-device["']\)\?\.value \|\| ["']["'],\s*\}\)/);
  assert.match(extension, /this\.terminal\('Logcat', \[adb\(\), '-s', serial, 'logcat'\]\)/);
  assert.doesNotMatch(extension, /\.\.\.\(message\.serial \? \['-s'/);
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

test('Devices section uses card gear menus and a new-device grid card', () => {
  assert.match(panel, /function deviceSection\(/);
  assert.match(panel, /emulatorCreateCard\(cliReady\)/);
  assert.match(panel, /class="device-card new-device-card"/);
  assert.match(panel, /function deviceSettingsMenu\(/);
  assert.match(panel, /data-device-menu=/);
  assert.match(panel, /device-gear/);
  assert.match(panel, /actionButton\('emulator-create','Create'/);
  assert.match(panel, /data-rotate=/);
  assert.match(panel, /data-font=/);
  assert.match(panel, /data-overlay=/);
  assert.doesNotMatch(panel, /deviceControlsPanel/);
  assert.doesNotMatch(panel, /section\('controls'/);
  assert.match(extension, /case 'emulator-create': await this\.createEmulator/);
  assert.match(extension, /case 'controls-rotate': await this\.setDeviceRotation/);
  assert.match(extension, /\['emulator', 'create', '--list-profiles'\]/);
  assert.match(extension, /\['emulator', 'create', selected\]/);
});

test('App data hosts permission grants with package actions', () => {
  assert.match(panel, /row\('Permissions',permissionControls/);
  assert.ok(panel.indexOf("row('Permissions',permissionControls") > panel.indexOf("row('Clear storage'"));
  assert.match(panel, /data-permission=/);
  assert.match(panel, /function appDataSection/);
  assert.match(panel, /filter\(\(\{status\}\)=>status\?\.requested&&status\?\.runtime\)/);
  assert.match(panel, /permission-switch/);
  assert.match(extension, /case 'controls-permission': await this\.setDevicePermission/);
  assert.match(extension, /parsePackagePermissionStates/);
  assert.match(panel, /permission-button.*active/);
});

test('Inspector hosts screen recording beside capture actions', () => {
  assert.match(panel, /inspectorAction\('screen-record-start'/);
  assert.match(panel, /inspectorAction\('screen-record-stop'/);
  assert.match(extension, /case 'screen-record-start': await this\.startScreenRecord/);
  assert.match(extension, /case 'screen-record-stop': await this\.stopScreenRecord/);
  assert.match(extension, /screenrecord/);
  assert.match(extension, /RECORDING_SAVE_DIR_KEY/);
  assert.match(extension, /waitForScreenRecordProcess/);
  assert.match(extension, /validateMp4Recording/);
});

test('Inspector exposes a persisted device picker and targets every device action', () => {
  assert.match(panel, /selectWrap\('inspector-device',deviceOptions/);
  assert.match(panel, /let inspectorSerial = savedUi\.inspectorSerial \|\| ''/);
  assert.match(panel, /inspectorSerial=e\.target\.value;saveUi\(\)/);
  assert.match(panel, /send\('screenshot',\{annotate:action==='screenshot-annotated',serial:document\.getElementById\('inspector-device'\)\?\.value\|\|''\}\)/);
  assert.match(panel, /send\('layout',\{serial:document\.getElementById\('inspector-device'\)\?\.value\|\|''\}\)/);
  assert.match(panel, /send\('screen-record-start',\{serial:document\.getElementById\('inspector-device'\)\?\.value\|\|''\}\)/);
  assert.match(extension, /ANDROID_SERIAL: target/);
  assert.match(extension, /\['layout', '--pretty', `--device=\$\{target\}`\]/);
});

test('View title expand-all and collapse-all controls leave Toolchain unchanged', () => {
  assert.equal(manifest.contributes.commands.some(({command}) => command === 'androidCli.expandAll'), true);
  assert.equal(manifest.contributes.commands.some(({command}) => command === 'androidCli.collapseAll'), true);
  assert.match(extension, /androidCli\.expandAll/);
  assert.match(extension, /setSectionsExpanded\(true\)/);
  assert.match(panel, /data\.type==='expand-all'/);
  assert.match(panel, /data\.type==='collapse-all'/);
  assert.match(panel, /const ALL_SECTIONS=/);
  assert.doesNotMatch(panel, /const ALL_SECTIONS=\[[^\n]*'toolchain'/);
  assert.match(panel, /const setMainSectionsExpanded=\(expanded\)=>\{const toolchainOpen=openSections\.has\('toolchain'\)/);
  assert.match(panel, /if\(toolchainOpen\)openSections\.add\('toolchain'\)/);
});

test('Performance section monitors gfxinfo vitals without becoming a profiler', () => {
  assert.match(panel, /const SHOW_PERFORMANCE=false/);
  assert.match(panel, /SHOW_PERFORMANCE\?performanceSection/);
  assert.match(panel, /function performanceSection\(/);
  assert.match(panel, /section\('performance','Performance'/);
  assert.match(panel, /actionButton\('performance-start','Monitor'/);
  assert.match(panel, /function performanceSparkline\(/);
  assert.match(extension, /case 'performance-start': await this\.startPerformanceMonitor/);
  assert.match(extension, /dumpsys', 'gfxinfo'/);
  assert.match(extension, /dumpsys', 'meminfo'/);
  assert.match(extension, /parseGfxInfo/);
  assert.match(extension, /type: 'performance-state'/);
  assert.match(panel, /updatePerformanceView\(\)/);
  assert.doesNotMatch(panel, /animatePerformanceElement/);
});
