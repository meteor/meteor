# Choose fixtures and assertions

Use this reference to decide where a scenario belongs and how it can fail meaningfully. The [coverage report](../../../../dev/modern-tools/rspack/E2E_COVERAGE.md) owns the detailed feature inventory; the examples below explain design choices rather than duplicate its matrix.

## Find an existing home

All suite paths in this table are under `tools/e2e-tests/`.

| Starting point | Purpose and distinction to preserve |
|----------------|-------------------------------------|
| `react.test.js` | React/SWC integration, custom local/build paths, plugins and cache behavior, browser polyfills. The old Creator block is skipped; active creation coverage lives in `skeleton.test.js`. |
| `react-router.test.js` | Full-app mode with routing, custom Meteor packages, Babel compiler integration, config overrides, Less, and npm format compatibility. |
| `blaze.test.js`, `full-blaze.test.js`, `blaze-router.test.js` | Basic Blaze; an imports-based FlowRouter app with regular tests; and a Galvanized Iron Router app with full-app import ordering. These are intentionally different configurations. |
| `typescript.test.js`, `babel.test.js`, `coffeescript.test.js` | Language/config loading and compilation paths. TypeScript covers custom build/assets/chunks paths; Babel covers overridden module rules and mode semantics. |
| `vue.test.js`, `solid.test.js`, `svelte.test.js` | Framework compilation and runtime integration. Vue also exercises Meteor/Rspack CSS ownership. Keep third-party component behavior outside these contracts. |
| `monorepo.test.js`, `yarn-monorepo.test.js` | npm workspace lifecycle and Workbox integration; a focused Yarn Classic dependency auto-install check reusing the same fixture. Yarn does not need a copy of every npm lifecycle assertion. |
| `pnpm-monorepo.test.js`, pnpm in `skeleton.test.js` | Fixture with `autoInstallDeps: false`, linked source packages and transitive resolution versus freshly generated defaults and automatic dependency repair. One does not replace the other. |
| `symlink-monorepo.test.js` | Physical symlink preservation, resolution relative to linked locations, watch behavior, Meteor packages, and deployable assets. A dereferenced copy would bypass the contract. |
| `assets.test.js` | Package and app-private assets through development, production, tests, and built server execution. Assets must be consumed, not merely present. |
| `server-only.test.js`, `server-runtime.test.js` | Baseline lifecycle without an app client versus focused external local-directory, wrapper-global, delayed import, ESM/CJS, and Inspector regressions. |
| `tla.test.js`, `regressions/*.test.js` | Narrow failures such as startup ordering, zero executed tests, process exit/port release, concurrent build contexts, and browser package-runner startup. Reuse existing fixtures where possible. |
| `skeleton.test.js` | Actual `meteor create` output and shipped defaults. Includes PWA behavior and a TypeScript checker diagnostic probe beyond baseline smoke checks. |
| `accounts.test.js` | Real Accounts browser/server flows, persistence modes, callbacks, methods/publications, middleware, and local substitutes for external services. |
| `add-from.test.js`, `example.test.js` | CLI source acquisition, option handling, and loading the result. Consider self-tests or unit tests for isolated CLI logic. |
| `npm-shrinkwrap-transitives.test.js`, `rspack-audit.test.js` | Packaging contracts: nested transitive dependencies and packed consumer dependency behavior. The audit test deliberately uses a registry-dependent consumer install; it is not a model for ordinary app tests. |

## Match evidence to the claim

### UI interactions and state transitions

Choose a coherent interaction sequence that exposes the intended failure. Make the initial state distinguish what should change, what should remain, and what should stop participating. Assert the resulting state and any required continuity. Check subsequent use when the transition could leave the application unable to respond correctly. Require element identity only when continuity or preserved state is part of the contract.

Wait for completion attributable to the current action. When final visible state can conceal a consequential intermediate failure, collect only the additional observations needed to detect it. Observation must preserve normal scheduling and dependencies. Assert consistency or forbidden effects without freezing incidental execution order.

Select configuration variants per failure mechanism. Each additional variant should expose a distinct integration risk; neighboring scenarios need not share the same matrix. Confirm the intended runtime path was exercised. When implementation selection is part of the regression, establish that the application loaded the intended code before interpreting a pass as evidence.

### Watch and HMR

The bundler helper appends code and waits for its marker. This establishes that edited code executes, but a full-page reload can do that too. `pnpm-monorepo.test.js` sets a value on `window` before the edit and checks it survives after the new code executes. Use that pattern when preservation of the browser instance is the contract. Do not call `page.reload()` to make an HMR assertion pass.

Mutation location matters: editing the app entry cannot prove that the watcher observes a pnpm-linked workspace package. Mutate the actual linked source, then verify its effect on the relevant client/server. Preserve the distinction between development HMR and production rebuild/hot-code-push behavior; Blaze's current integration intentionally lacks HMR.

### Test execution and full-app mode

`runMeteorTests({ checkTestResults: true })` checks the process exit code. It does not prove any particular test ran. `tla.test.js` requires the app-test marker and `1 passing`, rejects `0 passing`, and checks startup ordering. Use a named test/marker or an appropriate nonzero result when discovery, import ordering, or async startup is the regression.

`blaze-router.test.js` combines generated wrapper import-order checks with rendered Blaze content and actual client app-test execution. Wrapper text is useful because ordering is the bug; it is insufficient alone to prove the client boots. Regular `meteor test` and `--full-app` use different entry contexts. Preserve coverage for both when both are affected.

### Build artifacts and deployment

`meteor run --production` still runs through the development tool. `meteor build` file checks prove packaging shape. Running `node main.js` from the produced bundle proves it can execute outside that tool. Use `afterRunBuiltApp` for runtime assertions when the shared lifecycle applies; use `afterBuild` for manifest/file contracts or special boot requirements.

For assets, assert fetched bytes or `Assets.getTextAsync` results. For pnpm dependencies, execute an operation requiring the transitive imports. Avoid counting unused `package.json` entries as compatibility coverage. A static import followed by an explicit startup marker can be sufficient when loading itself is the contract; a live API or algorithm test is unnecessary.

### Cache and mode boundaries

`react.test.js` observes an unplugin transform during initialization, then plugin creation on a cached run. Requiring the transform to rerun on every cached start would contradict valid caching. Reproduce the relevant cold/warm transition explicitly instead of clearing the cache until a test passes.

`regressions/concurrent-modes.test.js` checks that development, normal-test, and full-app-test outputs coexist. Reuse that approach for context-isolation bugs rather than running a large framework matrix sequentially, which cannot expose concurrent interference. `babel.test.js` separately checks `NODE_ENV` compilation and Meteor command flags; do not assume these concepts are interchangeable.

### PWA behavior

The PWA skeleton test waits for the skeleton's own registration to control the page and survive reload. Registering the worker from the test would mask broken application registration. Its production offline check stops the server before reloading, exercising the worker's own network requests. Its content-negotiation regression first populates the navigation cache, then verifies a same-URL data request gets JSON rather than cached HTML.

These protect Meteor's generated app and worker. `monorepo.test.js` deliberately registers a generated Workbox worker to exercise that integration's output, caching, and rebuild stability. The same helper is not appropriate for proving that the PWA skeleton registers itself. Path-prefixed PWA coverage is production-only in the current suite; do not describe it as development coverage.

### Type checking

Successful transpilation or an error-free log cannot establish that a checker is active. `assertTsgoTypeChecker` in `skeleton.test.js` inserts a type error, waits for a new `TS2322` diagnostic, and removes the probe in `finally`. The separate TypeScript fixture removes its resource-intensive `TsCheckerRspackPlugin` on GitHub Actions. Do not report that plugin as exercised there.

### Accounts and third-party boundaries

Use `helpers/accounts-helpers.js` for startup, harness readiness, server resets, callbacks, email capture, and user state. The shared scenarios intentionally run against localStorage and HttpOnly cookie modes because persistence/resume paths differ. Express and alternative configuration scenarios have separate app setups.

Seed state through the local harness, then exercise the client/HTTP flow under test. Seeding a user or injecting a token is not evidence that signup or login works; exercise those operations when they are the contract. Reset the relevant server and browser state between attempts. Callback and reactive-state regressions may need the sequence of intermediate observations, not just a final logged-in user.

The fixture captures email and supplies fake OAuth credentials/provider requests. This tests Meteor's account linking, callback, and wrapper behavior without requiring live providers. It does not establish that a provider's website, email delivery, or remote API works. Keep new external-service substitutes at that boundary; do not stub out the Meteor operation the test claims to verify.

## Avoid false confidence

- Tie a negative assertion to a completed positive event. `waitForMeteorOutput(..., { negate: true })` inspects currently collected output; it is not a guarantee that an error cannot appear later.
- For repeated operations, capture `outputLines.length` before the trigger and pass it as `startIndex`, or use a distinct marker, so an earlier success cannot satisfy the new wait.
- Read flags and callbacks before assigning phases in the report. Shared helpers, handwritten tests, and skeletons do not all execute the same lifecycle.
- Keep platform exclusions and missing-prerequisite skips visible. The symlink suite skips Windows; built-app callbacks can be skipped when Mongo is unavailable. A discovered test name is not proof of execution.
- Prefer one assertion of the observable contract over many checks of incidental filenames, logs, or internal layout. Assert internals when they are the regression itself, as with wrapper ordering or isolated output directories.
