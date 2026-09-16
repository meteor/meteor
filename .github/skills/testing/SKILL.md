---
name: testing
description: Use when planning, implementing, reviewing, or debugging Meteor tests and choosing the appropriate test boundary. Owns shared test-value, change-scope, assertion, and verification guidance; routes to unit, CLI self-test, package, E2E, and native workflows.
---

# Testing

Choose useful coverage and the appropriate workflow for the Meteor codebase. Keep shared expectations here; load the selected workflow for its harness and execution details.

## Test Value

Optimize for useful failure detection and maintainability. In implementation plans and tasks, read the behavior and nearby coverage before proposing tests. For each scenario, be able to explain briefly:

1. What plausible change in Meteor's code would break the contract, and what observable wrong result would the test detect?
2. Would failure indicate an owned defect rather than incidental formatting, dependency behavior, or harmless internal refactoring?
3. What distinct protection does this add beyond existing tests, at what setup, execution, and maintenance cost?

If these answers are unclear, improve or omit the proposed test. Choose representative decisions and known incidents rather than every input permutation or changed file. Reachable unusual inputs can matter for compatibility, security, and recovery even when the UI restricts them. No test quota, scoring system, or whole-suite audit is required.

## Keep Changes Within Task Scope

Implementation tasks may add or update tests, assertions, fixtures/expected output, and shared setup/helpers directly relevant to the requested behavior without separate confirmation. This applies to both new and existing tests. Read affected cases and helper consumers, preserve meaningful coverage, and explain changed expectations. Refine scenarios introduced in the task before handoff: strengthen, consolidate, or discard them according to the value gate.

Keep cleanup proportional to the task. Propose unrelated refactoring or broad pruning separately unless already requested. Before removing or moving a test, read its full setup/teardown and relevant helpers, establish its purpose, and compare nearby coverage. Preserve distinct permission, failure, and state-transition protection. Weakening assertions, introducing skips, or increasing timeouts needs concrete evidence about the intended behavior or infrastructure; never use them merely to obtain a passing run.

Inspect and preserve pre-existing uncommitted work. A dirty file does not establish ownership or permission to rewrite unrelated scenarios. If ownership is uncertain, avoid overwriting the work and make only changes clearly required by the task.

For audit/review-only requests, report findings and proposed edits without applying them unless the user also requests fixes. Focused checks may substantiate findings; honor any explicit inspection-only constraint. When implementation or fixes are already requested, proceed within that scope without another approval step.

Do not change intended product behavior merely to satisfy a test, add production APIs solely for tests, or expand a small change into a test-framework refactor.

## Choose the Test Layer

Use the smallest layer that can observe the failure. Add integration coverage when isolated assertions cannot prove that the pieces work together. Classify by the exercised boundary: self-tests run real commands in a sandbox and can cover lifecycles; package tests can use real DOM; E2E supports full app lifecycles but need only run the phases relevant to the contract.

| Behavior to protect | Where to start |
|---------------------|----------------|
| Parsing, selection, transforms, and isolated owned adapters | [Unit-testing reference](references/unit-testing.md) for meaningful cases, dependency isolation, placement, and focused Jest execution |
| CLI commands, tool state, and process orchestration | [self-testing](../self-testing/SKILL.md) for real command execution in a controlled sandbox |
| Meteor package APIs and client/server runtime behavior | [package-testing](../package-testing/SKILL.md) for package contracts, Tinytest, runtime isolation, and headless execution |
| Published npm-package behavior under `npm-packages/` | Read that package's `package.json`, README, and owning CI workflow; use its existing test script and runner |
| Real app creation, bundling, watch/rebuild, deployment, or browser/server integration | [e2e-testing](../e2e-testing/SKILL.md) for fixture selection, meaningful assertions, isolation, and CI grouping |
| Installed Cordova app and native hot-code-push behavior | [Native smoke-test guide](../../../tools/native-tests/README.md) for Maestro flows, setup, and platform selection |
| Updating the app/skeleton coverage inventory | [E2E coverage-report guidance](../e2e-testing/references/coverage-report.md) |

Avoid repeating a contract already covered at the same boundary and mode. Third-party libraries can supply integration inputs, but their internal behavior does not need a parallel Meteor test suite. Keep shared test-layer guidance here; create another specialized skill only when its workflow needs substantial distinct instructions.

Meteor `Package.onTest` registration and npm package scripts are separate workflows. For `npm-packages/`, inspect the package-local test command and its matching workflow under `.github/workflows/`, including any build prerequisites and coverage checks. Shared test expectations still apply; preserve the package's existing runner.

Preserve the failure mechanism: mocks that remove the relevant persistence, authorization, hook, watcher, or concurrent interaction also remove the evidence. For command orchestration, execute our wrapper against controlled process/filesystem boundaries and inspect arguments, exit status, outputs, and consequential forbidden effects. Multiple layers are useful when they protect different failures; avoid repeating one decision table at every layer. Fixture seeding establishes preconditions, not proof of creation or login. Static checking can cover type guarantees; runtime inputs, configuration, defaults, and failure handling may still need tests.

## Prepare the selected runner

For self-tests, package tests, and E2E app execution, first follow [checkout setup](../../../DEVELOPMENT.md#running-from-a-git-checkout): initialize required submodules while preserving local work, and run `./meteor --help` when bootstrap is needed. The checkout launcher downloads or replaces `dev_bundle` when its required version is missing or outdated. Unit-only Jest execution does not need this bootstrap.

Use the selected runner's installation instructions and the Node/npm environment in its owning workflow. Browser binaries and their operating-system libraries are separate prerequisites from npm packages. Install only what the selected workflow needs. `./meteor --get-ready` prepares a broad set of packages; it is not a required preflight for every focused test.

## Make Assertions Informative

- Assert the contract's result: values, persisted changes, visible state, or external effects. Existence, type, mount-only, and no-throw checks suffice only when availability or safe acceptance is the actual contract.
- Use discriminating fixtures: a filter needs a nonmatching candidate, isolation needs data that could leak, and precedence needs conflicting values. Strengthen a relevant case instead of adding near duplicates, preserving any distinct protection it already provides.
- Derive expected values independently of the implementation. Reviewed golden files can protect transformations; generating expected output from the current run or bypassing execution with cached output cannot prove correctness.
- For negative cases, assert the intended error category and consequential forbidden effects. Do not swallow the test's own failure assertion in a broad catch or mistake a setup/import/network error for the expected failure.
- Prefer public effects and stable project anchors. Arguments, callback payloads, ordering, text, or layout are valid assertions when they are the requirement or owned boundary; incidental call counts, labels, classes, and serialized internals usually are not.
- Reuse builders where they clarify intent, keep scenario-specific facts visible, and isolate mutable state. Use tables for distinct decisions sharing setup/assertions; one coherent lifecycle may contain several actions. Split unrelated journeys according to their failure evidence.

## Describe and Verify Regressions

Use this process across unit, self-test, package, E2E, npm-package, and native workflows. The chosen boundary determines the evidence; the same standard for red and green applies.

1. **Describe the contract.** Identify the reachable condition, triggering action, and expected observable result. Name the test around that behavior. Add a short comment only when the failure mechanism or setup choice would otherwise be unclear. Derive expectations from the intended contract.
2. **Establish a valid red signal when feasible.** Run the proposed regression test against the broken behavior, confirming that the intended case and implementation actually ran. The failure must expose the targeted defect through an assertion or an attributable runtime failure. Failures caused by unrelated setup, imports, or missing dependencies do not establish red, nor do empty selections or deliberately incorrect expectations. A crash or bounded timeout can be valid when it is the regression being protected and the test reached the relevant operation.
3. **Verify green with the same contract.** Apply the fix and rerun the same case with the same expected result and relevant setup. Keep assertions strong enough to detect the original defect. If the assertion or fixture needs correction, recheck whether the revised test still demonstrates red before claiming a red/green result.
4. **Report the evidence briefly.** Identify the selected test, the observed failure attributable to the defect, and the passing result after the fix. Distinguish executed evidence from reasoning about why an assertion should catch the defect; state unavailable infrastructure or an unverified red result.

If the fix is already present, reproduce the original behavior in an isolated copy when practical, preserving pre-existing work. A test that also passes against the broken behavior has not demonstrated the regression; investigate its setup, assertion, and chosen boundary before claiming protection. Do not manufacture a failure unrelated to the defect just to obtain red.

The order of test and implementation work may vary; apply this process to useful regression coverage within the requested scope. Reuse convincing evidence when the relevant code and setup are unchanged. Repeat red/green or expand execution only when a change or unresolved concern calls that evidence into question; follow the proportional verification guidance below.

## Verify Proportionally

For test implementation or updates, choose the affected behavior before execution and use existing runner filters. Confirm the intended cases actually ran. Run the smallest selection with its required setup; add a file, representative neighbor, group, or wider run only for a concrete shared-state/code risk, observed failure, or explicit request. Keep normal CI coverage intact.

Stop once proportionate checks cover the identified risk. Add sensitivity checks only when the assertion or harness remains doubtful. Report unavailable infrastructure, skipped checks, and untested boundaries.

When pruning, identify each removed test and its reason, explain coverage retained/lost/gained, and report focused verification and its limits. Do not add a replacement merely to keep the test count unchanged.

Documentation-only work needs document checks. Do not automatically run the full suite, contact live providers, rebuild environments, or expand the browser/platform matrix. A setup helper can warrant a disposable smoke test, using an existing harness. During a review, run only checks useful to substantiate findings and report further verification that proposed edits would need.
