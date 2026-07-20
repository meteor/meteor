# SWC

SWC is the Rust-based transpiler and minifier on Meteor's modern build path. It compiles app code through `packages/babel-compiler`, minifies production bundles in `packages/standard-minifier-js`, and powers the Rspack `swc-loader` for application source.

The end-user view is documented in [`v3-docs/docs/about/modern-build-stack/meteor-bundler-optimizations.md`](../../../v3-docs/docs/about/modern-build-stack/meteor-bundler-optimizations.md). This document is the maintainer-facing counterpart, covering where the integration lives and the tasks needed when bumping or debugging it.

- [**Why SWC**](#why-swc): goals of the SWC integration.
- [**SWC integration and modules**](#swc-integration-and-modules): packages involved, `@swc/core` vs `@meteorjs/swc-core`, debugging notes.
- [**Test coverage**](#test-coverage): legacy self-test vs modern E2E, when to run which.
- [**Common maintenance tasks**](#common-maintenance-tasks)
  - [Stage 1: Publish the New Wrapper (`@meteorjs/swc-core`)](#stage-1-publish-the-new-wrapper-meteorjsswc-core)
  - [Stage 2: Roll the Wrapper into Meteor Core](#stage-2-roll-the-wrapper-into-meteor-core)

## Why SWC

SWC replaces the Babel transpilation step on the modern path. The goals of the integration are:

- Move transpilation off of Babel and onto a Rust-based parser/codegen for substantially faster cold builds and rebuilds.
- Keep Meteor-specific behavior intact (reify modules, nested imports, top-level await, modern vs legacy browser targets) without forcing users to maintain a Babel config.
- Reuse the same SWC backend for both the transpiler (compile step) and the minifier (production builds), so the bundler does not need to ship two JavaScript engines.

## SWC integration and modules

There are three places SWC is wired into the codebase:

1. **`packages/babel-compiler`**, the transpiler entry point.
   - Depends on `@meteorjs/swc-core` (see `package.js`).
   - `babel-compiler.js` requires `@meteorjs/swc-core` and exposes `compileWithSwc(source, swcOptions, { features })`. The output is post-processed by `@meteorjs/reify` so module compilation, nested imports, top-level await, and modern/legacy targets match Babel's behavior.
   - `initializeMeteorAppSwcrc` resolves the user's SWC config, in this order: `.swcrc`, `swc.config.js`, `swc.config.ts`. Dynamic (`.js` / `.ts`) configs are read, transpiled to CJS (using SWC itself), then evaluated. The resolved config is cached against the file's mtime plus a content hash.
   - `BabelCompiler` exports a `SwcCompiler` variant used when modern mode is enabled (`Meteor.modern: true` or `METEOR_MODERN=`). When SWC cannot handle a file, the compiler falls back to Babel and logs `[Transpiler] Used SWC` / `Used Babel` lines under verbose mode.

2. **`packages/standard-minifier-js`**, the minifier entry point.
   - Depends on `@meteorjs/swc-core`.
   - `plugin/minify-js.js` lazily requires `@meteorjs/swc-core` and uses it as the minifier for the modern build target.

3. **`npm-packages/meteor-rspack`**, the bundler-side integration.
   - The bundler uses Rspack's `swc-loader`, which depends on a peer-installed `@swc/core` (see `peerDependencies` in `package.json`).
   - `lib/swc.js` reads the same `.swcrc` / `swc.config.js` / `swc.config.ts` family for the loader, and `lib/localDependenciesHelpers.js` parses the user's `rspack.config.js` with `@swc/core` to discover local plugin files that should invalidate the persistent cache.

### `@swc/core` vs `@meteorjs/swc-core`

There are two different SWC packages in play, and the difference matters when bumping versions:

- **`@meteorjs/swc-core`** is a Meteor-controlled wrapper that vendors `@swc/core` and its native binaries. It is the dependency declared in `babel-compiler/package.js` and `standard-minifier-js/package.js`. Vendoring lets Meteor ship the right native binary for every supported platform without depending on each user's npm install hitting the optional-dependency platform-pick logic. It also pins the SWC API the Meteor tool is built against.
- **`@swc/core`** is the upstream package. It is a peer dependency of `@meteorjs/rspack`, because `swc-loader` resolves it from the user's project. The user's app installs it as part of the Rspack integration (the `rspack` Atmosphere package's auto-install flow handles this).
- The bundler integration also requires `@swc/core` directly in `meteor-rspack/lib/swc.js` and `lib/localDependenciesHelpers.js` to parse user configs. That `@swc/core` resolves through the app's `node_modules`, so the version is controlled by what the Rspack integration installs at the project level, not by what `@meteorjs/swc-core` ships.

In short: the tool-side compile/minify path uses `@meteorjs/swc-core`, and the bundler-side loader path uses `@swc/core`. Both should advance together so the user's app and the tool agree on syntax support.

### Debugging notes

- Set `METEOR_PROFILE=1` and look for `SWC.compile` / `Babel.compile` entries in the report to confirm which path each file took.
- Set `meteor.modern.verbose` to `true` in `package.json` (or `meteor.modern.transpiler.verbose`) to log `[Transpiler] Used SWC ...` / `[Transpiler] Used Babel ...` lines per file, distinguishing `(app)`, `(package)`, and `(node_modules)` contexts.
- A `.swcrc` is parsed as JSON. `swc.config.js` and `swc.config.ts` are evaluated in a vm sandbox; any change to the resolver should be exercised against both the static `.swcrc` and the dynamic config paths.
- When config changes are not taking effect, check the mtime+hash cache in `initializeMeteorAppSwcrc`. The config is re-read only when the mtime changes (and, for dynamic configs, when the hash of the resolved object changes).

## Test coverage

Two complementary suites cover SWC:

- **Legacy self-test coverage**, run via `meteor self-test`. The relevant files are `tools/tests/modern.js` (covers transpiler on/off and `.swcrc` / `swc.config.js` paths) and `tools/tests/compiler-plugins.js` (covers the `SwcCompiler` registered through `Plugin.registerCompiler`). These tests assert profile output (`/SWC\.compile/`, `/Babel\.compile/`) and verbose log lines like `[Transpiler] Used SWC.*(app)`. They catch regressions in how files are routed between SWC and Babel, how custom configs are picked up, and how legacy targets behave when modern mode is off.
- **Modern E2E coverage**, run via the Jest + Playwright suite under `tools/e2e-tests/`. The `typescript` app exercises a real `swc.config.ts` (including a type-only `import type { Config } from '@swc/core'`), `Meteor.extendSwcConfig` path aliases, and the Rspack `swc-loader` end-to-end. These tests catch regressions in the bundler's SWC path rather than the tool's transpiler path. See [`../rspack/E2E_COVERAGE.md`](../rspack/E2E_COVERAGE.md) for the full matrix.

When to run which:

- Touching `packages/babel-compiler`, `packages/standard-minifier-js`, or anything in the tool that calls `@meteorjs/swc-core`: run the self-tests in `tools/tests/modern.js` and `compiler-plugins.js`.
- Touching `npm-packages/meteor-rspack/lib/swc.js`, the bundler-side config parsing, or any helper from `@meteorjs/rspack` related to SWC: run the Rspack E2E suite, at minimum the `typescript` app.
- Changing the SWC version (either `@meteorjs/swc-core` or `@swc/core`): run both, since the two paths share user-facing config files.

## Common maintenance tasks

This section covers the typical workflows for bumping the SWC dependencies safely. 
Publishing a new `@meteorjs/swc-core` wrapper and rolling it into Meteor core are two stages of a single task. Do not split them; both must advance together so the tool path and the bundler path agree on syntax support.

### Stage 1: Publish the New Wrapper (`@meteorjs/swc-core`)

The wrapper package lives in the [`meteor/meteor-package-install-swc`](https://github.com/meteor/meteor-package-install-swc) repository.

**Steps to publish:**

```bash
# 1. Clone or pull the latest wrapper repository
git clone https://github.com/meteor/meteor-package-install-swc
cd meteor-package-install-swc

# 2. Update the wrapper configuration
# - Open `install.js` and update the `@swc/core` version in the inline `dependencies` block.
# - Open `package.json` and set `"version"` to match the new SWC version exactly.

# 3. Regenerate the lockfile and verify
npm install
rm -rf .swc node_modules
npm install
node -e "require('./index.js')" # Must load without throwing

# 4. Commit and Publish (requires @meteorjs npm org publish rights)
git commit -am "bump @swc/core version to <version>"
npm publish --access public

# 5. Verify the publish succeeded
npm view @meteorjs/swc-core version
```

### Stage 2: Roll the Wrapper into Meteor Core

Once the wrapper is live on npm, update the `meteor/meteor` codebase to consume it.

**Steps to update Meteor core:**

**1. Update the Core Packages**
Update the `@meteorjs/swc-core` version string in these files:
- `packages/babel-compiler/package.js` (top-level `Npm.depends`)
- `packages/standard-minifier-js/package.js` (plugin `Npm.depends`)

**2. Update the Bundler Integration (NPM Package)**
Bump the `@swc/core` peer dependency range in `npm-packages/meteor-rspack/package.json`.

```bash
# Refresh the lockfiles
cd packages/babel-compiler/.npm/package && meteor npm install
cd ../../../../packages/standard-minifier-js/.npm/plugin/minifyStdJS && meteor npm install
cd ../../../../../npm-packages/meteor-rspack && npm install
```

**3. Update Option Resolvers (If SWC API Changed)**
If new SWC options are required, update:
- `compileWithSwc` and the resolver in `packages/babel-compiler/babel-compiler.js`
- Loader defaults in `npm-packages/meteor-rspack/lib/meteorRspackConfigFactory.js` (and `meteorRspackHelpers.js`)
- Config parser in `npm-packages/meteor-rspack/lib/swc.js`

**4. Verify Compatibility via Tests**
Run the self-tests and the E2E suite to ensure transpilation and bundling paths are intact:

```bash
meteor self-test --file modern.js
meteor self-test --file compiler-plugins.js

# Tip: Run `npm run install:e2e` first if the E2E suite fails to start
npm run test:e2e
```

**5. Bump Atmosphere Package Versions**
Use the [`version-bump`](../../../.github/skills/version-bump/SKILL.md) skill to bump `babel-compiler` and `standard-minifier-js`. Downstream packages will re-release automatically.
