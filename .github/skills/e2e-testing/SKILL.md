---
name: e2e-testing
description: Use when designing, adding, reviewing, or debugging Meteor E2E tests in tools/e2e-tests, or maintaining their app/skeleton coverage report. Covers fixture selection, meaningful assertions, lifecycle helpers, isolation, CI grouping, and coverage documentation. Use testing for shared test-value and change-scope rules and choosing another test layer.
---

# E2E Testing

Protect Meteor behavior across real CLI, build, server, and browser boundaries with the smallest useful scenario. Paths in prose are relative to the repository root.

## Decide what needs coverage

Apply the [testing skill's value gate and scope guidance](../testing/SKILL.md#test-value) when planning and implementing E2E work. Update relevant new or existing tests, fixtures, and helpers within the requested implementation scope, preserving meaningful coverage and explaining changed expectations. Review-only requests produce findings rather than edits unless fixes are also requested; unrelated cleanup remains a separate proposal.

For a scenario that earns E2E coverage, identify:

- The Meteor behavior that can break, its trigger, and the observable failure.
- The existing test or helper closest to that behavior, and the additional failure E2E can detect beyond lower-level coverage.
- The fixture and command mode needed to expose the failure.

Use [testing](../testing/SKILL.md) if a unit test, Tinytest, CLI self-test, or native smoke test can prove the contract more directly. Choose E2E when a plausible failure could escape those tests because application assembly, configuration, or runtime interactions matter. Its added value is confidence that the selected packages, compiler, bundler, server, and browser work together along the relevant path. Keep detailed algorithm cases at the owning layer and choose a representative integration journey. Rendering real DOM alone does not justify E2E: package tests can render DOM too. Existing placement alone is not a reason to add every related case to E2E.

The [self-test sandbox](../self-testing/SKILL.md) also runs real commands and can exercise apps and browsers. Choose between harnesses by the contract and existing coverage. This E2E harness supports full application lifecycles; an individual scenario should exercise only the phases needed to expose its failure. Temporary fixtures and controlled external services are compatible with meaningful E2E coverage when the claimed integration remains real.

Start with [E2E_COVERAGE.md](../../../dev/modern-tools/rspack/E2E_COVERAGE.md), then read the matching suite, fixture, and helper implementation. The report is the shared app/skeleton inventory; executable assertions determine what is actually covered. It does not inventory every Accounts or CLI scenario. Check skipped tests, CI conditionals, and prerequisite-dependent checks before claiming coverage.

## Choose the smallest useful change

Prefer an additive assertion in an existing compatible app/mode. When a scenario needs different preconditions or independent cleanup, reuse the app in a focused case with options or small programmatic source/configuration changes to its temporary copy. A new regression does not by itself require a new fixture or another full lifecycle run.

| Need | Preferred shape |
|------|-----------------|
| An additional assertion for an existing compatible app/mode | Extend its `customAssertions` callback, preserving the existing contract |
| A generated app's defaults or creation path | Extend `skeleton.test.js` with `testMeteorSkeleton` |
| A source/configuration variant or focused regression | Reuse an existing app's temporary copy, apply the minimal setup or transition, and run only the relevant modes with existing helpers |
| A distinct app purpose, dependency graph, framework, or workspace topology that existing fixtures cannot express clearly | Add a focused fixture; use `testMeteorRspackBundler` when lifecycle coverage is needed |
| Accounts behavior across browser, DDP, storage, or HTTP | Add or update a relevant case in `accounts.test.js`; reuse or adjust Accounts helpers and inspect affected consumers |

Keep shared fixture additions aligned with the app's existing purpose. Prefer a dedicated fixture when reuse would require substantial rewrites, obscure the failure mechanism, or compromise existing coverage. See [temporary app variants](references/harness.md#temporary-app-variants) for mutation timing and isolation.

Read [coverage design](references/coverage-design.md) when choosing a fixture, assessing duplication, or deciding what to assert. Keep alternative configurations separate when combining them would remove the original scenario: `full-blaze` regular tests and `blaze-router` full-app tests protect different contracts.

Do not multiply every feature across every framework, package manager, and command. Add a dimension when Meteor takes a different path or an observed regression requires it. Reuse established lifecycle coverage without repeating its default assertions. A new fixture adds dependency installation, compilation, browser, and maintenance costs.

Third-party packages are useful inputs for Meteor integration tests: module formats, compilation, asset handling, and runtime interoperation. Exercise the smallest operation that proves that boundary. Do not reproduce a dependency's own algorithm or API test suite. Explain why each compatibility dependency is present.

## Implement with the existing harness

Read [harness and isolation](references/harness.md) before adding a suite or changing setup, hooks, mutations, or process handling. Follow the closest *relevant* test, checking its assumptions against the current helpers.

- Put runner suites in `tools/e2e-tests/**/*.test.js`, outside `apps/`. Fixture-local tests are executed by Meteor's test driver, not discovered by the outer Jest runner.
- Use Jest's `describe`/`test`/`expect` and the Playwright globals from `jest-playwright-preset`. This is not an `@playwright/test` project.
- Keep test dependencies in the isolated `tools/e2e-tests` environment and app dependencies in the fixture. Root dependencies participate in building the shipped Meteor tool.
- Choose a group-compatible suite name and preserve lifecycle setup when selecting tests.

Assert the claimed behavior, not just successful startup. For example, preserve browser state across a source edit to prove HMR; inspect the actual test execution marker to reject zero-test success; boot a built bundle to prove deployment runtime behavior. Read the design reference for these and other established examples.

For UI behavior, drive the relevant browser interaction and assert resulting DOM or visible state. Check continued use when a transition could produce the right immediate result while leaving the application in a broken state. Observe intermediate behavior only when it exposes a consequential failure hidden by the final result, and keep that observation from changing the behavior under test. CLI, packaging, and server contracts may instead require process, filesystem, or HTTP evidence.

Prefer readiness tied to a DOM value, output marker, HTTP result, or process exit over fixed sleeps. Restore mutations and release owned resources even on failure. Retries must not turn leaked state or an already-applied mutation into a passing test.

## Run and review

Read [groups and CI](references/groups-and-ci.md) when adding/renaming suites, changing the runner, or reproducing CI failures. Commands below run from the repository root:

```bash
npm run install:e2e                         # First-time dependencies and Chromium
npm run test:e2e:groups                     # Current group names and workflow owners
npm run test:e2e:groups:audit               # Registration/group assignment only
npm run test:e2e:group -- monorepo          # Entire affected group
npm run test:e2e:group -- react_vue --runTestsByPath react.test.js
```

For implementation or test updates, select the smallest affected scenario with its necessary lifecycle setup, and confirm it ran. Expand to the file/group or representative helper consumers only for a concrete interaction risk. Check group assignment when names or selection change; do not rerun the audit for unrelated documentation edits. Documentation-only edits need link and command validation, not app builds. During a review, use focused checks when needed to substantiate findings; honor explicit inspection-only constraints.

Use the [shared regression process](../testing/SKILL.md#describe-and-verify-regressions) to establish red/green evidence in the selected application mode. Keep the relevant lifecycle preconditions and assertions consistent between runs. Do not count successful discovery, a skipped callback, or a retry-only pass as evidence that the behavior works reliably.

Before finishing, check:

- Would the test fail for the intended Meteor regression? Does an existing assertion already prove the same contract in the same mode?
- Does it observe runtime behavior where required, with readiness and cleanup appropriate to that behavior?
- Does its intended group select it, and do the executed assertions match the claimed coverage?

## Maintain the coverage report

Read [coverage-report guidance](references/coverage-report.md) when app/skeleton coverage changes or the report itself needs updating. Keep the actual assertions, phases, and limitations in the existing inventory. A new assertion needs a new report row only when it adds a distinct contract; updating an existing row may be sufficient. For scenarios outside the report's scope, keep their purpose clear in the suite.

Report the new protection, commands run, and any skipped or unverified behavior. When pruning within the requested scope, identify each removed test and its reason, coverage retained or changed, and the verification limits.
