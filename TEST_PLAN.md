# Android Command Center Test Plan

## Goal

Prove that every visible control works on the happy path, fails clearly on expected edge paths, preserves state correctly, and never leaves the panel in a misleading busy or success state.

The release candidate is ready only when:

- all P0/P1 bugs are closed;
- every test in the section matrix has a recorded result;
- the automated suite, `npm run compile`, and a clean real-emulator run pass;
- destructive actions are confirmed and verified on the intended package/device;
- missing-tool and disconnected-device errors are actionable rather than raw process errors;
- the panel is checked in narrow/wide layouts and light/dark editor themes.

## Implemented test infrastructure

- `npm test` compiles the extension, validates webview scripts, and runs Node unit/contract tests.
- `src/core.ts` exposes deterministic device, variant, deeplink, executable-error, and ADB summary logic.
- `media/panel-logic.js` exposes coordinate, UI-state migration, action-availability, and route-target logic for browser-free tests.
- `test/fixtures/fake-tools/` provides deterministic Android CLI and ADB behavior.
- dedicated Extension Host launch configurations cover missing/partial toolchains and device edge states.
- `AndroidCliTestApp` supplies full/minimal variants with observable database, deeplink, app-data, logcat, theme, location, and Inspector state.
- `TESTING.md` is the concise developer and Codex-assisted execution guide.

## Recommended test mix

Use all four layers. Unit tests alone cannot prove that VS Code tasks, terminals, webviews, ADB, and emulators interact correctly; manual testing alone will be slow and inconsistent for error states.

### 1. Fast automated checks on every change

- Keep `npm run compile` as the first gate.
- Add unit tests for pure parsing and state logic: ADB device parsing, build-variant parsing, manifest deeplink discovery, URI validation, coordinate validation, SQL result parsing/limits, shell quoting, and saved webview-state migration.
- Add DOM-level tests for `media/panel.js` with a mocked `acquireVsCodeApi()`. Verify enabled/disabled states, emitted messages, section persistence, local spinner state, error toast behavior, and route controls.

### 2. Deterministic contract tests with fake tools

Create fixture executables for `android`, `adb`, and `sqlite3` whose outputs are selected by a scenario file or environment variable. Use them to reproduce states without uninstalling the real SDK:

- executable missing (`ENOENT`);
- executable present but exits nonzero;
- Android CLI version succeeds while `android info` fails;
- ADB reports no devices, multiple devices, `offline`, and `unauthorized`;
- emulator start/stop/theme/screenshot/layout commands succeed, fail, or time out;
- deeplink launch returns success, no handler, or package mismatch;
- SQLite is missing, returns malformed JSON, or rejects a write;
- a device disconnects in the middle of an operation.

The extension should accept injected process runners/state stores for most contract tests. Keep a small black-box suite using the actual fake executables to verify argument construction.

### 3. VS Code extension integration smoke tests

Use `@vscode/test-electron` with a dedicated fixture workspace to verify activation, view registration, workspace settings, commands, tasks, and persistence after reload. Keep this suite small because it is slower and webview automation is more fragile.

### 4. Real manual journeys

Run the Extension Development Host against `AndroidCliTestApp` and use a real emulator for final end-to-end evidence. Each journey should record:

- extension commit and test-app commit;
- editor/OS, Android CLI, ADB, SDK, emulator/API, and selected build variant;
- exact action and expected result;
- actual result plus screenshot/terminal excerpt;
- Pass, Fail, or Blocked;
- a `BUG-NNN` reference for failures.

## Test app fixture

`AndroidCliTestApp` is currently a minimal Compose greeting app. Evolve it into an observable test fixture rather than a production-style sample.

Add a small in-app diagnostics screen with:

- a Room/SQLite database created on first launch, using WAL mode;
- seeded tables containing text, numbers, nulls, quotes, Unicode, and more than 200 rows;
- visible database values so an inspector edit can be verified after relaunch;
- custom deeplinks such as `androidclitest://home` and `androidclitest://profile/42`, with the received URI shown on screen;
- buttons that emit tagged logcat messages at several levels;
- cache, preferences, and internal-file markers whose presence is shown on screen;
- a launch/session counter to verify force-stop and relaunch;
- current light/dark mode displayed on screen;
- last observed location displayed after permission is granted;
- stable accessibility labels, a scrollable area, a text field, and off-screen content for screenshot/layout inspection.

Add build variants that exercise discovery. A practical shape is `fullDebug`, `minimalDebug`, and release variants. `fullDebug` contains all fixtures; `minimalDebug` deliberately omits a database and deeplink filters. Keep a non-debuggable build for Database filtering tests.

The test app should retain its own unit and instrumented UI tests, but those tests validate the fixture itself, not the extension.

## Section test matrix

### Build

Happy paths:

- Discover every intended variant and preserve the selected variant after rerender/reload.
- Run and verify build, install, launch, selected package, selected device, and local success animation.
- Clean and verify build outputs are removed.
- Run Gradle Sync and verify the wrapper executes `help --refresh-dependencies --console=plain` in its dedicated terminal.

Edge paths:

- no workspace folder; non-Android folder; missing/non-executable Gradle wrapper;
- parent monorepo folder with `androidCli.projectRoot` pointing at a nested Android app; changing the setting refreshes variants/deeplinks;
- Gradle compile failure and Gradle process cancellation;
- Android CLI missing while Gradle is healthy;
- no online device, multiple devices, and device-picker cancellation;
- zero APKs, multiple matching APKs, and APK-picker cancellation;
- device disconnect after build but before install;
- repeated click while running and fast task completion.

### Devices

Happy paths:

- no running device but multiple available AVDs;
- start each AVD, observe its serial/name mapping, stop it, and see the card update;
- connected physical device appears without an emulator Stop action;
- switch emulator light/dark mode and verify both card state and app UI.

Edge paths:

- empty AVD list; ADB `offline`/`unauthorized`; duplicate-looking device names;
- emulator start timeout/failure; emulator exits unexpectedly; ADB disconnect during polling;
- CLI available with ADB missing and ADB available with CLI missing;
- stale cached cards disappear only after confirmed refresh, not on a transient polling failure.

### Deeplinks

Happy paths:

- discover schemes/routes from the selected variant;
- launch a known route and verify the app displays the received URI;
- launch with Enter and with the button;
- add/remove favorites, populate history, clear history, and verify persistence.

Edge paths:

- empty input disabled; malformed URI produces the fixed toast;
- valid URI with no handler; valid route for another package; special characters and Unicode;
- no online device; multiple devices; disconnected selected device;
- variant switch changes discovered routes without corrupting favorites/history.

### Inspector

Happy paths:

- normal screenshot is written, previewed, and opened;
- annotated screenshot is distinct and opened;
- layout opens valid formatted JSON and contains expected accessibility labels.

Edge paths:

- no device, multiple devices, locked/booting device, and device disconnect;
- missing workspace folder or unwritable screenshot directory;
- CLI timeout, invalid image output, malformed layout output, and a WebView-heavy screen.

### Database

Happy paths:

- scan a debuggable running app, select database/table, and read seeded rows;
- verify the 200-row cap and truncation message;
- run read-only SQL, syntax-error SQL, insert/update/delete, and schema-changing SQL;
- edit text, number, empty string, quoted text, Unicode, and NULL cells;
- push, force-stop/relaunch the app, and verify the changed value in-app.

Edge paths:

- no device; non-debuggable app; debuggable app with no database; empty database/table;
- app process stopped; database open in WAL mode; stale WAL/SHM files;
- missing host `sqlite3`; invalid SQLite file; malformed SQLite JSON;
- package uninstall or device disconnect during pull/query/push;
- identifiers with spaces/reserved words and attempted edits without a usable rowid.

### App data

Happy paths:

- scan third-party packages and select the project package;
- force-stop and verify the process is gone;
- clear cache and verify cache markers disappear while prefs/database remain;
- cancel Clear storage, then confirm it and verify all fixture state resets.

Edge paths:

- no device/package; package uninstalled after scan; non-debuggable package;
- `pm clear --cache-only` unsupported so the `run-as` fallback is exercised;
- fallback denied, ADB disconnect, and package name containing unexpected input;
- ensure destructive confirmation names the exact package.

### Location

Happy paths:

- select from the map and enter valid coordinates manually;
- test poles, equator, date line, negative/zero coordinates, Enter, zoom/pan/reset, and persistence;
- play/pause/stop each route, cycle speed and movement mode, and verify the app receives changing coordinates.

Edge paths:

- only a physical device is online; no emulator is selected; emulator disconnects during playback;
- incomplete, nonnumeric, out-of-range, whitespace, and locale-style inputs;
- ADB/geo command errors and delayed responses;
- switching Point/Route while playing and reopening the section after rerenders.

### Stream

Happy paths:

- start logcat for the selected device and verify the fixture's tagged messages;
- close/restart the terminal and confirm commands are inspectable.

Edge paths:

- no ADB/device; multiple devices; offline device;
- repeated Start clicks, terminal disposal, high-volume output, and device disconnect.

### Toolchain and global behavior

Happy paths:

- ready versions/environment are accurate; Check again refreshes them;
- choose valid custom executables and reopen Settings;
- install actions prepare commands but do not execute them automatically.

Edge paths:

- CLI missing; ADB missing; both missing;
- executable path exists but is not executable or exits nonzero;
- `android --version` succeeds but `android info` fails;
- host `sqlite3` missing;
- local, SSH, WSL, and dev-container extension hosts where tools differ from the UI machine;
- reload/hide/show while busy, section-open persistence, toast dismissal, narrow panel, light/dark/high-contrast themes.

## Hands-on execution workflow

The current Mac baseline is Android CLI `1.0.15498356`, ADB `35.0.2`, SQLite `3.44.3`, Java 17, two AVDs, and one online emulator (`emulator-5554`). The Extension Development Host is already open on `AndroidCliTestApp`.

For each manual session:

1. Compile the extension and record the revision/status.
2. Launch or reload the Extension Development Host with `AndroidCliTestApp` as its folder.
3. Reset only the fixture state required by the journey.
4. Perform one journey at a time and observe the exact clicked control, terminal/process result, emulator state, and app state.
5. Capture screenshots for visual/async/error-state assertions.
6. Add failures to `BUGS.md`; do not debug during the evidence pass unless needed to unblock later tests.
7. Re-run the smallest failed journey after a fix, then run the full section and global smoke suite.

Computer control should handle launching/reloading Cursor, opening sections, clicking controls, handling non-destructive prompts, and collecting screenshots. Terminal and ADB assertions should be used alongside it because the webview accessibility tree is limited. If the WebView click bridge is unavailable, use a user-assisted click while the agent continues to drive the terminal, ADB checks, and evidence capture. Clear storage remains an intentionally explicit destructive step in each journey.

## Suggested implementation order

1. Triage the initial bugs already recorded in `BUGS.md`.
2. Upgrade `AndroidCliTestApp` with the observable full/minimal fixtures.
3. Add unit/DOM tests and make `npm test` part of the compile/CI gate.
4. Add injectable runners plus the fake-tool scenario suite.
5. Add the small VS Code integration smoke suite.
6. Execute the real-emulator matrix section by section and maintain the bug ledger.
