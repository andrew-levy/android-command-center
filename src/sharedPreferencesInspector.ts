import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export type PrefProcess = { packageName: string; label: string; running: boolean };
export type PrefValueType = 'string' | 'boolean' | 'int' | 'long' | 'float' | 'set';
export type PrefEntry = {
  key: string;
  type: PrefValueType;
  /** Display / edit string. For `set`, newline-separated members. */
  value: string;
};

export type SharedPreferencesInspectorState = {
  serial?: string;
  packageName?: string;
  processes: PrefProcess[];
  files: string[];
  selectedFile?: string;
  entries: PrefEntry[];
  dirty: boolean;
  localPath?: string;
  message?: string;
  error?: string;
};

const PREF_TYPES: PrefValueType[] = ['string', 'boolean', 'int', 'long', 'float', 'set'];

export function emptySharedPreferencesState(): SharedPreferencesInspectorState {
  return { processes: [], files: [], entries: [], dirty: false };
}

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export class SharedPreferencesInspector {
  private state: SharedPreferencesInspectorState = emptySharedPreferencesState();
  private workRoot?: string;
  private preparedStorageRoot?: string;

  constructor(
    private readonly adb: () => string,
    private readonly storageRoot: () => string | undefined,
  ) {}

  snapshot(): SharedPreferencesInspectorState {
    return { ...this.state, entries: this.state.entries.map((entry) => ({ ...entry })) };
  }

  async dispose(): Promise<void> {
    await this.discardLocal();
  }

  async refreshProcesses(
    serial: string,
    preferredPackage?: string,
    thorough = true,
    loadSelectedFile = true,
  ): Promise<SharedPreferencesInspectorState> {
    if (this.state.serial && this.state.serial !== serial) await this.discardLocal();
    this.state.serial = serial;
    this.state.error = undefined;
    const processes = await listDebuggableProcesses(this.adb(), serial, preferredPackage, thorough);
    this.state.processes = processes;
    if (!processes.some((item) => item.packageName === this.state.packageName)) {
      this.state.packageName = preferredPackage && processes.some((item) => item.packageName === preferredPackage)
        ? preferredPackage
        : processes.find((item) => item.running)?.packageName ?? processes[0]?.packageName;
    }
    if (this.state.packageName) await this.refreshFiles(loadSelectedFile);
    else {
      this.state.files = [];
      this.state.selectedFile = undefined;
      this.state.entries = [];
      this.state.localPath = undefined;
      this.state.dirty = false;
    }
    return this.snapshot();
  }

  async selectPackage(packageName: string): Promise<SharedPreferencesInspectorState> {
    if (!packageName || packageName === this.state.packageName) return this.snapshot();
    await this.discardLocal();
    this.state.packageName = packageName;
    this.state.selectedFile = undefined;
    this.state.entries = [];
    this.state.message = undefined;
    this.state.error = undefined;
    await this.refreshFiles();
    return this.snapshot();
  }

  async selectFile(fileName: string): Promise<SharedPreferencesInspectorState> {
    if (!fileName) return this.snapshot();
    if (this.state.dirty) await this.push();
    this.state.selectedFile = fileName;
    this.state.error = undefined;
    await this.pullSelected();
    return this.snapshot();
  }

  async setEntry(key: string, type: PrefValueType, value: string): Promise<SharedPreferencesInspectorState> {
    const trimmedKey = key.trim();
    if (!trimmedKey) throw new Error('Enter a preference key.');
    if (!PREF_TYPES.includes(type)) throw new Error(`Unsupported preference type: ${type}`);
    await this.ensureLocal();
    const normalized = normalizePrefValue(type, value);
    const next = [...this.state.entries];
    const index = next.findIndex((entry) => entry.key === trimmedKey);
    const entry: PrefEntry = { key: trimmedKey, type, value: formatPrefValue(type, normalized) };
    if (index >= 0) next[index] = entry;
    else next.push(entry);
    next.sort((a, b) => a.key.localeCompare(b.key));
    this.state.entries = next;
    this.state.dirty = true;
    await this.writeLocalAndPush();
    this.state.message = `Updated ${trimmedKey} · pushed to device`;
    return this.snapshot();
  }

  async deleteEntry(key: string): Promise<SharedPreferencesInspectorState> {
    const trimmedKey = key.trim();
    if (!trimmedKey) throw new Error('Choose a preference key to delete.');
    await this.ensureLocal();
    const before = this.state.entries.length;
    this.state.entries = this.state.entries.filter((entry) => entry.key !== trimmedKey);
    if (this.state.entries.length === before) throw new Error(`No preference named ${trimmedKey}.`);
    this.state.dirty = true;
    await this.writeLocalAndPush();
    this.state.message = `Deleted ${trimmedKey} · pushed to device`;
    return this.snapshot();
  }

  async refresh(): Promise<SharedPreferencesInspectorState> {
    if (!this.state.serial || !this.state.packageName) return this.snapshot();
    if (this.state.dirty) await this.push();
    await this.refreshFiles();
    if (this.state.selectedFile) await this.pullSelected();
    this.state.message = 'Reloaded from device';
    return this.snapshot();
  }

  async push(): Promise<SharedPreferencesInspectorState> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const fileName = this.requireFile();
    const local = this.requireLocal();
    await fsp.writeFile(local, serializeSharedPreferencesXml(this.state.entries), 'utf8');
    await pushPreferencesFile(this.adb(), serial, packageName, fileName, local);
    this.state.dirty = false;
    this.state.message = `Pushed ${fileName} to ${packageName}`;
    return this.snapshot();
  }

  private async refreshFiles(loadSelectedFile = true): Promise<void> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const files = await listPreferenceFiles(this.adb(), serial, packageName);
    this.state.files = files;
    if (!files.includes(this.state.selectedFile ?? '')) {
      this.state.selectedFile = files[0];
      this.state.entries = [];
      this.state.localPath = undefined;
      this.state.dirty = false;
    }
    if (this.state.selectedFile && loadSelectedFile) await this.pullSelected();
  }

  private async pullSelected(): Promise<void> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const fileName = this.requireFile();
    const local = await this.localFileFor(packageName, fileName);
    await pullPreferencesFile(this.adb(), serial, packageName, fileName, local);
    const xml = await fsp.readFile(local, 'utf8');
    this.state.entries = parseSharedPreferencesXml(xml);
    this.state.localPath = local;
    this.state.dirty = false;
  }

  private async ensureLocal(): Promise<void> {
    if (this.state.localPath && fs.existsSync(this.state.localPath)) return;
    await this.pullSelected();
  }

  private async writeLocalAndPush(): Promise<void> {
    const local = this.requireLocal();
    await fsp.writeFile(local, serializeSharedPreferencesXml(this.state.entries), 'utf8');
    await this.push();
  }

  private async discardLocal(): Promise<void> {
    if (!this.workRoot) return;
    await fsp.rm(this.workRoot, { recursive: true, force: true }).catch(() => undefined);
    this.workRoot = undefined;
    this.state.localPath = undefined;
    this.state.dirty = false;
  }

  private async localFileFor(packageName: string, fileName: string): Promise<string> {
    const root = this.storageRoot() ?? path.join(os.tmpdir(), 'android-command-center');
    const prefsRoot = path.join(root, 'shared_prefs');
    if (this.preparedStorageRoot !== prefsRoot) {
      await fsp.rm(prefsRoot, { recursive: true, force: true }).catch(() => undefined);
      this.preparedStorageRoot = prefsRoot;
    }
    this.workRoot = path.join(prefsRoot, safePathSegment(this.requireSerial()), safePathSegment(packageName));
    await fsp.mkdir(this.workRoot, { recursive: true });
    return path.join(this.workRoot, safePathSegment(fileName));
  }

  private requireSerial(): string {
    if (!this.state.serial) throw new Error('Connect or start an Android device first.');
    return this.state.serial;
  }

  private requirePackage(): string {
    if (!this.state.packageName) throw new Error('Choose a debuggable app process first.');
    return this.state.packageName;
  }

  private requireFile(): string {
    if (!this.state.selectedFile) throw new Error('No SharedPreferences file found for this app.');
    return this.state.selectedFile;
  }

  private requireLocal(): string {
    if (!this.state.localPath || !fs.existsSync(this.state.localPath)) {
      throw new Error('Pull a preferences file from the device before editing.');
    }
    return this.state.localPath;
  }
}

export function parseSharedPreferencesXml(xml: string): PrefEntry[] {
  const mapMatch = xml.match(/<map\b[^>]*>([\s\S]*?)<\/map>/i);
  const body = mapMatch ? mapMatch[1] : xml;
  const entries: PrefEntry[] = [];
  const tagPattern = /<(string|boolean|int|long|float|set)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body))) {
    const type = match[1].toLowerCase() as PrefValueType;
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const name = attributeValue(attrs, 'name');
    if (!name) continue;
    if (type === 'string') {
      entries.push({ key: name, type, value: decodeXml(inner) });
      continue;
    }
    if (type === 'set') {
      const values: string[] = [];
      const stringPattern = /<string\b[^>]*>([\s\S]*?)<\/string>/gi;
      let stringMatch: RegExpExecArray | null;
      while ((stringMatch = stringPattern.exec(inner))) values.push(decodeXml(stringMatch[1] ?? ''));
      entries.push({ key: name, type, value: values.join('\n') });
      continue;
    }
    const raw = attributeValue(attrs, 'value') ?? '';
    entries.push({ key: name, type, value: formatPrefValue(type, normalizePrefValue(type, raw)) });
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export function serializeSharedPreferencesXml(entries: PrefEntry[]): string {
  const lines = entries.map((entry) => {
    const name = encodeXml(entry.key);
    if (entry.type === 'string') {
      return `    <string name="${name}">${encodeXml(entry.value)}</string>`;
    }
    if (entry.type === 'set') {
      const members = parseSetMembers(entry.value)
        .map((member) => `        <string>${encodeXml(member)}</string>`)
        .join('\n');
      return members
        ? `    <set name="${name}">\n${members}\n    </set>`
        : `    <set name="${name}" />`;
    }
    const value = encodeXml(formatPrefValue(entry.type, normalizePrefValue(entry.type, entry.value)));
    return `    <${entry.type} name="${name}" value="${value}" />`;
  });
  return [
    "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
    '<map>',
    ...lines,
    '</map>',
    '',
  ].join('\n');
}

export function normalizePrefValue(type: PrefValueType, value: string): string | boolean | number | string[] {
  const trimmed = value.trim();
  switch (type) {
    case 'string':
      return value;
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
      throw new Error('Boolean preferences must be true or false.');
    }
    case 'int': {
      if (!/^-?\d+$/.test(trimmed)) throw new Error('Int preferences must be a whole number.');
      const parsed = Number(trimmed);
      if (!Number.isSafeInteger(parsed) || parsed < -2147483648 || parsed > 2147483647) {
        throw new Error('Int preferences must fit in a 32-bit signed integer.');
      }
      return parsed;
    }
    case 'long': {
      if (!/^-?\d+$/.test(trimmed)) throw new Error('Long preferences must be a whole number.');
      // Keep as string so we do not lose precision beyond JS safe integers.
      return trimmed;
    }
    case 'float': {
      if (!trimmed || Number.isNaN(Number(trimmed))) throw new Error('Float preferences must be a number.');
      return Number(trimmed);
    }
    case 'set':
      return parseSetMembers(value);
    default:
      throw new Error(`Unsupported preference type: ${type}`);
  }
}

export function formatPrefValue(type: PrefValueType, value: string | boolean | number | string[]): string {
  if (type === 'set') return (Array.isArray(value) ? value : parseSetMembers(String(value))).join('\n');
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'float') {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(number) ? `${number}.0` : String(number);
  }
  return String(value);
}

function parseSetMembers(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      // Fall through to newline / comma splitting.
    }
  }
  if (value.includes('\n')) {
    return value.split(/\r?\n/).map((item) => item.trimEnd()).filter((item, index, all) => item.length > 0 || all.length === 1);
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function attributeValue(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeXml(match[2]) : undefined;
}

function encodeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

async function listDebuggableProcesses(
  adbPath: string,
  serial: string,
  preferredPackage?: string,
  thorough = true,
): Promise<PrefProcess[]> {
  const [packagesOutput, processesOutput] = await Promise.all([
    adb(adbPath, serial, ['shell', 'pm', 'list', 'packages', '-3']).catch(() => ''),
    adb(adbPath, serial, ['shell', 'ps', '-A', '-o', 'NAME']).catch(() => ''),
  ]);
  const installed = new Set(
    packagesOutput
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^package:/, ''))
      .filter(Boolean),
  );
  if (preferredPackage) installed.add(preferredPackage);
  const running = new Set(
    processesOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== 'NAME' && !line.startsWith('[')),
  );

  const candidates = [...installed]
    .filter((name) => name.includes('.') || name === preferredPackage)
    .sort((a, b) => {
      if (preferredPackage && a === preferredPackage) return -1;
      if (preferredPackage && b === preferredPackage) return 1;
      return Number(running.has(b)) - Number(running.has(a)) || a.localeCompare(b);
    });

  const likely = candidates.filter((packageName) => packageName === preferredPackage || running.has(packageName));
  const scanCandidates = thorough ? candidates.slice(0, 80) : (likely.length ? likely.slice(0, 12) : candidates.slice(0, 12));
  const checks = await mapLimit(scanCandidates, thorough ? 8 : 6, async (packageName) => {
    const debuggable = await isDebuggable(adbPath, serial, packageName, thorough ? 8_000 : 2_500);
    if (!debuggable) return undefined;
    return {
      packageName,
      running: running.has(packageName),
      label: running.has(packageName) ? `${packageName} · running` : packageName,
    } satisfies PrefProcess;
  });
  return checks.filter((item): item is PrefProcess => Boolean(item));
}

async function isDebuggable(adbPath: string, serial: string, packageName: string, timeout: number): Promise<boolean> {
  try {
    await adb(adbPath, serial, ['shell', 'run-as', packageName, 'id'], timeout);
    return true;
  } catch {
    return false;
  }
}

async function listPreferenceFiles(adbPath: string, serial: string, packageName: string): Promise<string[]> {
  const output = await adb(adbPath, serial, ['shell', 'run-as', packageName, 'ls', 'shared_prefs']).catch(() => '');
  return unique(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name.toLowerCase().endsWith('.xml') && !name.includes('/')),
  ).sort((a, b) => a.localeCompare(b));
}

async function pullPreferencesFile(
  adbPath: string,
  serial: string,
  packageName: string,
  fileName: string,
  localPath: string,
): Promise<void> {
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  const remote = `shared_prefs/${fileName}`;
  try {
    const buffer = await adbBinary(adbPath, serial, ['exec-out', 'run-as', packageName, 'cat', remote]);
    await fsp.writeFile(localPath, buffer);
  } catch {
    await fsp.rm(localPath, { force: true });
    throw new Error(`Could not read ${remote}. Is the app debuggable and the preferences file present?`);
  }
}

async function pushPreferencesFile(
  adbPath: string,
  serial: string,
  packageName: string,
  fileName: string,
  localPath: string,
): Promise<void> {
  const remote = `shared_prefs/${fileName}`;
  await adb(adbPath, serial, ['shell', 'run-as', packageName, 'mkdir', '-p', 'shared_prefs']);
  await pipeToAdb(adbPath, serial, ['shell', 'run-as', packageName, 'sh', '-c', `cat > ${shellSingleQuote(remote)}`], localPath);
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function adb(adbPath: string, serial: string, args: string[], timeout = 20_000): Promise<string> {
  const { stdout } = await execFileAsync(adbPath, ['-s', serial, ...args], { timeout, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function adbBinary(adbPath: string, serial: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(adbPath, ['-s', serial, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => errors.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `adb exited with code ${code}`));
    });
  });
}

async function pipeToAdb(adbPath: string, serial: string, args: string[], filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(adbPath, ['-s', serial, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const errors: Buffer[] = [];
    child.stderr.on('data', (chunk) => errors.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Failed to push preferences (exit ${code})`));
    });
    fs.createReadStream(filePath).pipe(child.stdin!);
  });
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
