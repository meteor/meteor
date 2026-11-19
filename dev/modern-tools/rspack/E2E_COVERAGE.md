# E2E Test Coverage

> To update this report, follow the [coverage-report guidance](/.github/skills/e2e-testing/references/coverage-report.md) in the [E2E testing skill](/.github/skills/e2e-testing/SKILL.md).

End-to-end tests using Jest + Playwright that verify Meteor apps with the Rspack bundler across frameworks, build modes, and features.

Test infrastructure lives in `tools/e2e-tests/`, with app fixtures in `tools/e2e-tests/apps/` and matching test files at `tools/e2e-tests/<name>.test.js`.

## Test Lifecycle

The Rspack fixture helper covers the phases below. The skeleton helper covers
creation, Run, Prod, Test once, Build, and Reset; it does not automatically run
the fixture helper's watch/rebuild cases. Focused regression suites select their
own phases. Check each suite's options and assertions for exceptions.

| Phase | What it does |
|-------|-------------|
| **Init** | Copies app, installs deps, adds rspack, generates config |
| **Run (dev)** | `meteor run` — asserts build artifacts, app loads, client/server hot rebuild |
| **Run (prod)** | `meteor run --production` — same checks in production mode |
| **Test** | `meteor test` — runs the selected test engine and verifies test rebuild |
| **Test once** | `meteor test --once` — runs the selected engine to completion and checks exit code |
| **Build** | `meteor build` — verifies bundle structure (main.js, programs/server, web.browser, web.browser.legacy); shared helpers also boot the built app by default when Mongo is available |
| **Reset** | `meteor reset` — clears rspack build artifacts, caches, asset/chunk context dirs, and `.meteor/local` subdirectories |

The fixture helper checks mode-specific build artifacts and, when client checks
are enabled, the page title and body styles. The `__rspack__` development script
tag must be present in Run and absent in Prod. Skeletons check rendering/styles
according to their options. Shared built-app boot checks can be disabled with
`testBuiltApp: false` and are skipped if neither bundled MongoDB nor `MONGO_URL`
is available; those runs do not execute `afterRunBuiltApp` assertions.

### Package dependency regression

| What is covered | Test |
|-----------------|------|
| Packed `@meteorjs/rspack` consumer uses the React skeleton dependency graph, applies both `npm audit fix` and `npm audit fix --force`, retains compatible Rspack versions and valid peers, excludes the old elliptic polyfill chain, reports zero critical vulnerabilities, and builds and executes a bundle through the Rspack CLI (#14310) | `rspack-audit.test.js` |
| Fresh `meteor create --package` output completes both client and server Tinytests with the default browser driver and no browser errors, without adding a separate jQuery dependency (#14735) | `regressions/test-in-browser.test.js` |

---

## Apps

Each app lives in `apps/<name>/` and has a matching `<name>.test.js`.

### source-maps

Small TypeScript fixture for source-map correctness (#14655); focused debugging and build checks replace the default lifecycle.

| What is covered | Phase |
|----------------|-------|
| Original source paths, contents, and exact line/column mappings through an independent map consumer | Run, Build |
| Chromium breakpoints, stepping, and mapped exception frames in modern and legacy browser programs | Run |
| Lazy-loaded code and rebuilds that shift original source line numbers | Run |
| Meteor and Rspack server breakpoints, stepping, and mapped error stacks | Run |
| Debug maps for modern, legacy, and Cordova web programs, plus Rspack's emitted production maps | Build |
| Babel and SWC legacy map composition; warm Meteor caches update maps when generated JavaScript is unchanged (Rspack cache cleared) | Build (debug) |
| Debug and production bundles boot and execute eager and lazy browser code | Build |
| App paths containing spaces and Unicode; inline and external map references accepted | All |

A separate warm-Rspack-cache regression is skipped pending a fix for stale upstream maps after edits that only shift source locations; see the fixture README.

### react

Core React 19 integration with custom Meteor local directory.

| What is covered | Phase |
|----------------|-------|
| Custom `METEOR_LOCAL_DIR` (`.meteor/local-custom`) | All (env prefix) |
| Custom build dir (`_build-local-custom`) created | Run |
| `.gitignore` updated with custom local dir | Run |
| React + JSX environment detection | Run, Prod, Test, Build |
| React Compiler on React 19 through Rspack's built-in SWC transform | All |
| Automatic JSX runtime without default React imports | Run, Prod, Test, Build |
| Image assets load (generated + public + background) | Run, Prod |
| `Meteor.disablePlugins` suppresses rspack plugins | Run, Prod, Test, Build |
| Unplugin transform hook fires on first run (fresh cache) | Init |
| Unplugin factory created on cached run — #14031 regression | Run |
| Unplugin transform + buildDependencies tracking in production | Prod |
| Custom rspack config (`rspack.config.cjs`) | All |
| HMR works in dev, disabled in prod | Run, Prod |
| Rspack devserver port is released after `SIGTERM` (`regressions/port-cleanup.test.js`) | Run |
| Rapid server edits during slow startup and shutdown preserve the dev server, apply the final edit, allow a later client refresh, and can replace an app that stops answering IPC (`regressions/rapid-server-restarts.test.js`, #14755) | Run |
| `--port` with a host prefix derives a valid rspack devserver port (`regressions/host-prefixed-port.test.js`) | Run |
| Client test Node compatibility (`Buffer`, `buffer`, `crypto`, `timers/promises`) | Test |
| Cordova bundle stays modern when `meteor.modern` is unset (`regressions/cordova-modern-default.test.js`) | Build |

### react-router

Full-featured React Router app with custom packages, Less, and advanced rspack config.

| What is covered | Phase |
|----------------|-------|
| `METEOR_PACKAGE_DIRS` custom packages dir | All (env prefix) |
| `babel-plugin-react-compiler` configuration loads on first compilation | Init, Prod |
| 404 page routing (renders "Page Not Found") | Run, Prod |
| Less stylesheet support (`white-space: break-spaces`) | Run, Prod |
| `meteor.modules` config styles (`align-content: center`) | Run, Prod |
| Custom HTML meta tags (`theme-color`) | Run, Prod |
| Default + custom package loading | Run |
| `resolve.extensions` loading (`.jsx`) | Run |
| `rspack.config.override.js` custom plugin loading | Run, Test, Build |
| User-level `devServer.onListening` composed with meteor-rspack default | Run |
| React + TSX environment detection | Run, Prod, Test, Build |
| Full-app test mode (`--full-app`) | Test |
| Static assets in bundle (png, md) | Build |
| HMR works in dev, disabled in prod | Run, Prod |

Full-app test-once execution also checks that earlier dev/prod builds do not introduce uncaught client errors through stale generated HTML.

Later runs and builds may reuse compiled output, so they do not require `babel.config.js` to log another execution.

### assets

Minimal app with a local package testing asset resolution and bundling. `regressions/rspack-static-assets.test.js` boots a temporary production variant to exercise static requests. `regressions/output-cleanup.test.js` checks source preservation during production builds from ordinary, `build`, and `build-agent` parent directories.

| What is covered | Phase |
|----------------|-------|
| Local package loading (`api.addAssets`) | Run, Prod, Test, Build |
| Server-side package assets (`Assets.getTextAsync`) | Run, Prod |
| App-private folder assets (`Assets.getTextAsync`) | Run, Prod |
| Client-side package assets (`fetch('/packages/...`) | Run, Prod |
| `skipTestClient: true` (ignores client mocha tests) | Test once |
| Assets skipped by compiler source discovery (#14566) | All |
| Boot built bundle (`node main.js`) to test assets | Build |
| Source assets and other mode/local-directory contexts survive cleanup; built apps serve public assets and read private assets (#14871) | Build |
| First-build cleanup preserves symlinks at asset-context roots and inside chunk directories, including external target contents, while removing stale generated chunks | Build |
| Missing Rspack chunks/assets return uncached 404s without growing shared manifests | Build |
| Existing files and alternate URL spellings do not accumulate manifest entries | Build |
| Emitted assets and lazy chunks preserve GET/HEAD, ETag, range, and cache behavior | Build |
| Removed files, directories, and malformed/traversing paths; restored files become available again | Build |
| Client rebuild pauses and existing inline static content are preserved | Build |
| Files removed between stat and open return uncached 404s without stale response headers | Build |

### blaze

Blaze templating engine integration.

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection (`isBlazeEnabled`) | Run, Prod, Test, Build |
| HMR disabled (incompatible with Blaze) | Run, Prod |

### blaze-router

Focused Blaze and Galvanized Iron Router fixture that exercises the standard E2E lifecycle and reproduces the `meteor test --full-app` regression in [issue #14561](https://github.com/meteor/meteor/issues/14561). It keeps templates and styles in top-level client files; nested eager HTML/CSS coverage remains scoped to [PR #14637](https://github.com/meteor/meteor/pull/14637). FlowRouter Extra remains covered by the existing `full-blaze` fixture because the two routers are alternatives and should not share one runtime app.

| What is covered | Phase |
|----------------|-------|
| Shared app lifecycle, including initialization, client/server rebuilds, build, and cache reset | All |
| Full-app test mode (`--full-app`) with separate client and server test modules | Test, Test once |
| Generated test client wrapper imports the Rspack bundle after eager Blaze HTML imports | Test, Test once |
| Rspack client boot marker and rendered Blaze template | Run, Prod, Test |
| Galvanized Iron Router named route matrix registration | Run, Prod, Test, Test once |
| Shared Blaze layout and route rendering | Run, Prod, Test |
| Client-side link navigation preserves the page instance | Run, Prod, Test |
| ES-module `RouteController` registry with path, query, and hash parameters | Run, Prod, Test |
| Dynamic deep-link reload and browser history restore the controller route | Run, Prod, Test |
| Route-scoped `onBeforeAction` hook and template data context | Run, Prod, Test |
| Programmatic navigation renders the configured not-found template | Run, Prod, Test |
| Client-side app test executes instead of reporting a false zero-test success | Test once |
| Rspack client boot marker is packaged in the deployable browser program | Build |
| Concurrent development and full-app test commands preserve the development `.cjs` bundle | Run, Test |
| Normal and full-app tests use isolated `_build/test` and `_build/app-test` module directories in both startup orders | Test |
| Full-app tests build and execute the app client with no `testModule` or a server-only `testModule` | Test |

### full-blaze

Full Blaze app with an `imports/` structure and regular `meteor test` coverage. It validates FlowRouter Extra during normal application runs, but does not reproduce issue #14561 because it does not use `--full-app`; that scenario remains additive in `blaze-router`.

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection | Run, Prod, Test, Build |
| `imports/api/` test path structure | Test |
| Regular test mode (`meteor test`, without `--full-app`) | Test, Test once |
| FlowRouter Extra route renders the Blaze home template | Run, Prod |
| HMR disabled (incompatible with Blaze) | Run, Prod |

### typescript

TypeScript with SCSS, type checking, `.ts` rspack config, and `.ts` SWC config.

| What is covered | Phase |
|----------------|-------|
| TypeScript rspack config (`rspack.config.ts`) | All |
| TypeScript SWC config (`swc.config.ts`) with automatic JSX runtime | All |
| `@swc/core` type-only import for SWC config typings | All |
| Custom build dir (`build`) | All |
| Custom asset/chunk context dirs (`assets`, `chunks`) | All |
| Explicit `meteor types` command generates native package declarations before app startup | Init |
| SCSS styles support (`white-space: break-spaces`) | Run, Prod |
| TypeScript + TSX environment detection | Run, Prod, Test, Build |
| Portable build (Meteor.isDevelopment/isProduction not defined) | Run, Prod, Build |
| `Meteor.extendSwcConfig` with path aliases (`@ui/*`, `@api/*`) | All |
| `TsCheckerRspackPlugin` type checking (no errors) | Run |
| `.meteor/types` directory generated by the native core generator | Init, Run |
| Separate client/server test files | Test |
| CI: removes TsCheckerRspackPlugin (resource limits) | Init |
| Persistent cache dependency scanner parses TypeScript configs without errors | All |
| HMR works in dev, disabled in prod | Run, Prod |

### babel

Babel transpilation with custom module rules and `.mjs` rspack config.

| What is covered | Phase |
|----------------|-------|
| Custom rspack config (`rspack.config.mjs`) | All |
| Custom `NODE_ENV` compilation per phase | All (env prefix) |
| Rspack mode assertion (development/production) | Run, Prod, Test, Build |
| `Meteor.isDevelopment`/`Meteor.isProduction` defines | Run, Prod, Test, Build |
| Module rules for `.js`/`.jsx` files | Run, Prod, Test, Build |
| Module rules for `.tsx`/`.ts`/`.mts`/`.cts`/`.mjs`/`.cjs` | Run, Prod, Test, Build |
| Module rules for `.graphql`/`.gql` files | Run, Prod, Test, Build |
| Default rules negated (custom rules override) | Run, Prod, Test, Build |
| HMR works in dev, disabled in prod | Run, Prod |

### coffeescript

CoffeeScript language support.

| What is covered | Phase |
|----------------|-------|
| `.coffee` file compilation (client + server + test) | All |
| CoffeeScript-specific conditional syntax | Run, Prod |
| HMR works in dev, disabled in prod | Run, Prod |

### vue

Vue.js framework with Tailwind CSS, CSS auto-delegation, and `meteor.modules` config.

| What is covered | Phase |
|----------------|-------|
| Vue single-file components | All |
| Tailwind CSS styles (`.p-8` padding) | Run, Prod |
| CSS auto-delegation (`client/main.css` processed by Rspack, not Meteor) | All |
| `meteor.modules` config preserves `client/meteor.css` for Meteor processing | All |
| Rspack CSS + Meteor CSS coexistence in same entry folder | All |
| HMR works in dev, disabled in prod | Run, Prod |

### solid

SolidJS framework integration.

| What is covered | Phase |
|----------------|-------|
| SolidJS compilation and rendering | All |
| HMR works in dev, disabled in prod | Run, Prod |

### svelte

Svelte framework integration.

| What is covered | Phase |
|----------------|-------|
| Svelte compilation and rendering | All |
| HMR works in dev, disabled in prod | Run, Prod |

### monorepo

Monorepo structure with app in a subdirectory, exercised through the full npm
workspace lifecycle and a focused Yarn Classic initialization smoke test.

| What is covered | Phase |
|----------------|-------|
| Monorepo layout (`app/` subdirectory) | All |
| npm workspace auto-install keeps the lockfile at the root | Init |
| Yarn Classic workspace auto-install keeps the lockfile at the root | Init |
| Custom rspack config (`rspack.config.cjs`) | All |
| `rspack.config.override.cjs` custom plugin loading | Run, Test, Build |
| Static assets in bundle (png, md, icon, manifest) | Build |
| Service worker in production build (`sw.js` found in bundle tree) | Build |
| Service worker file served (`/sw.js`) | Run |
| Service worker registers, activates, controls page | Run |
| Service worker runtime caching (images) | Run |
| Service worker precaching (`/icon.png` via `additionalManifestEntries`) | Run |
| Service worker stability (`sw.js` not rewritten on rebuild) | Run |
| Service worker regenerated on restart (`sw.js` changed between runs) | Run, Prod |
| PWA manifest linked and fields validated | Run |
| Meta tags (`theme-color`) | Run |
| HMR works in dev, disabled in prod | Run, Prod |

### pnpm-monorepo

Meteor app inside a pnpm workspace monorepo, with shared code in `workspace:*` packages compiled through Rspack. Meteor app lives at `apps/app/`.

| What is covered | Phase |
|----------------|-------|
| pnpm workspace layout (`apps/` + `packages/`, Meteor app at `apps/app`) | All |
| `corepack pnpm install` at workspace root | Init |
| `workspace:*` dependency linking between local packages | All |
| `meteor.autoInstallDeps: false` (pnpm owns npm install) | All |
| Workspace package sources compiled by Rspack (`compileWithRspack`, `resolve.symlinks: false`) | All |
| Workspace packages render on client (`@example/ui`, `@example/shared`) | Run, Prod |
| Workspace packages load on server (`@example/shared`, `@example/server`) | Run, Prod |
| Compiled workspace packages available in tests | Test |
| Transitive npm dependency resolution through pnpm store (`color` tree) — client | Run, Prod |
| Transitive npm dependency resolution through pnpm store (`color` tree) — server | Run, Prod |
| Transitive npm dependency resolution through pnpm store (`color` tree) — tests | Test |
| Built app boots; workspace packages + `color` tree imported in production bundle | Build |
| HMR works in dev, disabled in prod | Run, Prod |

### workspace

Minimal Meteor app with two external npm workspaces and an internal command tarball;
Build only, without Rspack. POSIX symlinks; Windows command shims are not covered.
Covered by `workspace-bin-portability.test.js`.

| What is covered | Phase |
|----------------|-------|
| npm installs the command as a real directory and both workspaces as external symlinks | Init |
| Relative and absolute workspace `.bin` links resolve to the packaged command or copied second workspace after source removal | Build |
| Commands retain executable mode and read their package-relative JSON resources | Build |
| Links survive server runtime dependency installation | Build |
| Built server invokes both workspace commands at request time and returns `portable:cross-portable` to Chromium | Build |

### server-only

Server-only app (no client entry point).

| What is covered | Phase |
|----------------|-------|
| No client bundle (client skipped) | All |
| No client tests (test client skipped) | Test |
| Server entry loads (`server/main.js loaded`) | Run |
| Server Rspack process exits before first compilation and Meteor fails promptly | Run |
| `.meteorignore` negation re-includes a test file an earlier pattern ignored (`regressions/meteorignore-negation.test.js`, [#14742](https://github.com/meteor/meteor/issues/14742)) | Test once |
| User `METEOR_IGNORE` overrides file patterns in Rspack children with a root `test/` directory while internal root and per-entrypoint ignores stay in meteor-tool (`regressions/meteorignore-negation.test.js`) | Test once |

### legacy

Minimal app with separate modern, legacy, and Cordova entries. `legacy.test.js` runs the shared lifecycle; `regressions/architecture-entrypoints.test.js` covers the architecture configuration matrix. See the fixture README for manual use.

| What is covered | Phase |
|----------------|-------|
| Shared lifecycle: development/production client and server rebuilds, watched tests, tests once, deployed bundle, and reset | All |
| With a root `test/` data directory, separate legacy test module executes an alias configured only for `Meteor.isLegacy`, its loader, plugin constant, and async chunk, then reruns after a source edit | Test |
| Full-app tests render each browser's app entry and pass its matching test module, including the legacy-only configuration, after running development mode | Test |
| Distinct client entries in production/debug bundles, covering `client`, `modern`, `legacy`, `web.browser.legacy`, and `web.cordova` | Build |
| Legacy TypeScript imports use an alias configured only for `Meteor.isLegacy`, a custom loader, DefinePlugin constant, and asynchronous chunk | Run, Prod, Build |
| Legacy CSS and emitted SVG assets load from its Rspack output; legacy styles do not affect the modern page, including after switching from development to full-app tests | Run, Prod, Test, Build |
| Raw legacy Rspack bundle/runtime, async chunks, and Meteor-linked application output parse as ES5 after compiling modern TypeScript syntax | Build |
| Browser programs render the correct modern/legacy entry for each user agent, report `Meteor.isModern`, and exercise the legacy dependency's fallback without browser errors (Chromium) | Run, Prod, Build |
| Explicit `false` architecture entries suppress app JavaScript; omitted entries fall back to the Rspack client | Build |
| Development serves modern/legacy separately, reloads legacy after a source edit, and skips an excluded Cordova entry that cannot compile | Run |
| Empty Rspack config with shared npm imports and `nodeModules.recompile`: production programs isolate the React app and legacy stub, and both pages render browser information after booting the bundle, including helpers introduced by Meteor's legacy recompilation | Build |

### Focused server runtime regressions

`server-runtime.test.js` reuses isolated temporary copies of the
`server-only` fixture without modifying its normal lifecycle coverage.

| What is covered | Phase |
|----------------|-------|
| Absolute external `METEOR_LOCAL_DIR` outside the app | Run |
| `Assets` and `Npm` wrapper globals visible to server bundle code | Run |
| Development server bundle stays outside Meteor's linked `app.js` payload | Run |
| Delayed server import of a previously unused Meteor package | Run |
| CommonJS development server bundle under a `type: module` app | Run |
| Node Inspector attach, pauses, breakpoint, source map, and mapped stack | Run |

### Focused root-ignore regressions

`regressions/root-ignore.test.js` creates a minimal Rspack app and runs in the
`regressions` CI group.

| What is covered | Phase |
|----------------|-------|
| A root `test/` data directory does not hide generated `_build/test/` entry points ([#14514](https://github.com/meteor/meteor/issues/14514)) | Test once |
| Explicit client `testModule` and eager server discovery each execute a named test with `1 passing`, without `--full-app` | Test once |

### tla

Minimal top-level await fixture.

| What is covered | Phase |
|----------------|-------|
| `meteor run` waits for macrotask top-level await before running `Meteor.startup` hooks ([#14806](https://github.com/meteor/meteor/issues/14806)) | Run |
| `meteor test --full-app --once` waits for macrotask top-level await before running server app tests | Test once |
| Exit-code-zero `0 passing` regression is rejected by explicit `1 passing` assertion | Test once |
| Absolute project paths containing a `private` segment still discover eager tests ([#14688](https://github.com/meteor/meteor/issues/14688)) | Test once |

### rspack-rstest

Focused Rspack 2.2.7 + Rstest 0.11.6 integration fixture. Unlike framework
fixtures, this app uses a dedicated command matrix rather than the common
run/build lifecycle helper.

- Fixture: `tools/e2e-tests/apps/rspack-rstest/`
- Suite: `tools/e2e-tests/rstest.test.js`
- Focused run: `tools/e2e-tests/node_modules/.bin/jest --config tools/e2e-tests/jest.config.js --runInBand --no-watchman tools/e2e-tests/rstest.test.js`

Verified coverage:

| What is covered | Scenario |
|----------------|----------|
| `meteor test` automatically selects Rstest from the Atmosphere capability | Pure/runtime server |
| One Rspack dependency graph routes colocated tests by direct/transitive `@rstest/*` and `meteor/*` signals; global APIs and server-only Mongo use filename opt-ins without directory ownership | Smart-routing fixture lane |
| Exact routing manifests keep native Rstest selection, Meteor server/client eager entries, and user config projects disjoint; incompatible runtime markers fail before execution | Unit characterization, smart-routing fixture lane |
| One test-only `rstest` package owns runtime plus isolated `tooling/` provider; no second Atmosphere support package is required | Fixture init, automatic selection, runtime |
| Local npm mirror packs `@meteorjs/rspack` and `@meteorjs/rstest` as regular app installs without global npm state or source-tree dependency leakage | Fixture init |
| Atmosphere-owned bootstrap installs only `@meteorjs/rstest`, `@rstest/core`, and `@rstest/adapter-rspack`; fixture explicitly owns jsdom, Browser Mode, coverage, and Playwright dependencies | Fixture init, all optional lanes |
| Optional capability preflight resolves dependencies from project, never installs them, and provides npm/browser installation guidance when selected capability is missing | Unit characterization, fixture dependency policy |
| Dynamic `@meteorjs/rstest.defineConfig(context)` receives command, roots, server/client selection, and architecture data | Pure server/client |
| Native Rstest uses `@rstest/adapter-rspack` with shared SWC, aliases/fallbacks, CSS/assets, Meteor compile-time defines, and compatible `tools.rspack` composition | Pure server/client, Browser Mode, unit characterization |
| Native `rs.mock` hoisting and `rs.fn` use upstream Rstest under Meteor's projected Rspack config; supervised Rstest owns `NODE_ENV=test` instead of inheriting Meteor CLI's production environment | Pure server, process characterization |
| Inline, committed external, and committed file snapshots; mismatch exits nonzero, `--update-snapshots` rewrites the temporary snapshot, and a clean rerun passes | Pure server, snapshot update |
| `--coverage` instruments imported Rspack source and writes a parsed Istanbul JSON report | Pure server, native coverage |
| One Istanbul report merges positive counters from native Rspack, Meteor-runtime server/client, a local Atmosphere package, and a Playwright-only click-triggered dynamic import on the full-app page | Unified coverage, test once |
| Coverage remains one report with `--runtime-workers 2`; `test-packages --once --coverage` attributes the physical local package source | Runtime-worker/package coverage, test once |
| Passing and impossible thresholds preserve exit precedence; `reportOnFailure` writes the report, while coverage-disabled hosts expose neither report nor sentinel | Coverage policy, test once |
| jsdom client project | Client-only |
| Real Chromium Browser Mode with semantic locators, a real click/state update, auto-waiting assertions, and an inline DOM snapshot | Browser project, client-only |
| Meteor-runtime server resolves `meteor/*`, Atmosphere packages, and MongoDB | Server runtime |
| Tool-side provider selects Atmosphere `rstest` as its host driver adapter, so async server startup hooks settle before tests and `Meteor.isPackageTest` remains true | Runtime/package lifecycle |
| Native `describe.concurrent` and Meteor-runtime `describe.concurrent` overlap cases, honor inherited scheduling, stop at config-derived `maxConcurrency: 2`, and wait at explicit `.sequential` barriers | Native/runtime concurrency |
| Meteor-runtime concurrent cases retain one real Meteor process/database while hooks and structured results remain suite-owned and declaration-ordered | Runtime concurrency |
| `--runtime-workers 2` evaluates Rstest planning once, prepares Meteor packages once, partitions exact server files, and starts two isolated Rspack/Meteor hosts on deterministic proxy/Mongo port pairs | Runtime worker pool |
| Two hosts insert the same `_id` into the same named collection, proving distinct local Mongo databases; worker IDs and prefixed output identify each process | Runtime worker isolation |
| Worker results aggregate in stable order; two passes exit `0`, while one transported assertion failure preserves its sibling and exits `1` | Runtime worker aggregation |
| Default Meteor-runtime output reports each app-relative runtime file with colored Rstest-style status/count rows and `Test Files`/`Tests` totals; passing case names, reporter-added worker labels, and machine frames stay hidden, while failures retain name/message/stack | Runtime server/client/filter/failure |
| Client executor submits without browser-console duplication; external E2E remains owned by native Rstest reporting | Client-only, full-app E2E |
| `meteor test --verbose` (or persistent `meteor.verbose`) adds runtime case rows/durations and worker attribution while ownership routing and raw protocol JSON stay hidden | Runtime watch |
| Native `-- --reporters=verbose` adds case rows/durations and parallel worker attribution without generic Meteor diagnostics, Rstest ownership chatter, or `[Meteor-Rstest]` frames | Runtime server failure and worker failure |
| Exact `METEOR_RSTEST_DEBUG=1` opt-in exposes generation-bound `[Meteor-Rstest]` frames for protocol diagnosis | Runtime debug |
| Runtime-worker children emit no result summary; parent prints one per-file aggregate for success or sibling-preserving failure without adding worker labels unless verbose | Runtime worker pool |
| `--server-only` and `--client-only` exclude opposite native/runtime sides | Side selection |
| `--test-name-pattern` reaches the Meteor-runtime executor and reports filtered cases as skipped | Runtime filter |
| `--test-file` emits an exact runtime manifest and compiles only matching Meteor files | Runtime file filter |
| Meteor-runtime client runs inside the real Meteor browser and returns versioned results | Client-only |
| Client runtime with no supported desktop architecture fails instead of passing an empty result | Selection safety |
| Full-app external E2E imports project-owned `@rstest/playwright` directly against Meteor-owned lifecycle | Full-app E2E |
| Full-app Meteor runtime keeps ordinary `*.test.*` discovery while loading app entry | Full-app runtime |
| Explicit `--driver-package meteortesting:mocha` preserves callback `done` and Mocha `this.timeout` semantics | Driver compatibility |
| `meteor test-packages` auto-selects from strong `Package.onTest` dependency metadata | Package tests |
| Package test-only unibuilds execute on server and client through Isobuild/Atmosphere resolution | Package tests |
| Outside-app `meteor test-packages /absolute/package/path` bootstraps exact npm coordinator dependencies into the generated harness | Package tests outside app |
| `meteor.autoInstallDeps: false` prevents Rstest/Rspack dependency installation and fails with the missing dependency | Package dependency policy |
| Separate Rstest-owned and Tinytest-owned packages in one command fail nonzero before build; no partial or empty pass | Package ownership |
| One package declaring both Rstest and Tinytest fails before provider installation/build, names both registries, and prints exact Rstest-migration and legacy-driver commands | Same-package migration safety |
| Missing files, empty generated projects, project/side conflicts, and E2E without full-app fail nonzero | Selection safety |
| Server/client/external results aggregate through authenticated versioned transports and determine process exit; diagnostic machine frames are debug-only | Runtime and E2E |
| External JSON reporting preserves real Rstest case names, counts, durations, and errors | Full-app E2E |
| Native Rstest watch stays supervised by Meteor and recovers after an imported dependency fails and is fixed | Native watch |
| Runtime watch rebuild follows imported dependency changes, reports a failure, and recovers after the dependency is fixed without leaking transport payloads | Runtime watch |
| Transported runtime assertion failure retains case name and exits nonzero | Runtime failure |
| Native Rstest roots are excluded from Meteor eager discovery; runtime roots are excluded from native Rstest discovery | All |

Deliberate non-claims keep this fixture focused:

| Not covered by this app | Current boundary |
|-------------------------|------------------|
| Running Tinytest or Mocha cases through Rstest | Legacy registries keep their real driver semantics; no compatibility adapter or merged result stream is claimed |
| Firefox/WebKit Browser Mode matrix | Chromium proves Browser Mode integration; upstream browser matrix belongs to Rstest/Playwright |
| React/Vue/Svelte component matrices under Rstest | Existing framework apps cover Rspack integration; this fixture covers engine and Meteor lifecycle boundaries |
| Runtime snapshots, runtime module-mock hoisting, and general runtime sharding | Coverage is proven across two server workers; the remaining features are not claimed yet |
| Client/browser, watch, full-app, package-test, driver, and external-Mongo runtime worker pools | Initial `--runtime-workers` slice requires `meteor test --once --server-only` and keeps all other routes unchanged |
| Adding, renaming, or removing test files during one native watch process | Current Rstest 0.11 collection does not rediscover changed test inventory; restart `meteor test` after inventory or ownership changes |
| `web.browser.legacy` and `web.cordova` runtime execution | Current executor contract covers server and `web.browser` |
| Visual screenshot baselines | DOM snapshots and real interaction are covered without platform-sensitive image baselines |

---

## Skeletons

Tested via `skeleton.test.js` using `meteor create --<skeleton>`. Each skeleton verifies: app creation, dev run, production run, test once, build, and reset.

| Skeleton | Port | Language | Extra coverage |
|----------|------|----------|----------------|
| angular | 3213 | TypeScript | |
| apollo | 3201 | JSX | React 19.2 dependencies |
| babel | 3212 | JSX | React 19.2 dependencies |
| bare | 3219 | JS | No title/style checks, no client tests, skip build cache check |
| blaze | 3202, 3216 | JS | Path-prefixed `ROOT_URL` (`/app`, port 3216): Rspack dev script injected under the prefix and client code running, dev + prod (#14716) |
| chakra-ui | 3203 | JSX | React 19.2 dependencies; no body style checks (custom UI library) |
| coffeescript | 3211 | CoffeeScript | React 19.2 dependencies |
| full | 3204 | JS | `imports/api/` test structure; wildcard 404 route renders with no deprecation notice in the console (Run) |
| pnpm | 3222 | JS + TypeScript workspace package | pnpm workspace root with Meteor at `apps/app`; default auto-install behavior with no explicit `autoInstallDeps`; root install via Corepack/bundled npx fallback; automatic pnpm bump of an outdated Rspack dependency; `workspace:*` linking; transitive pnpm-store resolution; local tarball dependency validation without false warnings; nested app lifecycle; built-app boot; workspace dependencies preserved by reset |
| pwa | 3214, 3215 | JS | Manifest link + templated `manifest.webmanifest`; skeleton's own service worker controlling the page across reload (dev `/sw.js?dev=1`, prod `/sw.js`); prod app shell loads with the server down; a data fetch to a navigation-cached URL reaches the network instead of the cached page (PRECACHE-only fallback); manifest, worker and offline checks repeated under a path-prefixed `ROOT_URL` (`/app`, port 3215, production only: the dev boilerplate injects the Rspack client script unprefixed) |
| react | 3205 | JSX | React 19.2 dependencies, automatic JSX runtime via `.swcrc`, custom body styles |
| solid | 3206 | JS | |
| svelte | 3207 | JS | |
| tailwind | 3208 | JSX | React 19.2 dependencies; Tailwind `bg-gray-100` styles (dev + prod color formats) |
| typescript | 3209 | TypeScript | React 19.2 dependencies and type definitions; TypeScript 7 native `tsgo` diagnostics; TSX edits preserve React state, the browser document, and server PID while server edits restart and execute new code (Run); installs the packed npm candidate for this unpublished output-tracker regression, including in the release lane; the TypeScript app fixture retains published-package coverage |
| typescript-tailwind | 3221 | TypeScript | React 19.2 dependencies and type definitions; TypeScript 7, native `tsgo`, Tailwind 4, and PostCSS |
| vue | 3210 | JS | |

---

## NPM Package Compatibility

Several apps import specific npm packages to verify that Meteor + Rspack handles different module formats and edge cases without errors. The app boots successfully only if these imports resolve correctly.

### legacy (`apps/legacy/`)

These dependencies are installed only in the temporary variant used by `regressions/architecture-entrypoints.test.js`.

| Package | File | Reason |
|---------|------|--------|
| `ua-parser-js` | `imports/browser-info.ts` | Shared npm import in separate modern/legacy compilations with the reporter's `nodeModules.recompile` setting; browser output is checked with default Rspack configuration |
| `@datadog/browser-rum` | `client/npm-modern.tsx`, `client/npm-legacy.ts` | Browser SDK and its transitive imports execute in both entrypoints without initializing telemetry; exposes missing helper imports after Meteor recompiles the legacy bundle. Its BigInt syntax is outside the fixture's ES5 checks |
| `react` + `react-dom/client` | `client/npm-modern.tsx` | The built modern page renders React while the legacy program excludes React DOM and renders its own stub |

### react-router (`apps/react-router/server/main.js`)

| Package | Reason |
|---------|--------|
| `s3mini` | ESM-only package (no CJS fallback) |
| `@modelcontextprotocol/sdk/client/streamableHttp.js` | ESM subpath export (deep path into ESM package) |
| `bcrypt` | Native Node.js bindings (compiled C++ addon) |
| `puppeteer` | Large ESM-compatible package with complex dependency tree (`server/browser-tests/browser.app-test.js`) |

### monorepo (`apps/monorepo/app/`)

| Package | File | Reason |
|---------|------|--------|
| `pino` + `pino-pretty` | `server/main.js` | ESM-first logger; `pino-pretty` uses `thread-stream` which has worker file resolution issues — needs `Meteor.compileWithMeteor(["thread-stream"])` in rspack config |
| `grubba-rpc` | `server/main.js` | Untranspiled npm dependency — needs `Meteor.compileWithRspack(["grubba-rpc"])` to compile it through rspack |
| `node:buffer` | `imports/api/links.js` | Node.js built-in via `node:` protocol in shared client/server code — must be ignored on client without errors |
| `@react-email/components` | `imports/emails/TestEmail.jsx` | JSX-heavy ESM package with many subpath exports |
| `workbox-webpack-plugin` + `webpack` | `rspack.config.cjs` | GenerateSW compatibility with Rspack; declares Workbox's Webpack peer explicitly for Yarn Classic installs |

### pnpm-monorepo (`apps/pnpm-monorepo/packages/domain/`)

| Package | File | Reason |
|---------|------|--------|
| `color` | `packages/domain/src/index.js` | npm dependency of a `workspace:*` package, pulling a multi-level transitive tree (`color-convert`, `color-name`, `color-string`, `simple-swizzle`, `is-arrayish`) — pnpm does not hoist these to the app, so it validates transitive resolution through the pnpm store |

### pnpm skeleton (`tools/static-assets/skel-pnpm/packages/domain/`)

| Package | File | Reason |
|---------|------|--------|
| `color` | `packages/domain/src/index.js` | Verifies a generated `workspace:*` package can resolve its non-hoisted transitive dependency tree through the pnpm store |

### react (`apps/react/plugins/demo-unplugin.js`)

| Package | File | Reason |
|---------|------|--------|
| `unplugin` | `plugins/demo-unplugin.js` | Unplugin transform hook integration validates rspack cache tracks plugin dependency files (#14031) |
| `meteor-node-stubs` (`buffer`, `crypto`) and `isomorphic-timers-promises` | `tests/main.js` | Browser implementations and global `Buffer` support for client tests |

### babel (`apps/babel/server/apollo.js`)

| Package | Reason |
|---------|--------|
| `@apollo/server` | ESM-first GraphQL server |
| `@apollo/server/express4` | ESM subpath export (middleware from deep path) |
| `graphql` | Peer dependency, dual CJS/ESM package |

### typescript (`apps/typescript/rspack.config.ts`, `apps/typescript/swc.config.ts`)

| Package | Reason |
|---------|--------|
| `node:module` (`createRequire`) | Node.js built-in in a `.ts` config file — tests CJS interop via `createRequire(import.meta.url)` in an ESM context |
| `@swc/core`, `@rspack/core` | Type-only import (`import type { Config }`, `import type { Configuration }`) — provides typings for configs, verifies the cache dependency scanner correctly parses TS syntax |

---

## Feature Coverage Matrix

Where each feature is tested across apps and skeletons.

| Feature | Apps | Skeletons |
|---------|------|-----------|
| HMR (dev) | react, react-router, babel, coffeescript, vue, solid, svelte, monorepo, pnpm-monorepo, typescript | typescript |
| HMR disabled (prod) | all apps with HMR | |
| HMR incompatible | blaze, full-blaze | |
| Custom rspack config | react (.cjs), react-router, babel (.mjs), monorepo (.cjs), typescript (.ts) | |
| Custom SWC config (.ts) | typescript | |
| Config override file | react-router, monorepo | |
| User-level `devServer.onListening` composition | react-router | |
| Custom build dir | react, typescript | |
| Custom asset/chunk context dirs | typescript | |
| Custom env vars | react (METEOR_LOCAL_DIR), react-router (METEOR_PACKAGE_DIRS), server-only regression (absolute external METEOR_LOCAL_DIR) | |
| Path-prefixed `ROOT_URL` (`ROOT_URL_PATH_PREFIX`) | | blaze |
| Static asset bundling | react-router, monorepo (png, md, icon, manifest) | |
| Less styles | react-router | |
| SCSS styles | typescript | |
| Tailwind CSS | vue (PostCSS) | tailwind |
| PWA (manifest, service worker, offline app shell) | | pwa |
| Image asset loading | react | |
| 404 routing | react-router, blaze-router | |
| Meta tags | react-router, monorepo | |
| Babel compiler plugin | react-router | |
| React Compiler through built-in SWC | react | |
| React 19.2 | react | apollo, babel, chakra-ui, coffeescript, react, tailwind, typescript, typescript-tailwind |
| Automatic JSX runtime | react | react |
| TypeScript type checking | typescript | typescript (`tsgo` loading, diagnostic, watch), typescript-tailwind (`tsgo`) |
| Meteor.disablePlugins | react | |
| Unplugin transform with cache (#14031) | react | |
| Custom package dirs | react-router | |
| CoffeeScript compilation | coffeescript | coffeescript |
| Server-only (no client) | server-only | |
| Architecture-specific entrypoints and legacy application syntax/runtime | legacy | |
| Rspack process cleanup | react | |
| Server bundle excluded from Meteor linker payload | server-only regression | |
| `Assets`/`Npm` server globals in the dev bundle | server-only regression | |
| Delayed server Meteor package import | server-only regression | |
| Monorepo layout | monorepo, pnpm-monorepo | pnpm |
| Source-independent workspace executable links (POSIX) | workspace | |
| Workspace-aware Rspack dependency auto-install | monorepo (npm, Yarn Classic) | pnpm |
| pnpm workspace (`workspace:*` packages, `corepack pnpm install`) | pnpm-monorepo | pnpm |
| Transitive npm dependency resolution (pnpm store) | pnpm-monorepo | pnpm |
| First-compilation process failure | server-only | |
| Rstest automatic engine selection | rspack-rstest | |
| Dynamic Meteor Rstest config context | rspack-rstest | |
| Rstest native Node/jsdom projects | rspack-rstest | |
| Rstest Browser Mode locators, interaction, and snapshots (Chromium) | rspack-rstest | |
| Rstest Playwright full-app E2E | rspack-rstest | |
| Rstest snapshots (inline, external, file) | rspack-rstest | |
| Rstest snapshot mismatch/update/recheck lifecycle | rspack-rstest | |
| Rstest native Istanbul coverage report | rspack-rstest | |
| Unified Rstest Istanbul coverage across native, Meteor server/client, Atmosphere package, worker, and Playwright full-app lanes | rspack-rstest | |
| Meteor-runtime Rstest server/client | rspack-rstest | |
| Rstest runtime name filtering | rspack-rstest | |
| Atmosphere package and MongoDB runtime resolution | rspack-rstest | |
| Isolated multi-host Meteor runtime workers and result aggregation | rspack-rstest | |
| `test-packages` Rstest capability and test-only unibuilds | rspack-rstest | |
| Explicit real-Mocha compatibility route | rspack-rstest | |
| Full-app ordinary Rstest runtime discovery | rspack-rstest | |
| Exact runtime `--test-file` manifest | rspack-rstest | |
| Empty-selection and mixed-package false-green guards | rspack-rstest | |
| Same-package provider/legacy-registry conflict diagnostics | rspack-rstest | |
| Rstest dependency auto-install opt-out | rspack-rstest | |
| Per-file Rstest-style Meteor runtime reporting and `meteor.verbose` worker diagnostics | rspack-rstest | |
| Full-app test mode | react-router, blaze-router, tla | |
| Concurrent Rspack mode isolation | blaze-router | |
| Full-app client without a client test module | blaze-router | |
| Blaze router compatibility | blaze-router (Galvanized Iron Router routes, controllers, hooks, and layout), full-blaze (FlowRouter Extra) | |
| Top-level await in full-app tests | tla | |
| Module rules override | babel | |
| Custom NODE_ENV compilation | babel | |
| Portable build (no isDev/isProd defines) | typescript | |
| Source-map paths, contents, exact breakpoint/step/exception locations, lazy code, and rebuilds | source-maps | |
| Modern, legacy, and Cordova web source maps in built output | source-maps | |
| `Meteor.extendSwcConfig` (path aliases) | typescript | |
| CSS auto-delegation (entry folder filtering) | vue | |
| `meteor.modules` config (preserve files for Meteor) | react-router, vue | |
| `meteor reset` cleanup | apps using the shared lifecycle tests | all skeletons |
| Skeleton creation | | all 16 tested skeletons |
| Body style assertions | | react, tailwind (custom); most others (default) |
| Custom .gitignore entries | react | |
| ESM-only packages | react-router, monorepo, babel | |
| ESM subpath exports | react-router, babel | |
| Native bindings (C++ addon) | react-router | |
| `node:` protocol imports | monorepo, typescript | |
| Untranspiled npm deps (`compileWithRspack`) | monorepo | |
| Worker resolution (`compileWithMeteor`) | monorepo | |
| Service worker (Workbox GenerateSW) | monorepo | |
| Service worker stability (no rewrite on rebuild) | monorepo | |
| Service worker regenerated on restart | monorepo | |
| Service worker in production build | monorepo | |
| Service worker runtime caching (images) | monorepo | |
| Service worker precaching (`additionalManifestEntries`) | monorepo | |
| PWA manifest | monorepo | |
| Local package loading (`api.addAssets`) | assets | |
| Server/App-private assets (`Assets.getTextAsync`) | assets | |
| Client package assets (`fetch`) | assets | |
| `skipTestClient: true` test helper option | assets | |
| Assets skipped by compiler source discovery (#14566) | assets | |
| Boot built bundle (`node main.js`) to test assets | assets | |
| Rspack static-file failures and bounded manifest state | assets | |
| Production cleanup preserves source assets, symlinks and other output contexts under `build` ancestors (#14871) | assets | |
