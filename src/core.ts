export type Device = {
  serial: string;
  state: string;
  description: string;
  avdName?: string;
  theme?: 'light' | 'dark' | 'auto';
};

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
] as const;

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
