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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
