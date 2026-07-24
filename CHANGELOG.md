# Changelog

All notable changes to Android Command Center are documented here.

## Unreleased

### Added

- Shared Preferences inspector for debuggable apps: select a device and package, browse SharedPreferences XML key/value pairs, and optimistically save inline edits, additions, and deletions to the device.
- Database cell edits and mutating SQL now apply automatically without replacing the query editor text or requiring a manual Push step.
- Logcat streams now have a Start/Stop toggle, priority-level terminal colors, and readable block formatting that keeps wrapped messages separate from metadata.

### Fixed

- Leaving the boolean Shared Preferences type now clears the boolean-only value.
- Inline database edits rerun the visible query result, preserving custom filters and limits such as `LIMIT 2`.
- Completed actions now reveal their updated state immediately instead of waiting for success feedback to exit.
- Running an edited SQL query no longer flashes the previous query text while it executes.
- Shared Preferences Delete actions use destructive red styling, while section Refresh actions use a distinct blue treatment.

## 0.1.14 - 2026-07-22

### Changed

- Project root empty-state copy points users to configure the project root above.
- README and release notes catch up nested project-root, launch-activity, and recent panel changes.

## 0.1.13 - 2026-07-22

### Changed

- Location route modes use distinct walk / run / cycle / drive icons in the mode segment.
- Inspector remembers the selected device across rerenders.
- Expand All / Collapse All leave the Toolchain section unchanged.

## 0.1.12 - 2026-07-20

### Added

- Broader App data permission grants: contacts, calendar, phone, nearby devices, and activity recognition.

### Fixed

- Permission action buttons wrap cleanly when the panel is narrow.

## 0.1.11 - 2026-07-20

### Changed

- Project root configuration uses a native folder picker from the Build section instead of opening VS Code settings.

### Fixed

- Crash when resolving or updating the configured project root.

## 0.1.10 - 2026-07-20

### Added

- Optional `androidCli.activity` setting to launch a specific activity after install; empty uses the variant MAIN/LAUNCHER activity.
- Manifest launch-activity discovery so Run matches Android Studio's Default Activity behavior when possible.
- Richer App data permission state parsing for grant/revoke status on the selected device.

### Changed

- Project root control in Build shows the resolved path and opens configuration from the panel.

## 0.1.9 - 2026-07-18

### Added

- Create emulator AVDs from Android CLI profiles directly in the Devices section.
- Per-device settings gear on online cards for theme, rotation, font scale, emulator battery, and on-device overlays.
- Common runtime permission grants in App data alongside package actions.
- Screen recording in Inspector with stop-and-save to a chosen destination.
- Performance vitals monitor: FPS, jank, memory, slow frames, sparkline, reset, and raw dump.
- Expand All / Collapse All icon actions in the Android Command Center view header.
- `androidCli.projectRoot` for nested Android apps: open a parent monorepo folder and point the panel at the Gradle project that contains `gradlew`.

## 0.1.8 - 2026-07-16

### Added

- Added a preview-first screenshot workflow with clear saved/unsaved state and an explicit **Save as…** destination picker.
- Remembered the last screenshot destination while retaining only the latest disposable preview.
- Added a persisted multi-device Run picker for active devices and emulators, with a shortcut to **Devices** for starting inactive AVDs, then builds once and deploys to each target.

### Changed

- Moved database working copies and screenshot previews into private, workspace-scoped extension storage so runtime files are never added to the project.
- Made automatic database scans metadata-only; the selected database is copied only after the Database section is opened or explicitly refreshed.
- Separated database working copies by device and package and cleaned disposable files between targets and extension sessions.
- Kept captured screenshots in the Inspector preview instead of automatically opening them in an editor tab.

### Fixed

- Preserved page, deeplink, database-result, and Toolchain scroll positions across asynchronous panel rerenders.
- Hid the deeplink chip scrollbar without removing horizontal scrolling.

## 0.1.6 - 2026-07-16

### Changed

- Replaced the marketplace icon with a full-bleed mint design without rounded white corners.
- Updated the marketplace banner color to match the new icon.

## 0.1.5 - 2026-07-16

Initial public preview release.

### Added

- A theme-aware Android Command Center activity-bar dashboard for VS Code and Cursor.
- One-click Run flow that builds, installs, and launches the selected Gradle variant.
- Connected-device and emulator cards with start, stop, and light/dark theme controls.
- Inline deeplink discovery, history, favorites, validation, and launch controls.
- Screenshot, annotated screenshot, and layout-inspection actions.
- SQLite and Room database inspection for debuggable apps, including queries, cell edits, and push-back to the device.
- App data actions for force-stop, cache clearing, and confirmed storage clearing.
- Point and route-based emulator location simulation.
- Device-filtered logcat terminals and toolchain diagnostics.

### Improved

- Persistent section state, compact native-themed controls, and control-local progress indicators.
- Actionable setup states for Android CLI, ADB, and SQLite dependencies.
- Safer command execution through argument arrays and visible integrated terminals for interactive work.

### License

- Released under the MIT License.

## 0.1.4 - 2026-07-16

- Internal release candidate used for final marketplace validation.

## 0.1.3 and earlier

- Initial local development builds of the Android CLI panel.
