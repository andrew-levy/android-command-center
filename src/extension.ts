import * as vscode from 'vscode';
import { execFile, type ChildProcess, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { DatabaseInspector, emptyDatabaseState, type DatabaseInspectorState } from './databaseInspector';
import {
  COMMON_PERMISSIONS,
  buildPerformanceIssues,
  emulatorCreateSupported,
  buildRunTargets,
  isCompleteDeepLink,
  isMissingExecutable,
  nearestFontScale,
  parseBatteryDump,
  parseDevices,
  parseEmulatorProfiles,
  parseGfxInfo,
  parseMemInfo,
  parseSettingsFloat,
  parseSettingsInt,
  reconcileRunTargetSelection,
  resolveProjectRootPath,
  summarizeAdb,
  variantFromTask,
  type BuildVariant,
  type Device,
  type DeviceControls,
  type PerformanceMetrics,
  type RunTarget,
} from './core';

const execFileAsync = promisify(execFile);
const CACHE_KEY = 'androidCli.dashboardCache.v1';
const VARIANT_KEY = 'androidCli.selectedVariant.v1';
const RECENT_LINKS_KEY = 'androidCli.recentDeepLinks.v1';
const FAVORITE_LINKS_KEY = 'androidCli.favoriteDeepLinks.v1';
const APP_PACKAGE_KEY = 'androidCli.selectedAppPackage.v1';
const RUN_TARGETS_KEY = 'androidCli.selectedRunTargets.v1';
const SCREENSHOT_SAVE_DIR_KEY = 'androidCli.screenshotSaveDirectory.v1';
const RECORDING_SAVE_DIR_KEY = 'androidCli.recordingSaveDirectory.v1';
const CONTROLS_SERIAL_KEY = 'androidCli.controlsSerial.v1';
const SCREEN_RECORD_REMOTE = '/sdcard/Download/acc-screenrecord.mp4';
const REFRESH_CHECK_TIMEOUT_MS = 12_000;
const LAYOUT_BOUNDS_POKE_CODE = 1599295570;
const PERFORMANCE_POLL_MS = 1_000;
const MIN_BUSY_MS = 2_000;
const SUCCESS_ENTER_MS = 220;
const SUCCESS_HOLD_MS = 2_000;
const SUCCESS_EXIT_MS = 180;
const ERROR_HOLD_MS = 4_000;
const ERROR_EXIT_MS = 180;

type LinkResult = { ok: boolean; message: string };
type Operation = { id: string; status: 'running' | 'success' | 'success-exit' | 'error' | 'error-exit'; message: string };
type DependencyStatus = 'checking' | 'ready' | 'missing' | 'error';
type PerformanceState = {
  serial?: string;
  packageName?: string;
  monitoring: boolean;
  fps?: number;
  jankPercent?: number;
  memoryMb?: number;
  slowFrames?: number;
  frameTimesMs: number[];
  issues: string[];
  error?: string;
  updatedAt?: number;
};
type DeployFailure = { target: RunTarget; message: string };
type DeployResult = { launched: RunTarget[]; failures: DeployFailure[]; total: number };
type DashboardState = {
  cliAvailable: boolean;
  cliStatus: DependencyStatus;
  cliVersion?: string;
  cliMessage?: string;
  adbStatus: DependencyStatus;
  adbVersion?: string;
  adbMessage?: string;
  sqliteStatus: DependencyStatus;
  sqliteVersion?: string;
  sqliteMessage?: string;
  environment: string;
  sdk?: string;
  devices: Device[];
  emulators: string[];
  emulatorProfiles: string[];
  emulatorCreateSupported: boolean;
  selectedEmulatorProfile?: string;
  controlsSerial?: string;
  deviceControls?: DeviceControls;
  runTargets: RunTarget[];
  selectedRunTargets: string[];
  variants: BuildVariant[];
  selectedVariant?: string;
  deepLinkPrefixes: string[];
  recentDeepLinks: string[];
  favoriteDeepLinks: string[];
  applicationId?: string;
  database: DatabaseInspectorState;
  appPackages: string[];
  appPackagesSerial?: string;
  selectedAppPackage?: string;
  appDataMessage?: string;
  initializing?: boolean;
  databaseScanning?: boolean;
  appPackagesScanning?: boolean;
  projectRoot?: string;
  projectRootStatus?: 'ready' | 'missing-folder' | 'missing-path' | 'missing-wrapper';
  projectRootMessage?: string;
  busy?: string;
  error?: string;
  errorExiting?: boolean;
  screenshot?: string;
  screenshotSaved?: boolean;
  recording?: { serial: string; active: boolean };
  performance: PerformanceState;
  linkResult?: LinkResult;
  operation?: Operation;
  testOpenSections?: string[];
};

type ProjectRootInfo = {
  uri?: vscode.Uri;
  displayPath?: string;
  status: NonNullable<DashboardState['projectRootStatus']>;
  message?: string;
};

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DashboardProvider(context);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider('androidCli.dashboard', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('androidCli.refresh', () => provider.refresh(true)),
    vscode.commands.registerCommand('androidCli.openDashboard', () =>
      vscode.commands.executeCommand('workbench.view.extension.androidCli')),
    vscode.commands.registerCommand('androidCli.expandAll', () => provider.setSectionsExpanded(true)),
    vscode.commands.registerCommand('androidCli.collapseAll', () => provider.setSectionsExpanded(false)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('androidCli.projectRoot')) void provider.onProjectRootSettingChanged();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void provider.onProjectRootSettingChanged()),
  );
}

export function deactivate(): void {}

class DashboardProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private state: DashboardState;
  private devicePoll?: NodeJS.Timeout;
  private pollingDevices = false;
  private autoScannedSerial?: string;
  private operationSequence = 0;
  private errorSequence = 0;
  private readonly databases: DatabaseInspector;
  private screenshotFile?: vscode.Uri;
  private lastProjectRootKey?: string;
  private screenRecordProcess?: ChildProcess;
  private screenRecordSerial?: string;
  private performancePoll?: NodeJS.Timeout;
  private performanceSampling = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const cached = context.workspaceState.get<Partial<DashboardState>>(CACHE_KEY);
    const storedRunTargets = context.workspaceState.get<string[]>(RUN_TARGETS_KEY);
    this.databases = new DatabaseInspector(adb, sqlite, () => this.privateStorageUri().fsPath);
    this.state = {
      cliAvailable: cached?.cliAvailable ?? false,
      cliStatus: 'checking',
      cliVersion: cached?.cliVersion,
      adbStatus: 'checking',
      adbVersion: cached?.adbVersion,
      sqliteStatus: 'checking',
      sqliteVersion: cached?.sqliteVersion,
      environment: environmentLabel(),
      sdk: cached?.sdk,
      devices: cached?.devices ?? [],
      emulators: cached?.emulators ?? [],
      emulatorProfiles: cached?.emulatorProfiles ?? [],
      emulatorCreateSupported: emulatorCreateSupported(),
      selectedEmulatorProfile: cached?.selectedEmulatorProfile ?? 'medium_phone',
      controlsSerial: context.workspaceState.get<string>(CONTROLS_SERIAL_KEY) ?? cached?.controlsSerial,
      runTargets: buildRunTargets(cached?.devices ?? [], cached?.emulators ?? []),
      selectedRunTargets: storedRunTargets ?? [],
      variants: cached?.variants ?? [],
      selectedVariant: context.workspaceState.get<string>(VARIANT_KEY) ?? cached?.selectedVariant,
      deepLinkPrefixes: cached?.deepLinkPrefixes ?? [],
      applicationId: cached?.applicationId,
      recentDeepLinks: context.workspaceState.get<string[]>(RECENT_LINKS_KEY) ?? [],
      favoriteDeepLinks: context.workspaceState.get<string[]>(FAVORITE_LINKS_KEY) ?? [],
      database: emptyDatabaseState(),
      appPackages: cached?.appPackages ?? [],
      appPackagesSerial: cached?.appPackagesSerial,
      selectedAppPackage: context.workspaceState.get<string>(APP_PACKAGE_KEY) ?? cached?.selectedAppPackage,
      performance: {
        serial: cached?.performance?.serial,
        packageName: context.workspaceState.get<string>(APP_PACKAGE_KEY) ?? cached?.selectedAppPackage,
        monitoring: false,
        frameTimesMs: [],
        issues: [],
      },
      initializing: true,
      testOpenSections: process.env.ANDROID_CLI_TEST_OPEN_SECTIONS?.split(',').map((item) => item.trim()).filter(Boolean),
    };
    this.applyProjectRootState(inspectProjectRoot(), false);
  }

  async onProjectRootSettingChanged(): Promise<void> {
    this.applyProjectRootState(inspectProjectRoot(), true);
    this.render();
    await this.refresh(true);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri, this.privateStorageUri()] };
    view.webview.onDidReceiveMessage((message) => void this.handle(message));
    view.webview.html = html(view.webview);
    if (this.devicePoll) clearInterval(this.devicePoll);
    this.devicePoll = setInterval(() => void this.pollDevices(), 5_000);
    view.onDidDispose(() => {
      if (this.devicePoll) clearInterval(this.devicePoll);
      this.devicePoll = undefined;
    });
  }

  dispose(): void {
    if (this.devicePoll) clearInterval(this.devicePoll);
    this.devicePoll = undefined;
    this.stopPerformanceMonitor();
    void this.stopScreenRecordProcess();
    void this.databases.dispose();
    if (this.screenshotFile) void vscode.workspace.fs.delete(this.screenshotFile, { useTrash: false }).then(undefined, () => undefined);
  }

  private async pollDevices(): Promise<void> {
    if (this.pollingDevices || !this.view?.visible) return;
    this.pollingDevices = true;
    try {
      const devices = await enrichDevices(parseDevices(await run(adb(), ['devices', '-l'])));
      if (JSON.stringify(devices) === JSON.stringify(this.state.devices)) return;
      this.state.devices = devices;
      this.syncControlsSerial();
      await this.updateRunTargets();
      this.persistCache();
      this.render();
      void this.autoScanSections(false);
    } catch {
      // A temporary ADB failure should not replace the last known device list.
    } finally {
      this.pollingDevices = false;
    }
  }

  async refresh(discoverProject = false): Promise<void> {
    const initialLoad = Boolean(this.state.initializing);
    this.state.busy = initialLoad ? undefined : 'Refreshing…';
    this.clearError(false);
    this.state.cliStatus = 'checking';
    this.state.adbStatus = 'checking';
    this.state.sqliteStatus = 'checking';
    const project = this.applyProjectRootState(inspectProjectRoot(), false);
    this.render();
    const root = project.status === 'ready' ? project.uri : undefined;
    const shouldDiscover = Boolean(root && (discoverProject || !this.state.variants.length));
    if (!this.state.variants.length) {
      this.applyVariants([variantFromTask(config().get<string>('gradleTask', 'assembleDebug'))]);
    }
    const variantDiscovery = shouldDiscover && root ? this.discoverProjectVariants(root) : undefined;
    const profilesRequest = this.state.emulatorCreateSupported
      ? run(cli(), ['emulator', 'create', '--list-profiles'], undefined, REFRESH_CHECK_TIMEOUT_MS)
      : Promise.reject(new Error('Emulator create is unavailable on Windows.'));
    const [cliVersion, info, adbVersion, sqliteVersion, devices, emulators, profiles] = await Promise.allSettled([
      run(cli(), ['--version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(cli(), ['info'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(adb(), ['version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(sqlite(), ['-version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(adb(), ['devices', '-l'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(cli(), ['emulator', 'list'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      profilesRequest,
    ]);
    this.state.cliAvailable = cliVersion.status === 'fulfilled';
    this.state.cliStatus = cliVersion.status === 'rejected'
      ? (isMissingExecutable(cliVersion.reason) ? 'missing' : 'error')
      : info.status === 'fulfilled' ? 'ready' : 'error';
    this.state.cliVersion = cliVersion.status === 'fulfilled' ? firstLine(cliVersion.value) : undefined;
    this.state.cliMessage = cliVersion.status === 'rejected'
      ? messageOf(cliVersion.reason)
      : info.status === 'rejected' ? `Installed, but its environment check failed: ${messageOf(info.reason)}` : undefined;
    this.state.adbStatus = adbVersion.status === 'fulfilled'
      ? 'ready' : isMissingExecutable(adbVersion.reason) ? 'missing' : 'error';
    this.state.adbVersion = adbVersion.status === 'fulfilled' ? firstLine(adbVersion.value) : undefined;
    this.state.adbMessage = adbVersion.status === 'rejected' ? messageOf(adbVersion.reason) : undefined;
    this.state.sqliteStatus = sqliteVersion.status === 'fulfilled'
      ? 'ready' : isMissingExecutable(sqliteVersion.reason) ? 'missing' : 'error';
    this.state.sqliteVersion = sqliteVersion.status === 'fulfilled' ? firstLine(sqliteVersion.value) : undefined;
    this.state.sqliteMessage = sqliteVersion.status === 'rejected'
      ? (isMissingExecutable(sqliteVersion.reason)
        ? 'SQLite 3 is required for Database inspection. Install sqlite3 or choose its executable.'
        : messageOf(sqliteVersion.reason))
      : undefined;
    this.state.sdk = info.status === 'fulfilled' ? info.value.trim() : this.state.sdk;
    this.state.devices = devices.status === 'fulfilled' ? await enrichDevices(parseDevices(devices.value)) : this.state.devices;
    this.state.emulators = emulators.status === 'fulfilled'
      ? emulators.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : this.state.emulators;
    this.state.emulatorCreateSupported = emulatorCreateSupported();
    if (profiles.status === 'fulfilled') {
      const parsed = parseEmulatorProfiles(profiles.value);
      this.state.emulatorProfiles = parsed.length ? parsed : this.state.emulatorProfiles;
      if (!this.state.emulatorProfiles.includes(this.state.selectedEmulatorProfile ?? '')) {
        this.state.selectedEmulatorProfile = this.state.emulatorProfiles[0] ?? 'medium_phone';
      }
    }
    this.syncControlsSerial();
    if (this.state.controlsSerial && this.state.adbStatus === 'ready') {
      await this.refreshDeviceControls(this.state.controlsSerial).catch(() => undefined);
    }
    await this.updateRunTargets();
    if (!initialLoad && variantDiscovery) await variantDiscovery;
    if (root && project.status === 'ready') {
      try { await this.refreshDeepLinks(root); }
      catch { /* Project metadata is optional and should not block the panel. */ }
    }
    this.persistCache();
    this.render();
    await this.autoScanSections(true);
    this.state.initializing = false;
    this.state.busy = undefined;
    this.persistCache();
    this.render();
  }

  private async discoverProjectVariants(root: vscode.Uri): Promise<void> {
    try {
      const variants = await discoverVariants(root);
      if (variants.length) this.applyVariants(variants);
      await this.refreshDeepLinks(root);
      this.persistCache();
      this.render();
    } catch {
      // Gradle discovery can be slow or unavailable. The configured default is
      // already usable, so keep it rather than holding the whole UI hostage.
    }
  }

  private async autoScanSections(force: boolean): Promise<void> {
    const serial = this.state.devices.find((device) => device.state === 'device')?.serial;
    if (!serial || this.state.adbStatus !== 'ready') return;
    if (!force && serial === this.autoScannedSerial) return;
    this.autoScannedSerial = serial;
    const scans: Promise<void>[] = [this.autoRefreshAppPackages(serial)];
    if (this.state.sqliteStatus === 'ready') scans.push(this.autoRefreshDatabase(serial));
    await Promise.allSettled(scans);
  }

  private async handle(message: { type?: string; [key: string]: unknown }): Promise<void> {
    try {
      switch (message.type) {
        case 'ready': this.render(); await this.refresh(false); return;
        case 'refresh': await this.refresh(true); return;
        case 'dependency-retry': await this.refresh(true); return;
        case 'dependency-install-cli': this.prepareInstallCli(); return;
        case 'dependency-install-adb': this.prepareInstallAdb(); return;
        case 'dependency-choose-cli': await this.chooseExecutable('executable', 'Choose the Android CLI executable'); return;
        case 'dependency-choose-adb': await this.chooseExecutable('adbExecutable', 'Choose the adb executable'); return;
        case 'dependency-choose-sqlite': await this.chooseExecutable('sqliteExecutable', 'Choose the sqlite3 executable'); return;
        case 'dependency-settings': await vscode.commands.executeCommand('workbench.action.openSettings', 'Android Command Center'); return;
        case 'error-dismiss': this.clearError(); return;
        case 'variant': await this.selectVariant(String(message.id)); return;
        case 'run-targets': await this.selectRunTargets(Array.isArray(message.ids) ? message.ids.map(String) : []); return;
        case 'gradle-sync': await this.gradleSync(); return;
        case 'build-run': await this.buildAndRun(); return;
        case 'clean': await this.clean(); return;
        case 'deeplink-open': await this.openDeepLink(String(message.uri), String(message.serial ?? '')); return;
        case 'deeplink-favorite': await this.toggleFavorite(String(message.uri)); return;
        case 'deeplink-clear': await this.clearDeepLinkHistory(); return;
        case 'start': await this.startEmulator(String(message.name)); return;
        case 'stop': await this.stopDevice(String(message.serial)); return;
        case 'theme': await this.setDeviceTheme(String(message.serial), String(message.theme)); return;
        case 'emulator-profile': this.selectEmulatorProfile(String(message.profile ?? '')); return;
        case 'emulator-create': await this.createEmulator(String(message.profile ?? '')); return;
        case 'controls-serial': await this.selectControlsSerial(String(message.serial ?? '')); return;
        case 'controls-rotate': await this.setDeviceRotation(String(message.serial ?? ''), Number(message.rotation)); return;
        case 'controls-font': await this.setDeviceFontScale(String(message.serial ?? ''), Number(message.scale)); return;
        case 'controls-battery-level': await this.setDeviceBatteryLevel(String(message.serial ?? ''), Number(message.level)); return;
        case 'controls-battery-charging': await this.setDeviceBatteryCharging(String(message.serial ?? ''), Boolean(message.charging)); return;
        case 'controls-overlay': await this.setDeviceOverlay(String(message.serial ?? ''), String(message.overlay ?? ''), Boolean(message.enabled)); return;
        case 'controls-permission': await this.setDevicePermission(
          String(message.serial ?? ''),
          String(message.packageName ?? ''),
          String(message.permission ?? ''),
          Boolean(message.grant),
        ); return;
        case 'screenshot': await this.screenshot(Boolean(message.annotate)); return;
        case 'screenshot-save': await this.saveScreenshot(); return;
        case 'screen-record-start': await this.startScreenRecord(String(message.serial ?? '')); return;
        case 'screen-record-stop': await this.stopScreenRecord(true); return;
        case 'performance-serial': this.setPerformanceSerial(String(message.serial ?? '')); return;
        case 'performance-package': this.setPerformancePackage(String(message.packageName ?? '')); return;
        case 'performance-start': await this.startPerformanceMonitor(String(message.serial ?? ''), String(message.packageName ?? '')); return;
        case 'performance-stop': this.stopPerformanceMonitor(); this.render(); return;
        case 'performance-reset': await this.resetPerformanceCounters(); return;
        case 'performance-dump': await this.dumpPerformance(); return;
        case 'layout': await this.layout(); return;
        case 'location': await this.location(String(message.serial), Number(message.latitude), Number(message.longitude)); return;
        case 'location-path': await this.pathLocation(String(message.serial), Number(message.latitude), Number(message.longitude)); return;
        case 'logcat': {
          const serial = String(message.serial ?? '').trim();
          if (!serial) throw new Error('Connect or start an Android device first.');
          return void this.terminal('Logcat', [adb(), '-s', serial, 'logcat']);
        }
        case 'db-refresh': await this.dbRefresh(String(message.serial ?? '')); return;
        case 'db-open': await this.dbOpen(); return;
        case 'db-package': await this.dbSelectPackage(String(message.packageName ?? '')); return;
        case 'db-database': await this.dbSelectDatabase(String(message.database ?? '')); return;
        case 'db-table': await this.dbSelectTable(String(message.table ?? '')); return;
        case 'db-query': await this.dbRunQuery(String(message.sql ?? '')); return;
        case 'db-cell': await this.dbUpdateCell(
          String(message.table ?? ''),
          String(message.rowid ?? ''),
          String(message.column ?? ''),
          message.value === null || message.value === undefined ? null : String(message.value),
        ); return;
        case 'db-push': await this.dbPush(); return;
        case 'app-packages': await this.refreshAppPackages(String(message.serial ?? '')); return;
        case 'app-package': await this.selectAppPackage(String(message.packageName ?? '')); return;
        case 'app-clear-cache': await this.clearAppCache(String(message.serial ?? ''), String(message.packageName ?? '')); return;
        case 'app-clear-data': await this.clearAppData(String(message.serial ?? ''), String(message.packageName ?? '')); return;
        case 'app-force-stop': await this.forceStopApp(String(message.serial ?? ''), String(message.packageName ?? '')); return;
      }
    } catch (error) {
      if (error instanceof UserCancelledError) {
        this.clearError(false);
        this.state.busy = undefined;
        this.render();
        return;
      }
      this.showError(messageOf(error));
      this.state.busy = undefined;
      this.render();
    }
  }

  private selectedVariant(): BuildVariant {
    return this.state.variants.find((variant) => variant.id === this.state.selectedVariant)
      ?? variantFromTask(config().get<string>('gradleTask', 'assembleDebug'));
  }

  private applyVariants(variants: BuildVariant[]): void {
    this.state.variants = variants;
    if (!variants.some((variant) => variant.id === this.state.selectedVariant)) {
      this.state.selectedVariant = variants.find((variant) => /debug$/i.test(variant.name))?.id ?? variants[0]?.id;
    }
    void this.context.workspaceState.update(VARIANT_KEY, this.state.selectedVariant);
  }

  private async selectVariant(id: string): Promise<void> {
    if (!this.state.variants.some((variant) => variant.id === id)) return;
    this.state.selectedVariant = id;
    this.state.linkResult = undefined;
    await this.context.workspaceState.update(VARIANT_KEY, id);
    const root = firstRoot();
    if (root) await this.refreshDeepLinks(root);
    this.persistCache();
    this.render();
  }

  private async selectRunTargets(ids: string[]): Promise<void> {
    this.state.selectedRunTargets = reconcileRunTargetSelection(this.state.runTargets, ids);
    await this.context.workspaceState.update(RUN_TARGETS_KEY, this.state.selectedRunTargets);
    this.persistCache();
    this.render();
  }

  private async updateRunTargets(): Promise<void> {
    this.state.runTargets = buildRunTargets(this.state.devices, this.state.emulators);
    const selected = reconcileRunTargetSelection(this.state.runTargets, this.state.selectedRunTargets);
    if (sameStrings(selected, this.state.selectedRunTargets)) return;
    this.state.selectedRunTargets = selected;
    await this.context.workspaceState.update(RUN_TARGETS_KEY, selected);
  }

  private async gradleSync(): Promise<void> {
    const root = requireRoot();
    await this.busy('Syncing Gradle project…', async () => {
      const args = ['help', '--refresh-dependencies', '--console=plain'];
      if (!await this.runGradle(root, args, 'Gradle Sync', 'gradle-sync')) throw new Error('Gradle sync failed. Check the Gradle Sync terminal for details.');
    }, 'gradle-sync', 'Gradle sync succeeded');
  }

  private async clean(): Promise<void> {
    const root = requireRoot();
    await this.busy('Cleaning project…', async () => {
      if (!await this.runGradleTask(root, 'clean', 'Android Clean')) throw new Error('Android clean failed. Check the build terminal for details.');
    }, 'clean', 'Clean succeeded');
  }

  private async buildAndRun(): Promise<void> {
    const root = requireRoot();
    const selected = new Set(this.state.selectedRunTargets);
    const targets = this.state.runTargets.filter((target) => target.status === 'online' && target.selectable && selected.has(target.id));
    if (!targets.length) throw new Error('Choose at least one deployment target before running the app.');
    await this.busy('Building…', async () => {
      const variant = this.selectedVariant();
      if (!await this.runGradleTask(root, variant.task, 'Build & Run')) throw new Error('Android build failed. Check the Build & Run terminal for details.');
      await this.refreshDeepLinks(root);
      const result = await this.deploy(variant, targets);
      if (result.failures.length) this.showError(deployResultMessage(result));
      return result;
    }, 'build-run', (result) => result.failures.length
      ? `Launched on ${result.launched.length} of ${result.total}`
      : `Launched on ${result.launched.length} ${result.launched.length === 1 ? 'target' : 'targets'}`);
  }

  private async deploy(variant: BuildVariant, targets: RunTarget[]): Promise<DeployResult> {
    const files = await findVariantApks(requireRoot(), variant);
    if (!files.length) throw new Error(`No APK found for ${variant.label}. Build the variant first.`);
    const picked = files.length === 1 ? files[0] : await vscode.window.showQuickPick(
      files.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
      { placeHolder: `Choose a ${variant.label} APK to deploy` },
    ).then((x) => x?.uri);
    if (!picked) throw new UserCancelledError();
    const failures: DeployFailure[] = [];
    await this.refreshConnectedDevices().catch(() => undefined);
    const ready = targets.flatMap((target) => {
      const current = this.state.runTargets.find((candidate) => candidate.id === target.id);
      if (current?.status === 'online' && current.serial) return [current];
      failures.push({ target, message: 'Target went offline after the build.' });
      return [];
    });
    const launched: RunTarget[] = [];
    if (ready.length) this.setBusyLabel('build-run', 'Launching…');
    for (let index = 0; index < ready.length; index += 1) {
      const target = ready[index];
      const args = ['run', `--apks=${picked.fsPath}`, `--device=${target.serial}`];
      const name = `Android Run · ${target.label}`;
      if (await this.runProcessTask(name, cli(), args, undefined, `android-run:${target.id}`)) {
        launched.push(target);
      } else {
        failures.push({ target, message: `Launch failed. Check the ${name} terminal.` });
      }
    }
    const result = { launched, failures, total: targets.length };
    if (!launched.length) throw new Error(deployResultMessage(result));
    return result;
  }

  private async openDeepLink(uri: string, serial: string): Promise<void> {
    uri = uri.trim();
    if (!isCompleteDeepLink(uri)) throw new Error('Enter a complete deeplink such as myapp://profile/42.');
    const device = serial || await this.chooseDevice();
    if (!device) throw new Error('Connect or start an Android device first.');
    const args = ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', uri];
    if (this.state.applicationId) args.push(this.state.applicationId);
    try {
      const output = await this.busy('Opening deeplink…', () => run(adb(), args), 'deeplink', 'Deeplink opened');
      this.state.linkResult = { ok: true, message: summarizeAdb(output) || `Opened on ${device}` };
      this.state.recentDeepLinks = [uri, ...this.state.recentDeepLinks.filter((item) => item !== uri)].slice(0, 20);
      await this.context.workspaceState.update(RECENT_LINKS_KEY, this.state.recentDeepLinks);
    } catch (error) {
      this.state.linkResult = { ok: false, message: messageOf(error) };
    }
    this.render();
  }

  private async toggleFavorite(uri: string): Promise<void> {
    uri = uri.trim();
    if (!uri) return;
    const exists = this.state.favoriteDeepLinks.includes(uri);
    this.state.favoriteDeepLinks = exists
      ? this.state.favoriteDeepLinks.filter((item) => item !== uri)
      : [uri, ...this.state.favoriteDeepLinks];
    await this.context.workspaceState.update(FAVORITE_LINKS_KEY, this.state.favoriteDeepLinks);
    this.render();
  }

  private async clearDeepLinkHistory(): Promise<void> {
    this.state.recentDeepLinks = [];
    await this.context.workspaceState.update(RECENT_LINKS_KEY, []);
    this.render();
  }

  private async refreshDeepLinks(root: vscode.Uri): Promise<void> {
    const discovered = await discoverDeepLinks(root, this.selectedVariant());
    const configured = config().get<string[]>('deepLinkPrefixes', []);
    this.state.deepLinkPrefixes = unique([...configured, ...discovered.prefixes]);
    this.state.applicationId = discovered.applicationId;
    if (discovered.applicationId && !this.state.selectedAppPackage) {
      this.state.selectedAppPackage = discovered.applicationId;
      await this.context.workspaceState.update(APP_PACKAGE_KEY, discovered.applicationId);
    }
  }

  private async startEmulator(name: string): Promise<void> {
    if (!name) return;
    await this.busy(`Starting ${name}…`, () => run(cli(), ['emulator', 'start', name], undefined, 180_000), `device:${name}`, `${name} started`);
    await this.refresh(false);
  }

  private async stopDevice(serial: string): Promise<void> {
    await this.busy(`Stopping ${serial}…`, () => run(adb(), ['-s', serial, 'emu', 'kill']), `device:${serial}`, `${serial} stopped`);
    await this.refresh(false);
  }

  private async setDeviceTheme(serial: string, theme: string): Promise<void> {
    if (!serial || !['light', 'dark'].includes(theme)) return;
    await this.busy(`Switching ${serial} to ${theme} mode…`, () =>
      run(adb(), ['-s', serial, 'shell', 'cmd', 'uimode', 'night', theme === 'dark' ? 'yes' : 'no']),
    `theme:${serial}`, `${theme[0].toUpperCase()}${theme.slice(1)} mode enabled`);
    await this.refresh(false);
  }

  private selectEmulatorProfile(profile: string): void {
    if (!profile) return;
    this.state.selectedEmulatorProfile = profile;
    this.persistCache();
    this.render();
  }

  private async createEmulator(profile: string): Promise<void> {
    if (!this.state.emulatorCreateSupported) {
      throw new Error('Android CLI emulator create is currently unavailable on Windows.');
    }
    const selected = profile.trim() || this.state.selectedEmulatorProfile || this.state.emulatorProfiles[0] || 'medium_phone';
    this.state.selectedEmulatorProfile = selected;
    await this.busy(
      `Creating ${selected}…`,
      () => run(cli(), ['emulator', 'create', `--profile=${selected}`], undefined, 300_000),
      'emulator-create',
      `${selected} created`,
    );
    await this.refresh(false);
  }

  private syncControlsSerial(): void {
    const online = this.state.devices.filter((device) => device.state === 'device');
    if (!online.length) {
      this.state.controlsSerial = undefined;
      this.state.deviceControls = undefined;
      return;
    }
    if (!online.some((device) => device.serial === this.state.controlsSerial)) {
      this.state.controlsSerial = online[0]?.serial;
    }
    void this.context.workspaceState.update(CONTROLS_SERIAL_KEY, this.state.controlsSerial);
  }

  private async selectControlsSerial(serial: string): Promise<void> {
    if (!serial) return;
    this.state.controlsSerial = serial;
    await this.context.workspaceState.update(CONTROLS_SERIAL_KEY, serial);
    await this.refreshDeviceControls(serial);
    this.render();
  }

  private async refreshDeviceControls(serial: string): Promise<void> {
    if (!serial) return;
    const isEmulator = serial.startsWith('emulator-');
    const reads = [
      run(adb(), ['-s', serial, 'shell', 'settings', 'get', 'system', 'font_scale'], undefined, 5_000),
      run(adb(), ['-s', serial, 'shell', 'settings', 'get', 'system', 'user_rotation'], undefined, 5_000),
      run(adb(), ['-s', serial, 'shell', 'settings', 'get', 'system', 'show_touches'], undefined, 5_000),
      run(adb(), ['-s', serial, 'shell', 'settings', 'get', 'system', 'pointer_location'], undefined, 5_000),
      run(adb(), ['-s', serial, 'shell', 'getprop', 'debug.layout'], undefined, 5_000),
    ];
    if (isEmulator) reads.push(run(adb(), ['-s', serial, 'shell', 'dumpsys', 'battery'], undefined, 5_000));
    const [fontScale, rotation, showTouches, pointerLocation, layoutBounds, battery] = await Promise.allSettled(reads);
    const batteryInfo = battery?.status === 'fulfilled' ? parseBatteryDump(battery.value) : {};
    this.state.deviceControls = {
      serial,
      isEmulator,
      fontScale: nearestFontScale(fontScale.status === 'fulfilled' ? parseSettingsFloat(fontScale.value, 1) : 1),
      rotation: rotation.status === 'fulfilled' ? Math.max(0, Math.min(3, parseSettingsInt(rotation.value, 0))) : 0,
      showTouches: showTouches.status === 'fulfilled' ? parseSettingsInt(showTouches.value, 0) === 1 : false,
      pointerLocation: pointerLocation.status === 'fulfilled' ? parseSettingsInt(pointerLocation.value, 0) === 1 : false,
      layoutBounds: layoutBounds.status === 'fulfilled' ? /^(true|1)$/i.test(layoutBounds.value.trim()) : false,
      batteryLevel: batteryInfo.level,
      batteryCharging: batteryInfo.charging,
    };
  }

  private async setDeviceRotation(serial: string, rotation: number): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    if (![0, 1, 2, 3].includes(rotation)) throw new Error('Choose a valid rotation.');
    await this.busy(`Rotating device…`, async () => {
      await run(adb(), ['-s', target, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
      await run(adb(), ['-s', target, 'shell', 'settings', 'put', 'system', 'user_rotation', String(rotation)]);
    }, 'controls-rotate', 'Rotation updated');
    await this.refreshDeviceControls(target);
    this.render();
  }

  private async setDeviceFontScale(serial: string, scale: number): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    const next = nearestFontScale(scale);
    await this.busy(`Updating font scale…`, () =>
      run(adb(), ['-s', target, 'shell', 'settings', 'put', 'system', 'font_scale', String(next)]),
    'controls-font', 'Font scale updated');
    await this.refreshDeviceControls(target);
    this.render();
  }

  private async setDeviceBatteryLevel(serial: string, level: number): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    if (!target.startsWith('emulator-')) throw new Error('Battery controls require an emulator.');
    if (!Number.isFinite(level) || level < 0 || level > 100) throw new Error('Choose a battery level between 0 and 100.');
    await this.busy(`Setting battery to ${Math.round(level)}%…`, () =>
      run(adb(), ['-s', target, 'shell', 'dumpsys', 'battery', 'set', 'level', String(Math.round(level))]),
    'controls-battery', `Battery set to ${Math.round(level)}%`);
    await this.refreshDeviceControls(target);
    this.render();
  }

  private async setDeviceBatteryCharging(serial: string, charging: boolean): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    if (!target.startsWith('emulator-')) throw new Error('Battery controls require an emulator.');
    await this.busy(charging ? 'Plugging in charger…' : 'Unplugging charger…', async () => {
      if (charging) {
        await run(adb(), ['-s', target, 'shell', 'dumpsys', 'battery', 'set', 'ac', '1']);
        await run(adb(), ['-s', target, 'shell', 'dumpsys', 'battery', 'set', 'status', '2']);
      } else {
        await run(adb(), ['-s', target, 'shell', 'dumpsys', 'battery', 'unplug']);
        await run(adb(), ['-s', target, 'shell', 'dumpsys', 'battery', 'set', 'status', '3']);
      }
    }, 'controls-battery', charging ? 'Charging enabled' : 'Charging disabled');
    await this.refreshDeviceControls(target);
    this.render();
  }

  private async setDeviceOverlay(serial: string, overlay: string, enabled: boolean): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    const value = enabled ? '1' : '0';
    await this.busy(enabled ? `Enabling ${overlay}…` : `Disabling ${overlay}…`, async () => {
      if (overlay === 'touches') {
        await run(adb(), ['-s', target, 'shell', 'settings', 'put', 'system', 'show_touches', value]);
      } else if (overlay === 'pointer') {
        await run(adb(), ['-s', target, 'shell', 'settings', 'put', 'system', 'pointer_location', value]);
      } else if (overlay === 'bounds') {
        await run(adb(), ['-s', target, 'shell', 'setprop', 'debug.layout', enabled ? 'true' : 'false']);
        await run(adb(), ['-s', target, 'shell', 'service', 'call', 'activity', String(LAYOUT_BOUNDS_POKE_CODE)]);
      } else {
        throw new Error(`Unknown overlay: ${overlay}`);
      }
    }, `overlay:${overlay}`, enabled ? 'Overlay enabled' : 'Overlay disabled');
    await this.refreshDeviceControls(target);
    this.render();
  }

  private async setDevicePermission(serial: string, packageName: string, permission: string, grant: boolean): Promise<void> {
    const target = this.requireOnlineSerial(serial);
    const pkg = packageName.trim() || this.state.selectedAppPackage || this.state.applicationId;
    if (!pkg) throw new Error('Choose a package for permission changes.');
    const known = COMMON_PERMISSIONS.some((item) => item.permission === permission);
    if (!known) throw new Error('Choose a supported permission.');
    await this.busy(grant ? `Granting permission…` : `Revoking permission…`, () =>
      run(adb(), ['-s', target, 'shell', 'pm', grant ? 'grant' : 'revoke', pkg, permission]),
    'controls-permission', grant ? 'Permission granted' : 'Permission revoked');
  }

  private requireOnlineSerial(serial: string): string {
    const target = serial || this.state.controlsSerial || '';
    const online = this.state.devices.some((device) => device.serial === target && device.state === 'device');
    if (!target || !online) throw new Error('Connect or start an Android device first.');
    return target;
  }

  private async startScreenRecord(serial: string): Promise<void> {
    if (this.state.recording?.active) throw new Error('A screen recording is already in progress.');
    const target = serial || await this.chooseDevice();
    if (!target) throw new Error('Connect or start an Android device first.');
    await run(adb(), ['-s', target, 'shell', 'rm', '-f', SCREEN_RECORD_REMOTE]).catch(() => undefined);
    const child = spawn(adb(), ['-s', target, 'shell', 'screenrecord', '--time-limit=180', SCREEN_RECORD_REMOTE], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.screenRecordProcess = child;
    this.screenRecordSerial = target;
    this.state.recording = { serial: target, active: true };
    this.render();
    child.on('exit', () => {
      if (this.screenRecordProcess !== child) return;
      this.screenRecordProcess = undefined;
      if (this.state.recording?.active && this.state.recording.serial === target) {
        this.state.recording = undefined;
        this.render();
      }
    });
    this.showOperationSuccess('screen-record', 'Recording started');
  }

  private async stopScreenRecord(save: boolean): Promise<void> {
    const serial = this.screenRecordSerial || this.state.recording?.serial;
    if (!serial) {
      this.state.recording = undefined;
      this.render();
      return;
    }
    await this.busy('Stopping recording…', async () => {
      await run(adb(), ['-s', serial, 'shell', 'pkill', '-2', 'screenrecord']).catch(() => undefined);
      await this.stopScreenRecordProcess();
      await new Promise<void>((resolve) => setTimeout(resolve, 700));
      if (!save) {
        await run(adb(), ['-s', serial, 'shell', 'rm', '-f', SCREEN_RECORD_REMOTE]).catch(() => undefined);
        return;
      }
      const folder = vscode.Uri.joinPath(this.privateStorageUri(), 'recordings');
      await vscode.workspace.fs.createDirectory(folder);
      const local = vscode.Uri.joinPath(folder, recordingFilename());
      await run(adb(), ['-s', serial, 'pull', SCREEN_RECORD_REMOTE, local.fsPath], undefined, 60_000);
      await run(adb(), ['-s', serial, 'shell', 'rm', '-f', SCREEN_RECORD_REMOTE]).catch(() => undefined);
      const defaultUri = this.defaultRecordingSaveUri(path.basename(local.fsPath));
      const target = await vscode.window.showSaveDialog({
        title: 'Save screen recording',
        saveLabel: 'Save Recording',
        defaultUri,
        filters: { 'MPEG-4 video': ['mp4'] },
      });
      if (!target) {
        await vscode.workspace.fs.delete(local, { useTrash: false }).then(undefined, () => undefined);
        throw new UserCancelledError();
      }
      await vscode.workspace.fs.copy(local, target, { overwrite: true });
      await vscode.workspace.fs.delete(local, { useTrash: false }).then(undefined, () => undefined);
      await this.context.globalState.update(RECORDING_SAVE_DIR_KEY, uriDirectory(target).toString());
    }, 'screen-record', 'Recording saved');
    this.screenRecordSerial = undefined;
    this.state.recording = undefined;
    this.render();
  }

  private async stopScreenRecordProcess(): Promise<void> {
    const child = this.screenRecordProcess;
    this.screenRecordProcess = undefined;
    if (!child || child.killed) return;
    try { child.kill('SIGTERM'); } catch { /* Process may already be gone. */ }
  }

  private defaultRecordingSaveUri(filename: string): vscode.Uri {
    const saved = this.context.globalState.get<string>(RECORDING_SAVE_DIR_KEY);
    if (saved) {
      try { return vscode.Uri.joinPath(vscode.Uri.parse(saved), filename); }
      catch { /* Fall back to the user's home directory. */ }
    }
    return vscode.Uri.file(path.join(os.homedir(), filename));
  }

  private async screenshot(annotate: boolean): Promise<void> {
    const folder = vscode.Uri.joinPath(this.privateStorageUri(), 'screenshot-previews');
    await vscode.workspace.fs.createDirectory(folder);
    const file = vscode.Uri.joinPath(folder, screenshotFilename(annotate));
    try {
      await this.busy('Capturing screenshot…', () => run(cli(), ['screen', 'capture', `--output=${file.fsPath}`, ...(annotate ? ['--annotate'] : [])]), annotate ? 'screenshot-annotated' : 'screenshot', 'Screenshot captured');
    } catch (error) {
      await vscode.workspace.fs.delete(file, { useTrash: false }).then(undefined, () => undefined);
      throw error;
    }
    await this.pruneScreenshotPreviews(folder, file);
    this.screenshotFile = file;
    this.state.screenshot = this.view?.webview.asWebviewUri(file).toString();
    this.state.screenshotSaved = false;
    this.render();
  }

  private async saveScreenshot(): Promise<void> {
    const source = this.screenshotFile;
    if (!source) return;
    const defaultUri = this.defaultScreenshotSaveUri(path.basename(source.fsPath));
    const target = await vscode.window.showSaveDialog({
      title: 'Save device screenshot',
      saveLabel: 'Save Screenshot',
      defaultUri,
      filters: { 'PNG image': ['png'] },
    });
    if (!target) return;
    await this.busy(
      'Saving screenshot…',
      async () => vscode.workspace.fs.copy(source, target, { overwrite: true }),
      'screenshot-save',
      'Screenshot saved',
    );
    await this.context.globalState.update(SCREENSHOT_SAVE_DIR_KEY, uriDirectory(target).toString());
    this.state.screenshotSaved = true;
    this.render();
  }

  private defaultScreenshotSaveUri(filename: string): vscode.Uri {
    const saved = this.context.globalState.get<string>(SCREENSHOT_SAVE_DIR_KEY);
    if (saved) {
      try { return vscode.Uri.joinPath(vscode.Uri.parse(saved), filename); }
      catch { /* Fall back to the user's home directory. */ }
    }
    return vscode.Uri.file(path.join(os.homedir(), filename));
  }

  private async pruneScreenshotPreviews(folder: vscode.Uri, keep: vscode.Uri): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(folder).then((items) => items, () => []);
    await Promise.all(entries
      .map(([name]) => vscode.Uri.joinPath(folder, name))
      .filter((entry) => entry.toString() !== keep.toString())
      .map((entry) => vscode.workspace.fs.delete(entry, { recursive: true, useTrash: false }).then(undefined, () => undefined)));
  }

  private async layout(): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      language: 'json',
      content: await this.busy('Reading accessibility tree…', () => run(cli(), ['layout', '--pretty']), 'layout', 'Accessibility tree opened'),
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async location(serial: string, latitude: number, longitude: number): Promise<void> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Enter valid latitude and longitude values.');
    if (!serial.startsWith('emulator-')) throw new Error('Start and select an emulator to simulate location.');
    await this.busy('Changing emulator location…', () => run(adb(), ['-s', serial, 'emu', 'geo', 'fix', String(longitude), String(latitude)]), 'location', 'Location updated');
  }

  private async pathLocation(serial: string, latitude: number, longitude: number): Promise<void> {
    if (!serial || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    try {
      await run(adb(), ['-s', serial, 'emu', 'geo', 'fix', String(longitude), String(latitude)]);
      this.view?.webview.postMessage({ type: 'location-result', ok: true });
    } catch (error) {
      this.view?.webview.postMessage({ type: 'location-result', ok: false, error: messageOf(error) });
    }
  }

  private async dbRefresh(serialHint = ''): Promise<void> {
    const serial = serialHint || await this.chooseDevice();
    if (!serial) throw new Error('Connect or start an Android device first.');
    this.state.database = await this.busy(
      'Scanning debuggable apps…',
      () => this.databases.refreshProcesses(serial, this.state.applicationId, true),
      'db-refresh',
      'Database inspector ready',
    );
  }

  private async autoRefreshDatabase(serial: string): Promise<void> {
    this.state.databaseScanning = true;
    this.render();
    try {
      this.state.database = await this.databases.refreshProcesses(serial, this.state.applicationId, false, false);
    } catch (error) {
      this.state.database = { ...this.databases.snapshot(), error: messageOf(error) };
    } finally {
      this.state.databaseScanning = false;
      this.render();
    }
  }

  private async dbOpen(): Promise<void> {
    const database = this.databases.snapshot();
    if (!database.selectedDatabase || database.localPath || this.state.databaseScanning || this.state.operation?.id === 'db-open') return;
    this.state.database = await this.busy(
      `Opening ${database.selectedDatabase}…`,
      () => this.databases.selectDatabase(database.selectedDatabase!),
      'db-open',
      'Database ready',
    );
  }

  private async dbSelectPackage(packageName: string): Promise<void> {
    this.state.database = await this.busy(
      `Opening ${packageName}…`,
      () => this.databases.selectPackage(packageName),
      'db-package',
      'App databases loaded',
    );
  }

  private async dbSelectDatabase(database: string): Promise<void> {
    this.state.database = await this.busy(
      `Pulling ${database}…`,
      () => this.databases.selectDatabase(database),
      'db-database',
      'Database ready',
    );
  }

  private async dbSelectTable(table: string): Promise<void> {
    this.state.database = await this.busy(
      `Reading ${table}…`,
      () => this.databases.selectTable(table),
      'db-table',
      'Table loaded',
    );
  }

  private async dbRunQuery(sql: string): Promise<void> {
    this.state.database = await this.busy(
      'Running SQL…',
      () => this.databases.runQuery(sql),
      'db-query',
      'Query finished',
    );
  }

  private async dbUpdateCell(table: string, rowid: string, column: string, value: string | null): Promise<void> {
    this.state.database = await this.busy(
      `Updating ${column}…`,
      () => this.databases.updateCell(table, rowid, column, value),
      'db-cell',
      'Cell updated',
    );
  }

  private async dbPush(): Promise<void> {
    this.state.database = await this.busy(
      'Pushing database…',
      () => this.databases.push(),
      'db-push',
      'Database pushed',
    );
  }

  private async refreshAppPackages(serialHint = ''): Promise<void> {
    const serial = serialHint || await this.chooseDevice();
    if (!serial) throw new Error('Connect or start an Android device first.');
    await this.busy('Listing installed apps…', () => this.loadAppPackages(serial), 'app-packages', 'Apps loaded');
  }

  private async autoRefreshAppPackages(serial: string): Promise<void> {
    this.state.appPackagesScanning = true;
    this.render();
    try {
      await this.loadAppPackages(serial);
    } catch (error) {
      this.state.appDataMessage = `Could not refresh installed apps: ${messageOf(error)}`;
    } finally {
      this.state.appPackagesScanning = false;
      this.render();
    }
  }

  private async loadAppPackages(serial: string): Promise<void> {
    const packages = await listInstalledPackages(serial);
    if (this.state.applicationId && !packages.includes(this.state.applicationId)) {
      try {
        await run(adb(), ['-s', serial, 'shell', 'pm', 'path', this.state.applicationId]);
        packages.unshift(this.state.applicationId);
      } catch {
        // Project applicationId is not installed on this device yet.
      }
    }
    this.state.appPackages = packages;
    this.state.appPackagesSerial = serial;
    const preferred = this.state.selectedAppPackage || this.state.applicationId;
    if (preferred && packages.includes(preferred)) this.state.selectedAppPackage = preferred;
    else if (!this.state.selectedAppPackage || !packages.includes(this.state.selectedAppPackage)) {
      this.state.selectedAppPackage = this.state.applicationId && packages.includes(this.state.applicationId)
        ? this.state.applicationId
        : packages[0];
    }
    if (this.state.selectedAppPackage) {
      await this.context.workspaceState.update(APP_PACKAGE_KEY, this.state.selectedAppPackage);
    }
    this.state.appDataMessage = packages.length
      ? `${packages.length} installed app${packages.length === 1 ? '' : 's'}`
      : 'No third-party packages found';
    this.persistCache();
  }

  private async selectAppPackage(packageName: string): Promise<void> {
    const trimmed = packageName.trim();
    if (!trimmed) return;
    this.state.selectedAppPackage = trimmed;
    this.state.appDataMessage = undefined;
    this.state.performance = { ...this.state.performance, packageName: trimmed };
    await this.context.workspaceState.update(APP_PACKAGE_KEY, trimmed);
    this.persistCache();
    this.render();
  }

  private async clearAppCache(serialHint: string, packageHint: string): Promise<void> {
    const { serial, packageName } = await this.requireAppTarget(serialHint, packageHint);
    await this.busy(`Clearing cache for ${packageName}…`, async () => {
      try {
        await run(adb(), ['-s', serial, 'shell', 'pm', 'clear', '--cache-only', packageName]);
      } catch (error) {
        // Older Images may lack --cache-only; fall back to wiping cache dirs for debuggable apps.
        try {
          await run(adb(), ['-s', serial, 'shell', 'run-as', packageName, 'sh', '-c', 'rm -rf cache code_cache']);
        } catch {
          throw new Error(`Could not clear cache for ${packageName}. ${messageOf(error)}`);
        }
      }
      this.state.appDataMessage = `Cleared cache for ${packageName}`;
    }, 'app-clear-cache', 'Cache cleared');
  }

  private async clearAppData(serialHint: string, packageHint: string): Promise<void> {
    const { serial, packageName } = await this.requireAppTarget(serialHint, packageHint);
    const confirmed = await vscode.window.showWarningMessage(
      `Clear all storage for ${packageName}? This deletes databases, prefs, and files like the emulator's Clear storage.`,
      { modal: true },
      'Clear storage',
    );
    if (confirmed !== 'Clear storage') return;
    await this.busy(`Clearing storage for ${packageName}…`, async () => {
      const output = await run(adb(), ['-s', serial, 'shell', 'pm', 'clear', packageName]);
      if (!/success/i.test(output) && output.trim()) throw new Error(output.trim());
      this.state.appDataMessage = `Cleared storage for ${packageName}`;
    }, 'app-clear-data', 'Storage cleared');
  }

  private async forceStopApp(serialHint: string, packageHint: string): Promise<void> {
    const { serial, packageName } = await this.requireAppTarget(serialHint, packageHint);
    await this.busy(`Force-stopping ${packageName}…`, async () => {
      await run(adb(), ['-s', serial, 'shell', 'am', 'force-stop', packageName]);
      this.state.appDataMessage = `Force-stopped ${packageName}`;
    }, 'app-force-stop', 'App stopped');
  }

  private async requireAppTarget(serialHint: string, packageHint: string): Promise<{ serial: string; packageName: string }> {
    const serial = serialHint || await this.chooseDevice();
    if (!serial) throw new Error('Connect or start an Android device first.');
    const packageName = (packageHint || this.state.selectedAppPackage || this.state.applicationId || '').trim();
    if (!packageName) throw new Error('Choose an app package first. Scan installed apps or build the project to discover one.');
    this.state.selectedAppPackage = packageName;
    await this.context.workspaceState.update(APP_PACKAGE_KEY, packageName);
    return { serial, packageName };
  }

  private terminal(name: string, command: string[], cwd?: string): void {
    const terminal = vscode.window.createTerminal({ name, cwd });
    terminal.show();
    terminal.sendText(command.map(shellQuote).join(' '));
  }

  private prepareInstallCli(): void {
    const terminal = vscode.window.createTerminal({ name: 'Install Android CLI' });
    terminal.show();
    terminal.sendText(installCliCommand(), false);
    void vscode.window.showInformationMessage('The Android CLI install command is ready in the terminal. Review it, then press Enter to run it.');
  }

  private prepareInstallAdb(): void {
    const terminal = vscode.window.createTerminal({ name: 'Install Android Platform Tools' });
    terminal.show();
    terminal.sendText(`${shellQuote(cli())} sdk install platform-tools`, false);
    void vscode.window.showInformationMessage('The platform-tools install command is ready in the terminal. Review it, then press Enter to run it.');
  }

  private async chooseExecutable(setting: 'executable' | 'adbExecutable' | 'sqliteExecutable', title: string): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      title,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Use executable',
    });
    if (!picked?.[0]) return;
    await config().update(setting, picked[0].fsPath, vscode.ConfigurationTarget.Global);
    await this.refresh(true);
  }

  private async refreshConnectedDevices(): Promise<void> {
    this.state.devices = await enrichDevices(parseDevices(await run(adb(), ['devices', '-l'], undefined, REFRESH_CHECK_TIMEOUT_MS)));
    await this.updateRunTargets();
    this.persistCache();
  }

  private async runGradleTask(root: vscode.Uri, gradleTask: string, name = 'Build & Run'): Promise<boolean> {
    return this.runGradle(root, [gradleTask], name, gradleTask);
  }

  private async runGradle(root: vscode.Uri, args: string[], name: string, taskId: string): Promise<boolean> {
    return this.runProcessTask(name, gradleWrapper(root), args, root.fsPath, taskId);
  }

  private async runProcessTask(name: string, executablePath: string, args: string[], cwd?: string, taskId = name): Promise<boolean> {
    const task = new vscode.Task(
      { type: 'androidCli', task: taskId }, vscode.TaskScope.Workspace, name, 'Android Command Center',
      new vscode.ProcessExecution(executablePath, args, cwd ? { cwd } : undefined), '$gradle',
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
    const execution = await vscode.tasks.executeTask(task);
    return new Promise((resolve) => {
      const subscription = vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution !== execution) return;
        subscription.dispose();
        resolve(event.exitCode === 0);
      });
    });
  }

  private async chooseDevice(): Promise<string | undefined> {
    const online = this.state.devices.filter((device) => device.state === 'device');
    if (online.length <= 1) return online[0]?.serial;
    return vscode.window.showQuickPick(online.map((device) => ({ label: device.description, description: device.serial, serial: device.serial })),
      { placeHolder: 'Choose a target device' }).then((item) => item?.serial);
  }

  private async busy<T>(label: string, action: () => Promise<T>, id = 'busy', success: string | ((result: T) => string) = 'Done'): Promise<T> {
    const startedAt = Date.now();
    const sequence = ++this.operationSequence;
    this.state.busy = label;
    this.state.operation = { id, status: 'running', message: label };
    this.clearError(false);
    this.render();
    try {
      const result = await action();
      await this.waitForMinimumBusyTime(startedAt);
      if (sequence === this.operationSequence) this.showOperationSuccess(id, typeof success === 'function' ? success(result) : success);
      return result;
    } catch (error) {
      if (error instanceof UserCancelledError) {
        if (sequence === this.operationSequence) this.state.operation = undefined;
        throw error;
      }
      await this.waitForMinimumBusyTime(startedAt);
      if (sequence === this.operationSequence) {
        this.showOperationError(id, messageOf(error));
      }
      throw error;
    } finally {
      if (sequence === this.operationSequence) {
        this.state.busy = undefined;
        this.render();
      }
    }
  }

  private setBusyLabel(id: string, label: string): void {
    this.state.busy = label;
    if (this.state.operation?.id === id && this.state.operation.status === 'running') {
      this.state.operation = { ...this.state.operation, message: label };
    }
    this.render();
  }

  private async waitForMinimumBusyTime(startedAt: number): Promise<void> {
    const remaining = MIN_BUSY_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }

  private showOperationSuccess(id: string, message: string): void {
    const success: Operation = { id, status: 'success', message };
    this.state.operation = success;
    setTimeout(() => {
      if (this.state.operation !== success) return;
      const exiting: Operation = { ...success, status: 'success-exit' };
      this.state.operation = exiting;
      this.render();
      setTimeout(() => {
        if (this.state.operation !== exiting) return;
        this.state.operation = undefined;
        this.render();
      }, SUCCESS_EXIT_MS);
    }, SUCCESS_ENTER_MS + SUCCESS_HOLD_MS);
  }

  private showOperationError(id: string, message: string): void {
    const failure: Operation = { id, status: 'error', message };
    this.state.operation = failure;
    setTimeout(() => {
      if (this.state.operation !== failure) return;
      const exiting: Operation = { ...failure, status: 'error-exit' };
      this.state.operation = exiting;
      this.render();
      setTimeout(() => {
        if (this.state.operation !== exiting) return;
        this.state.operation = undefined;
        this.render();
      }, ERROR_EXIT_MS);
    }, SUCCESS_ENTER_MS + SUCCESS_HOLD_MS);
  }

  private showError(message: string): void {
    const sequence = ++this.errorSequence;
    this.state.error = message;
    this.state.errorExiting = false;
    this.render();
    setTimeout(() => {
      if (sequence !== this.errorSequence || this.state.error !== message) return;
      this.state.errorExiting = true;
      this.render();
      setTimeout(() => {
        if (sequence !== this.errorSequence || this.state.error !== message) return;
        this.state.error = undefined;
        this.state.errorExiting = undefined;
        this.render();
      }, ERROR_EXIT_MS);
    }, ERROR_HOLD_MS);
  }

  private clearError(render = true): void {
    this.errorSequence += 1;
    this.state.error = undefined;
    this.state.errorExiting = undefined;
    if (render) this.render();
  }

  private privateStorageUri(): vscode.Uri {
    return this.context.storageUri ?? vscode.Uri.joinPath(this.context.globalStorageUri, 'workspace-less');
  }

  private applyProjectRootState(info: ProjectRootInfo, invalidateDerived: boolean): ProjectRootInfo {
    const key = `${info.status}:${info.uri?.fsPath ?? ''}:${config().get<string>('projectRoot', '')}`;
    const changed = this.lastProjectRootKey !== undefined && this.lastProjectRootKey !== key;
    this.lastProjectRootKey = key;
    this.state.projectRoot = info.displayPath;
    this.state.projectRootStatus = info.status;
    this.state.projectRootMessage = info.message;
    if (invalidateDerived || changed) this.clearProjectDerivedState();
    return info;
  }

  private clearProjectDerivedState(): void {
    this.state.variants = [];
    this.state.deepLinkPrefixes = [];
    this.state.applicationId = undefined;
    this.state.selectedVariant = undefined;
    this.state.linkResult = undefined;
    void this.context.workspaceState.update(VARIANT_KEY, undefined);
  }

  private setPerformanceSerial(serial: string): void {
    this.state.performance = { ...this.state.performance, serial: serial || undefined, error: undefined };
    this.render();
  }

  private setPerformancePackage(packageName: string): void {
    this.state.performance = { ...this.state.performance, packageName: packageName || undefined, error: undefined };
    this.render();
  }

  private performanceTarget(): { serial: string; packageName: string } {
    const online = this.state.devices.filter((device) => device.state === 'device');
    const serial = this.state.performance.serial
      && online.some((device) => device.serial === this.state.performance.serial)
      ? this.state.performance.serial
      : online[0]?.serial;
    const packageName = this.state.performance.packageName
      || this.state.selectedAppPackage
      || this.state.applicationId;
    if (!serial) throw new Error('Connect or start an Android device first.');
    if (!packageName) throw new Error('Choose a package to monitor.');
    return { serial, packageName };
  }

  private async startPerformanceMonitor(serial: string, packageName: string): Promise<void> {
    if (serial) this.state.performance.serial = serial;
    if (packageName) this.state.performance.packageName = packageName;
    const target = this.performanceTarget();
    this.state.performance = {
      ...this.state.performance,
      serial: target.serial,
      packageName: target.packageName,
      monitoring: true,
      error: undefined,
      issues: [],
    };
    this.render();
    if (this.performancePoll) clearInterval(this.performancePoll);
    await this.samplePerformance();
    this.performancePoll = setInterval(() => void this.samplePerformance(), PERFORMANCE_POLL_MS);
  }

  private stopPerformanceMonitor(): void {
    if (this.performancePoll) clearInterval(this.performancePoll);
    this.performancePoll = undefined;
    this.performanceSampling = false;
    this.state.performance = { ...this.state.performance, monitoring: false };
  }

  private async samplePerformance(): Promise<void> {
    if (this.performanceSampling || !this.state.performance.monitoring) return;
    this.performanceSampling = true;
    try {
      const { serial, packageName } = this.performanceTarget();
      const [gfxResult, memResult] = await Promise.allSettled([
        run(adb(), ['-s', serial, 'shell', 'dumpsys', 'gfxinfo', packageName, 'framestats'], undefined, 8_000),
        run(adb(), ['-s', serial, 'shell', 'dumpsys', 'meminfo', packageName], undefined, 8_000),
      ]);
      if (gfxResult.status !== 'fulfilled') throw gfxResult.reason;
      const gfx = parseGfxInfo(gfxResult.value);
      const memoryMb = memResult.status === 'fulfilled' ? parseMemInfo(memResult.value) : this.state.performance.memoryMb;
      const metrics: PerformanceMetrics = { ...gfx, memoryMb };
      this.state.performance = {
        ...this.state.performance,
        serial,
        packageName,
        fps: metrics.fps,
        jankPercent: metrics.jankPercent,
        memoryMb: metrics.memoryMb,
        slowFrames: metrics.slowFrames,
        frameTimesMs: metrics.frameTimesMs.length
          ? metrics.frameTimesMs
          : this.state.performance.frameTimesMs,
        issues: buildPerformanceIssues(metrics),
        error: undefined,
        updatedAt: Date.now(),
      };
      this.render();
    } catch (error) {
      this.state.performance = {
        ...this.state.performance,
        error: messageOf(error),
        issues: [],
      };
      this.render();
    } finally {
      this.performanceSampling = false;
    }
  }

  private async resetPerformanceCounters(): Promise<void> {
    const { serial, packageName } = this.performanceTarget();
    await this.busy('Resetting graphics counters…', () =>
      run(adb(), ['-s', serial, 'shell', 'dumpsys', 'gfxinfo', packageName, 'reset']),
    'performance-reset', 'Graphics counters reset');
    this.state.performance = {
      ...this.state.performance,
      fps: undefined,
      jankPercent: undefined,
      slowFrames: undefined,
      frameTimesMs: [],
      issues: [],
      error: undefined,
    };
    if (this.state.performance.monitoring) await this.samplePerformance();
    else this.render();
  }

  private async dumpPerformance(): Promise<void> {
    const { serial, packageName } = this.performanceTarget();
    const content = await this.busy('Dumping performance…', async () => {
      const [gfx, mem] = await Promise.all([
        run(adb(), ['-s', serial, 'shell', 'dumpsys', 'gfxinfo', packageName, 'framestats'], undefined, 20_000),
        run(adb(), ['-s', serial, 'shell', 'dumpsys', 'meminfo', packageName], undefined, 20_000),
      ]);
      return [
        `# Performance dump`,
        `# device: ${serial}`,
        `# package: ${packageName}`,
        `# captured: ${new Date().toISOString()}`,
        '',
        '## gfxinfo framestats',
        gfx.trim(),
        '',
        '## meminfo',
        mem.trim(),
        '',
      ].join('\n');
    }, 'performance-dump', 'Performance dump opened');
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private persistCache(): void {
    const {
      busy: _busy,
      error: _error,
      errorExiting: _errorExiting,
      screenshot: _screenshot,
      screenshotSaved: _screenshotSaved,
      recording: _recording,
      deviceControls: _deviceControls,
      performance: performanceState,
      linkResult: _result,
      operation: _operation,
      database: _database,
      appDataMessage: _appDataMessage,
      initializing: _initializing,
      databaseScanning: _databaseScanning,
      appPackagesScanning: _appPackagesScanning,
      testOpenSections: _testOpenSections,
      projectRootMessage: _projectRootMessage,
      runTargets: _runTargets,
      selectedRunTargets: _selectedRunTargets,
      ...cache
    } = this.state;
    void this.context.workspaceState.update(CACHE_KEY, {
      ...cache,
      performance: {
        serial: performanceState.serial,
        packageName: performanceState.packageName,
        monitoring: false,
        frameTimesMs: [],
        issues: [],
      },
    });
  }

  setSectionsExpanded(expanded: boolean): void {
    void this.view?.webview.postMessage({ type: expanded ? 'expand-all' : 'collapse-all' });
  }

  private render(): void { void this.view?.webview.postMessage({ type: 'state', state: this.state }); }
}

function screenshotFilename(annotate: boolean): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `screen-${timestamp}${annotate ? '-annotated' : ''}.png`;
}

function recordingFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `record-${timestamp}.mp4`;
}

function uriDirectory(uri: vscode.Uri): vscode.Uri {
  const separator = uri.path.lastIndexOf('/');
  return uri.with({ path: separator > 0 ? uri.path.slice(0, separator) : '/' });
}

function config(): vscode.WorkspaceConfiguration { return vscode.workspace.getConfiguration('androidCli'); }
function cli(): string {
  const testExecutable = process.env.ANDROID_CLI_TEST_CLI?.trim();
  if (testExecutable) return testExecutable;
  const configured = config().get<string>('executable', 'android');
  if (configured !== 'android') return configured;
  return firstExisting([path.join(os.homedir(), '.local', 'bin', 'android')]) ?? configured;
}
function adb(): string {
  const testExecutable = process.env.ANDROID_CLI_TEST_ADB?.trim();
  if (testExecutable) return testExecutable;
  const configured = config().get<string>('adbExecutable', 'adb');
  if (configured !== 'adb') return configured;
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return firstExisting([
    ...(sdk ? [path.join(sdk, 'platform-tools', executable('adb'))] : []),
    path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', executable('adb')),
  ]) ?? configured;
}
function sqlite(): string {
  const testExecutable = process.env.ANDROID_CLI_TEST_SQLITE?.trim();
  if (testExecutable) return testExecutable;
  return config().get<string>('sqliteExecutable', 'sqlite3');
}
function executable(name: string): string { return process.platform === 'win32' ? `${name}.exe` : name; }
function environmentLabel(): string {
  const remote = vscode.env.remoteName ? `${vscode.env.remoteName} remote` : 'local';
  return `${remote} · ${process.platform} ${process.arch}`;
}
function installCliCommand(): string {
  if (process.platform === 'win32') {
    return 'cmd.exe /d /s /c "curl.exe -fsSL https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd -o \\"%TEMP%\\android-cli-install.cmd\\" && call \\"%TEMP%\\android-cli-install.cmd\\""';
  }
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  return `curl -fsSL https://dl.google.com/android/cli/latest/${platform}_${architecture}/install.sh | bash`;
}
function firstExisting(candidates: string[]): string | undefined { return candidates.find((candidate) => fs.existsSync(candidate)); }
function inspectProjectRoot(): ProjectRootInfo {
  const configured = config().get<string>('projectRoot', '');
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const resolved = resolveProjectRootPath(configured, folders);
  if (resolved.error === 'no-workspace' || !resolved.rootPath) {
    return {
      status: 'missing-folder',
      message: 'Open a folder that contains your Android project, or set androidCli.projectRoot to that directory.',
    };
  }
  if (!fs.existsSync(resolved.rootPath) || !fs.statSync(resolved.rootPath).isDirectory()) {
    return {
      status: 'missing-path',
      displayPath: resolved.displayPath,
      message: `Project root not found: ${resolved.displayPath}. Update androidCli.projectRoot.`,
    };
  }
  const uri = vscode.Uri.file(resolved.rootPath);
  const relative = vscode.workspace.asRelativePath(uri, false);
  const displayPath = configured.trim()
    ? (path.isAbsolute(configured.trim()) ? relative : resolved.displayPath!)
    : relative;
  if (!fs.existsSync(gradleWrapperPath(uri))) {
    return {
      uri,
      displayPath,
      status: 'missing-wrapper',
      message: `No Gradle wrapper in ${displayPath}. Set androidCli.projectRoot to the Android project directory that contains gradlew.`,
    };
  }
  return { uri, displayPath, status: 'ready' };
}

function firstRoot(): vscode.Uri | undefined { return inspectProjectRoot().uri; }
function requireRoot(): vscode.Uri {
  const info = inspectProjectRoot();
  if (!info.uri || info.status !== 'ready') {
    throw new Error(info.message ?? 'Open an Android project folder first.');
  }
  return info.uri;
}
function gradleWrapperPath(root: vscode.Uri): string {
  return path.join(root.fsPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
}
function gradleWrapper(root: vscode.Uri): string {
  const wrapper = gradleWrapperPath(root);
  if (!fs.existsSync(wrapper)) {
    throw new Error(`Gradle wrapper not found: ${wrapper}. Set androidCli.projectRoot to your Android project directory.`);
  }
  return wrapper;
}

async function run(file: string, args: string[], cwd = firstRoot()?.fsPath, timeout = 30_000): Promise<string> {
  const { stdout } = await execFileAsync(file, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

async function discoverVariants(root: vscode.Uri): Promise<BuildVariant[]> {
  const wrapper = gradleWrapper(root);
  const output = await run(wrapper, ['tasks', '--all', '--console=plain'], root.fsPath, 90_000);
  const variants = new Map<string, BuildVariant>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\S*assemble([A-Z][A-Za-z0-9]*))\s+-\s+.*\bvariant\s+([A-Za-z0-9_-]+)/i);
    if (!match) continue;
    const suffix = match[2];
    if (/(AndroidTest|UnitTest|TestFixtures|Benchmark)$/i.test(suffix)) continue;
    const variant = variantFromTask(match[1], match[3]);
    variants.set(variant.id, variant);
  }
  if (!variants.size) {
    const configured = variantFromTask(config().get<string>('gradleTask', 'assembleDebug'));
    variants.set(configured.id, configured);
  }
  return [...variants.values()].sort((a, b) => Number(/release$/i.test(a.name)) - Number(/release$/i.test(b.name)) || a.label.localeCompare(b.label));
}

async function findVariantApks(root: vscode.Uri, variant: BuildVariant): Promise<vscode.Uri[]> {
  const exclude = new vscode.RelativePattern(root, '**/{node_modules,.gradle}/**');
  const modulePrefix = variant.module ? `${variant.module.replaceAll(':', '/')}/` : '';
  const apkPattern = modulePrefix
    ? new vscode.RelativePattern(root, `${modulePrefix}build/outputs/apk/**/*.apk`)
    : new vscode.RelativePattern(root, '**/build/outputs/apk/**/*.apk');
  const all = await vscode.workspace.findFiles(apkPattern, exclude, 100);
  if (!all.length) {
    const fallback = config().get<string>('apkGlob', '**/build/outputs/apk/debug/*.apk').replace(/^\.?\/+/, '');
    return vscode.workspace.findFiles(new vscode.RelativePattern(root, fallback), exclude, 100);
  }
  const wanted = normalize(variant.name);
  const matching = all.filter((uri) => {
    const relative = normalize(path.relative(root.fsPath, uri.fsPath));
    return relative.includes(wanted) && !relative.includes('androidtest');
  });
  return matching.length ? matching : all;
}

async function discoverDeepLinks(root: vscode.Uri, variant: BuildVariant): Promise<{ prefixes: string[]; applicationId?: string }> {
  const exclude = new vscode.RelativePattern(root, '**/{node_modules,.gradle}/**');
  const [built, source] = await Promise.all([
    vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/build/intermediates/**/AndroidManifest.xml'), exclude, 100),
    vscode.workspace.findFiles(new vscode.RelativePattern(root, '**/src/**/AndroidManifest.xml'), exclude, 100),
  ]);
  const modulePath = variant.module?.replaceAll(':', '/') ?? '';
  const variantName = normalize(variant.name);
  const files = [...built, ...source].sort((a, b) => manifestScore(b, modulePath, variantName) - manifestScore(a, modulePath, variantName));
  let applicationId: string | undefined;
  const prefixes = new Set<string>();
  for (const uri of files.slice(0, 12)) {
    let xml: string;
    try { xml = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'); }
    catch { continue; }
    applicationId ??= xml.match(/<manifest[^>]*\bpackage\s*=\s*"([^"]+)"/)?.[1];
    for (const filter of xml.match(/<intent-filter\b[\s\S]*?<\/intent-filter>/g) ?? []) {
      if (!filter.includes('android.intent.action.VIEW')) continue;
      const dataTags = filter.match(/<data\b[^>]*>/g) ?? [];
      const schemes = unique(dataTags.map((tag) => attr(tag, 'scheme')).filter(isString));
      const hosts = unique(dataTags.map((tag) => attr(tag, 'host')).filter(isString));
      const paths = unique(dataTags.flatMap((tag) => ['path', 'pathPrefix', 'pathPattern'].map((name) => attr(tag, name))).filter(isString));
      for (const scheme of schemes) {
        if (scheme.includes('${')) continue;
        for (const host of hosts.length ? hosts : ['']) {
          if (host.includes('${')) continue;
          const base = `${scheme}://${host}`;
          if (!paths.length) prefixes.add(base);
          for (const item of paths) prefixes.add(base + staticPath(item));
        }
      }
    }
    if (prefixes.size && uri.fsPath.includes(`${path.sep}build${path.sep}intermediates${path.sep}`)) break;
  }
  return { prefixes: [...prefixes].sort(), applicationId };
}

function manifestScore(uri: vscode.Uri, modulePath: string, variant: string): number {
  const normalized = normalize(uri.fsPath);
  return (modulePath && normalized.includes(normalize(modulePath)) ? 100 : 0)
    + (normalized.includes(variant) ? 60 : 0)
    + (normalized.includes('buildintermediates') ? 40 : 0)
    + (normalized.includes('mergedmanifest') ? 20 : 0);
}
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`(?:android:)?${name}\\s*=\\s*"([^"]+)"`))?.[1];
}
function staticPath(value: string): string {
  const prefix = value.split(/[.*[(\\]/)[0];
  if (!prefix) return '';
  return prefix.startsWith('/') ? prefix : `/${prefix}`;
}
function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function isString(value: string | undefined): value is string { return Boolean(value); }
function sameStrings(a: string[], b: string[]): boolean { return a.length === b.length && a.every((value, index) => value === b[index]); }

function deployResultMessage(result: DeployResult): string {
  const failures = result.failures.map(({ target, message }) => `${target.label}: ${message}`).join(' ');
  if (result.launched.length) return `Launched on ${result.launched.length} of ${result.total} targets. ${failures}`;
  return `Could not launch on any selected target. ${failures}`;
}

async function enrichDevices(devices: Device[]): Promise<Device[]> {
  return Promise.all(devices.map(async (device) => {
    const emulator = device.serial.startsWith('emulator-');
    if (device.state !== 'device' && !emulator) return device;
    const [avdResult, themeResult] = await Promise.allSettled([
      emulator
        ? run(adb(), ['-s', device.serial, 'emu', 'avd', 'name'], undefined, 5_000)
        : Promise.resolve(''),
      device.state === 'device'
        ? run(adb(), ['-s', device.serial, 'shell', 'cmd', 'uimode', 'night'], undefined, 5_000)
        : Promise.resolve(''),
    ]);
    const avdName = avdResult.status === 'fulfilled'
      ? avdResult.value.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== 'OK')
      : undefined;
    const themeOutput = themeResult.status === 'fulfilled' ? themeResult.value.toLowerCase() : '';
    const theme = /\b(yes|enabled)\b/.test(themeOutput) ? 'dark'
      : /\b(no|disabled)\b/.test(themeOutput) ? 'light' : 'auto';
    const enriched: Device = {
      ...device,
      avdName,
      description: avdName ? `${avdName.replaceAll('_', ' ')} · ${device.serial}` : device.description,
    };
    if (device.state === 'device') enriched.theme = theme;
    return enriched;
  }));
}
async function listInstalledPackages(serial: string): Promise<string[]> {
  const output = await run(adb(), ['-s', serial, 'shell', 'pm', 'list', 'packages', '-3']);
  return unique(
    output
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^package:/, ''))
      .filter((name) => Boolean(name) && name.includes('.')),
  ).sort((a, b) => a.localeCompare(b));
}

function shellQuote(value: string): string {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }

class UserCancelledError extends Error {
  constructor() { super('Canceled'); }
}

function html(webview: vscode.Webview): string {
  const nonce = Math.random().toString(36).slice(2);
  const css = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'media', 'panel.css'));
  const world = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'media', 'world-land.js'));
  const logic = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'media', 'panel-logic.js'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', 'media', 'panel.js'));
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};"><link rel="stylesheet" href="${css}"></head><body><main id="app"></main><script nonce="${nonce}" src="${world}"></script><script nonce="${nonce}" src="${logic}"></script><script nonce="${nonce}" src="${script}"></script></body></html>`;
}
