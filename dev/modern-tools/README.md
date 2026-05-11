# Modern Tools

Meteor's modern tooling has three integrated areas: the SWC transpiler/minifier, the Rspack bundler integration, and the profiler. This directory documents how those pieces wire into the build system, where they live in the codebase, and the maintenance tasks contributors most often touch.

End-user documentation lives in [`v3-docs/docs/about/modern-build-stack/`](../../v3-docs/docs/about/modern-build-stack/). These notes are the maintainer-facing counterpart.

- [**Build plugins for modern tool integration**](#build-plugins-for-modern-tool-integration): how external tools plug into the Meteor build via `Package.registerBuildPlugin` and `Plugin.registerCompiler`.
- [**`tools-core` helpers package**](#tools-core-helpers-package): shared utilities (npm, processes, logging, git, Meteor config) that every modern integration builds on.
- [**SWC case**](#swc-case): pointer to the SWC-specific maintainer notes.
- [**Rspack case**](#rspack-case): pointer to the Rspack-specific maintainer notes.
- [**Profiler case**](#profiler-case): pointer to the profiler maintainer notes.

## Build plugins for modern tool integration

Each modern tool plugs into the bundler lifecycle through a Meteor build plugin declared in a package's `package.js`. There are two integration points:

- `Package.registerBuildPlugin({ name, sources, use })`. Registers a plugin that runs in the Meteor tool's plugin context. The Rspack package uses this form to spawn the Rspack processes and configure Meteor before the bundler runs. See `packages/rspack/package.js`.
- `Plugin.registerCompiler({ extensions, filenames }, factory)`. Registers a compiler that processes specific source files during the build. The TypeScript package uses this form to register `compile-typescript`; the Babel compiler is invoked through the same mechanism by `caching-compiler`. See `packages/typescript/plugin.js` and `packages/babel-compiler/babel-compiler.js`.

Package-level tooling integrations keep the per-tool wiring inside the Atmosphere package that owns the dependency. Adding the package (for example `meteor add rspack`) brings the integration in; removing the package takes it out. The tool itself does not hard-code references to SWC, Rspack, or any other external tool.

## `tools-core` helpers package

`packages/tools-core` is the helpers package that modern integrations build on top of. It exposes shared utilities for npm, processes, logging, git, and Meteor-specific configuration, so each integration does not have to reinvent them. It is `devOnly`, used at build-plugin time as well as from the server entry.

Source: `packages/tools-core/lib/*.js`. The package is documented in `packages/tools-core/README.md`. Each helper module is summarized below.

### `lib/log.js`, colored progress logging

Adds `logProgress`, `logSuccess`, `logInfo`, `logError`, and `logRaw` helpers that wrap `console.log` with ANSI colors and a minimum line length. Respects `METEOR_DISABLE_COLORS`. Use these from any plugin that prints lifecycle messages so output stays consistent between SWC, Rspack, and future integrations. `getRunLog()` returns the `Plugin.runLogInstance` when available, for plugins that need to feed structured messages back into the Meteor run UI.

### `lib/npm.js`, npm/yarn dependency management

The npm module is the workhorse for any plugin that needs to inspect or install npm dependencies on the user's behalf. Highlights:

- `getNodeBinaryPath('npm' | 'npx' | 'node' | 'yarn')` and `getNodeBinEnv()` resolve binaries from Meteor's `dev_bundle`. Use them when spawning a child process that must use the same Node version Meteor is running on.
- `checkNpmDependencyExists`, `checkNpmDependencyVersion`, `checkNpmBinaryExists` read the project's `package.json` and `node_modules` to validate what is installed. The Rspack plugin uses these to decide whether `@rspack/core`, `@meteorjs/rspack`, and friends need to be added.
- `installNpmDependency(deps, { dev, exact, yarn })` installs missing dependencies, falling back to `meteor npm install` when the dev bundle npm cannot be located.
- `getNpmCommand`, `getNpxCommand`, `getYarnCommand` return the `{ command, args, prefix }` triple a plugin should pass to `spawnProcess`.
- `isYarnProject`, `isMonorepo`, `getMonorepoPath` answer common layout questions.

Caveat: these helpers parse `package.json` directly rather than invoking `npm ls`. That is intentional (it is much faster), but it means that the version reported is the declared range, not the installed lockfile version, unless `checkNodeModules: true` is passed.

### `lib/process.js`, process and port helpers

`spawnProcess(command, args, options)` wraps `child_process.spawn` with sensible defaults: `FORCE_COLOR=1`, decoded `onStdout`/`onStderr` callbacks, `onExit`/`onError` hooks, Windows `shell: true`, and a detached-mode escape hatch. Use it instead of calling `spawn` directly so streaming output stays color-preserving and detachment works the same way across plugins. `stopProcess` adds a graceful `SIGTERM` then `SIGKILL` fallback. `isProcessRunning`, `isPortAvailable`, and `waitForPort` round out the lifecycle utilities; Rspack uses `waitForPort` to coordinate the dev server with the Meteor server.

### `lib/meteor.js`, Meteor app introspection

The largest module. Helpers are grouped by purpose:

| Group | Functions | When to use |
|-------|-----------|-------------|
| App configuration | `getMeteorAppDir`, `getMeteorAppPackageJson`, `getMeteorAppConfig`, `getMeteorAppConfigModern`, `isMeteorAppConfigModernVerbose`, `hasMeteorAppConfigAutoInstallDeps`, `getMeteorAppPort` | Reading the user's `meteor.*` config from `package.json` (or `Plugin.getMeteorConfig()`, which `getMeteorAppConfig` prefers). |
| Entry points | `getMeteorAppEntrypoints`, `getMeteorInitialAppEntrypoints`, `setMeteorAppEntrypoints`, `setMeteorAppIgnore`, `setMeteorAppCustomScriptUrl`, `isMeteorAppTestModule` | Resolving or overriding client/server/test entry modules. `setMeteorAppEntrypoints` writes `METEOR_CONFIG_*` env vars and calls `global.reinitializeMeteorConfig?.()` so child processes pick up the change. `getMeteorInitialAppEntrypoints` also resolves the matching client HTML file. |
| Command/mode detection | `isMeteorAppRun`, `isMeteorAppBuild`, `isMeteorAppUpdate`, `isMeteorAppTest`, `isMeteorAppTestFullApp`, `isMeteorAppTestWatch`, `isMeteorAppNative` (+ `Android`/`Ios`), `isMeteorAppDevelopment`, `isMeteorAppProduction`, `isMeteorAppDebug`, `isMeteorAppProfile`, `isMeteorPackagesTest` | Branching plugin behavior on the current CLI subcommand and run mode. |
| Project detection | `isMeteorBlazeProject`, `isMeteorBlazeHotProject`, `isMeteorCoffeescriptProject`, `isMeteorLessProject`, `isMeteorScssProject`, `isMeteorTypescriptProject`, `isMeteorBundleVisualizerProject` | Detecting which optional packages the app uses, to enable or disable loaders and framework-specific wiring. |
| File system | `getMeteorAppFilesAndFolders`, `getMeteorAppPackages`, `getMeteorEnvPackageDirs`, `getMeteorToolsRequire` | Scanning the app tree, listing loaded packages, or requiring modules relative to the running `meteor` tool binary. |
| Process environment | `inheritMeteorToolNodeFlags` | Spreading `TOOL_NODE_FLAGS` into `NODE_OPTIONS` for spawned children. Controlled by `TOOL_NODE_FLAGS_INHERIT`. |

Most of these depend on `Plugin` and `Package.meteor.global` being available, so they only return meaningful values inside a build-plugin context or the running tool.

### `lib/global-state.js`, state across file changes

`getGlobalState`, `setGlobalState`, `removeGlobalState`, `clearGlobalState` read and write keys on `Package.meteor.global.persistentState`. This state survives across incremental rebuilds, which is the only place a build plugin can keep process handles, "already installed" flags, and similar one-shot markers. The Rspack plugin keys are listed in `packages/rspack/lib/constants.js#GLOBAL_STATE_KEYS`.

### `lib/git.js`, `.gitignore` maintenance

`isGitRepository`, `gitignoreExists`, `ensureGitignoreExists`, `getMissingGitignoreEntries`, `addGitignoreEntries`. The Rspack plugin uses these to add entries like the custom build context directory to `.gitignore` automatically.

### `lib/string.js`, small string utilities

`capitalizeFirstLetter`, `shuffleString`, `joinWithAnd` (for human-readable lists in log lines).

### `lib/ignore.js`, gitignore-style negation patterns

`buildUnignorePatterns(paths, options)` produces the `!` patterns required to keep specific files and folders visible to the watcher when a broader ignore rule would otherwise hide them. The defaults emit ancestor directories so paths like `assets/public/icon.png` are restored level by level.

## SWC case

SWC is the modern transpiler and minifier. The Meteor bundler ships `@meteorjs/swc-core` and uses it from `babel-compiler` and `standard-minifier-js`, while application code goes through SWC via the Rspack `swc-loader` in the bundler integration. See [`swc/README.md`](swc/README.md) for the full picture, including how the bundler's `@swc/core` relates to `@meteorjs/swc-core`.

## Rspack case

Rspack is the modern bundler integration. The `rspack` Atmosphere package wires Rspack into the Meteor lifecycle, and `@meteorjs/rspack` provides the default configuration. See [`rspack/README.md`](rspack/README.md) for the integration map, E2E testing strategy, and common maintenance tasks.

## Profiler case

The profiler tooling instruments the Meteor tool (via `METEOR_PROFILE`) and exposes `meteor profile` to run a benchmark suite against the current project. See [`profiler/README.md`](profiler/README.md) for the maintenance flow.
