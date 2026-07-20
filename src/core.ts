export type Device = {
  serial: string;
  state: string;
  description: string;
  avdName?: string;
  theme?: 'light' | 'dark' | 'auto';
};

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function targetStatus(device: Device | undefined): RunTarget['status'] {
  if (!device) return 'stopped';
  if (device.state === 'device') return 'online';
  return device.state === 'unauthorized' ? 'unauthorized' : 'offline';
}
