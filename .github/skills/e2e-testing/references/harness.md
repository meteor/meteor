# Harness and isolation

Read when implementing a suite or changing lifecycle hooks. The current implementations in [test-helpers.js](../../../../tools/e2e-tests/test-helpers.js), [helpers.js](../../../../tools/e2e-tests/helpers.js), and [assertions.js](../../../../tools/e2e-tests/assertions.js) are the API reference; check their signatures before using an option.

## Select the lifecycle

| Helper | What it owns |
|--------|--------------|
| `testMeteorRspackBundler(options)` | Copies `apps/<appName>` into a temporary directory, installs dependencies, adds/links Rspack, initializes, then registers dev/rebuild, prod/rebuild, test/watch, test-once, build/boot, and reset cases. Optional bundle-visualizer case. |
| `testMeteorSkeleton(options)` | Creates a real app with `meteor create --<skeletonName>`, then registers dev, prod, test-once, build/boot, and reset cases. It does not automatically add the fixture helper's source-mutation/watch tests. |
| `testMeteorBundler(options)` | A simpler fixture startup smoke test. It does not add Rspack or provide the full Rspack lifecycle. |
| `setupMeteorApp`, `runMeteorApp`, `runMeteorTests`, `buildMeteorApp`, `runMeteorCommand` | Building blocks for focused regressions. The suite owns phase selection, process handles, fixture mutations, and teardown. |

The generators return a function passed to `describe`. Extend the relevant options block or reuse the helper for a new scenario to avoid duplicating the lifecycle. When changing shared options or helpers, inspect affected cases and preserve their distinct coverage:

```js
describe('Pnpm Monorepo App Bundling /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'pnpm-monorepo',
    port: 3134,
    isMonorepo: true,
    monorepoAppPath: 'apps/app',
    packageManager: 'pnpm',
    configFile: 'rspack.config.cjs',
    filePaths: {
      client: 'packages/ui/src/client.ts',
      server: 'apps/app/server/main.js',
      test: 'apps/app/tests/main.test.js',
    },
    customAssertions: {
      // Add assertions at the phase that exposes the new behavior.
    },
  }));
});
```

This illustrates the existing fixture's topology, not a second suite to add verbatim. Supply `customAssertions: {}` even when empty: the fixture helper currently reads `customAssertions.afterCreate` directly.

## Temporary app variants

For a focused regression, `setupMeteorApp` can copy an existing app and the test can write the minimal source or configuration needed to trigger the defect. Make runtime mutations in that disposable copy, preserving the checked-in fixture. Keep the changes easy to inspect; when replacing text, verify that the intended target was present so fixture drift cannot silently remove the trigger.

Apply initial configuration before the operation that consumes it. For a watch/rebuild regression, establish the running baseline, edit the actual watched source, and observe the resulting behavior. Avoid manually restarting or reloading when that would bypass the transition being tested. App mutations establish inputs; the regression assertion must observe Meteor's response and follow the [shared red/green process](../../testing/SKILL.md#describe-and-verify-regressions).

Recreate the relevant preconditions for independent cases and retries. Restore mutations before another case reuses the app, or dispose of an independently owned copy. Follow [state and resource cleanup](#restore-state-and-own-resources); temporary app reuse does not make arbitrary mutations automatically isolated.

## Use the right phase

| Callback | Useful for |
|----------|------------|
| `afterCreate` | Fixture configuration before the first Rspack run; generated app defaults after creation for skeletons |
| `afterInit` | Fixture-only first-run installation, generated configuration, cold-cache behavior |
| `afterRun`, `afterRunProduction` | Behavior once the respective application mode is ready |
| `afterRunRebuildClient`, `afterRunRebuildServer` | Fixture watch/HMR assertions after the helper observes edited code; production counterparts are `afterRunProductionRebuildClient/Server` |
| `afterTest`, `afterTestRebuild` | Fixture test/watch integration; `testFullApp: true` selects full-app mode |
| `afterTestOnce` | Actual test execution and process completion |
| `afterBuild` | Bundle structure/content; provides `buildOutputDir` |
| `afterRunBuiltApp` | Runtime of the built bundle; reached only when built-app boot runs |
| `afterReset` | Removal of generated state while preserving required source/dependencies |

Skeletons expose the creation, run, production, test-once, build/boot, and reset callbacks, not the fixture-only init/rebuild callbacks. Their creation is itself a Jest test, and later phases require it to finish. Run the whole skeleton lifecycle when filtering.

The fixture helper already checks mode-specific generated entries, basic rendering/styles, rebuild markers, test exit status, bundle structure, and reset cleanup. Its Rspack script-tag check expects the development tag to exist in dev and be absent in production. Inspect the relevant phase before adding duplicate checks.

## Paths, dependencies, and options

- `tempDir` is the copied fixture/workspace root. In fixture helpers, `filePaths` are relative to that root; configuration/build paths are relative to the Meteor app directory. For a monorepo, derive `appDir` using `monorepoAppPath` (default `app`), not by assuming it equals `tempDir`. Skeleton callbacks supply both paths; pnpm skeletons use `meteorAppPath: 'apps/app'`.
- `setupMeteorApp` normally dereferences symlinks. Set `preserveFixtureSymlinks: true` when the symlink itself is the input, and verify fixture integrity before interpreting resolution results.
- Choose `packageManager` to match the workspace. pnpm/Yarn installs happen at the workspace root. Preserve the root lockfile and avoid accidentally creating a nested npm lockfile. Reuse `assertRspackWorkspaceInstall` for that contract.
- Lifecycle helpers link `npm-packages/meteor-rspack` by default and prepare its dependencies for a cold checkout. The `linkLocalRspack` wrapper in `test-helpers.js` respects `NPM_LINK_RSPACK=false`. Import the wrapper when that switch should apply; direct `scripts/link-rspack.js` calls in some focused suites link unconditionally.
- Use per-phase `env` options supported by the selected helper. Fixture callbacks distinguish `meteorTest` and `meteorTestOnce`; skeleton test-once uses `meteorTest`. Built-app execution accepts `env.builtApp`. Read how the phase merges options rather than assuming all paths forward the same environment.
- `skipClient` suppresses the fixture helper's app-client checks; `skipTestClient` disables the Mocha browser test driver. Neither means “skip all testing.” Bare/server-only fixtures have explicit exceptions; do not copy them to suppress an unexplained failure.
- `testBuiltApp` defaults to true, but the common boot check warns and skips if neither bundled MongoDB nor `MONGO_URL` is available. A runtime regression needs that prerequisite or an explicit suitable boot path. File existence alone does not replace it.
- Keep browsers aligned with the E2E environment's installed Playwright version. Generated apps run their own test-driver subprocesses; the helper pins their Playwright dependency to reuse the installed browser.

## Readiness and failure evidence

Use `runMeteorApp` output readiness and HTTP checks, then wait for the actual app condition. A listening server does not imply the browser bundle has compiled or the framework has hydrated. `assertMeteorApp` includes the Rspack bundle probe; a 404 is allowed for modes without that dev-server path, so still assert the intended page or runtime value.

Use bounded waits (`waitForMeteorOutput`, `assertFileExist`, `assertConsoleEval`, `page.waitForSelector`, `page.waitForFunction`) appropriate to the signal. For a new asynchronous browser event, attach the listener before triggering it and remove it in cleanup. Use a synchronous predicate with `page.waitForFunction`; where a browser check needs awaited I/O, follow the bounded async polling pattern in the PWA skeleton test.

Pass the process to output waits where supported so an unexpected exit produces useful diagnostics. Startup helpers support a Mongo watchdog and `failOnOutput`; configure them for the process under test rather than increasing every timeout. Setup hooks have separate budgets from individual tests because dependency installation and compilation are costly.

For expected failures, assert the intended exit/error within a bound and retain output. A timeout caused by missing infrastructure is not proof of the desired failure path.

## Restore state and own resources

Fixture lifecycle tests reuse an initialized app across phases. The helper snapshots only the paths listed in `filePaths`, restores those after each test, resets the page to `about:blank`, and cleans up processes. Custom edits outside that list need their own `try/finally` or teardown. Skeleton callbacks must restore their own temporary mutations.

Retry cache cleanup covers a fixed set of default paths in `clearBuildArtifacts`; custom `buildDir`, external `METEOR_LOCAL_DIR`, or extra generated state may need scoped cleanup. Do not erase a warm-cache precondition if caching is the behavior under test. Recreate the required transition on each attempt.

Use `killMeteorProcess`, `killProcessByPort`, and `cleanupTempDir` in the established teardown structure. Track processes as soon as they are spawned so timeouts can release them. For lower-level commands, retain returned handles even for creation/build steps that normally exit. Stop a built app and its Mongo instance in `finally`; close any additional browser/context and remove custom listeners/timers.

Account for app, sidecar Mongo (`port + 1`), Rspack, and optional Inspector ports when running processes concurrently. The normal Jest configuration uses one worker and groups reuse fixed ports. Process cleanup helpers can affect other tests on those ports, so run local groups sequentially.

`resetPlaywrightPage` navigates away; it does not clear cookies, localStorage, or service workers. Tests involving these must arrange suitable origin/context isolation or clear their own state. Follow the Accounts reset harness and the PWA setup for the relevant behavior rather than treating navigation as a fresh browser.

Retries are off locally by default. When changing mutation/cleanup behavior, `METEOR_E2E_TEST_RETRIES=1` with `E2E_FORCE_FLAKY_TEST='<test-name substring>'` can deliberately fail the first attempt after its body to exercise cleanup. Use this diagnostic for a concrete isolation concern, not as an extra required run for every test edit.
