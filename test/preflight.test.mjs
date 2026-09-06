import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv } from '../dist/env.js';
import { scanSource } from '../dist/scan.js';
import { checkProject } from '../dist/check.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const codes = result => result.issues.map(i => i.code);
async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'env-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries({ 'src/app.ts': 'console.log(process.env.TOKEN);', '.env.example': 'TOKEN=\n', '.env': 'TOKEN=local-fixture-value\n', ...files })) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}
const run = (cwd, args = []) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

test('dotenv: BOM, CRLF, export, comments, equals signs and multiline quotes', () => {
  const result = parseEnv('\uFEFF# header\r\nexport TOKEN = "abc=#def" # note\r\nMULTI=\'first\r\nsecond\'\r\nEMPTY= # none\r\nZERO=0\r\n', 'test.env');
  assert.deepEqual(result.issues, []);
  assert.deepEqual([...result.entries], [
    ['TOKEN', { line: 2, empty: false }], ['MULTI', { line: 3, empty: false }],
    ['EMPTY', { line: 5, empty: true }], ['ZERO', { line: 6, empty: false }]
  ]);
  assert.equal(JSON.stringify([...result.entries]).includes('abc'), false);
});

test('dotenv: reports duplicate key at its second line and discards values', () => {
  const r = parseEnv('TOKEN=secret-first\nTOKEN=secret-second\n', 'test.env');
  assert.deepEqual(r.issues, [{ code: 'DUPLICATE_KEY', severity: 'error', file: 'test.env', line: 2, key: 'TOKEN' }]);
  assert.equal(JSON.stringify(r).includes('secret'), false);
});

test('dotenv: rejects malformed lines and unterminated strings without echoing secrets', () => {
  for (const text of ['invalid-secret-line', 'BAD-KEY=secret', 'TOKEN="secret" junk', 'TOKEN="secret\nNEXT=hidden']) {
    const r = parseEnv(text, 'test.env');
    assert.ok(codes(r).includes('INVALID_ENV'));
    assert.equal(JSON.stringify(r).includes('secret'), false);
  }
});

test('dotenv: whitespace-only values are empty; quoted # is content', () => {
  const r = parseEnv('A="  "\nB=\'\n\'\nC="#"\nD=false\n', 'test.env');
  assert.deepEqual([...r.entries.values()].map(e => e.empty), [true, true, false, false]);
});

test('AST: dot, static bracket, template key, optional chaining and destructuring', () => {
  const r = scanSource('process.env.A; process.env["B"]; process.env[`C`]; process?.env?.D; const { E: renamed, F = "fallback" } = process.env;', 'app.ts');
  assert.deepEqual(r.references.map(r => r.key), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(r.issues, []);
});

test('AST: ignores comments and string text; checks expressions inside template strings', () => {
  const r = scanSource('// process.env.FAKE\nconst a = "process.env.NOT_REAL"; const b = `hello ${process.env.REAL}`;', 'app.js');
  assert.deepEqual(r.references.map(r => r.key), ['REAL']);
  assert.equal(r.references[0].line, 2);
});

test('AST: lexical shadowing does not hide unrelated global process references', () => {
  const r = scanSource('process.env.REAL; function f(process) { return process.env.FAKE; } { const process = { env: {} }; process.env.OTHER; } process.env.ALSO_REAL;', 'app.js');
  assert.deepEqual(r.references.map(r => r.key), ['REAL', 'ALSO_REAL']);
});

test('AST: recognizes imports from node:process and ignores unrelated imports', () => {
  const r = scanSource('import p from "node:process"; import { env as environment } from "process"; p.env.A; environment.B;', 'app.ts');
  assert.deepEqual(r.references.map(r => r.key), ['A', 'B']);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(scanSource('import process from "unrelated"; process.env.A;', 'app.ts').references, []);
});

test('AST: JSX and typed wrappers preserve source locations', () => {
  const r = scanSource('export const A = <div>{(process.env as Record<string,string>).TOKEN}</div>;', 'app.tsx');
  assert.deepEqual(r.references.map(r => r.key), ['TOKEN']);
  assert.deepEqual(r.issues, []);
});

test('AST: warns about computed names, object aliases, rest bindings and invalid keys', () => {
  const r = scanSource('process.env[key]; const e = process.env; const { A, ...rest } = process.env; process.env["INVALID-KEY"];', 'app.ts');
  assert.deepEqual(codes(r), ['DYNAMIC_ACCESS', 'ENV_OBJECT_USAGE', 'ENV_OBJECT_USAGE', 'UNSUPPORTED_KEY']);
  assert.deepEqual(r.references.map(r => r.key), ['A']);
});

test('AST: parse failure is explicit and never embeds source text', () => {
  const r = scanSource('const password = "secret-sentinel', 'app.ts');
  assert.ok(codes(r).includes('SOURCE_PARSE'));
  assert.equal(JSON.stringify(r).includes('secret-sentinel'), false);
});

test('three-way check succeeds for aligned source, example and actual config', async t => {
  const root = await fixture(t);
  const r = await checkProject({ cwd: root });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.summary, { filesScanned: 1, variables: 1, errors: 0, warnings: 0 });
});

test('three-way check finds an undocumented source reference even when actual value exists', async t => {
  const root = await fixture(t, { '.env.example': '# missing from documentation\n' });
  const r = await checkProject({ cwd: root });
  assert.equal(r.exitCode, 1);
  assert.deepEqual(codes(r), ['MISSING_EXAMPLE']);
  assert.equal(r.issues[0].file, 'src/app.ts');
  assert.equal(r.issues[0].key, 'TOKEN');
});

test('checks missing actual keys from both example and source; flags empty values', async t => {
  const root = await fixture(t, { 'src/app.ts': 'process.env.TOKEN; process.env.NEW;', '.env.example': 'TOKEN=\nDEPLOY_ONLY=\n', '.env': 'TOKEN=\n' });
  const r = await checkProject({ cwd: root });
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.issues.filter(i => i.code === 'MISSING_ENV').map(i => i.key).sort(), ['DEPLOY_ONLY', 'NEW']);
  assert.ok(codes(r).includes('EMPTY_ENV'));
  assert.ok(codes(r).includes('MISSING_EXAMPLE'));
});

test('optional keys still require documentation; ignored keys are exempt from agreement checks', async t => {
  const root = await fixture(t, { 'src/app.ts': 'process.env.PORT; process.env.NODE_ENV;', '.env.example': 'PORT=\n', '.env': '' });
  assert.equal((await checkProject({ cwd: root, optional: ['PORT'], ignore: ['NODE_ENV'] })).exitCode, 0);
  assert.ok(codes(await checkProject({ cwd: root, optional: ['PORT', 'NODE_ENV'] })).includes('MISSING_EXAMPLE'));
});

test('example-only works with no .env and never reads host environment values', async t => {
  const root = await fixture(t);
  await rm(path.join(root, '.env'));
  assert.equal((await checkProject({ cwd: root, exampleOnly: true })).exitCode, 0);
  assert.equal((await checkProject({ cwd: root })).exitCode, 2);
});

test('syntax errors and missing files fail as incomplete instead of a clean scan', async t => {
  const root = await fixture(t, { '.env': 'invalid-secret-line' });
  const invalid = await checkProject({ cwd: root });
  assert.equal(invalid.exitCode, 2);
  assert.equal(codes(invalid).includes('MISSING_ENV'), false);
  const missing = await checkProject({ cwd: root, sources: ['absent'] });
  assert.equal(missing.exitCode, 2);
  assert.ok(codes(missing).includes('IO_ERROR'));
  assert.ok(codes(missing).includes('NO_SOURCE'));
});

test('source traversal deduplicates roots, skips generated files and supports explicit exclusions', async t => {
  const root = await fixture(t, { 'src/node_modules/vendor.js': 'process.env.VENDOR;', 'src/dist/generated.js': 'process.env.BUILD;', 'src/ignore/fixture.js': 'process.env.FIXTURE;', 'src/types.d.ts': 'declare const a: string;' });
  const r = await checkProject({ cwd: root, sources: ['src', 'src/app.ts'], exclude: ['src/ignore'] });
  assert.equal(r.exitCode, 0);
  assert.equal(r.summary.filesScanned, 1);
});

test('source symlinks produce a warning and are not followed', { skip: process.platform === 'win32' }, async t => {
  const root = await fixture(t);
  await symlink(path.join(root, 'src'), path.join(root, 'src/loop'));
  const r = await checkProject({ cwd: root });
  assert.equal(r.summary.filesScanned, 1);
  assert.ok(codes(r).includes('SYMLINK_SKIPPED'));
});

test('CLI: stable JSON, Chinese output and no configuration values in reports', async t => {
  const root = await fixture(t, { '.env': 'TOKEN=never-echo-this-value\nTOKEN=second-secret-value\n' });
  for (const args of [['--json'], ['--lang', 'zh']]) {
    const result = run(root, args);
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes('secret-value'), false);
    assert.equal((result.stdout + result.stderr).includes('never-echo'), false);
    assert.match(result.stdout, /DUPLICATE_KEY/);
    if (args[0] === '--json') assert.equal(JSON.parse(result.stdout).schemaVersion, 1);
    else assert.match(result.stdout, /变量重复定义/);
  }
});

test('CLI: warnings are visible and --strict changes exit status', async t => {
  const root = await fixture(t, { 'src/app.ts': 'process.env.TOKEN; process.env[key];' });
  assert.equal(run(root).status, 0);
  const strict = run(root, ['--strict', '--json']);
  assert.equal(strict.status, 1);
  assert.equal(JSON.parse(strict.stdout).ok, false);
});

test('CLI: bad flags, invalid keys, incompatible modes and invalid language return exit 2', async t => {
  const root = await fixture(t);
  for (const args of [['--unknown'], ['--lang', 'fr'], ['--optional', 'BAD-KEY'], ['--example-only', '--env', '.env'], ['--src', ''], ['--src']]) {
    const result = run(root, [...args, '--json']);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.equal(JSON.parse(result.stdout).error, 'CLI_ERROR');
  }
});

test('CLI: help and version work outside a project', async t => {
  const root = await fixture(t);
  assert.match(run(root, ['--help']).stdout, /example-only/);
  assert.equal(run(root, ['--version']).stdout.trim(), '0.1.0');
});

test('scanner never executes source files', async t => {
  const root = await fixture(t, { 'src/app.js': 'throw new Error("must not execute"); process.env.TOKEN;' });
  assert.equal((await checkProject({ cwd: root })).exitCode, 0);
});
