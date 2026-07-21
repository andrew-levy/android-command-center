import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

export type DbProcess = { packageName: string; label: string; running: boolean };
export type DbQueryResult = {
  columns: string[];
  rows: (string | null)[][];
  changes?: number;
  message?: string;
  truncated?: boolean;
};
export type DatabaseInspectorState = {
  serial?: string;
  packageName?: string;
  processes: DbProcess[];
  databases: string[];
  selectedDatabase?: string;
  tables: string[];
  selectedTable?: string;
  query: string;
  result?: DbQueryResult;
  dirty: boolean;
  localPath?: string;
  message?: string;
  error?: string;
};

const ROW_LIMIT = 200;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function emptyDatabaseState(): DatabaseInspectorState {
  return { processes: [], databases: [], tables: [], query: '', dirty: false };
}

export class DatabaseInspector {
  private state: DatabaseInspectorState = emptyDatabaseState();
  private workRoot?: string;
  private preparedStorageRoot?: string;

  constructor(
    private readonly adb: () => string,
    private readonly sqlite: () => string,
    private readonly storageRoot: () => string | undefined,
  ) {}

  snapshot(): DatabaseInspectorState {
    return { ...this.state };
  }

  async dispose(): Promise<void> {
    await this.discardLocal();
  }

  async refreshProcesses(
    serial: string,
    preferredPackage?: string,
    thorough = true,
    loadSelectedDatabase = true,
  ): Promise<DatabaseInspectorState> {
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
    if (this.state.packageName) await this.refreshDatabases(loadSelectedDatabase);
    else {
      this.state.databases = [];
      this.state.selectedDatabase = undefined;
      this.state.tables = [];
      this.state.selectedTable = undefined;
      this.state.result = undefined;
      this.state.localPath = undefined;
      this.state.dirty = false;
    }
    return this.snapshot();
  }

  async selectPackage(packageName: string): Promise<DatabaseInspectorState> {
    if (!packageName || packageName === this.state.packageName) return this.snapshot();
    await this.discardLocal();
    this.state.packageName = packageName;
    this.state.selectedDatabase = undefined;
    this.state.selectedTable = undefined;
    this.state.result = undefined;
    this.state.query = '';
    this.state.message = undefined;
    this.state.error = undefined;
    await this.refreshDatabases();
    return this.snapshot();
  }

  async selectDatabase(database: string): Promise<DatabaseInspectorState> {
    if (!database) return this.snapshot();
    if (this.state.dirty) await this.push();
    this.state.selectedDatabase = database;
    this.state.error = undefined;
    await this.pullSelected();
    await this.loadTables();
    if (this.state.selectedTable) await this.openTable(this.state.selectedTable);
    else this.state.result = undefined;
    return this.snapshot();
  }

  async selectTable(table: string): Promise<DatabaseInspectorState> {
    if (!table) return this.snapshot();
    this.state.selectedTable = table;
    this.state.query = `SELECT rowid AS __rowid__, * FROM ${quoteIdent(table)} LIMIT ${ROW_LIMIT};`;
    await this.openTable(table);
    return this.snapshot();
  }

  async runQuery(sql: string): Promise<DatabaseInspectorState> {
    const query = sql.trim();
    if (!query) throw new Error('Enter a SQL statement to run.');
    await this.ensureLocal();
    this.state.query = query;
    this.state.error = undefined;
    const mutating = isMutatingSql(query);
    const result = await runSqlite(this.sqlite(), this.requireLocal(), query, !mutating);
    this.state.result = result;
    if (mutating) {
      this.state.dirty = true;
      await this.push();
      await this.loadTables();
      this.state.message = `Applied on device · ${result.message ?? countLabel(result.changes ?? 0, 'change')}`;
    } else {
      this.state.message = result.truncated ? `Showing first ${ROW_LIMIT} rows` : result.message;
    }
    return this.snapshot();
  }

  async updateCell(table: string, rowid: string, column: string, value: string | null): Promise<DatabaseInspectorState> {
    if (!table || !rowid || !column || column === '__rowid__') throw new Error('Pick an editable cell first.');
    await this.ensureLocal();
    const sql = `UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ${sqlLiteral(value)} WHERE rowid = ${Number(rowid)};`;
    const result = await runSqlite(this.sqlite(), this.requireLocal(), sql, false);
    this.state.dirty = true;
    this.state.query = sql;
    await this.push();
    await this.openTable(table);
    this.state.message = `Updated ${column} · pushed to device (${countLabel(result.changes ?? 0, 'row')})`;
    return this.snapshot();
  }

  async refresh(): Promise<DatabaseInspectorState> {
    if (!this.state.serial || !this.state.packageName) return this.snapshot();
    if (this.state.dirty) await this.push();
    await this.refreshDatabases();
    if (this.state.selectedDatabase) {
      await this.pullSelected();
      await this.loadTables();
      if (this.state.selectedTable) await this.openTable(this.state.selectedTable);
    }
    this.state.message = 'Reloaded from device';
    return this.snapshot();
  }

  async push(): Promise<DatabaseInspectorState> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const database = this.requireDatabase();
    const local = this.requireLocal();
    await checkpointDatabase(this.sqlite(), local);
    await removeSiblingWal(local);
    await pushDatabase(this.adb(), serial, packageName, database, local);
    await prepareLocalDatabase(this.sqlite(), local);
    this.state.dirty = false;
    this.state.message = `Pushed ${database} to ${packageName}`;
    return this.snapshot();
  }

  private async refreshDatabases(loadSelectedDatabase = true): Promise<void> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const databases = await listDatabases(this.adb(), serial, packageName);
    this.state.databases = databases;
    if (!databases.includes(this.state.selectedDatabase ?? '')) {
      this.state.selectedDatabase = databases[0];
      this.state.selectedTable = undefined;
      this.state.tables = [];
      this.state.result = undefined;
      this.state.localPath = undefined;
      this.state.dirty = false;
    }
    if (this.state.selectedDatabase && loadSelectedDatabase) {
      await this.pullSelected();
      await this.loadTables();
      if (!this.state.selectedTable && this.state.tables[0]) {
        this.state.selectedTable = this.state.tables[0];
        this.state.query = `SELECT rowid AS __rowid__, * FROM ${quoteIdent(this.state.tables[0])} LIMIT ${ROW_LIMIT};`;
        await this.openTable(this.state.tables[0]);
      }
    }
  }

  private async pullSelected(): Promise<void> {
    const serial = this.requireSerial();
    const packageName = this.requirePackage();
    const database = this.requireDatabase();
    const local = await this.localFileFor(packageName, database);
    await pullDatabase(this.adb(), serial, packageName, database, local);
    await prepareLocalDatabase(this.sqlite(), local);
    this.state.localPath = local;
    this.state.dirty = false;
  }

  private async loadTables(): Promise<void> {
    const local = this.requireLocal();
    const listed = await runSqlite(
      this.sqlite(),
      local,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
      true,
    );
    this.state.tables = listed.rows.map((row) => row[0]).filter((name): name is string => Boolean(name));
    if (this.state.selectedTable && !this.state.tables.includes(this.state.selectedTable)) {
      this.state.selectedTable = this.state.tables[0];
    }
  }

  private async openTable(table: string): Promise<void> {
    const local = this.requireLocal();
    this.state.selectedTable = table;
    const result = await runSqlite(
      this.sqlite(),
      local,
      `SELECT rowid AS __rowid__, * FROM ${quoteIdent(table)} LIMIT ${ROW_LIMIT};`,
      true,
    );
    this.state.result = result;
    if (!this.state.query.trim()) {
      this.state.query = `SELECT rowid AS __rowid__, * FROM ${quoteIdent(table)} LIMIT ${ROW_LIMIT};`;
    }
  }

  private async ensureLocal(): Promise<void> {
    if (this.state.localPath && fs.existsSync(this.state.localPath)) return;
    await this.pullSelected();
  }

  private async discardLocal(): Promise<void> {
    if (!this.workRoot) return;
    await fsp.rm(this.workRoot, { recursive: true, force: true }).catch(() => undefined);
    this.workRoot = undefined;
    this.state.localPath = undefined;
    this.state.dirty = false;
  }

  private async localFileFor(packageName: string, database: string): Promise<string> {
    const root = this.storageRoot() ?? path.join(os.tmpdir(), 'android-command-center');
    const databasesRoot = path.join(root, 'databases');
    if (this.preparedStorageRoot !== databasesRoot) {
      // Database copies are disposable. Clear leftovers from a previous host
      // session before creating the first working copy for this one.
      await fsp.rm(databasesRoot, { recursive: true, force: true }).catch(() => undefined);
      this.preparedStorageRoot = databasesRoot;
    }
    this.workRoot = path.join(databasesRoot, safePathSegment(this.requireSerial()), safePathSegment(packageName));
    await fsp.mkdir(this.workRoot, { recursive: true });
    return path.join(this.workRoot, database);
  }

  private requireSerial(): string {
    if (!this.state.serial) throw new Error('Connect or start an Android device first.');
    return this.state.serial;
  }

  private requirePackage(): string {
    if (!this.state.packageName) throw new Error('Choose a debuggable app process first.');
    return this.state.packageName;
  }

  private requireDatabase(): string {
    if (!this.state.selectedDatabase) throw new Error('No SQLite database found for this app.');
    return this.state.selectedDatabase;
  }

  private requireLocal(): string {
    if (!this.state.localPath || !fs.existsSync(this.state.localPath)) {
      throw new Error('Pull a database from the device before querying.');
    }
    return this.state.localPath;
  }
}

async function listDebuggableProcesses(
  adbPath: string,
  serial: string,
  preferredPackage?: string,
  thorough = true,
): Promise<DbProcess[]> {
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
    } satisfies DbProcess;
  });
  return checks.filter((item): item is DbProcess => Boolean(item));
}

async function isDebuggable(adbPath: string, serial: string, packageName: string, timeout: number): Promise<boolean> {
  try {
    await adb(adbPath, serial, ['shell', 'run-as', packageName, 'id'], timeout);
    return true;
  } catch {
    return false;
  }
}

async function listDatabases(adbPath: string, serial: string, packageName: string): Promise<string[]> {
  const output = await adb(adbPath, serial, ['shell', 'run-as', packageName, 'ls', 'databases']).catch(() => '');
  const candidates = unique(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name && !name.endsWith('-wal') && !name.endsWith('-shm') && !name.endsWith('-journal') && !name.includes('/')),
  );
  const checks = await mapLimit(candidates, 8, async (name) => {
    try {
      const header = await adbBinary(adbPath, serial, [
        'exec-out',
        'run-as',
        packageName,
        'head',
        '-c',
        String(SQLITE_HEADER.length),
        `databases/${name}`,
      ]);
      return hasSqliteHeader(header) ? name : undefined;
    } catch {
      // `ls databases` may include directories and arbitrary app files. Neither
      // can be queried by sqlite3, so omit them instead of failing the scan.
      return undefined;
    }
  });
  return checks.filter((name): name is string => Boolean(name));
}

async function pullDatabase(
  adbPath: string,
  serial: string,
  packageName: string,
  database: string,
  localPath: string,
): Promise<void> {
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  for (const suffix of ['', '-wal']) {
    const remote = `databases/${database}${suffix}`;
    const target = `${localPath}${suffix}`;
    try {
      const buffer = await adbBinary(adbPath, serial, ['exec-out', 'run-as', packageName, 'cat', remote]);
      if (!suffix && !hasSqliteHeader(buffer)) {
        await fsp.rm(target, { force: true });
        throw new Error(`${database} is not a readable SQLite database.`);
      }
      if (!buffer.length && suffix) {
        await fsp.rm(target, { force: true });
        continue;
      }
      await fsp.writeFile(target, buffer);
    } catch {
      await fsp.rm(target, { force: true });
      if (!suffix) throw new Error(`Could not read ${remote}. Is the app debuggable and the database present?`);
    }
  }
}

async function pushDatabase(
  adbPath: string,
  serial: string,
  packageName: string,
  database: string,
  localPath: string,
): Promise<void> {
  const remote = `databases/${database}`;
  await adb(adbPath, serial, ['shell', 'run-as', packageName, 'mkdir', '-p', 'databases']);
  await pipeToAdb(adbPath, serial, ['shell', 'run-as', packageName, 'sh', '-c', `cat > ${shellSingleQuote(remote)}`], localPath);
  // Drop stale WAL so the app does not replay old pages over our push.
  await adb(adbPath, serial, ['shell', 'run-as', packageName, 'rm', '-f', `${remote}-wal`, `${remote}-shm`]).catch(() => undefined);
}

async function runSqlite(sqlitePath: string, databasePath: string, sql: string, expectRows: boolean): Promise<DbQueryResult> {
  if (expectRows || looksLikeQuery(sql)) {
    try {
      const { stdout } = await execFileAsync(sqlitePath, ['-json', '-readonly', databasePath, withLimit(sql)], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 20_000,
      });
      return parseJsonRows(stdout, sql);
    } catch (error) {
      throw sqliteError(error, sqlitePath);
    }
  }

  const changesSql = `BEGIN; ${sql.replace(/;?\s*$/, '')}; SELECT changes() AS changes; COMMIT;`;
  try {
    const { stdout } = await execFileAsync(sqlitePath, ['-json', databasePath, changesSql], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 20_000,
    });
    const parsed = parseJsonRows(stdout, sql);
    const changes = Number(parsed.rows[0]?.[0] ?? 0);
    return { columns: [], rows: [], changes, message: countLabel(changes, 'change') };
  } catch (error) {
    if (isMissingExecutable(error)) throw sqliteError(error, sqlitePath);
    // Fallback for statements that cannot run inside an explicit transaction batch.
    try {
      await execFileAsync(sqlitePath, [databasePath, sql], { maxBuffer: 2 * 1024 * 1024, timeout: 20_000 });
      return { columns: [], rows: [], changes: 0, message: 'Statement executed' };
    } catch (fallbackError) {
      throw sqliteError(fallbackError, sqlitePath);
    }
  }
}

export async function prepareLocalDatabase(sqlitePath: string, databasePath: string): Promise<void> {
  // A device's shared-memory file contains process-local locks and cannot be
  // reused safely. Rebuild it locally, preserving the WAL long enough to merge
  // any committed pages into the main database.
  await fsp.rm(`${databasePath}-shm`, { force: true });
  await fsp.writeFile(`${databasePath}-wal`, Buffer.alloc(0), { flag: 'a' });
  await checkpointDatabase(sqlitePath, databasePath);
}

async function checkpointDatabase(sqlitePath: string, databasePath: string): Promise<void> {
  try {
    await execFileAsync(sqlitePath, [databasePath, 'PRAGMA wal_checkpoint(TRUNCATE);'], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 20_000,
    });
  } catch (error) {
    throw sqliteError(error, sqlitePath);
  }
}

function sqliteError(error: unknown, sqlitePath: string): Error {
  if (isMissingExecutable(error)) {
    return new Error(`SQLite executable not found: ${sqlitePath}. Install SQLite 3 or set androidCli.sqliteExecutable.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function isMissingExecutable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'ENOENT' || /\bENOENT\b|not found|not recognized/i.test(message);
}

function parseJsonRows(stdout: string, sql: string): DbQueryResult {
  const trimmed = stdout.trim();
  if (!trimmed) return { columns: [], rows: [], message: 'No rows' };
  let rows: Record<string, unknown>[];
  try {
    rows = JSON.parse(trimmed) as Record<string, unknown>[];
  } catch {
    return { columns: ['output'], rows: [[trimmed]], message: 'Raw output' };
  }
  if (!Array.isArray(rows) || !rows.length) return { columns: [], rows: [], message: 'No rows' };
  const columns = Object.keys(rows[0]);
  const values = rows.map((row) => columns.map((column) => {
    const value = row[column];
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : String(value);
  }));
  return {
    columns,
    rows: values,
    truncated: /limit\s+\d+/i.test(sql) ? undefined : values.length >= ROW_LIMIT,
    message: countLabel(values.length, 'row'),
  };
}

export function withLimit(sql: string): string {
  if (/^\s*(select|with)\b/i.test(sql) && !/\blimit\s+\d+/i.test(sql)) {
    return `${sql.replace(/;?\s*$/, '')} LIMIT ${ROW_LIMIT};`;
  }
  return sql;
}

function looksLikeQuery(sql: string): boolean {
  return /^\s*(select|with|pragma\s+table_info|pragma\s+database_list)\b/i.test(sql);
}

export function isMutatingSql(sql: string): boolean {
  return /^\s*(insert|update|delete|replace|create|drop|alter|attach|detach|reindex|vacuum|analyze)\b/i.test(sql);
}

export function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

export function sqlLiteral(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replaceAll("'", "''")}'`;
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

function hasSqliteHeader(buffer: Buffer): boolean {
  return buffer.length >= SQLITE_HEADER.length
    && buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

async function removeSiblingWal(databasePath: string): Promise<void> {
  await Promise.all([
    fsp.rm(`${databasePath}-wal`, { force: true }),
    fsp.rm(`${databasePath}-shm`, { force: true }),
  ]);
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
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Failed to push database (exit ${code})`));
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
