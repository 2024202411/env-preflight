# Validation record

Recorded on 2026-09-05 for the initial 0.1.0 implementation.

## Local behavior tests

Environment: Linux, Node.js **24.19.0**, TypeScript **5.9.3**.

`npm test` completed with **24 passing tests, zero failures**. Coverage includes:

- dotenv BOM, CRLF, export prefixes, comments, multiline quotes, duplicate keys and malformed input;
- AST recognition, source locations, destructuring, imports, comments/strings and lexical shadowing;
- source/example/actual agreement, optional/ignored keys and example-only mode;
- unreadable paths, empty scans, exclusions, overlapping roots and source symlinks;
- JSON/Chinese reports, exit status, invalid arguments, value redaction and non-execution of application code.

These are behavior tests, not a claim of exhaustive scanner coverage. See the README's supported patterns and boundaries.

## Package installation

Built the npm tarball, checked that its contents match the compiled source and documents, then installed it into a fresh directory with development dependencies omitted and lifecycle scripts disabled.

The installed `env-preflight` executable produced:

| Trial | Source files / variables | Result |
| --- | --- | --- |
| Fictional valid config | 1 / 3 | Exit 0, zero findings |
| Fictional broken config | 1 / 3 | Exit 1: missing DATABASE_URL, duplicate API_KEY, empty API_KEY |
| Example-only, strict | 1 / 3 | Exit 0, no actual env file needed |

This verifies that the packaged executable can run independently of the development checkout. It does not indicate npm publication.

## Public-source trial

Read [2024202411/nodejs-argo/index.js](https://github.com/2024202411/nodejs-argo/blob/main/index.js), blob SHA `82e5a5f0b320c63cf05461dde11efa9e9152d785`. The application was **not executed**, and its source was not copied into this repository.

The scanner recognized **17 distinct keys** with no parse warnings: `UPLOAD_URL`, `PROJECT_URL`, `AUTO_ACCESS`, `FILE_PATH`, `SUB_PATH`, `SERVER_PORT`, `PORT`, `UUID`, `NEZHA_SERVER`, `NEZHA_PORT`, `NEZHA_KEY`, `ARGO_DOMAIN`, `ARGO_AUTH`, `ARGO_PORT`, `CFIP`, `CFPORT`, `NAME`.

For a controlled integration trial, generated a temporary template from those names and ran example-only mode:

1. Complete synthetic template: exit 0.
2. Removed `UPLOAD_URL` from that template: exit 1, one `MISSING_EXAMPLE` finding at `index.js:10:20`.

The omission was **deliberately injected into a test template**. This is not evidence of a bug in the original project, verification of its actual deployment configuration, or third-party adoption of env-preflight. Its configuration includes conditional/fallback behavior that requires manual optionality decisions for normal-mode checks.

## Not yet verified

- Hosted GitHub Actions: workflow included; results will be recorded after the development branch runs CI.
- Node 22 and Windows: included in the planned CI matrix, not yet run locally.
- No npm publication, GitHub Release, external-user feedback or download statistics are claimed.
