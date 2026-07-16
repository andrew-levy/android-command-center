# Android Command Center Bug Ledger

This file tracks product defects found during testing. Test-fixture gaps and unconfirmed risks are kept separate so they are not mistaken for shipped product bugs.

Priority guide:

- P0: data loss, destructive action on the wrong target, security issue, or unusable extension.
- P1: primary section/action is unavailable, reports a false result, or has no practical workaround.
- P2: important edge case, misleading state, or poor/non-actionable error with a workaround.
- P3: cosmetic or low-impact polish.

## Open bugs

### BUG-001 — Database inspection cannot be started from a fresh panel

- Priority: P1
- Status: Verified
- Found by: static UI/message-path audit
- Area: Database
- Expected: A fresh Database section offers a visible action that scans debuggable apps for the chosen device.
- Actual: The backend handles `db-refresh` and the webview bind layer can send it, but `databaseSection()` renders no `db-refresh` control. Its disabled App selector says “Scan debuggable apps,” leaving no way to initiate that scan.
- Evidence: `src/extension.ts` handles `db-refresh`; `media/panel.js` defines its icon/binding but does not render an action with `data-action="db-refresh"`.
- Fix: Added a first-class **Scan debuggable apps → Scan** row. It is enabled only when ADB is ready and sends the device selected in the Database section.
- Fix verification: `npm test` includes a regression check for both the visible `db-refresh` action and its `db-device` message wiring.

### BUG-002 — Build and Clean are incorrectly disabled when Android CLI is unavailable

- Priority: P1
- Status: Fixed
- Found by: dependency/command-path audit
- Area: Build, Toolchain
- Expected: Build and Clean remain available when the project Gradle wrapper is healthy; only Run should require Android CLI.
- Actual: all three buttons are disabled when `cliStatus !== "ready"`, even though Build and Clean execute `gradlew` directly.
- Evidence: `buildSection()` passes `!cliReady` to Build and Clean; `build()` and `clean()` call `runGradleTask()`/the Gradle wrapper without Android CLI.
- Fix: The live panel now derives separate availability for Run, Build, and Clean. Run still requires Android CLI; Build and Clean remain enabled because they use the project Gradle wrapper.
- Fix verification: `npm test` asserts the helper boundaries and verifies the live button wiring uses them.

### BUG-003 — Canceling the APK picker can produce a false “App launched” success

- Priority: P1
- Status: Fixed
- Found by: control-flow audit; manual reproduction still required
- Area: Build and Run
- Expected: Canceling a required APK choice cancels the operation and does not report success.
- Actual: `deploy()` returns normally when the picker yields no APK. `buildAndRun()` then completes its busy operation and reports “App launched.”
- Reproduction setup: ensure multiple APK files match the chosen variant, click Run, then cancel the APK picker.
- Fix: Canceling the picker now raises an internal cancellation signal. The busy state clears without entering success/error state, and the top-level handler suppresses an error toast for this user-initiated cancellation.
- Fix verification: `npm test` verifies both the picker guard and cancellation handling are wired into the live extension path.

### BUG-004 — Route simulation can show “Simulating” with no emulator target

- Priority: P2
- Status: Fixed
- Found by: webview/backend control-flow audit
- Area: Location
- Expected: Play is disabled without a selected emulator, or playback stops with a visible target error.
- Actual: Play is disabled only when ADB is unavailable. With ADB ready and no emulator selected, the animation advances and sends an empty serial; the backend silently returns without applying location.
- Reproduction setup: leave ADB ready with no online emulator (a physical device may remain connected), open Location → Route, and press Play.
- Fix: Point and route controls now require ADB plus an emulator serial. If the selected emulator disappears during playback, the route pauses and shows a target-specific error instead of continuing to report simulation.
- Fix verification: `npm test` covers no-target, physical-device, missing-ADB, and valid-emulator boundaries and verifies the live Play control uses the result.

### BUG-005 — Host SQLite is an undeclared and undiagnosed dependency

- Priority: P2
- Status: Fixed
- Found by: dependency audit
- Area: Database, Toolchain, documentation
- Expected: Database prerequisites are detected and missing SQLite produces a specific setup action/message.
- Actual: database operations invoke the host `sqlite3` executable, but the Toolchain section checks only Android CLI and ADB and the README requirements do not mention SQLite. A missing binary falls through as a raw process error.
- Reproduction setup: launch the extension host with a PATH/configuration that cannot resolve `sqlite3`, then inspect a valid app database.
- Fix: SQLite is now detected with the rest of the toolchain, documented as a requirement, configurable through `androidCli.sqliteExecutable`, and represented by a **Choose sqlite3…** recovery action. Database Scan is unavailable until both ADB and SQLite are ready, and process-level `ENOENT` failures are rewritten as actionable setup guidance.
- Fix verification: `npm test` covers the manifest/toolchain wiring and the missing-executable error contract.

### BUG-006 — Database Scan cannot open the app-full database

- Priority: P1
- Status: Fixed
- Found by: manual testing
- Environment: `AndroidCliTestApp` built and installed from `app-full-debug.apk`
- Area: Database
- Expected: Clicking **Scan** discovers the test app database and lists its tables.
- Actual: Scan fails before the tables can be listed because the local database file cannot be opened.
- Reproduction steps: build `app-full-debug.apk`, install/run it, open the Database section, and click **Scan**.
- Evidence: `sqlite3 -json -readonly /Users/andrewlevy/Documents/AndroidCliTestApp/.android-cli/databases/com.example.androidclitest/command-center-test.db SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 200;` fails with `Error: in prepare, unable to open database file (14)`.
- Root cause: The pulled database remained in WAL mode, but the inspector deleted its local `-wal` and `-shm` sidecars before opening it read-only. SQLite then could not open the WAL-mode copy and returned error 14.
- Fix: The inspector no longer copies device shared-memory locks. It rebuilds local shared memory, checkpoints/truncates the pulled WAL into the main database, keeps the local sidecars needed for read-only inspection, and removes them only after checkpointing immediately before a push.
- Fix verification: `npm test` creates the same WAL-mode/no-sidecar failure shape, prepares it through the production helper, and confirms a read-only table query succeeds. A copy of the recorded failing fixture also returned `android_metadata`, `fixture_metadata`, and `test_records` after preparation. The real emulator Scan journey still needs a screenshot-backed rerun before this item is promoted to Verified.

## Test-fixture gaps

These are required changes to `AndroidCliTestApp`, not extension bugs:

- FIXTURE-001: no SQLite/Room database exists.
- FIXTURE-002: no deeplink intent filter or deeplink-observable UI exists.
- FIXTURE-003: no cache/prefs/files diagnostics exist for App data verification.
- FIXTURE-004: no tagged log controls, theme indicator, or location display exists.
- FIXTURE-005: the UI is too small to exercise rich screenshot/layout/scroll/accessibility cases.
- FIXTURE-006: only the normal debug/release shape exists; there is no full/minimal scenario variant.

## Reproduction candidates

Do not promote these to bugs until the stated journey fails:

- Run with no online device may delegate selection/error handling to Android CLI instead of showing the panel's standard “Connect or start” error.
- A very fast or immediately failing VS Code task may expose a task-completion subscription race and leave the panel busy.
- Multiple Inspector-capable devices may produce ambiguous screenshot/layout targeting because those actions do not expose a device selector.
- Repeated Logcat Start clicks may create redundant terminals without reflecting stream state in the panel.

## New bug template

### BUG-NNN — Short title

- Priority: P0/P1/P2/P3
- Status: Open/Fixed/Verified/Deferred
- Found by: test ID or audit
- Environment: extension commit, test-app commit, editor/OS, tool versions, device/API
- Area: section/global
- Expected:
- Actual:
- Reproduction steps:
- Evidence: screenshot, terminal excerpt, or relevant path
- Suspected cause (optional):
- Fix verification:
