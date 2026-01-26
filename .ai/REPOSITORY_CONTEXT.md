# Meteor Repository Context

> A comprehensive guide to understanding the Meteor monorepo structure and source code organization.
> This file serves as high-context documentation for developers and AI assistants working with the codebase.

## Table of Contents

- [Overview](#overview)
- [Top-Level Directory Structure](#top-level-directory-structure)
- [Core Packages (`/packages`)](#core-packages-packages)
- [Modern Utilities & Integrations](#modern-utilities--integrations)
- [Build System & CLI (`/tools`)](#build-system--cli-tools)
- [NPM Packages (`/npm-packages`)](#npm-packages-npm-packages)
- [Scripts & Automation (`/scripts`)](#scripts--automation-scripts)
- [Documentation (`/docs`, `/guide`, `/v3-docs`)](#documentation)
- [CI/CD Configuration](#cicd-configuration)
- [Configuration Files](#configuration-files)
- [Architecture Overview](#architecture-overview)
- [Development Conventions](#development-conventions)
- [Common Patterns](#common-patterns)

---

## Overview

Meteor is a full-stack JavaScript platform for developing modern web and mobile applications. This monorepo contains:

- **144 core packages** providing Meteor's functionality
- **Build system (Isobuild)** for compiling and bundling applications
- **CLI tool** for project management and development
- **Multiple UI framework integrations** (React, Vue, Svelte, Angular, Blaze)
- **Real-time data layer** via DDP (Distributed Data Protocol)
- **Integrated MongoDB support** with reactive queries
- **Mobile support** via Cordova integration

---

## Top-Level Directory Structure

```
meteor-3/
├── packages/              # Core Meteor packages
├── tools/                 # Meteor CLI tool & build system (Isobuild)
├── npm-packages/          # Published npm packages
├── v3-docs/               # Meteor 3.x documentation
├── docs/, guide/          # Legacy documentation (Meteor 2.x)
├── scripts/               # Build & release automation
├── dev_bundle/            # Precompiled Node.js, npm, MongoDB binaries
├── .github/               # GitHub Actions workflows
├── .circleci/             # CircleCI configuration
├── meteor                 # Main CLI entry point (bash)
├── meteor.bat             # Windows CLI entry point
├── package.json           # Root npm configuration
└── tsconfig.json          # TypeScript configuration
```

---

## Core Packages (`/packages`)

The `/packages` directory contains Meteor's modular core functionality organized by domain.

### Authentication & Accounts (14 packages)

| Package | Description |
|---------|-------------|
| `accounts-base` | Foundation for the user account system |
| `accounts-password` | Password-based authentication |
| `accounts-passwordless` | Magic-link/token-based authentication |
| `accounts-2fa` | Two-factor authentication support |
| `accounts-ui` / `accounts-ui-unstyled` | Pre-built UI components for auth |
| `accounts-oauth` | OAuth protocol support |
| `oauth` / `oauth1` / `oauth2` | OAuth implementation |
| `oauth-encryption` | Encrypted OAuth token storage |
| `service-configuration` | OAuth provider configuration |

**Social Login Providers:**
- `accounts-facebook`, `accounts-github`, `accounts-google`
- `accounts-twitter`, `accounts-meetup`, `accounts-weibo`
- `accounts-meteor-developer`

### Data & Database (13 packages)

| Package | Description |
|---------|-------------|
| `mongo` | MongoDB integration and collection API |
| `minimongo` | Client-side MongoDB emulation |
| `mongo-id` | MongoDB ObjectID generation |
| `mongo-livedata` | Reactive MongoDB queries |
| `npm-mongo` | MongoDB Node.js driver wrapper |
| `mongo-dev-server` | Development MongoDB server |
| `ddp` | Distributed Data Protocol meta-package |
| `ddp-common` | Shared DDP utilities |
| `ddp-client` | DDP client implementation |
| `ddp-server` | DDP server implementation |
| `ddp-rate-limiter` | Rate limiting for DDP methods/subscriptions |
| `ejson` | Extended JSON serialization |

### Build System & Compilation (18 packages)

| Package | Description |
|---------|-------------|
| `babel-compiler` | JavaScript transpilation via Babel |
| `babel-runtime` | Babel runtime helpers |
| `ecmascript` | ECMAScript 2015+ support |
| `ecmascript-runtime` | ES6+ runtime polyfills |
| `typescript` | TypeScript compilation support |
| `modules` | ES modules system |
| `modules-runtime` | Module runtime implementation |
| `modules-runtime-hot` | Hot module reloading runtime |
| `hot-code-push` | Live code updates |
| `hot-module-replacement` | HMR support |
| `rspack` | Rspack bundler integration |
| `boilerplate-generator` | HTML boilerplate generation |
| `dynamic-import` | Dynamic `import()` support |
| `caching-compiler` | Build cache management |

### Minification & Assets (6 packages)

| Package | Description |
|---------|-------------|
| `minifier-js` | JavaScript minification (terser) |
| `minifier-css` | CSS minification |
| `standard-minifier-js` | Default JS minifier package |
| `standard-minifier-css` | Default CSS minifier package |
| `standard-minifiers` | Meta-package for minifiers |
| `static-html` | Static HTML file processing |

### Web & Server (11 packages)

| Package | Description |
|---------|-------------|
| `webapp` | HTTP server and request handling |
| `webapp-hashing` | Asset fingerprinting |
| `reload` | Client-side app reload mechanism |
| `reload-safetybelt` | Reload failure recovery |
| `autoupdate` | Automatic client updates |
| `browser-policy` | Content Security Policy |
| `force-ssl` | HTTPS enforcement |
| `allow-deny` | Collection permission rules |
| `fetch` | HTTP Fetch API polyfill |
| `routepolicy` | Route-based policies |

### Client-Side Utilities (16 packages)

| Package | Description |
|---------|-------------|
| `tracker` | Reactive dependency tracking |
| `reactive-var` | Single reactive value |
| `reactive-dict` | Reactive key-value store |
| `session` | Client-side session storage |
| `localstorage` | LocalStorage wrapper |
| `socket-stream-client` | WebSocket client |
| `random` | Cryptographic random generation |
| `check` | Runtime type checking |
| `underscore` | Utility library |
| `base64` | Base64 encoding/decoding |
| `diff-sequence` | Array diffing algorithm |
| `id-map` | ID-based mapping |
| `ordered-dict` | Ordered dictionary |

### Testing (6 packages)

| Package | Description |
|---------|-------------|
| `tinytest` | Meteor's built-in test framework |
| `tinytest-harness` | Test harness utilities |
| `test-helpers` | Testing utility functions |
| `test-in-browser` | Browser-based test runner |
| `test-in-console` | Console-based test runner |

### Context & Roles

| Package | Description |
|---------|-------------|
| `context` | Request context management (AsyncLocalStorage) |
| `roles` | User roles and permissions system |

### Deprecated Packages (`/packages/deprecated/`)

40+ legacy packages maintained for backward compatibility:
- UI libraries: `amplify`, `backbone`, `d3`, `handlebars`
- Legacy OAuth: `facebook`, `github`, `google` (use `accounts-*` instead)
- Config UIs: `*-config-ui` packages
- Others: `jquery-history`, `jshint`, `jsparse`, `deps` (use `tracker`)

### Development-Only Packages

| Package | Description |
|---------|-------------|
| `autopublish` | Auto-publish all collections (remove in production) |
| `insecure` | Allow all database writes (remove in production) |

---

## Modern Utilities & Integrations

This section covers utility packages designed for modern bundler integrations (Rspack, Vite, Webpack) and native solutions (CapacitorJS).

### tools-core (`/packages/tools-core`)

**Central utility package** providing helpers for npm, logging, process management, and Meteor configuration. This is the foundation for modern tool integrations using Meteor build plugin lifecycle to manage new tools. 

#### Logging Module (`lib/log.js`)

```javascript
import { logProgress, logError, logInfo, logSuccess } from 'meteor/tools-core';

logProgress('Building application...');  // Blue
logSuccess('Build complete');            // Green
logError('Build failed');                // Red
logInfo('Using Rspack bundler');         // Purple
```

Respects `METEOR_DISABLE_COLORS` environment variable.

#### NPM Management Module (`lib/npm.js`)

| Function | Description |
|----------|-------------|
| `getNodeBinaryPath(binaryName)` | Gets path to Node binaries (npm, npx, node) |
| `checkNpmDependencyExists(dep, opts)` | Checks if npm package is installed |
| `checkNpmBinaryExists(binary, opts)` | Checks if binary exists in node_modules/.bin |
| `checkNpmDependencyVersion(dep, opts)` | Validates semver with conditions (gte, lt, eq) |
| `installNpmDependency(deps, opts)` | Installs dependencies (npm/yarn, dev/exact flags) |
| `getNpmCommand(args)` | Returns npm command with `meteor npm` fallback |
| `getNpxCommand(args)` | Returns npx command with `meteor npx` fallback |
| `getYarnCommand(args)` | Gets yarn command path |
| `isYarnProject(opts)` | Detects yarn projects (yarn.lock, packageManager) |
| `getMonorepoPath(opts)` | Detects monorepo root (workspaces, lerna, pnpm) |
| `isMonorepo(opts)` | Boolean monorepo detection |

#### Process Management Module (`lib/process.js`)

| Function | Description |
|----------|-------------|
| `spawnProcess(cmd, args, opts)` | Spawns process with streaming output, color preservation |
| `stopProcess(proc, opts)` | Graceful termination with SIGTERM/SIGKILL fallback |
| `isProcessRunning(proc)` | Checks if process is still running |
| `isPortAvailable(port, host)` | Checks if port is free |
| `waitForPort(port, opts)` | Waits for port availability with timeout |

Options for `spawnProcess`: `env`, `cwd`, `detached`, `onStdout`, `onStderr`, `onExit`, `onError`

#### Meteor Configuration Module (`lib/meteor.js`)

**Application Configuration:**

| Function | Description |
|----------|-------------|
| `getMeteorAppDir()` | Gets application root directory |
| `getMeteorAppPackageJson()` | Parses app's package.json |
| `getMeteorAppConfig()` | Retrieves Meteor config from package.json or Plugin |
| `getMeteorAppPort()` | Gets app port from environment |
| `getMeteorAppConfigModern()` | Gets modern bundler configuration |
| `isMeteorAppConfigModernVerbose()` | Checks verbose flag |
| `hasMeteorAppConfigAutoInstallDeps()` | Auto-install deps flag |

**Entry Points:**

| Function | Description |
|----------|-------------|
| `getMeteorAppEntrypoints()` | Gets main/test modules for client/server |
| `getMeteorInitialAppEntrypoints()` | Gets initial entry points with HTML detection |
| `isMeteorAppTestModule()` | Checks if project is test module |
| `setMeteorAppEntrypoints(opts)` | Sets entry points via environment variables |
| `setMeteorAppIgnore(pattern)` | Sets file ignore patterns |
| `setMeteorAppCustomScriptUrl(url)` | Sets custom script URLs |

**Command Detection:**

| Function | Description |
|----------|-------------|
| `isMeteorAppRun()` | Running in 'run' mode |
| `isMeteorAppBuild()` | Running in 'build' or 'deploy' |
| `isMeteorAppUpdate()` | Running in 'update' |
| `isMeteorAppTest()` | In test mode |
| `isMeteorAppTestFullApp()` | Test mode with full-app flag |
| `isMeteorAppTestWatch()` | Test mode in watch mode |
| `isMeteorAppNativeAndroid()` | Native Android mode |
| `isMeteorAppNativeIos()` | Native iOS mode |
| `isMeteorAppNative()` | Any native mode |
| `isMeteorAppDevelopment()` | Development mode |
| `isMeteorAppProduction()` | Production mode |
| `isMeteorAppDebug()` | Debug mode |

**Package Detection:**

| Function | Description |
|----------|-------------|
| `isMeteorBlazeProject()` | Has blaze/blaze-html-templates |
| `isMeteorBlazeHotProject()` | Blaze with hot reload |
| `isMeteorCoffeescriptProject()` | Has CoffeeScript |
| `isMeteorLessProject()` | Has Less CSS |
| `isMeteorScssProject()` | Has SCSS/Sass |
| `isMeteorTypescriptProject()` | Has TypeScript |
| `isMeteorBundleVisualizerProject()` | Has bundle visualizer |
| `isMeteorPackagesTest()` | test-packages command |

**File Operations:**

| Function | Description |
|----------|-------------|
| `getMeteorAppFilesAndFolders(opts)` | Scans app directory (recursive, with ignore) |
| `getMeteorAppPackages()` | Lists all loaded packages |
| `getMeteorEnvPackageDirs()` | Gets package directories from env vars |
| `getMeteorToolsRequire(filePath)` | Requires module relative to Meteor tools |

#### Global State Module (`lib/global-state.js`)

Maintains persistent state across file changes during development:

```javascript
import { getGlobalState, setGlobalState, removeGlobalState, clearGlobalState } from 'meteor/tools-core';

setGlobalState('buildStartTime', Date.now());
const startTime = getGlobalState('buildStartTime');
```

#### Git Management Module (`lib/git.js`)

| Function | Description |
|----------|-------------|
| `isGitRepository(dir)` | Checks if directory is git repo |
| `gitignoreExists(dir)` | Checks .gitignore existence |
| `ensureGitignoreExists(dir, entries)` | Creates .gitignore with initial entries |
| `getMissingGitignoreEntries(dir, entries)` | Finds missing entries |
| `addGitignoreEntries(dir, entries, ctx)` | Adds entries with context logging |

#### String Utilities (`lib/string.js`)

| Function | Description |
|----------|-------------|
| `capitalizeFirstLetter(str)` | Capitalizes first character |
| `shuffleString(str)` | Shuffles string characters |
| `joinWithAnd(items, opts)` | Human-readable list ("a, b, and c") |

#### Ignore Patterns (`lib/ignore.js`)

```javascript
import { buildUnignorePatterns } from 'meteor/tools-core';

// Builds gitignore-style negation patterns
const patterns = buildUnignorePatterns(inputPaths, {
  includeAllAncestors: true,
  includeGlobForDirs: true,
  skipLevel: 0
});
```

---

### Rspack Integration (`/packages/rspack`)

Modern bundler integration using Rspack (Rust-based Webpack alternative).

**Package Structure:**

| File | Description |
|------|-------------|
| `lib/constants.js` | Default versions, global state keys, build contexts |
| `lib/dependencies.js` | Dependency checking and auto-installation |
| `lib/build-context.js` | Build directory management |
| `lib/config.js` | Meteor configuration for Rspack |
| `lib/processes.js` | Rspack process spawning |
| `lib/compilation.js` | Compilation tracking |

**Build Contexts:**

| Context | Directory | Purpose |
|---------|-----------|---------|
| `RSPACK_BUILD_CONTEXT` | `_build` | Build output |
| `RSPACK_ASSETS_CONTEXT` | `build-assets` | Static assets |
| `RSPACK_CHUNKS_CONTEXT` | `build-chunks` | Chunk bundles |
| `RSPACK_DOCTOR_CONTEXT` | `.rsdoctor` | Analysis/diagnostics |

**Key Dependencies:**
- `@rspack/core` ^1.7.1
- `@meteorjs/rspack` ^0.3.56 (configuration logic)
- `@rspack/plugin-react-refresh` ^1.4.3
- `swc-loader` ^0.2.6

**Integration with tools-core:**
- Uses `getMeteorInitialAppEntrypoints()` for entry points
- Uses command detection functions for build mode awareness
- Uses process spawning and npm utilities

---

### TypeScript Compiler (`/packages/typescript`)

Compiler plugin for TypeScript/TSX file compilation.

**Registered Plugin:** `compile-typescript`

**Supported Extensions:** `.ts`, `.tsx`

**Implied Packages:** `modules`, `ecmascript-runtime`, `babel-runtime`, `promise`, `dynamic-import`

**Features:**
- Transpiles TypeScript before Babel processing
- Supports client/server/legacy browser targets
- Integrates with React Fast Refresh for HMR

**Limitations:**
- Per-file transpilation (no cross-file type analysis)
- No tsconfig.json support (Meteor manages settings)
- No type checking during compilation
- No .d.ts generation

---

### WebApp & Express (`/packages/webapp`)

HTTP server integration using Express.js 5.x framework.

**Key APIs:**

```javascript
import { WebApp } from 'meteor/webapp';

// Middleware registration
WebApp.connectHandlers.use('/api', myMiddleware);
WebApp.handlers.use(compression());

// Direct Express access
WebApp.expressApp.get('/health', (req, res) => res.send('OK'));

// Server instance
WebApp.httpServer;

// Hooks
WebApp.onListening(() => console.log('Server ready'));
```

**Express Exports:**

| Property | Description |
|----------|-------------|
| `WebApp.connectHandlers` | Express middleware registry (legacy name) |
| `WebApp.handlers` | Current middleware registry |
| `WebApp.rawConnectHandlers` | Raw Express handlers |
| `WebApp.expressApp` | Direct Express app instance |
| `WebApp.httpServer` | HTTP server instance |
| `WebApp.express` | Express module export |

**Dependencies:** express@5.1.0, cookie-parser@1.4.6, compression@1.7.4, errorhandler@1.5.1

---

### Static HTML Tools (`/packages/static-html-tools`)

Utilities for static HTML template processing.

```javascript
import { TemplatingTools } from 'meteor/static-html-tools';

// Parse HTML for specific tags
const tags = TemplatingTools.scanHtmlForTags({
  sourceName: 'template.html',
  contents: htmlString,
  tagNames: ['template', 'head', 'body']
});

// Caching compiler for build plugins
const compiler = new TemplatingTools.CachingHtmlCompiler(/* options */);
```

---

### Test Helpers (`/packages/test-helpers`)

Comprehensive testing utilities for Meteor applications.

**Async Testing:**

```javascript
import { testAsyncMulti, simplePoll, waitUntil } from 'meteor/test-helpers';

// Wait for condition
await waitUntil(() => someCondition, { timeout: 5000, interval: 100 });

// Poll until ready
simplePoll(() => isReady(), successCallback, failCallback);
```

**DOM/UI Testing:**

```javascript
import { clickElement, simulateEvent, canonicalizeHtml, renderToDiv } from 'meteor/test-helpers';

clickElement(button);
simulateEvent(input, 'keydown', { keyCode: 13 });
const normalized = canonicalizeHtml(html);
```

**Connection Testing:**

```javascript
import { makeTestConnection, captureConnectionMessages } from 'meteor/test-helpers';

const conn = makeTestConnection(clientId);
const messages = captureConnectionMessages(server);
```

**Utilities:**

| Function | Description |
|----------|-------------|
| `SeededRandom` | Predictable random for deterministic tests |
| `try_all_permutations()` | Test all permutations of inputs |
| `withCallbackLogger()` | Track callback invocations |
| `mockBehaviours()` | Behavior mocking |

---

### Callback Hook (`/packages/callback-hook`)

Generic callback/hook registration system used throughout Meteor.

```javascript
import { Hook } from 'meteor/callback-hook';

const onUserLogin = new Hook();

// Register callbacks
const stop = onUserLogin.register((user) => {
  console.log('User logged in:', user._id);
});

// Invoke all callbacks
onUserLogin.each((callback) => callback(user));

// Unregister
stop.stop();
```

**Used By:** accounts-base, webapp, ddp-server, autoupdate

---

### Accounts Base (`/packages/accounts-base`)

Core authentication system with middleware integration.

**Key Features:**
- Rate limiting via ddp-rate-limiter
- DDP protocol for realtime session updates
- Callback hooks for auth events
- WebApp middleware integration

```javascript
import { Accounts } from 'meteor/accounts-base';

// Auth hooks
Accounts.onLogin((info) => { /* ... */ });
Accounts.onLogout((info) => { /* ... */ });
Accounts.onLoginFailure((info) => { /* ... */ });

// Validate login attempts
Accounts.validateLoginAttempt((attempt) => {
  return attempt.allowed;
});
```

---

## Build System & CLI (`/tools`)

The `/tools` directory contains Meteor's build system (Isobuild) and command-line interface.

### Directory Structure

```
tools/
├── cli/                   # Command-line interface
├── isobuild/              # Build system core
├── packaging/             # Package management
├── runners/               # App execution engines
├── fs/                    # File system utilities
├── cordova/               # Mobile/Cordova support
├── tool-env/              # Tool environment setup
├── utils/                 # Core utilities
├── tests/                 # Tool test suite
├── static-assets/         # Project templates
├── console/               # REPL implementation
└── project-context.js     # Project dependency resolution
```

### CLI (`/tools/cli/`)

| File | Description |
|------|-------------|
| `main.js` | CLI entry point and command dispatcher |
| `commands.js` | Main command implementations |
| `commands-packages.js` | Package management commands |
| `commands-packages-query.js` | Package query functionality |
| `commands-cordova.js` | Cordova/mobile commands |
| `help.txt` | CLI help documentation |

**Key Commands:**
- `meteor create` - Create new projects
- `meteor run` - Run development server
- `meteor build` - Build for production
- `meteor deploy` - Deploy to Galaxy
- `meteor add/remove` - Package management
- `meteor mongo` - MongoDB shell access
- `meteor shell` - Server-side REPL

### Isobuild (`/tools/isobuild/`)

The core build system that compiles packages and applications.

| File | Description |
|------|-------------|
| `bundler.js` | High-level bundling orchestration |
| `compiler.js` | Package compilation |
| `builder.js` | File system output |
| `isopack.js` | Package format handling |
| `isopack-cache.js` | Build cache management |
| `package-source.js` | Package source representation |
| `package-api.js` | Package API interface |
| `linker.js` | Module wrapping and linking |
| `import-scanner.ts` | Import statement parsing |
| `resolver.ts` | Module resolution |
| `meteor-npm.js` | NPM integration |
| `compiler-plugin.js` | Compiler plugin API |
| `build-plugin.js` | Build plugin implementation |

### Packaging (`/tools/packaging/`)

| File | Description |
|------|-------------|
| `package-client.js` | Package server client |
| `catalog/catalog.js` | Package catalog interface |
| `tropohouse.js` | Package repository management |
| `warehouse.js` | Package warehouse |
| `release.js` | Release management |
| `updater.js` | Package updater |

### Runners (`/tools/runners/`)

| File | Description |
|------|-------------|
| `run-app.js` | Web application runner |
| `run-mongo.js` | MongoDB server runner |
| `run-proxy.js` | Development proxy |
| `run-all.js` | Multi-runner orchestration |
| `run-hmr.js` | Hot module reload runner |
| `run-log.js` | Logging utilities |

### File System (`/tools/fs/`)

| File | Description |
|------|-------------|
| `files.ts` | File operation helpers |
| `watch.ts` | File watching/monitoring |
| `safe-watcher.ts` | Safe file watcher |
| `optimistic.ts` | Optimistic I/O caching |

### Cordova (`/tools/cordova/`)

| File | Description |
|------|-------------|
| `builder.js` | Cordova app builder |
| `project.js` | Cordova project management |
| `runner.js` | Cordova app runner |
| `index.js` | Cordova integration entry |

### Project Templates (`/tools/static-assets/`)

Available project templates via `meteor create --<template>`:

| Template | Description |
|----------|-------------|
| `skel-react` | React with hooks |
| `skel-vue` | Vue.js integration |
| `skel-svelte` | Svelte integration |
| `skel-angular` | Angular integration |
| `skel-blaze` | Blaze templating |
| `skel-typescript` | TypeScript setup |
| `skel-tailwind` | Tailwind CSS |
| `skel-chakra-ui` | Chakra UI |
| `skel-solid` | Solid.js |
| `skel-apollo` | Apollo GraphQL |
| `skel-minimal` | Minimal setup |
| `skel-bare` | Bare bones |
| `skel-full` | Full-featured |

### Key Components

#### Project Context (`project-context.js`)

The ProjectContext class manages:
- Package version resolution
- Dependency graph construction
- Catalog management
- Build configuration

#### Upgraders (`upgraders.js`)

Handles migrations between Meteor versions:
- Database schema updates
- Configuration migrations
- Package compatibility fixes

---

## NPM Packages (`/npm-packages`)

Packages published to npm for external use and tooling support.

### Core Tooling

| Package | npm Name | Version | Description |
|---------|----------|---------|-------------|
| `meteor-babel` | `@meteorjs/babel` | 7.20.1 | Babel wrapper for ES2015+ transpilation |
| `babel-preset-meteor` | `@meteorjs/babel-preset-meteor` | 7.10.4 | Babel preset with 40+ Meteor-specific transforms |
| `meteor-rspack` | `@meteorjs/rspack` | 0.3.56 | Rspack configuration builder |
| `meteor-promise` | `meteor-promise` | 0.9.2 | ES6 Promise with Fiber support |

### Browser Compatibility

| Package | Description |
|---------|-------------|
| `meteor-node-stubs` | Node.js core module polyfills for browser (crypto, buffer, stream, path, etc.) |

### Development Tools

| Package | Description |
|---------|-------------|
| `eslint-plugin-meteor` | Meteor-specific ESLint rules (v7.4.1) |
| `eslint-config-meteor` | ESLint configuration preset |
| `meteor-installer` | CLI tool for Meteor installation |

### Mobile

| Package | Description |
|---------|-------------|
| `cordova-plugin-meteor-webapp` | Cordova plugin for hot code push |

---

## Scripts & Automation (`/scripts`)

### Admin Scripts (`/scripts/admin/`)

| Script | Description |
|--------|-------------|
| `bump-all-version-numbers.js` | Version bumping |
| `build-dev-bundle-common.sh` | Dev bundle building |
| `generate-dev-bundle.sh` | Dev bundle generation |
| `make-release-tarballs.sh` | Release packaging |
| `check-package-dependencies.rb` | Dependency checking |

### CI Scripts (`/scripts/ci/`)

Continuous integration automation scripts.

### Benchmarks (`/scripts/benchmarks/`)

Performance benchmarking utilities.

---

## Documentation

### Meteor 3.x Documentation (`/v3-docs`)

Current documentation for Meteor 3.x, including API reference and migration guides.

### Legacy Documentation (`/docs`, `/guide`)

These directories contain Meteor 2.x documentation and are maintained for historical reference only.

---

## CI/CD Configuration

### GitHub Actions (`/.github/workflows/`)

| Workflow | Description |
|----------|-------------|
| `e2e-tests.yml` | End-to-end testing |
| `docs.yml` | Documentation builds |
| `guide.yml` | Guide builds |
| `check-code-style.yml` | Linting and formatting |
| `check-syntax.yml` | Syntax validation |
| `npm-*.yml` | NPM package publishing |
| `windows-selftest.yml` | Windows testing |
| `test-deprecated-packages.yml` | Legacy package tests |

### CircleCI (`/.circleci/config.yml`)

Comprehensive CI/CD pipeline configuration.

---

## Configuration Files

| File | Description |
|------|-------------|
| `package.json` | Root npm dependencies |
| `package-lock.json` | Locked dependency versions |
| `tsconfig.json` | TypeScript configuration (ES2020, CommonJS) |
| `meteor` | Main CLI entry point (bash script) |
| `meteor.bat` | Windows CLI entry point |
| `.eslintignore` | ESLint exclusions |
| `.gitignore` | Git exclusions |
| `.envrc` | direnv environment setup |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Input (meteor command)                 │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLI Tool (/tools/cli/)                         │
│                 main.js → commands.js                            │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Project Context (project-context.js)                │
│         Package resolution, dependency graph, catalogs           │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Isobuild (/tools/isobuild/)                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Bundler (bundler.js)                  │    │
│  │              High-level build orchestration              │    │
│  └────────────┬─────────────┬─────────────┬────────────────┘    │
│               ▼             ▼             ▼                      │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│  │   Compiler    │ │    Linker     │ │ Import Scanner│          │
│  │ (compiler.js) │ │  (linker.js)  │ │(import-scan.ts│          │
│  └───────┬───────┘ └───────────────┘ └───────────────┘          │
│          ▼                                                       │
│  ┌───────────────────────────────────────────┐                  │
│  │              Build Plugins                 │                  │
│  │  Babel │ TypeScript │ CSS │ Custom        │                  │
│  └───────────────────────────────────────────┘                  │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Output (star.json, programs)                   │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Runners (/tools/runners/)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │  run-app.js │ │run-mongo.js │ │  run-hmr.js │                │
│  │  Node.js    │ │  MongoDB    │ │     HMR     │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Live Application                            │
│         DDP Server ↔ Minimongo Client ↔ Reactive UI              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **CLI** parses commands and initializes project context
2. **Project Context** resolves package versions and dependencies
3. **Isobuild** compiles packages using registered build plugins
4. **Bundler** orchestrates the build process and generates output
5. **Linker** wraps modules and sets up import/export relationships
6. **Runners** start the application with MongoDB and HMR support
7. **DDP** enables real-time data synchronization between server and client

---

## Development Quick Reference

### Running Meteor from Source

```bash
# Clone and enter the repository
cd meteor-3

# Run Meteor CLI from source
./meteor --help

# Create a new app
./meteor create my-app

# Run an app
cd my-app && ../meteor run
```

### Running Tests

```bash
# Run self-tests
./meteor self-test

# Run specific test
./meteor self-test "test name"

# Run package tests
./meteor test-packages ./packages/accounts-base
```

### Building Dev Bundle

```bash
./scripts/admin/generate-dev-bundle.sh
```

---

---

## Development Conventions

### Package Structure

Every Meteor package follows this structure:

```
packages/my-package/
├── package.js          # Package manifest (name, version, dependencies, exports)
├── my-package.js       # Main implementation (or split by concern)
├── my-package-server.js # Server-only code (optional)
├── my-package-client.js # Client-only code (optional)
├── my-package-tests.js  # Tests (loaded via api.addFiles in test mode)
└── README.md           # Documentation (optional)
```

### Package.js Anatomy

```javascript
Package.describe({
  name: 'my-package',
  version: '1.0.0',
  summary: 'Brief description',
  git: 'https://github.com/meteor/meteor.git',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom(['3.0']);  // Minimum Meteor version

  api.use([
    'ecmascript',            // ES2015+ support
    'mongo',                 // MongoDB integration
    'tracker'                // Reactivity (client)
  ]);

  api.use('accounts-base', { weak: true }); // Optional dependency

  api.mainModule('my-package-server.js', 'server');
  api.mainModule('my-package-client.js', 'client');

  api.export('MyPackage');   // Global export
});

Package.onTest(function(api) {
  api.use(['tinytest', 'my-package']);
  api.addFiles('my-package-tests.js');
});

Npm.depends({
  'lodash': '4.17.21'        // npm dependencies
});
```

### File Naming Conventions

| Pattern | Purpose |
|---------|---------|
| `*-server.js` | Server-only code |
| `*-client.js` | Client-only code |
| `*-common.js` | Shared code |
| `*-tests.js` | Test files |
| `*.d.ts` | TypeScript declarations |

### Build Target Architecture

| Target | Description |
|--------|-------------|
| `web.browser` | Modern browsers |
| `web.browser.legacy` | Legacy browsers (IE11) |
| `web.cordova` | Cordova mobile apps |
| `server` | Node.js server |

---

## Common Patterns

### Adding a New Core Package

1. Create directory in `/packages/my-package/`
2. Add `package.js` with proper dependencies
3. Implement functionality with proper exports
4. Add tests in `*-tests.js`
5. Update version numbers if needed

### Modifying Build System

Key files to understand:
- `/tools/isobuild/bundler.js` - High-level bundling
- `/tools/isobuild/compiler.js` - Package compilation
- `/tools/project-context.js` - Dependency resolution
- `/tools/cli/commands.js` - CLI command handlers

### Adding CLI Commands

Edit `/tools/cli/commands.js` or create new command file:

```javascript
main.registerCommand({
  name: 'my-command',
  options: {
    'option-name': { type: String, short: 'o' }
  },
  catalogRefresh: new catalog.Refresh.Never()
}, function(options) {
  // Implementation
});
```

### Using tools-core in Packages

```javascript
// In package.js
api.use('tools-core');

// In implementation
import {
  logProgress,
  checkNpmDependencyExists,
  getMeteorAppConfig,
  spawnProcess
} from 'meteor/tools-core';

// Check and install dependencies
if (!checkNpmDependencyExists('@rspack/core')) {
  installNpmDependency(['@rspack/core@^1.7.1']);
}

// Spawn external process
const proc = spawnProcess('npx', ['rspack', 'build'], {
  cwd: getMeteorAppDir(),
  onStdout: (data) => logProgress(data)
});
```

### WebApp Middleware Pattern

```javascript
import { WebApp } from 'meteor/webapp';

// Add middleware before Meteor's default handlers
WebApp.rawConnectHandlers.use('/api', (req, res, next) => {
  // Runs before authentication
  next();
});

// Add middleware after authentication
WebApp.connectHandlers.use('/api', (req, res, next) => {
  // req.userId available if authenticated
  next();
});
```

### Build Plugin Pattern

```javascript
// In package.js
Package.registerBuildPlugin({
  name: 'compile-my-files',
  use: ['ecmascript', 'caching-compiler'],
  sources: ['plugin.js'],
  npmDependencies: { 'my-compiler': '1.0.0' }
});

// In plugin.js
Plugin.registerCompiler({
  extensions: ['myext'],
  archMatching: 'web'
}, () => new MyCompiler());

class MyCompiler extends CachingCompiler {
  getCacheKey(inputFile) {
    return inputFile.getSourceHash();
  }

  compileOneFile(inputFile) {
    const source = inputFile.getContentsAsString();
    const compiled = transform(source);
    inputFile.addJavaScript({
      data: compiled,
      path: inputFile.getPathInPackage() + '.js'
    });
  }
}
```

---

## Environment Variables

### Build & Runtime

| Variable | Description |
|----------|-------------|
| `METEOR_PACKAGE_DIRS` | Additional package directories |
| `METEOR_PROFILE` | Enable profiling output |
| `METEOR_WATCH_FORCE_POLLING` | Force polling file watcher |

### Testing

| Variable | Description |
|----------|-------------|
| `TEST_METADATA` | Test configuration JSON |
| `METEOR_TEST_PACKAGES` | Packages to test |

---

## Troubleshooting Guide

### Common Issues

**Package not found:**
- Check `/packages/` directory exists
- Verify `package.js` has correct `Package.describe({ name: ... })`
- Run `meteor reset` to clear cache

**Build plugin not running:**
- Ensure `Package.registerBuildPlugin()` is called
- Check `archMatching` matches target architecture
- Verify file extensions in `Plugin.registerCompiler()`

**npm dependency issues:**
- Check `Npm.depends()` in package.js
- Clear `.meteor/local/` directory
- Run `meteor npm install` in app directory

**tools-core functions not found:**
- Ensure `api.use('tools-core')` in package.js
- Check import path: `import { fn } from 'meteor/tools-core'`

### Debug Commands

```bash
# Verbose build output
METEOR_DEBUG_BUILD=1 meteor run

# Profile build performance
METEOR_PROFILE=1 meteor build

# Force rebuild
meteor reset && meteor run

# Run specific package tests
meteor test-packages ./packages/my-package --driver-package meteortesting:mocha
```

---

## Related Documentation

- [Meteor 3.x Docs](https://docs.meteor.com) - Official documentation
- [README.md](../README.md) - Project overview
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Developer setup guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](../SECURITY.md) - Security policy
- [GLOSSARY.md](../GLOSSARY.md) - Meteor terminology

---

## AI Assistant Notes

This section provides guidance for AI assistants working with this codebase.

### Key Entry Points

- **CLI commands**: Start at `/tools/cli/commands.js`
- **Build system**: Start at `/tools/isobuild/bundler.js`
- **Package lookup**: Check `/packages/<name>/package.js`
- **Modern bundler**: Check `/packages/rspack/` and `/packages/tools-core/`

### When Modifying Packages

1. Always read `package.js` first to understand dependencies and exports
2. Check for both client and server files (`*-client.js`, `*-server.js`)
3. Look for existing tests in `*-tests.js`
4. Understand the build target (web.browser, server, etc.)

### When Modifying Build Tools

1. Changes to `/tools/` affect the `meteor` CLI itself
2. Test changes with `./meteor self-test`
3. Build system is in `/tools/isobuild/`
4. CLI commands are in `/tools/cli/`

### Package Relationships

- `tools-core` → Used by `rspack`, `vite` integrations
- `accounts-base` → Used by all `accounts-*` packages
- `ddp-server` + `ddp-client` → Core realtime communication
- `mongo` → Depends on `minimongo` for client-side
- `webapp` → Foundation for all HTTP handling

### Version Patterns

Meteor uses `X.Y.Z-rcN.M` versioning where:
- `X.Y.Z` - Semantic version
- `rcN` - Release candidate number
- `M` - Package-specific revision
