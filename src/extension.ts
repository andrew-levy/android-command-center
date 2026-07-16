import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { DatabaseInspector, emptyDatabaseState, type DatabaseInspectorState } from './databaseInspector';
import {
  isCompleteDeepLink,
  isMissingExecutable,
  parseDevices,
  summarizeAdb,
  variantFromTask,
  type BuildVariant,
  type Device,
} from './core';

const execFileAsync = promisify(execFile);
const CACHE_KEY = 'androidCli.dashboardCache.v1';
const VARIANT_KEY = 'androidCli.selectedVariant.v1';
const RECENT_LINKS_KEY = 'androidCli.recentDeepLinks.v1';
const FAVORITE_LINKS_KEY = 'androidCli.favoriteDeepLinks.v1';
const APP_PACKAGE_KEY = 'androidCli.selectedAppPackage.v1';
const REFRESH_CHECK_TIMEOUT_MS = 12_000;
const MIN_BUSY_MS = 2_000;
const SUCCESS_ENTER_MS = 220;
const SUCCESS_HOLD_MS = 2_000;
const SUCCESS_EXIT_MS = 180;

type LinkResult = { ok: boolean; message: string };
type Operation = { id: string; status: 'running' | 'success' | 'success-exit' | 'error'; message: string };
type DependencyStatus = 'checking' | 'ready' | 'missing' | 'error';
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
  busy?: string;
  error?: string;
  screenshot?: string;
  linkResult?: LinkResult;
  operation?: Operation;
  testOpenSections?: string[];
};

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DashboardProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('androidCli.dashboard', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('androidCli.refresh', () => provider.refresh(true)),
    vscode.commands.registerCommand('androidCli.openDashboard', () =>
      vscode.commands.executeCommand('workbench.view.extension.androidCli')),
  );
}

export function deactivate(): void {}

class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private state: DashboardState;
  private devicePoll?: NodeJS.Timeout;
  private pollingDevices = false;
  private autoScannedSerial?: string;
  private operationSequence = 0;
  private readonly databases: DatabaseInspector;

  constructor(private readonly context: vscode.ExtensionContext) {
    const cached = context.workspaceState.get<Partial<DashboardState>>(CACHE_KEY);
    this.databases = new DatabaseInspector(adb, sqlite, () => firstRoot()?.fsPath);
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
      initializing: true,
      testOpenSections: process.env.ANDROID_CLI_TEST_OPEN_SECTIONS?.split(',').map((item) => item.trim()).filter(Boolean),
    };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri, ...workspaceRoots()] };
    view.webview.onDidReceiveMessage((message) => void this.handle(message));
    view.webview.html = html(view.webview);
    if (this.devicePoll) clearInterval(this.devicePoll);
    this.devicePoll = setInterval(() => void this.pollDevices(), 5_000);
    view.onDidDispose(() => {
      if (this.devicePoll) clearInterval(this.devicePoll);
      this.devicePoll = undefined;
    });
  }

  private async pollDevices(): Promise<void> {
    if (this.pollingDevices || !this.view?.visible) return;
    this.pollingDevices = true;
    try {
      const devices = await enrichDevices(parseDevices(await run(adb(), ['devices', '-l'])));
      if (JSON.stringify(devices) === JSON.stringify(this.state.devices)) return;
      this.state.devices = devices;
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
    this.state.error = undefined;
    this.state.cliStatus = 'checking';
    this.state.adbStatus = 'checking';
    this.state.sqliteStatus = 'checking';
    this.render();
    const root = firstRoot();
    const shouldDiscover = Boolean(root && (discoverProject || !this.state.variants.length));
    if (!this.state.variants.length) {
      this.applyVariants([variantFromTask(config().get<string>('gradleTask', 'assembleDebug'))]);
    }
    const variantDiscovery = shouldDiscover && root ? this.discoverProjectVariants(root) : undefined;
    const [cliVersion, info, adbVersion, sqliteVersion, devices, emulators] = await Promise.allSettled([
      run(cli(), ['--version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(cli(), ['info'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(adb(), ['version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(sqlite(), ['-version'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(adb(), ['devices', '-l'], undefined, REFRESH_CHECK_TIMEOUT_MS),
      run(cli(), ['emulator', 'list'], undefined, REFRESH_CHECK_TIMEOUT_MS),
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
    if (!initialLoad && variantDiscovery) await variantDiscovery;
    if (root) {
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
        case 'error-dismiss': this.state.error = undefined; this.render(); return;
        case 'variant': await this.selectVariant(String(message.id)); return;
        case 'gradle-sync': await this.gradleSync(); return;
        case 'build-run': await this.buildAndRun(); return;
        case 'clean': await this.clean(); return;
        case 'deeplink-open': await this.openDeepLink(String(message.uri), String(message.serial ?? '')); return;
        case 'deeplink-favorite': await this.toggleFavorite(String(message.uri)); return;
        case 'deeplink-clear': await this.clearDeepLinkHistory(); return;
        case 'start': await this.startEmulator(String(message.name)); return;
        case 'stop': await this.stopDevice(String(message.serial)); return;
        case 'theme': await this.setDeviceTheme(String(message.serial), String(message.theme)); return;
        case 'screenshot': await this.screenshot(Boolean(message.annotate)); return;
        case 'layout': await this.layout(); return;
        case 'location': await this.location(String(message.serial), Number(message.latitude), Number(message.longitude)); return;
        case 'location-path': await this.pathLocation(String(message.serial), Number(message.latitude), Number(message.longitude)); return;
        case 'logcat': return void this.terminal('Logcat', [adb(), ...(message.serial ? ['-s', String(message.serial)] : []), 'logcat']);
        case 'db-refresh': await this.dbRefresh(String(message.serial ?? '')); return;
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
        this.state.error = undefined;
        this.state.busy = undefined;
        this.render();
        return;
      }
      this.state.error = messageOf(error);
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
    await this.busy('Building and running…', async () => {
      const variant = this.selectedVariant();
      if (!await this.runGradleTask(root, variant.task, 'Build & Run')) throw new Error('Android build failed. Check the Build & Run terminal for details.');
      await this.refreshDeepLinks(root);
      await this.deploy(variant);
    }, 'build-run', 'App launched');
  }

  private async deploy(variant: BuildVariant): Promise<void> {
    const files = await findVariantApks(variant);
    if (!files.length) throw new Error(`No APK found for ${variant.label}. Build the variant first.`);
    const picked = files.length === 1 ? files[0] : await vscode.window.showQuickPick(
      files.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
      { placeHolder: `Choose a ${variant.label} APK to deploy` },
    ).then((x) => x?.uri);
    if (!picked) throw new UserCancelledError();
    const device = await this.chooseDevice();
    const args = ['run', `--apks=${picked.fsPath}`, ...(device ? [`--device=${device}`] : [])];
    if (!await this.runProcessTask('Android Run', cli(), args)) throw new Error('Android run failed. Check the Android Run terminal for details.');
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

  private async screenshot(annotate: boolean): Promise<void> {
    const root = requireRoot();
    const folder = vscode.Uri.joinPath(root, '.android-cli', 'screenshots');
    await vscode.workspace.fs.createDirectory(folder);
    const file = vscode.Uri.joinPath(folder, `screen-${Date.now()}${annotate ? '-annotated' : ''}.png`);
    await this.busy('Capturing screenshot…', () => run(cli(), ['screen', 'capture', `--output=${file.fsPath}`, ...(annotate ? ['--annotate'] : [])]), annotate ? 'screenshot-annotated' : 'screenshot', 'Screenshot captured');
    this.state.screenshot = this.view?.webview.asWebviewUri(file).toString();
    this.render();
    await vscode.commands.executeCommand('vscode.open', file);
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
      this.state.database = await this.databases.refreshProcesses(serial, this.state.applicationId, false);
    } catch (error) {
      this.state.database = { ...this.databases.snapshot(), error: messageOf(error) };
    } finally {
      this.state.databaseScanning = false;
      this.render();
    }
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

  private async busy<T>(label: string, action: () => Promise<T>, id = 'busy', success = 'Done'): Promise<T> {
    const startedAt = Date.now();
    const sequence = ++this.operationSequence;
    this.state.busy = label;
    this.state.operation = { id, status: 'running', message: label };
    this.state.error = undefined;
    this.render();
    try {
      const result = await action();
      await this.waitForMinimumBusyTime(startedAt);
      if (sequence === this.operationSequence) this.showOperationSuccess(id, success);
      return result;
    } catch (error) {
      if (error instanceof UserCancelledError) {
        if (sequence === this.operationSequence) this.state.operation = undefined;
        throw error;
      }
      await this.waitForMinimumBusyTime(startedAt);
      if (sequence === this.operationSequence) {
        this.state.operation = { id, status: 'error', message: messageOf(error) };
      }
      throw error;
    } finally {
      if (sequence === this.operationSequence) {
        this.state.busy = undefined;
        this.render();
      }
    }
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

  private persistCache(): void {
    const {
      busy: _busy,
      error: _error,
      screenshot: _screenshot,
      linkResult: _result,
      operation: _operation,
      database: _database,
      appDataMessage: _appDataMessage,
      initializing: _initializing,
      databaseScanning: _databaseScanning,
      appPackagesScanning: _appPackagesScanning,
      testOpenSections: _testOpenSections,
      ...cache
    } = this.state;
    void this.context.workspaceState.update(CACHE_KEY, cache);
  }

  private render(): void { void this.view?.webview.postMessage({ type: 'state', state: this.state }); }
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
function workspaceRoots(): vscode.Uri[] { return vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? []; }
function firstRoot(): vscode.Uri | undefined { return vscode.workspace.workspaceFolders?.[0]?.uri; }
function requireRoot(): vscode.Uri {
  const root = firstRoot();
  if (!root) throw new Error('Open an Android project folder first.');
  return root;
}
function gradleWrapper(root: vscode.Uri): string {
  const wrapper = path.join(root.fsPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(wrapper)) throw new Error(`Gradle wrapper not found: ${wrapper}`);
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

async function findVariantApks(variant: BuildVariant): Promise<vscode.Uri[]> {
  const modulePrefix = variant.module ? `${variant.module.replaceAll(':', '/')}/` : '**/';
  const all = await vscode.workspace.findFiles(`${modulePrefix}build/outputs/apk/**/*.apk`, '**/{node_modules,.gradle}/**', 100);
  if (!all.length) return vscode.workspace.findFiles(
    config().get<string>('apkGlob', '**/build/outputs/apk/debug/*.apk'), '**/{node_modules,.gradle}/**', 100,
  );
  const wanted = normalize(variant.name);
  const matching = all.filter((uri) => {
    const relative = normalize(vscode.workspace.asRelativePath(uri));
    return relative.includes(wanted) && !relative.includes('androidtest');
  });
  return matching.length ? matching : all;
}

async function discoverDeepLinks(root: vscode.Uri, variant: BuildVariant): Promise<{ prefixes: string[]; applicationId?: string }> {
  const [built, source] = await Promise.all([
    vscode.workspace.findFiles('**/build/intermediates/**/AndroidManifest.xml', '**/{node_modules,.gradle}/**', 100),
    vscode.workspace.findFiles('**/src/**/AndroidManifest.xml', '**/{node_modules,.gradle}/**', 100),
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

async function enrichDevices(devices: Device[]): Promise<Device[]> {
  return Promise.all(devices.map(async (device) => {
    if (device.state !== 'device') return device;
    const [avdResult, themeResult] = await Promise.allSettled([
      device.serial.startsWith('emulator-')
        ? run(adb(), ['-s', device.serial, 'emu', 'avd', 'name'], undefined, 5_000)
        : Promise.resolve(''),
      run(adb(), ['-s', device.serial, 'shell', 'cmd', 'uimode', 'night'], undefined, 5_000),
    ]);
    const avdName = avdResult.status === 'fulfilled'
      ? avdResult.value.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== 'OK')
      : undefined;
    const themeOutput = themeResult.status === 'fulfilled' ? themeResult.value.toLowerCase() : '';
    const theme = /\b(yes|enabled)\b/.test(themeOutput) ? 'dark'
      : /\b(no|disabled)\b/.test(themeOutput) ? 'light' : 'auto';
    return {
      ...device,
      avdName,
      theme,
      description: avdName ? `${avdName.replaceAll('_', ' ')} · ${device.serial}` : device.description,
    };
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
