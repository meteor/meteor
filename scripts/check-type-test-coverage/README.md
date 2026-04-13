# check-type-test-coverage

> ⚠️ **Status: Proof of Concept** — This project currently lives inside the Meteor monorepo as a script, but it is being designed as a standalone npm package. **Before this branch is merged it will be extracted into its own npm package** and consumed from there. Treat the contents of this directory as a temporary home.

Report which exported `.d.ts` declarations are covered by a sibling `*.test-d.ts` file.

It walks a directory, pairs every `*.test-d.ts` with its matching `*.d.ts`, parses both, and tells you which exported types/values from the declaration file are exercised by a type-level assertion in the test file.

## Requirements

- Node.js `>= 22` (uses the built-in `node:test` runner and `parseArgs`)

## Install

While this is still part of the monorepo:

```bash
cd scripts/check-type-test-coverage
npm install
```

Once extracted to npm (planned), it will be installable as:

```bash
npm install --save-dev check-type-test-coverage
```

## Usage

```bash
check-type-test-coverage <dir> [options]
```

### Options

| Flag          | Default | Description                                                               |
| ------------- | ------- | ------------------------------------------------------------------------- |
| `--min <n>`   | `100`   | Minimum overall coverage required to pass (0–100).                        |
| `--json`      | `false` | Emit machine-readable JSON instead of the human-readable report.          |
| `--verbose`   | `false` | Show all unrecognized assertions and extra diagnostics.                   |
| `-h, --help`  | —       | Show usage.                                                               |

### Exit codes

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `0`  | Coverage `>= --min`.                          |
| `1`  | Coverage below `--min`.                       |
| `2`  | Usage error (missing/invalid arguments).      |

### Examples

Check a packages directory and require full coverage:

```bash
check-type-test-coverage ./packages
```

Allow partial coverage (useful while ramping up):

```bash
check-type-test-coverage ./packages --min 80
```

Emit JSON for downstream tooling:

```bash
check-type-test-coverage ./packages --json > coverage.json
```

## How it works

1. Walks `<dir>` and finds every `*.test-d.ts`.
2. Pairs each test file with its sibling `*.d.ts` (files without a sibling are reported as **orphans**).
3. Parses both files via the TypeScript compiler API to:
   - Collect every exported declaration from the `.d.ts`.
   - Collect every type-level assertion from the `.test-d.ts`.
4. Reports the percentage of declarations referenced by at least one assertion.

## Scripts

```bash
npm test            # run the test suite
npm run test:coverage  # run tests with 100% coverage gate
```

## Project layout

```
.
├── index.js           # CLI entry point
├── src/
│   ├── lib.js         # walk + evaluate pipeline
│   ├── tsAnalyze.js   # TS AST analysis (declarations + assertions)
│   ├── files.js       # filesystem traversal / pairing
│   ├── report.js      # human + aggregate report rendering
│   └── utils.js
└── test/              # node:test suite + fixtures
```

## Roadmap

- [ ] Extract to its own repository / npm package before merge.
- [ ] Publish under a stable name and pin in this repo as a dev dependency.
