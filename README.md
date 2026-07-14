# Android Command Center

A Cursor/VS Code activity-bar panel for everyday Android development without opening Android Studio.

## Requirements

Android Command Center uses the tools installed in the environment where its VS Code/Cursor extension host is running. For local work that is your computer; in SSH, WSL, or a dev container, install them in that remote environment.

- Android CLI for running apps, emulators, screenshots, and layout inspection
- Android SDK platform tools (`adb`) for connected devices, deeplinks, logcat, themes, and location simulation
- A project Gradle wrapper (`gradlew` or `gradlew.bat`) for Build and Clean

The dashboard detects each dependency and offers setup actions when one is unavailable. You can also set `androidCli.executable` and `androidCli.adbExecutable` to absolute paths.

## MVP features

- Detect the Android CLI, SDK, connected devices, and virtual devices
- Build and run in one click, matching Android Studio's Run flow: build, install, and launch
- Select discovered Gradle build variants, run standalone builds, or clean the project
- Open deeplinks inline with manifest-discovered prefixes, per-workspace history, and favorites
- Retain the webview when hidden and show cached state or a skeleton while refreshing
- See available and connected devices together, start or stop emulators independently, and switch device light/dark mode
- Capture normal or annotated screenshots and preview them in the editor
- Set an arbitrary emulator GPS coordinate or simulate movement along a route
- Open filtered-device logcat
- Clear app cache or storage and force-stop installed packages on a connected device

The extension deliberately does not wrap `android studio ...` commands: those require a running Android Studio instance. Kotlin language intelligence should be supplied by a VS Code language-server extension.

## Develop

```sh
npm install
npm run compile
```

Open this repository as a folder in Cursor, select **Run and Debug → Run Android Command Center**, and press `F5`. A second Cursor window opens as the Extension Development Host; open the Android icon in that window's activity bar. If `F5` is captured by macOS, use **Run → Start Debugging** or `fn`+`F5`.

## Architecture

The webview is presentation-only. Extension-host code invokes the CLI with argument arrays (no shell), while interactive Gradle, emulator, and logcat processes run visibly in integrated terminals. This keeps long-running work cancellable and makes every developer-initiated command inspectable.

## Next milestones

1. Parse `android describe` into build-target and artifact pickers.
2. Add a structured layout-tree inspector with click-to-highlight.
3. Add Journey authoring/running and test result views.
4. Add device actions (rotation, permissions, recordings).
5. Expose stable VS Code commands so agents and tasks can trigger the same workflows.
