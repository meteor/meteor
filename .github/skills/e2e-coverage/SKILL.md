---
name: e2e-coverage
description: Use when adding, modifying, or reviewing E2E test apps/skeletons to keep the test coverage report up to date.
---

# E2E Test Coverage Report

Guidelines for maintaining `dev/modern-tools/rspack/E2E_COVERAGE.md` — a single-page report of what every E2E app and skeleton tests.

## When to Update

| Trigger | Action |
|---------|--------|
| New app added to `apps/` | Add a subsection under **Apps** with a coverage table |
| New skeleton added to `skeleton.test.js` | Add a row to the **Skeletons** table |
| New npm package imported for compatibility testing | Add an entry under **NPM Package Compatibility** with the package name, file, and reason |
| New custom assertion added to a test file | Add a row to that app's coverage table |
| New feature tested across multiple apps | Add a row to the **Feature Coverage Matrix** |
| App or skeleton removed | Remove its entries from all sections |

## Report Structure

The report has five sections, in this order:

1. **Test Lifecycle** — the phases every app/skeleton goes through (init, run, prod, test, test once, build) and what default assertions apply
2. **Apps** — one subsection per `apps/<name>/` with a short description and a `| What is covered | Phase |` table
3. **Skeletons** — single table with one row per skeleton (`| Skeleton | Port | Language | Extra coverage |`)
4. **NPM Package Compatibility** — grouped by app, each entry has the package name, file path, and why it's included (ESM-only, native bindings, subpath exports, etc.)
5. **Feature Coverage Matrix** — cross-reference table (`| Feature | Apps | Skeletons |`) showing where each capability is tested

## How to Gather Information

For each app or skeleton, check these sources:

| Source | What to look for |
|--------|-----------------|
| `<name>.test.js` | Test helper used, options (`env`, `configFile`, `buildDir`, `testFullApp`, `checkBundleFilePaths`), all `customAssertions` callbacks and what they assert |
| `skeleton.test.js` | The `testMeteorSkeleton({ skeletonName: '<name>' })` block for that skeleton |
| `apps/<name>/server/main.js` | npm imports with comments explaining why (ESM-only, native bindings, etc.) |
| `apps/<name>/imports/` | Shared code with special imports (`node:` protocol, JSX packages) |
| `apps/<name>/rspack.config.*` | Custom config features (`compileWithRspack`, `compileWithMeteor`, `disablePlugins`, custom rules) |
| `apps/<name>/package.json` | Dependencies that exist solely for compatibility testing |

## Writing Guidelines

- Keep descriptions short — one line per table row
- Use the phase names from the lifecycle table: Init, Run, Prod, Test, Build, All
- For npm packages, always state the **reason** (what module format issue it validates)
- Don't duplicate info between the per-app table and the feature matrix — the app table has detail, the matrix has the cross-reference
- When an env var is set in a test file, note it as `All (env prefix)` in the phase column
