# E2E Test Coverage

> To update this report, follow the [e2e-coverage skill](/.github/skills/e2e-coverage/SKILL.md).

End-to-end tests using Jest + Playwright that verify Meteor apps with the Rspack bundler across frameworks, build modes, and features.

Test infrastructure lives in `tools/e2e-tests/`, with app fixtures in `tools/e2e-tests/apps/` and matching test files at `tools/e2e-tests/<name>.test.js`.

## Test Lifecycle

Every app and skeleton goes through these phases (unless skipped):

| Phase | What it does |
|-------|-------------|
| **Init** | Copies app, installs deps, adds rspack, generates config |
| **Run (dev)** | `meteor run` — asserts build artifacts, app loads, client/server hot rebuild |
| **Run (prod)** | `meteor run --production` — same checks in production mode |
| **Test** | `meteor test` — runs the selected test engine and verifies test rebuild |
| **Test once** | `meteor test --once` — runs the selected engine to completion and checks exit code |
| **Build** | `meteor build` — verifies bundle structure (main.js, programs/server, web.browser, web.browser.legacy) |
| **Reset** | `meteor reset` — clears rspack build artifacts, caches, asset/chunk context dirs, and `.meteor/local` subdirectories |

Default assertions on every run phase: build artifacts exist, page title matches, body styles render, `__rspack__` script tag is present.

---

## Apps

Each app lives in `apps/<name>/` and has a matching `<name>.test.js`.

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

### react-router

Full-featured React Router app with custom packages, Less, and advanced rspack config.

| What is covered | Phase |
|----------------|-------|
| `METEOR_PACKAGE_DIRS` custom packages dir | All (env prefix) |
| `babel-plugin-react-compiler` integration | Init, Prod, Build |
| Compiler output cached in dev (babel.config.js) | Run |
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

### blaze

Blaze templating engine integration.

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection (`isBlazeEnabled`) | Run, Prod, Test, Build |
| HMR disabled (incompatible with Blaze) | Run, Prod |

### full-blaze

Full Blaze app (with `imports/` structure for tests).

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection | Run, Prod, Test, Build |
| `imports/api/` test path structure | Test |
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
| SCSS styles support (`white-space: break-spaces`) | Run, Prod |
| TypeScript + TSX environment detection | Run, Prod, Test, Build |
| Portable build (Meteor.isDevelopment/isProduction not defined) | Run, Prod, Build |
| `Meteor.extendSwcConfig` with path aliases (`@ui/*`, `@api/*`) | All |
| `TsCheckerRspackPlugin` type checking (no errors) | Run |
| `.meteor/local/types` directory generated | Run |
| Separate client/server test files | Test |
| CI: removes TsCheckerRspackPlugin (resource limits) | Init |
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

Monorepo structure with app in subdirectory, service worker, and PWA manifest.

| What is covered | Phase |
|----------------|-------|
| Monorepo layout (`app/` subdirectory) | All |
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

### server-only

Server-only app (no client entry point).

| What is covered | Phase |
|----------------|-------|
| No client bundle (client skipped) | All |
| No client tests (test client skipped) | Test |
| Server entry loads (`server/main.js loaded`) | Run |

### rspack-rstest

Focused Rspack 2.1.8 + Rstest 0.11.6 integration fixture. Unlike framework
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
| blaze | 3202 | JS | |
| chakra-ui | 3203 | JSX | React 19.2 dependencies; no body style checks (custom UI library) |
| coffeescript | 3211 | CoffeeScript | React 19.2 dependencies |
| full | 3204 | JS | `imports/api/` test structure |
| react | 3205 | JSX | React 19.2 dependencies, automatic JSX runtime via `.swcrc`, custom body styles |
| solid | 3206 | JS | |
| svelte | 3207 | JS | |
| tailwind | 3208 | TypeScript | React 19.2 dependencies; Tailwind `bg-gray-100` styles (dev + prod color formats) |
| typescript | 3209 | TypeScript | React 19.2 dependencies and type definitions; CI: removes TsCheckerRspackPlugin |
| typescript-tailwind | 3221 | TypeScript | React 19.2 dependencies and type definitions; CI: removes TsCheckerRspackPlugin |
| vue | 3210 | JS | |

---

## NPM Package Compatibility

Several apps import specific npm packages to verify that Meteor + Rspack handles different module formats and edge cases without errors. The app boots successfully only if these imports resolve correctly.

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

### react (`apps/react/plugins/demo-unplugin.js`)

| Package | Reason |
|---------|--------|
| `unplugin` | Unplugin transform hook integration — validates rspack cache tracks plugin dependency files (#14031) |

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
| `@swc/core` | Type-only import (`import type { Config }`) — provides typings for `swc.config.ts`, stripped at compile time |

---

## Feature Coverage Matrix

Where each feature is tested across apps and skeletons.

| Feature | Apps | Skeletons |
|---------|------|-----------|
| HMR (dev) | react, react-router, babel, coffeescript, vue, solid, svelte, monorepo, typescript | |
| HMR disabled (prod) | all apps with HMR | |
| HMR incompatible | blaze, full-blaze | |
| Custom rspack config | react (.cjs), react-router, babel (.mjs), monorepo (.cjs), typescript (.ts) | |
| Custom SWC config (.ts) | typescript | |
| Config override file | react-router, monorepo | |
| User-level `devServer.onListening` composition | react-router | |
| Custom build dir | react, typescript | |
| Custom asset/chunk context dirs | typescript | |
| Custom env vars | react (METEOR_LOCAL_DIR), react-router (METEOR_PACKAGE_DIRS) | |
| Static asset bundling | react-router, monorepo (png, md, icon, manifest) | |
| Less styles | react-router | |
| SCSS styles | typescript | |
| Tailwind CSS | vue (PostCSS) | tailwind |
| Image asset loading | react | |
| 404 routing | react-router | |
| Meta tags | react-router, monorepo | |
| Babel compiler plugin | react-router | |
| React Compiler through built-in SWC | react | |
| React 19.2 | react | apollo, babel, chakra-ui, coffeescript, react, tailwind, typescript, typescript-tailwind |
| Automatic JSX runtime | react | react |
| TypeScript type checking | typescript | |
| Meteor.disablePlugins | react | |
| Unplugin transform with cache (#14031) | react | |
| Custom package dirs | react-router | |
| CoffeeScript compilation | coffeescript | coffeescript |
| Server-only (no client) | server-only | |
| Monorepo layout | monorepo | |
| Full-app test mode | react-router | |
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
| Module rules override | babel | |
| Custom NODE_ENV compilation | babel | |
| Portable build (no isDev/isProd defines) | typescript | |
| `Meteor.extendSwcConfig` (path aliases) | typescript | |
| CSS auto-delegation (entry folder filtering) | vue | |
| `meteor.modules` config (preserve files for Meteor) | react-router, vue | |
| `meteor reset` cleanup | all apps | all skeletons |
| Skeleton creation | | all 14 skeletons |
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
