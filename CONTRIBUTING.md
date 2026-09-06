# Contributing

Small, reproducible improvements are welcome. 中文反馈也欢迎。

## Bug reports

Include Node version, OS, command, expected/actual behavior and the smallest source/dotenv fixture that reproduces the issue. Replace real credentials with fictional values. Most reports do not need configuration values at all.

For scanner issues, distinguish a documented dynamic-access limitation from a missed supported literal reference.

## Development

1. Install Node 22+ and run `npm ci`.
2. Run `npm test` before and after your change.
3. Add a regression test for changed behavior; verify text/JSON never include values or source snippets.
4. Update both READMEs when supported patterns or options change.
5. Open a PR explaining the problem, changed behavior and validation.

Implementation: `src/env.ts` parses dotenv, `src/scan.ts` binds/scans source, `src/check.ts` traverses and compares, and `src/cli.ts` handles arguments/reporting. Tests use Node's built-in test runner.

Keep changes focused on Node.js configuration agreement. Framework loaders and cross-file aliases need concrete examples and a separate design.
