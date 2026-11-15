# E2E Test Coverage Report

Read when updating or auditing [E2E_COVERAGE.md](../../../../dev/modern-tools/rspack/E2E_COVERAGE.md), the shared report of app and skeleton integration coverage. Paths below are relative to `tools/e2e-tests/` unless stated otherwise.

The report covers app/skeleton integrations and related regressions; it is not
a complete inventory of Accounts and CLI scenarios. Updating the report does not
authorize changes to the tests it describes. For a requested read-only audit,
report inaccuracies and proposed corrections before applying them.

## When to Update

| Trigger | Action |
|---------|--------|
| New app added to `apps/` | Add a subsection under **Apps** with a coverage table |
| New skeleton added to `skeleton.test.js` | Add a row to the **Skeletons** table |
| New npm package imported for compatibility testing | Add an entry under **NPM Package Compatibility** with the package name, file, and reason |
| A new assertion adds distinct protection or changes the covered phases | Update the corresponding coverage row, or add one for the new contract |
| New feature tested across multiple apps | Add a row to the **Feature Coverage Matrix** |
| App or skeleton removed | Remove its entries from all sections |

## Report Structure

The report has five sections, in this order:

1. **Test Lifecycle** — shared fixture and skeleton phases, default assertions, and exceptions (including built-app prerequisites)
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
| `test-helpers.js`, `helpers.js`, `assertions.js` | Which checks run by default, callback phases, option semantics, and prerequisite-dependent skips |
| Related focused suites (including `regressions/`) | Additional assertions against the fixture that are not part of its normal lifecycle |

Trace each claimed feature to an executed assertion or an import/runtime operation
required for an asserted success. A dependency declaration, fixture name, or group
audit count alone is not coverage. Record `skip` declarations, platform/CI
exceptions, and missing-prerequisite skips accurately. If prose and code disagree,
correct the report from the implementation; do not invent assertions to justify it.

## Writing Guidelines

- Keep descriptions short — one line per table row
- Use consistent phase names: Init, Run, Prod, Test, Test once, Build, Reset, All. Explain creation checks in the skeleton entry. Use All only when the behavior is exercised across that suite's applicable phases.
- For npm packages, always state the **reason** (what module format issue it validates)
- Don't duplicate info between the per-app table and the feature matrix — the app table has detail, the matrix has the cross-reference
- For environment variables, inspect which phases receive them; use `All (env prefix)` only when it applies to all relevant phases.
- Distinguish build-file assertions from executing the built bundle, and source rebuilds from HMR preserving the page. Do not claim live external-provider coverage for a locally stubbed integration.
