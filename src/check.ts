import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from './env.js';
import { scanSource } from './scan.js';
import { type Entry, type Issue, type Reference, type Report } from './model.js';
export type { Report, Issue } from './model.js';

export interface CheckOptions {
  cwd?: string;
  sources?: string[];
  example?: string;
  env?: string;
  exampleOnly?: boolean;
  optional?: string[];
  ignore?: string[];
  exclude?: string[];
  strict?: boolean;
}

const skipped = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', 'vendor']);
const supported = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

export async function checkProject(options: CheckOptions = {}): Promise<Report> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const display = (p: string) => path.relative(cwd, p).split(path.sep).join('/') || '.';
  const issues: Issue[] = [];
  const files = new Set<string>();
  const excluded = (options.exclude ?? []).map(p => path.resolve(cwd, p));
  const isExcluded = (p: string) => excluded.some(e => p === e || p.startsWith(e + path.sep));
  const visited = new Set<string>();
  const walk = async (file: string, explicit = false): Promise<void> => {
    if (visited.has(file) || isExcluded(file)) return;
    visited.add(file);
    try {
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) {
        issues.push({ code: 'SYMLINK_SKIPPED', severity: 'warning', file: display(file) });
      } else if (stat.isDirectory()) {
        if (skipped.has(path.basename(file)) && !explicit) return;
        for (const entry of (await readdir(file)).sort()) await walk(path.join(file, entry));
      } else if (stat.isFile() && supported.test(file) && !/\.d\.[cm]?ts$/i.test(file)) files.add(file);
    } catch { issues.push({ code: 'IO_ERROR', severity: 'error', file: display(file) }); }
  };
  for (const src of options.sources ?? ['src']) await walk(path.resolve(cwd, src), true);
  if (!files.size) issues.push({ code: 'NO_SOURCE', severity: 'error', file: '.' });
  const references: Reference[] = [];
  let filesScanned = 0;
  for (const file of [...files].sort()) {
    try {
      const result = scanSource(await readFile(file, 'utf8'), display(file));
      references.push(...result.references);
      issues.push(...result.issues);
      filesScanned++;
    } catch { issues.push({ code: 'IO_ERROR', severity: 'error', file: display(file) }); }
  }
  const readEnv = async (name: string): Promise<Map<string, Entry> | undefined> => {
    const file = path.resolve(cwd, name);
    try {
      const result = parseEnv(await readFile(file, 'utf8'), display(file));
      issues.push(...result.issues);
      // Suppress misleading missing-key cascades if parsing failed.
      return result.issues.some(i => i.code === 'INVALID_ENV') ? undefined : result.entries;
    } catch {
      issues.push({ code: 'IO_ERROR', severity: 'error', file: display(file) });
      return undefined;
    }
  };
  const exampleName = options.example ?? '.env.example';
  const envName = options.env ?? '.env';
  const example = await readEnv(exampleName);
  const actual = options.exampleOnly ? undefined : await readEnv(envName);
  const ignored = new Set(options.ignore ?? []);
  const optional = new Set(options.optional ?? []);
  const firstReferences = new Map<string, Reference>();
  for (const ref of references) if (!ignored.has(ref.key) && !firstReferences.has(ref.key)) firstReferences.set(ref.key, ref);
  if (example) {
    for (const ref of firstReferences.values()) {
      if (!example.has(ref.key)) issues.push({ code: 'MISSING_EXAMPLE', severity: 'error', ...ref });
    }
  }
  if (actual) {
    const required = new Set([...firstReferences.keys(), ...(example?.keys() ?? [])]);
    for (const key of [...required].sort()) {
      if (ignored.has(key) || optional.has(key)) continue;
      const entry = actual.get(key);
      if (!entry) issues.push({ code: 'MISSING_ENV', severity: 'error', file: display(path.resolve(cwd, envName)), key });
      else if (entry.empty) issues.push({ code: 'EMPTY_ENV', severity: 'error', file: display(path.resolve(cwd, envName)), line: entry.line, key });
    }
  }
  issues.sort((a, b) => a.file.localeCompare(b.file, 'en') || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code, 'en') || (a.key ?? '').localeCompare(b.key ?? '', 'en'));
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const incomplete = issues.some(i => ['IO_ERROR', 'NO_SOURCE', 'SOURCE_PARSE', 'INVALID_ENV'].includes(i.code));
  const exitCode = incomplete ? 2 : errors || (options.strict && warnings) ? 1 : 0;
  return { schemaVersion: 1, ok: exitCode === 0, exitCode, summary: { filesScanned, variables: firstReferences.size, errors, warnings }, issues };
}
