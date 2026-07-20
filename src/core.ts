import * as path from 'node:path';

export type Device = {
  serial: string;
  state: string;
  description: string;
  avdName?: string;
  theme?: 'light' | 'dark' | 'auto';
};

export type ProjectRootResolution = {
  rootPath?: string;
  /** Configured value when set, otherwise the workspace folder path. */
  displayPath?: string;
  error?: 'no-workspace';
};

/** Resolve androidCli.projectRoot against the first workspace folder. */
export function resolveProjectRootPath(
  configured: string | undefined,
  workspaceFolderPaths: string[],
): ProjectRootResolution {
  const workspace = workspaceFolderPaths[0];
  if (!workspace) return { error: 'no-workspace' };
  const trimmed = configured?.trim() ?? '';
  if (!trimmed) {
    return { rootPath: path.normalize(workspace), displayPath: workspace };
  }
  const rootPath = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(workspace, trimmed);
  return { rootPath, displayPath: trimmed.replace(/\\/g, '/') };
}

/** Persist workspace-contained roots as portable relative paths. */
export function projectRootSettingValue(selectedPath: string, workspacePath?: string): string {
  const selected = path.normalize(selectedPath);
  if (!workspacePath) return selected;
  const relative = path.relative(path.normalize(workspacePath), selected);
  if (!relative) return '';
  const outsideWorkspace = relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
  return outsideWorkspace ? selected : relative.replace(/\\/g, '/');
}

export type DeviceControls = {
  serial: string;
  isEmulator: boolean;
  fontScale: number;
  rotation: number;
  showTouches: boolean;
  pointerLocation: boolean;
  layoutBounds: boolean;
  batteryLevel?: number;
  batteryCharging?: boolean;
};

export const FONT_SCALE_PRESETS = [
  { id: 'small', label: 'S', value: 0.85 },
  { id: 'default', label: 'M', value: 1 },
  { id: 'large', label: 'L', value: 1.15 },
  { id: 'largest', label: 'XL', value: 1.3 },
] as const;

export const ROTATION_PRESETS = [
  { id: '0', label: '0°', value: 0 },
  { id: '90', label: '90°', value: 1 },
  { id: '180', label: '180°', value: 2 },
  { id: '270', label: '270°', value: 3 },
] as const;

export const BATTERY_LEVEL_PRESETS = [5, 15, 50, 85, 100] as const;

export const COMMON_PERMISSIONS = [
  { id: 'location', label: 'Location', permission: 'android.permission.ACCESS_FINE_LOCATION' },
  { id: 'camera', label: 'Camera', permission: 'android.permission.CAMERA' },
  { id: 'mic', label: 'Mic', permission: 'android.permission.RECORD_AUDIO' },
  { id: 'notifications', label: 'Alerts', permission: 'android.permission.POST_NOTIFICATIONS' },
  { id: 'contacts', label: 'Contacts', permission: 'android.permission.READ_CONTACTS' },
  { id: 'calendar', label: 'Calendar', permission: 'android.permission.READ_CALENDAR' },
  { id: 'phone', label: 'Phone', permission: 'android.permission.READ_PHONE_STATE' },
  { id: 'nearby', label: 'Nearby', permission: 'android.permission.BLUETOOTH_CONNECT' },
  { id: 'activity', label: 'Activity', permission: 'android.permission.ACTIVITY_RECOGNITION' },
] as const;

export type PackagePermissionState = {
  permission: string;
  requested: boolean;
  runtime: boolean;
  granted: boolean;
};

export type ManifestLaunchInfo = {
  applicationId?: string;
  launchActivity?: string;
};

/** Resolve the default Android Studio-style launcher component from a manifest. */
export function parseManifestLaunchInfo(xml: string): ManifestLaunchInfo {
  const manifestTag = xml.match(/<manifest\b[^>]*>/i)?.[0] ?? '';
  const applicationId = attrValue(manifestTag, 'package');
  const componentPattern = /<(activity|activity-alias)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let component: RegExpExecArray | null;
  while ((component = componentPattern.exec(xml))) {
    const body = component[3];
    if (!/<action\b[^>]*android:name\s*=\s*["']android\.intent\.action\.MAIN["'][^>]*>/i.test(body)) continue;
    if (!/<category\b[^>]*android:name\s*=\s*["']android\.intent\.category\.LAUNCHER["'][^>]*>/i.test(body)) continue;
    const name = attrValue(component[2], 'name');
    if (!name || name.includes('${')) continue;
    return { applicationId, launchActivity: qualifyComponentName(name, applicationId) };
  }
  return { applicationId };
}

export function parsePackagePermissionStates(
  output: string,
  permissions: readonly string[] = COMMON_PERMISSIONS.map((item) => item.permission),
): PackagePermissionState[] {
  const requested = new Set<string>();
  const runtime = new Map<string, boolean>();
  let section = '';
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^requested permissions:$/i.test(line)) {
      section = 'requested';
      continue;
    }
    if (/^runtime permissions:$/i.test(line)) {
      section = 'runtime';
      continue;
    }
    if (/^[A-Za-z][^:]*:\s*$/.test(line)) {
      section = '';
      continue;
    }
    const permission = line.match(/^(android\.permission\.[A-Z0-9_]+)/)?.[1];
    if (!permission) continue;
    if (section === 'requested') requested.add(permission);
    const granted = line.match(/\bgranted=(true|false)\b/i)?.[1];
    if (section === 'runtime' || granted) runtime.set(permission, granted?.toLowerCase() === 'true');
  }
  return permissions.map((permission) => ({
    permission,
    requested: requested.has(permission),
    runtime: runtime.has(permission),
    granted: runtime.get(permission) ?? false,
  }));
}

export function parseEmulatorProfiles(output: string): string[] {
  return unique(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^(profile|name|available|device profiles|--)/i.test(line))
      .map((line) => line.split(/\s+/)[0] ?? '')
      .filter((name) => /^[A-Za-z0-9._-]+$/.test(name)),
  );
}

export function nearestFontScale(value: number): number {
  let best: number = FONT_SCALE_PRESETS[1].value;
  let distance = Math.abs(value - best);
  for (const preset of FONT_SCALE_PRESETS) {
    const next = Math.abs(value - preset.value);
    if (next < distance) {
      best = preset.value;
      distance = next;
    }
  }
  return best;
}

export function parseSettingsInt(output: string, fallback = 0): number {
  const match = output.match(/-?\d+/);
  return match ? Number(match[0]) : fallback;
}

export function parseSettingsFloat(output: string, fallback = 1): number {
  const match = output.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

export function parseBatteryDump(output: string): { level?: number; charging?: boolean } {
  const levelMatch = output.match(/^\s*level:\s*(\d+)/m);
  const statusMatch = output.match(/^\s*status:\s*(\d+)/m);
  const pluggedMatch = output.match(/^\s*powered:\s*(true|false)/im)
    ?? output.match(/^\s*USB powered:\s*(true|false)/im);
  const level = levelMatch ? Number(levelMatch[1]) : undefined;
  const status = statusMatch ? Number(statusMatch[1]) : undefined;
  const charging = pluggedMatch
    ? pluggedMatch[1].toLowerCase() === 'true'
    : status === 2 || status === 5;
  return { level, charging };
}

export function emulatorCreateSupported(platform = process.platform): boolean {
  return platform !== 'win32';
}

export type PerformanceMetrics = {
  totalFrames: number;
  jankyFrames: number;
  jankPercent: number;
  fps?: number;
  slowFrames: number;
  frameTimesMs: number[];
  memoryMb?: number;
};

export function parseFrameStats(output: string): number[] {
  const lines = output.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^Flags,/i.test(line.trim()));
  if (headerIndex < 0) return [];
  const header = lines[headerIndex].split(',').map((item) => item.trim());
  const intendedIdx = header.findIndex((item) => /^IntendedVsync$/i.test(item));
  const completedIdx = header.findIndex((item) => /^FrameCompleted$/i.test(item));
  if (intendedIdx < 0 || completedIdx < 0) return [];
  const times: number[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('---') || /^[A-Za-z]/.test(trimmed)) break;
    const cols = trimmed.split(',');
    const intended = Number(cols[intendedIdx]);
    const completed = Number(cols[completedIdx]);
    if (!Number.isFinite(intended) || !Number.isFinite(completed) || completed <= intended) continue;
    const ms = (completed - intended) / 1_000_000;
    if (ms > 0 && ms < 5_000) times.push(ms);
  }
  return times.slice(-40);
}

export function parseGfxInfo(output: string): Omit<PerformanceMetrics, 'memoryMb'> {
  const totalFrames = Number(output.match(/Total frames rendered:\s*(\d+)/i)?.[1] ?? 0);
  const jankyFrames = Number(output.match(/Janky frames:\s*(\d+)/i)?.[1] ?? 0);
  const explicitPercent = output.match(/Janky frames:\s*\d+\s*\(([\d.]+)\s*%\)/i)?.[1];
  const jankPercent = explicitPercent
    ? Number(explicitPercent)
    : totalFrames > 0 ? (jankyFrames / totalFrames) * 100 : 0;
  const frameTimesMs = parseFrameStats(output);
  const slowFrames = frameTimesMs.filter((ms) => ms > 16.67).length
    || Number(output.match(/Number Missed Vsync:\s*(\d+)/i)?.[1] ?? 0);
  let fps: number | undefined;
  if (frameTimesMs.length >= 2) {
    const average = frameTimesMs.reduce((sum, ms) => sum + ms, 0) / frameTimesMs.length;
    if (average > 0) fps = Math.max(1, Math.min(60, Math.round(1000 / average)));
  } else {
    const percentile = output.match(/50th percentile:\s*(\d+)\s*ms/i)?.[1];
    if (percentile) {
      const ms = Number(percentile);
      if (ms > 0) fps = Math.max(1, Math.min(60, Math.round(1000 / ms)));
    }
  }
  return {
    totalFrames,
    jankyFrames,
    jankPercent: Number.isFinite(jankPercent) ? jankPercent : 0,
    fps,
    slowFrames,
    frameTimesMs,
  };
}

export function parseMemInfo(output: string): number | undefined {
  const appSummary = output.match(/App Summary[\s\S]*?TOTAL:\s*([\d,]+)/i)?.[1];
  if (appSummary) return Number(appSummary.replace(/,/g, '')) / 1024;
  const totalPss = output.match(/TOTAL\s+PSS:\s*([\d,]+)/i)?.[1]
    ?? output.match(/^\s*TOTAL\s+(\d+)/m)?.[1];
  if (totalPss) return Number(totalPss.replace(/,/g, '')) / 1024;
  return undefined;
}

export function buildPerformanceIssues(metrics: PerformanceMetrics): string[] {
  const issues: string[] = [];
  if (metrics.slowFrames > 0) {
    issues.push(`${metrics.slowFrames} frame${metrics.slowFrames === 1 ? '' : 's'} > 16ms in last sample`);
  }
  if (metrics.jankPercent >= 5) {
    issues.push(`Jank ${metrics.jankPercent.toFixed(1)}% of rendered frames`);
  }
  if (metrics.memoryMb != null && metrics.memoryMb >= 300) {
    issues.push(`Memory ${metrics.memoryMb.toFixed(0)} MB is elevated`);
  }
  if (metrics.fps != null && metrics.fps < 45) {
    issues.push(`FPS around ${metrics.fps} looks soft`);
  }
  return issues.slice(0, 4);
}

export type RunTarget = {
  id: string;
  kind: 'device' | 'emulator';
  label: string;
  status: 'online' | 'stopped' | 'offline' | 'unauthorized';
  selectable: boolean;
  serial?: string;
  avdName?: string;
};
export type BuildVariant = {
  id: string;
  label: string;
  name: string;
  module?: string;
  task: string;
};

export function variantFromTask(task: string, explicitName?: string): BuildVariant {
  const clean = task.replace(/^:/, '');
  const parts = clean.split(':');
  const simpleTask = parts.pop() ?? task;
  const module = parts.join(':') || undefined;
  const suffix = simpleTask.replace(/^assemble/, '') || 'Debug';
  const name = explicitName ?? suffix[0].toLowerCase() + suffix.slice(1);
  return { id: task, task, name, module, label: module ? `${module} · ${name}` : name };
}

export function parseDevices(output: string): Device[] {
  return output.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const [serial, state, ...details] = line.trim().split(/\s+/);
    const model = details.find((item) => item.startsWith('model:'))?.slice(6)?.replaceAll('_', ' ');
    return { serial, state, description: model ? `${model} · ${serial}` : serial };
  });
}

export function buildRunTargets(devices: Device[], emulators: string[]): RunTarget[] {
  const usedSerials = new Set<string>();
  const avdTargets = emulators.map((avdName): RunTarget => {
    const device = devices.find((candidate) => candidate.avdName === avdName);
    if (device) usedSerials.add(device.serial);
    return {
      id: `avd:${avdName}`,
      kind: 'emulator',
      label: avdName.replaceAll('_', ' '),
      status: targetStatus(device),
      selectable: device?.state === 'device',
      serial: device?.serial,
      avdName,
    };
  });
  const connectedTargets = devices.filter((device) => !usedSerials.has(device.serial)).map((device): RunTarget => ({
    id: device.avdName ? `avd:${device.avdName}` : `device:${device.serial}`,
    kind: device.serial.startsWith('emulator-') ? 'emulator' : 'device',
    label: device.avdName?.replaceAll('_', ' ') ?? device.description.replace(` · ${device.serial}`, ''),
    status: targetStatus(device),
    selectable: device.state === 'device',
    serial: device.serial,
    avdName: device.avdName,
  }));
  return [...avdTargets, ...connectedTargets];
}

export function reconcileRunTargetSelection(targets: RunTarget[], selectedIds: string[]): string[] {
  const activeIds = new Set(
    targets.filter((target) => target.status === 'online' && target.selectable).map((target) => target.id),
  );
  const selected = selectedIds.filter((id) => activeIds.has(id));
  if (selected.length) return selected;
  const firstActive = targets.find((target) => activeIds.has(target.id));
  return firstActive ? [firstActive.id] : [];
}

export function summarizeAdb(output: string): string {
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^(Status|Activity):/i.test(line)) ?? '';
}

export function isMissingExecutable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return code === 'ENOENT' || /\bENOENT\b|not found|not recognized/i.test(messageOf(error));
}

export function isCompleteDeepLink(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function targetStatus(device: Device | undefined): RunTarget['status'] {
  if (!device) return 'stopped';
  if (device.state === 'device') return 'online';
  return device.state === 'unauthorized' ? 'unauthorized' : 'offline';
}

function attrValue(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`(?:android:)?${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
}

function qualifyComponentName(name: string, applicationId?: string): string {
  if (!applicationId || applicationId.includes('${')) return name;
  if (name.startsWith('.')) return `${applicationId}${name}`;
  if (!name.includes('.')) return `${applicationId}.${name}`;
  return name;
}
