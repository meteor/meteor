# Rspack

Rspack is the Rust-based, Webpack-compatible bundler that handles app source compilation, HMR, and asset emission for Meteor apps that opt in via `meteor add rspack`. Meteor itself still owns package compilation, the dev server lifecycle, and the runtime program manifest; this document covers the integration layer between the two.

End-user documentation is at [`v3-docs/docs/about/modern-build-stack/rspack-bundler-integration.md`](../../../v3-docs/docs/about/modern-build-stack/rspack-bundler-integration.md). The E2E coverage matrix is at [`E2E_COVERAGE.md`](E2E_COVERAGE.md). The memory benchmark guide is at [`MEMORY_BENCHMARK.md`](MEMORY_BENCHMARK.md).

- [**Why Rspack**](#why-rspack): goals of the Rspack integration.
- [**Rspack integration and modules**](#rspack-integration-and-modules): the Atmosphere package and the npm package, file-by-file responsibilities, and how Rspack fits next to Meteor's own bundler.
- [**E2E testing**](#e2e-testing): strategy, how to add a new test app, what to verify.
- [**Common maintenance tasks**](#common-maintenance-tasks)
  - [Iterating on `@meteorjs/rspack` (NPM Package)](#iterating-on-meteorjsrspack-npm-package)
  - [Upgrading Rspack Core Dependencies](#upgrading-rspack-core-dependencies)
  - [Publishing the Packages](#publishing-the-packages)
  - [Benchmark rebuild memory](#benchmark-rebuild-memory)

## Why Rspack

Rspack replaces parts of Meteor's bundler for client and server code. The goals of the integration are:

- Get faster cold and incremental builds without giving up Webpack ecosystem compatibility (loaders, plugins, HMR semantics).
- Support modern app code patterns (full ESM with `exports` fields, tree shaking, dynamic import, persistent FS cache) on the same code path Meteor uses for SSR and packages.
- Keep Meteor packages, atmosphere conventions, and the dev server flow working unchanged from the app's perspective: `meteor add rspack` is the only required step.

## Rspack integration and modules

The integration is split across two packages.

### `packages/rspack` (Atmosphere package)

This is the build-plugin side. `package.js` registers a build plugin and declares the runtime package:

```js
Package.registerBuildPlugin({
  name: 'rspack',
  sources: ['lib/constants.js', 'lib/dependencies.js',
            'lib/build-context.js', 'lib/processes.js',
            'lib/config.js', 'rspack_plugin.js'],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core'],
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use(['tools-core', 'webapp']);
  api.mainModule('rspack_server.js', 'server');
});
```

`lib/` contains:

| File | Responsibility |
|------|----------------|
| `constants.js` | Default versions of `@rspack/core`, `@meteorjs/rspack`, `swc-loader`, etc. Build context directory names (`_build`, `build-assets`, `build-chunks`, `.rsdoctor`). `GLOBAL_STATE_KEYS` used to track installation/compile state across rebuilds. |
| `dependencies.js` | Auto-install flow for `@rspack/core`, `@meteorjs/rspack`, React HMR, Rsdoctor. Uses `tools-core`'s npm helpers. |
| `build-context.js` | Creates and cleans the build context, asset, and chunk directories. Manages the default `rspack.config.js`. |
| `config.js` | Sets Meteor entry points and env from the resolved app config. |
| `processes.js` | Spawns the Rspack dev server and server-side watch process, computes ports, picks the right config file (`.cjs`/`.mjs`/`.ts`/...), handles cleanup. |
| `compilation.js` | First-compile barrier; coordinates the Meteor server start with Rspack's first emit. |

`rspack_plugin.js` is the orchestrator that runs inside the plugin sandbox: it checks installation, ensures the build context exists, configures Meteor, starts the Rspack processes (or runs a one-shot build), and waits for first compilation.

`rspack_server.js` is the runtime side that runs inside the user's app (see `mainModule` in `package.js`). It uses `webapp` to compose Meteor with the Rspack dev server (proxy middleware in development, static serving in production).

### `npm-packages/meteor-rspack` (the `@meteorjs/rspack` npm package)

This is the configuration side. Users install it through the Atmosphere package's auto-install flow, and it provides the default Rspack configuration plus a `defineConfig(factory)` helper. Key files:

| Path | Responsibility |
|------|----------------|
| `index.js`, `index.d.ts` | Public API: `defineConfig`, `HtmlRspackPlugin`. |
| `rspack.config.js` | The big default Rspack config (client + server, SWC loader, plugins, externals, HMR, persistent cache). |
| `lib/meteorRspackConfigFactory.js` | Factory that builds the `Meteor.*` helpers (`compileWithMeteor`, `compileWithRspack`, `extendSwcConfig`, `replaceSwcConfig`, `disablePlugins`, `enablePortableBuild`, `persistDevFiles`, `splitVendorChunk`, `setCache`, `extendConfig`). |
| `lib/meteorRspackHelpers.js`, `lib/meteorRspackConfigHelpers.js` | Detection helpers (React/Blaze/TS/etc.), Meteor define plugin values, output and externals wiring. |
| `lib/swc.js` | Resolves `.swcrc` / `swc.config.js` / `swc.config.ts` using `@swc/core` for TS configs; see also [`../swc/README.md`](../swc/README.md). |
| `lib/localDependenciesHelpers.js` | Parses the user's `rspack.config.js` with `@swc/core` to discover local plugin files and add them to the FS cache's `buildDependencies`. |
| `lib/mergeRulesSplitOverlap.js`, `lib/ignore.js` | Safe-merge logic for module rules and ignore-loader rules. |
| `plugins/` | Custom Rspack plugins (HTML generation, asset externals, server output, require externals). |
| `scripts/bump-version.js`, `scripts/publish-beta.sh` | Version bumper and beta publish script (see [`README.md`](../../../npm-packages/meteor-rspack/README.md) in the package). |

### How it interacts with Meteor

The bundler does *not* replace Meteor's bundler wholesale. Instead:

- Meteor still owns package compilation, the boilerplate generator, the dev server lifecycle, and the runtime program manifest.
- Rspack owns app source compilation (client and server), HMR, asset emission, and the chunk graph for user code.
- The two are stitched together at three points: the `webapp` middleware (dev: proxy to the Rspack dev server; prod: serve emitted files), the asset externals plugin (so Meteor packages remain external to Rspack), and the entry point env vars (`METEOR_CONFIG_CLIENT` / `METEOR_CONFIG_SERVER` / ...) set by the build plugin via `tools-core`'s `setMeteorAppEntrypoints`.

When debugging an integration issue, it is usually one of: a missing externals binding, a stale build context directory, an entrypoint env var that did not reach the bundler, or a config helper that returned a fragment Rspack does not merge correctly. The places to start are `packages/rspack/lib/build-context.js` (directory state), `packages/rspack/lib/processes.js` (process and port wiring), `npm-packages/meteor-rspack/rspack.config.js` (defaults), and `npm-packages/meteor-rspack/lib/meteorRspackConfigFactory.js` (helpers).

## E2E testing

The Rspack integration is exercised by the Jest + Playwright suite in `tools/e2e-tests/`. Each app fixture under `tools/e2e-tests/apps/<name>/` has a matching `<name>.test.js` that runs init/dev/prod/test/build/reset phases against a real Meteor + Rspack project. The full matrix lives in [`E2E_COVERAGE.md`](E2E_COVERAGE.md); maintain that file via the [`e2e-coverage`](../../../.github/skills/e2e-coverage/SKILL.md) skill when adding or modifying apps.

### Strategy

- **Real projects, not mocks.** Each test copies an app fixture, installs deps, adds the `rspack` package, and runs the Meteor CLI. This catches integration bugs that unit tests miss (HMR wiring, externals, asset paths, Windows quirks).
- **Same lifecycle for every fixture.** Init, dev run, prod run, test (watch and once), build, reset. The shared `helpers.js` and `test-helpers.js` enforce a consistent set of assertions: build artifacts exist, the page renders, `__rspack__` script is present, HMR is on in dev and off in prod.
- **Skeletons are covered too.** `skeleton.test.js` walks every `meteor create --<skeleton>` template through the same phases on dedicated ports.

### Creating a new E2E test app

1. Copy an existing app under `tools/e2e-tests/apps/` as the starting point (`apps/react` is a good baseline for a generic case).
2. Add an `<name>.test.js` next to the existing ones; reuse the helpers in `test-helpers.js` to drive lifecycle phases.
3. Update `jest.config.js` if the new file is not picked up by the default `testMatch`.
4. Install deps once with `npm run install:e2e` (run from repo root).
5. Run the new file alone: `npm run test:e2e -- --testPathPattern <name>`. That is also the fastest way to debug a single regression.
6. Update [`E2E_COVERAGE.md`](E2E_COVERAGE.md) per the e2e-coverage skill so the matrix stays accurate.

### What to verify when touching Rspack

- Dev run: build artifacts exist under the build context dir, the client loads in the browser, HMR triggers on a source edit.
- Prod run: same assertions with `--production`; HMR must be off.
- Test mode: `meteor test` runs the mocha driver, watches rebuilds, and `meteor test --once` exits with the expected code.
- Build: `meteor build` produces a valid bundle tree (`main.js`, `programs/server`, `web.browser`, `web.browser.legacy`) and any static assets the app expects.
- Reset: `meteor reset` clears the build context, asset/chunk directories, and `.meteor/local` subdirs.

## Common maintenance tasks

This section covers the typical workflows for iterating on the Rspack integration, upgrading its core dependencies, and publishing changes.

### Iterating on `@meteorjs/rspack` (NPM Package)

The `@meteorjs/rspack` npm package (`npm-packages/meteor-rspack/`) provides the default Rspack configuration. When making changes here, you need to link it to a local app to verify your modifications. The easiest targets are the E2E test fixtures (`tools/e2e-tests/apps/*`) or standard skeletons.

**Steps to test local changes:**

```bash
# 1. Build and link the local NPM package
cd npm-packages/meteor-rspack
npm link

# 2. Go to your target app and link the package
cd /path/to/target-app
meteor add rspack          # if not already added
meteor npm link @meteorjs/rspack
meteor run
```

*Note:* The Atmosphere package's auto-install flow may try to install a newer version of `@meteorjs/rspack` from the registry. To make your local link stick, set `"meteor": { "autoInstallDeps": false }` in the app's `package.json`.

After verifying changes manually, always run the E2E suite to ensure broader compatibility is intact before committing:
```bash
# Tip: If the test suite complains about missing dependencies,
# run `npm run install:e2e` from the repo root first.
npm run test:e2e
```

### Upgrading Rspack Core Dependencies

When a new version of Rspack is released, review and synchronize the core
dependencies: `@rspack/core`, `@rspack/cli`, `@rspack/dev-server`,
`@rspack/plugin-react-refresh`, `@swc/core`, `swc-loader`, and
`@rsdoctor/rspack-plugin`.

**1. Update the Constants (Atmosphere Package)**
Modify the default versions in `packages/rspack/lib/constants.js`. For example, change `DEFAULT_RSPACK_VERSION` to the new target version:
```javascript
// packages/rspack/lib/constants.js
const DEFAULT_RSPACK_VERSION = '1.0.0-beta.1'; 
```

**2. Update the Package Configuration (NPM Package)**
Bump the versions in the `peerDependencies` and `devDependencies` inside `npm-packages/meteor-rspack/package.json`. Keep `peerDependencies` ranges as broad as the new minimum allows.
```bash
# Refresh the lockfile after bumping package.json
cd npm-packages/meteor-rspack
npm install
```

**3. Verify Compatibility**
Run the full E2E suite from the repository root:
```bash
# Tip: Run `npm run install:e2e` first if encountering missing dependency errors
npm run test:e2e
```
*Look out for breaking changes in Rspack's release notes around:*
- Module resolution (especially `exports` conditions, ESM, `node:` protocol).
- Persistent FS cache layouts, as user apps may carry stale caches.
- HMR client wiring (the `__rspack__` script tag, dev server URL).
- SWC loader options (see [`../swc/README.md`](../swc/README.md)).

### Publishing the Packages

When `npm-packages/meteor-rspack` has publishable changes, bump and publish the
NPM package first, then synchronize and bump the Atmosphere package. If only
`packages/rspack` changes, only the Atmosphere package needs a new version.

When bumping `@meteorjs/rspack`, also update
`DEFAULT_METEOR_RSPACK_VERSION` in `packages/rspack/lib/constants.js` to the
same version before publishing. The Atmosphere package uses this constant to
auto-install `@meteorjs/rspack` in applications, so leaving it behind can make
new apps install an older or beta release. Use a beta version in the constant
only when publishing that beta release.

Use the `sync-modern-tool-versions` skill to discover and verify the matching
lockfile, skeleton, E2E fixture, constant, and active documentation references.
If `version-bump` already set the approved NPM package version, skip
`npm run bump`; that command increments the current version each time it runs.

**For a Beta Release:**
```bash
# 1. Bump the NPM package version and publish as beta
cd npm-packages/meteor-rspack
npm run bump -- patch --beta   # use patch, minor, or major depending on the change
npm run publish:beta

# 2. Bump the Atmosphere package version (e.g., to 1.0.0-beta.1)
# See the version-bump skill for detailed instructions.
```

**For an Official Release:**
```bash
# 1. Bump the NPM package version and publish
cd npm-packages/meteor-rspack
npm run bump -- patch          # use patch, minor, or major depending on the change
npm publish

# 2. Bump the Atmosphere package version (e.g., to 1.0.0)
# See the version-bump skill for detailed instructions.
```

### Benchmark rebuild memory

For investigating rebuild memory issues or analyzing process-tree memory retention (`meteor-tool`, app server, Rspack/TypeScript child processes), see [`MEMORY_BENCHMARK.md`](MEMORY_BENCHMARK.md) for instructions on running `scripts/build-stack-memory-bench.js` and capturing heap snapshots.
