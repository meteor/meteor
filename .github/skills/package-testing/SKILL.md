---
name: package-testing
description: Use when designing, adding, reviewing, or debugging Meteor package tests registered through Package.onTest and Tinytest. Covers runtime boundaries, client/server placement, asynchronous completion, test helpers, focused headless execution, and CI coverage limits. Use testing for shared test-value and scope guidance.
---

# Package Testing

Protect owned package contracts in the Meteor runtime they depend on. Paths in prose are relative to the repository root.

## Choose the boundary

Apply the [shared testing guidance](../testing/SKILL.md) first. Package tests can exercise public APIs, reactivity, persistence, connections, and real DOM with the necessary package dependencies loaded. They may cover small decisions or substantial integrations; the runner name alone does not determine their scope.

Use the [unit-testing reference](../testing/references/unit-testing.md) when the same failure can be observed without the Meteor runtime. Use [self-testing](../self-testing/SKILL.md) for CLI/tool orchestration. Add [E2E coverage](../e2e-testing/SKILL.md) when application assembly, configuration, or a user journey introduces a distinct failure that package tests cannot establish. Browser execution or DOM assertions alone do not require an E2E app.

## Define useful evidence

- Assert the package contract through meaningful results, state transitions, or effects. Keep focused algorithm cases here when this is their owning layer; an E2E journey need not repeat the decision table.
- Preserve the relevant runtime boundary. Mocking away a database operation, reactive dependency, or connection removes evidence about that interaction. Load only the dependencies needed to preserve it.
- Place assertions on the side that owns the behavior. Running similar code on both client and server is useful when their implementations or guarantees differ; it does not establish communication between them.
- For a client/server contract, observe the transfer and its resulting state. For reactive behavior, check completion of the relevant update and continued behavior when the transition could break future updates.
- Use discriminating state and independent expected results. DOM, callback traces, or internal hooks are useful when they expose the intended contract; avoid making incidental implementation order part of the requirement.

## Register and isolate the test

Read the package's `package.js`, nearby tests, and relevant helpers before editing. Register dependencies and test files in `Package.onTest`; use the existing `api.addFiles` or `api.mainModule` arrangement and explicit client/server placement where required. A file under `packages/` is not automatically executed by the unit runner.

Use [Tinytest](../../../packages/tinytest/tinytest.js) and the helpers exported by [test-helpers/package.js](../../../packages/test-helpers/package.js). Choose helpers for the evidence needed:

| Need | Existing helpers |
|------|------------------|
| Async stages and expected callbacks | `testAsyncMulti` in `async_multi.js` |
| Bounded polling for observable completion | `waitUntil`, `simplePoll`, `pollUntil` in `wait.js` |
| DOM rendering and interaction | `renderToDiv`, `canonicalizeHtml`, `clickElement`, `simulateEvent` |
| Connection setup and message observation | `makeTestConnection`, `createTestConnectionPromise`, and connection capture helpers |
| Repeatable generated inputs or callback observations | `SeededRandom`, `withCallbackLogger` |

These helper files live in `packages/test-helpers/`; inspect signatures and architecture exports before use. A helper's availability is not a reason to add permutations or message-level assertions unrelated to the contract.

Use `Tinytest.add` for synchronous cases and `Tinytest.addAsync` for asynchronous completion through a returned promise or completion callback. Choose one clear completion path; include all assertions and cleanup before it finishes. Avoid detached callbacks that assert after completion or an early callback that wins over unfinished promise work. In `testAsyncMulti`, register expected callbacks during the stage before it completes; do not create new expectations from a later callback.

Isolate mutable data between cases. Stop computations, observers, subscriptions, and connections; remove owned test data and DOM; restore clocks, stubs, and environment changes even on failure. Wait for the relevant effect rather than assuming a timer or an unrelated reactive flush establishes completion.

## Run the affected package and case

Use the checkout from the repository root. Replace `package-name` and `test name fragment` below:

```bash
# Interactive browser runner
./meteor test-packages package-name --filter 'test name fragment'

# Headless browser runner with terminal results
TINYTEST_FILTER='test name fragment' ./packages/test-in-console/run.sh "package-name"
```

Tinytest's filter is a case-sensitive substring of the registered test name. The CLI's `--filter` sets the same filter as `TINYTEST_FILTER`; do not treat it as a regex. The shell wrapper uses the environment variable to pass the filter. Omitting the filter runs the selected package; omitting the package broadens selection.

For regression work, use the [shared regression process](../testing/SKILL.md#describe-and-verify-regressions) with the required runtime and client/server side preserved between red and green.

`./meteor test-packages` starts an app and waits for a browser. Use [test-in-console/run.sh](../../../packages/test-in-console/run.sh) for automated terminal results; it starts the app and drives the browser with Puppeteer. Check its dependencies and environment before invoking it: it can install Puppeteer when unavailable. Confirm the expected case ran on the intended client/server side; server startup, an empty selection, and a page load are not passing assertions.

## Match the affected CI configuration

Read the owning workflow before reproducing a CI failure:

| Workflow | Selection and configuration |
|----------|-----------------------------|
| [test-packages.yml](../../workflows/test-packages.yml) | Runs the package suite with `METEOR_REACTIVITY_ORDER` set to `changeStreams,polling` or `oplog,polling`; `TEST_PACKAGES_EXCLUDE` currently excludes `stylus` |
| [test-ddp-transport.yml](../../workflows/test-ddp-transport.yml) | Runs `ddp-server` with `DDP_TRANSPORT=sockjs` or `DDP_TRANSPORT=uws` |

Apply the affected job's environment to the filtered command above. Reactivity preferences can allow fallback; verify the backend actually exercised when that is the contract. Check workflow triggers, exclusions, and browser prerequisites before claiming CI coverage. Reproduce another configuration only for a distinct risk, and report the selection, actual results, and any untested boundary.
