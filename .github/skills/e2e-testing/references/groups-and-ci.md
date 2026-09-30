# Groups and CI

Read when adding/renaming suites, changing selection, or diagnosing local/CI differences. [tools/e2e-tests/README.md](../../../../tools/e2e-tests/README.md) owns the contributor command guide; current configuration lives in `test-groups.js`, `jest*.js`, and the two E2E workflows.

## One selection definition

`tools/e2e-tests/test-groups.js` owns anchored full-test-name patterns, path filters, and workflow ownership. Both the local runner and audit use those rules. Suite titles are part of selection: changing a `describe` prefix can move tests even without moving files.

Most groups match name prefixes such as `^Monorepo App Bundling /`; the `monorepo` group also selects pnpm, Yarn, symlink, and generated pnpm scenarios. `server_runtime` is separate from other regressions. Accounts is selected by `accounts.test.js` path and excluded from the modern groups. Preserve the `apps/` discovery exclusion when changing path filters, since Jest CLI options replace configuration-level ignore patterns.

Use an existing named group when it fits. Add a group for a useful workload split, not for each test file. Grouping balances setup cost against long jobs; the current definitions combine several related framework/app/skeleton suites to reduce repeated CI setup. Do not duplicate these patterns in workflow YAML.

## Check assignment when selection changes

For suite/selection changes within the task, use the commands below as appropriate. During a review, use focused checks when they substantiate findings and honor explicit inspection-only constraints.

```bash
npm run test:e2e:groups
npm run test:e2e:groups:audit
npm run test:e2e:group -- react_vue --runTestsByPath react.test.js
npm run test:e2e:group -- accounts
```

The audit needs only E2E npm dependencies (`npm ci --prefix tools/e2e-tests`), not installed browsers. It registers suites in Jest's Node environment with a name pattern that runs no tests. Keep process/browser/app setup in hooks or test bodies so discovery stays side-effect free.

The audit fails for no inventory, discovery errors, unassigned tests, overlapping assignments, and empty named groups. Unmatched modern tests enter the automatic `uncategorized` fallback: the audit warns, and CI executes them in a real job. Assign new tests intentionally rather than relying on the fallback long-term. An empty fallback is allowed.

Audit counts include registered skipped tests; they measure assignment, not feature coverage or executed assertions. For example, the legacy React Creator block remains skipped even though it appears in discovery.

Paths after `--runTestsByPath` are relative to `tools/e2e-tests`. Narrow a group with file filters. Do not append `-t` or `--testNamePattern` to a group command: the installed Jest receives both patterns as an array and compiles their comma-joined value into a regex, which can leave the intended tests unselected.

For selection by name, use the direct E2E entrypoint with one pattern. Include required setup: a complete skeleton describe, or a file/group when necessary. For example, this selects the full React skeleton lifecycle:

```bash
npm run test:e2e -- --runTestsByPath skeleton.test.js -t '^Meteor Skeletons / React Skeleton /'
```

Selecting a single lifecycle phase can omit creation or an earlier cache precondition. Confirm the intended cases ran. Run groups sequentially on one machine because ports and cleanup are shared.

## Workflow behavior

- `.github/workflows/e2e-tests.yml` audits all groups (including Accounts), then obtains its matrix from `list-test-groups.js --json`. A new group with default workflow ownership joins that matrix automatically. It uses isolated Linux containers, one Jest worker per job, and a capped number of concurrent jobs.
- `.github/workflows/e2e-accounts.yml` runs `test:e2e:group -- accounts` separately. Its triggers include Accounts changes and shared E2E infrastructure, plus release-branch pushes. Check both workflows' path filters when changing shared infrastructure or adding a new source area.
- Workflows set `PLAYWRIGHT_BROWSERS_PATH` explicitly so browser-driver subprocesses find the same installation, prefer IPv4 localhost for proxies, and disable npm's automatic audit requests during repeated installs. These are infrastructure settings, not application assertions.
- On `release-*` branches, workflows set `NPM_LINK_RSPACK=false` to exercise published Rspack in helpers that honor the switch. Check direct linking in focused tests before claiming the entire suite used the published package.
- Jest can retry individual tests, and the workflow can retry a failed group. Modern CI cleans container leftovers before its group retry. Those protections do not establish that a test is isolated or reliable on the first attempt.

## Reproduce a failure

When reproduction is in scope, run the affected selection with its required lifecycle setup and without retries first. For timing/retry settings, `CI=true METEOR_E2E_TEST_RETRIES=1` enables the Jest defaults locally; some helper budgets and the TypeScript plugin exception additionally use `GITHUB_ACTIONS=true`. Set that only when reproducing those specific branches. Group membership itself never depends on these environment flags.

Use `HEADED=1`, `SLOWMO=250`, or `DEVTOOLS=1` for browser debugging. `RECORD=1` writes video and disables Jest's forced exit so recording can flush; inspect `jest-playwright.config.js` for current options. `npm run create-app:e2e -- --app react` creates a persistent manual reproduction, but does not execute the assertions and is not a substitute for the original workspace/symlink setup.

Diagnose the earliest failing stage: app creation/install, Mongo startup, Rspack compile/proxy, browser readiness, assertion, or teardown. Preserve its output. A later missing-directory error, occupied port, or browser timeout can be secondary. Fix the demonstrated cause rather than globally lengthening timeouts, enabling more retries, or skipping the behavior.
