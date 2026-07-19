# Changelog

All notable changes to Android Command Center are documented here.

## 0.1.9 - 2026-07-18

### Added

- Create emulator AVDs from Android CLI profiles directly in the Devices section.
- Per-device settings gear on online cards for theme, rotation, font scale, emulator battery, and on-device overlays.
- Common runtime permission grants in App data alongside package actions.
- Screen recording in Inspector with stop-and-save to a chosen destination.
- Performance vitals monitor: FPS, jank, memory, slow frames, sparkline, reset, and raw dump.
- Expand All / Collapse All icon actions in the Android Command Center view header.

## 0.1.8 - 2026-07-16

### Added

- Added a preview-first screenshot workflow with clear saved/unsaved state and an explicit **Save as…** destination picker.
- Remembered the last screenshot destination while retaining only the latest disposable preview.

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
