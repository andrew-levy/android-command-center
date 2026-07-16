# Testing Android Command Center

This is the short execution guide. `TEST_PLAN.md` contains the complete section-by-section matrix, and `BUGS.md` is the source of truth for failures.

Use `EXTENSION_HEALTH.md` as the current evidence dashboard. It deliberately treats untested areas as unknown rather than healthy.

## 1. Run the automated checks

From the extension repository:

```sh
npm test
```

This compiles TypeScript, checks both webview scripts, and runs the Node test suite for core parsing, validation, saved UI state, database SQL safety, and the fake Android/ADB tools.

From `AndroidCliTestApp`:

```sh
./gradlew testFullDebugUnitTest testMinimalDebugUnitTest assembleFullDebug assembleMinimalDebug
```

With an emulator connected, run the fixture UI tests:

```sh
./gradlew connectedFullDebugAndroidTest
```

## 2. Launch the extension with real tools

1. Open the Android Command Center extension repository in Cursor.
2. Open **Run and Debug**.
3. Select **Run Android Command Center — real tools**.
4. Press `F5` or choose **Run → Start Debugging**.
5. The Extension Development Host opens `AndroidCliTestApp` automatically.
6. Open the Android icon in the activity bar and execute the relevant journey from `TEST_PLAN.md`.

The `fullDebug` fixture is the main happy-path build. It contains:

- `command-center-test.db` in WAL mode with 230 rows;
- `androidclitest://home` and `androidclitest://profile/42` routes;
- cache and persistent-data markers;
- logcat events under `ACC_FIXTURE`;
- visible theme, launch count, last deeplink, database, and last-location state;
- scrollable/accessibility content for Inspector tests.

The `minimalDebug` fixture deliberately has no database and no merged deeplink filters. Use it for empty-state testing.

## 3. Launch hard-to-reach fake states

The fake configurations affect only the child Extension Development Host. They do not uninstall, rename, stop, or modify your real Android CLI, SDK, ADB server, devices, or global VS Code settings.

Choose one of these configurations in **Run and Debug**, then press `F5`:

| Launch configuration | State to verify |
| --- | --- |
| `Run ACC — fake healthy` | Fully ready toolchain with one fake emulator and two fake AVDs |
| `Run ACC — CLI missing` | Android CLI executable returns `ENOENT`; install/choose actions appear |
| `Run ACC — ADB missing` | Platform tools return `ENOENT`; ADB-dependent controls are unavailable |
| `Run ACC — CLI environment error` | CLI version works but `android info` fails |
| `Run ACC — no devices` | ADB works but reports no connected devices |
| `Run ACC — offline device` | ADB reports an offline emulator |
| `Run ACC — unauthorized device` | ADB reports an unauthorized physical device |
| `Run ACC — multiple devices` | Device selection paths see an emulator and physical device |
| `Run ACC — command failures` | Emulator start and Android run operations fail deterministically |

The launch configurations set three environment variables:

- `ANDROID_CLI_TEST_CLI`: executable used instead of the configured Android CLI;
- `ANDROID_CLI_TEST_ADB`: executable used instead of the configured ADB;
- `ANDROID_CLI_TEST_SQLITE`: executable used instead of configured SQLite for targeted dependency testing;
- `ANDROID_CLI_FAKE_SCENARIO`: output/failure behavior used by both fake tools.

The executables live under `test/fixtures/fake-tools/`. To add a scenario, add a named branch to the relevant fake script, add a Node test, then add a launch configuration using the same `ANDROID_CLI_FAKE_SCENARIO` value.

For a one-off missing-path test without a launch configuration, set the Extension Development Host workspace setting to an intentionally nonexistent path:

```json
{
  "androidCli.executable": "/not-installed/android",
  "androidCli.adbExecutable": "/not-installed/adb"
}
```

Remove those workspace overrides before returning to real-tool testing.

## 4. Manual fixture verification

Before testing Database, Deeplinks, App data, Stream, or Location, install and launch `fullDebug` once.

- Database: Scan `com.example.androidclitest`, open `command-center-test.db`, verify 230 seeded records, edit a value, then tap **Refresh diagnostics** in the app.
- Deeplinks: launch `androidclitest://profile/42`; the exact URI must appear in the app.
- App data: **Clear cache** should make only Cache marker become Missing. **Clear storage** should require confirmation and reset the launch count/database after relaunch.
- Stream: start Logcat, tap **Emit test logs**, and filter/inspect `ACC_FIXTURE` messages.
- Theme: switch device theme; the app's Theme row must change.
- Location: grant permission with **Request / refresh location**, set a point or play a route, then refresh the app diagnostics.
- Inspector: capture normal/annotated screenshots and verify layout JSON includes the input, buttons, scroll rows, and off-screen marker.

## 5. Testing with Codex operating the computer

Ask for a bounded journey or section, for example:

- “Run the Build happy-path and edge-case matrix using the real emulator.”
- “Launch every fake toolchain configuration and record failures.”
- “Test Database end to end, including a NULL edit and clear-storage reset.”

Codex can compile both projects, start/reload the Extension Development Host, select fake configurations, query ADB and Android layout state, capture screenshots, inspect terminal output, and append failures to `BUGS.md`. Cursor WebView accessibility can be limited, so Codex may ask you for a single user-assisted click if direct UI targeting is unavailable; it will continue all terminal/device verification afterward.

During an evidence pass, failures are recorded before debugging. Each bug should include environment, exact reproduction, expected/actual result, and screenshot or terminal evidence.

## 6. Recommended cadence

- Every code change: `npm test`.
- Every fixture change: both full/minimal unit builds.
- Before merging: fake CLI missing, fake ADB missing, no-devices, multiple-devices, and command-failure smoke tests.
- Before release: complete real-emulator matrix, connected fixture UI tests, light/dark editor themes, and narrow/wide panel layouts.
