# env-preflight

**Catch environment configuration gaps before deploying a Node.js application.**

[简体中文](README.zh-CN.md) · [Examples](examples) · [Validation notes](docs/validation.md) · [Contributing](CONTRIBUTING.md)

A new `process.env.DATABASE_URL` reference is easy to add and easy to forget in `.env.example`.
env-preflight compares **source references → example keys → actual configuration** and tells you which key is missing and where to look.

- TypeScript-aware scanning of JavaScript, TypeScript and JSX/TSX.
- Missing documentation, missing/empty required values and duplicate-key checks.
- English/Chinese output and versioned JSON reports.
- Example-only mode for CI without a real `.env` or credentials.
- Local file reading: no application execution, network requests, or configuration values in output.

This is the initial **0.1.0 implementation, not yet published to npm**. Install from source or a locally built package.

## Try it

Requires **Node.js 22 or newer** and npm.

```sh
git clone https://github.com/2024202411/env-preflight.git
cd env-preflight
npm ci
npm test
npm run demo
```

When reviewing unmerged code, first check out the corresponding development branch. If using a downloaded source archive, extract it and start at `cd env-preflight`.

The passing example reports one source file, three variables and zero errors. Try the deliberately broken fixture:

```sh
npm run demo:broken
```

It intentionally exits **1** and reports three errors: missing `DATABASE_URL`, duplicate `API_KEY`, and empty `API_KEY`. All committed example values are fictional; no server needs to run.

## Check your project

After `npm run build`, change to your application's directory and run:

```sh
node /path/to/env-preflight/dist/cli.js --src src --example .env.example --env .env --optional PORT --ignore NODE_ENV --lang en
```

All input paths are relative to the current directory. Quote paths containing spaces. To install a standalone command, run these in the tool's directory:

```sh
npm pack
npm install --global ./2024202411-env-preflight-0.1.0.tgz
env-preflight --help
```

Then run `env-preflight` in the project to check. The tool checks the selected file; it does not read or merge the shell's environment variables.

For CI without real secrets:

```sh
env-preflight --src src --example .env.example --example-only --strict
```

This validates source/template agreement and template syntax/duplicates. Template values may remain empty. Check actual deployment configuration separately in normal mode.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `--src PATH` | Source file/directory; repeat for multiple roots | `src` |
| `--example PATH` | Template dotenv file | `.env.example` |
| `--env PATH` | Actual dotenv file | `.env` |
| `--example-only` | Skip actual configuration; incompatible with `--env` | Off |
| `--optional A,B` | Keys allowed to be missing/empty in actual configuration; repeatable | None |
| `--ignore A,B` | Keys excluded from agreement checks; repeatable | None |
| `--exclude PATH` | Skip exact path and descendants; repeatable, no globs | None |
| `--strict` | Fail on warnings too | Off |
| `--json` | Versioned JSON report | Off |
| `--lang en\|zh` | Human-readable report language | `en` |
| `--help`, `--version` | Usage or version | — |

Optional keys still need documentation when used in source. Ignored keys are exempt from agreement checks, but neither option hides malformed lines or duplicates. Extra actual keys are allowed.

Traversal skips `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `vendor` and declaration files. Supports `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`. Source symlinks are skipped with a warning; specify the real path to scan the target. Overlapping roots are deduplicated. `.gitignore` is not interpreted; use `--exclude` for extra exclusions.

## Results

| Exit | Meaning |
| --- | --- |
| `0` | No errors; warnings may exist unless strict mode is enabled |
| `1` | Configuration findings, or warnings under `--strict` |
| `2` | Invalid arguments or incomplete scan: unreadable input, malformed dotenv, source parse error or no source files |

```sh
env-preflight --example-only --json > preflight-report.json
```

JSON contains `schemaVersion`, `ok`, `exitCode`, counts in `summary`, and `issues` with code, severity, relative file path and optional line/column/key. CLI failures return `{ "schemaVersion": 1, "ok": false, "exitCode": 2, "error": "CLI_ERROR" }`.

Report codes include `MISSING_EXAMPLE`, `MISSING_ENV`, `EMPTY_ENV`, `DUPLICATE_KEY`, `INVALID_ENV`, `DYNAMIC_ACCESS`, `ENV_OBJECT_USAGE`, `UNSUPPORTED_KEY`, `SOURCE_PARSE`, `IO_ERROR`, `NO_SOURCE`, and `SYMLINK_SKIPPED`.

Values and source snippets are omitted from text/JSON. Variable names and paths remain visible; review them before sharing a report.

## Source patterns

```ts
process.env.API_KEY;
process.env['DATABASE_URL'];
process.env[`PORT`];
process?.env?.API_KEY;
const { API_KEY: token, PORT = '3000' } = process.env;
import p from 'node:process';
p.env.API_KEY;
import { env as environment } from 'node:process';
environment.API_KEY;
```

Uses the [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) with file-local name binding. Comments/string text are ignored, and local `process` parameters/variables are not mistaken for Node's global. No project imports or `tsconfig` are loaded.

## Boundaries

- Checks presence, not credential validity, types or URL reachability.
- All source/example keys are required unless explicitly optional or ignored. JavaScript fallbacks do not automatically make a key optional. Reads and writes both count as references.
- Computed names and direct env-object alias/rest usage produce warnings. Use `--strict` to fail on these.
- Whole-program alias tracking is not implemented. CommonJS process imports, `globalThis.process`, cross-module aliases and custom wrappers can evade detection. Passing is not proof of complete configuration.
- No Vite `import.meta.env`, Cloudflare `env` bindings, Docker Compose or framework-specific env precedence in this version.
- Dotenv follows a strict subset of the [Node.js specification](https://nodejs.org/api/environment_variables.html): identifier keys, optional `export`, whitespace, comments, single/double quotes and multiline quoted values. BOM/CRLF are supported. No interpolation, command substitution, backtick quoting or escaping the matching quote delimiter. Backslash sequences are literal. Unsupported quoting fails visibly.
- Malformed env input suppresses agreement checks against that file to avoid misleading missing-key cascades.

## Development

```sh
npm ci
npm test
npm run check
npm pack --dry-run
```

Tests cover source recognition, shadowing, dotenv edge cases, three-way findings, redaction, exit status and non-execution. The included CI workflow targets Node 22/24 on Linux/Windows; [validation notes](docs/validation.md) distinguish tests actually run from planned hosted checks.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md). Licensed under [MIT](LICENSE).
