---
name: modern-tools
description: Use when working with tools-core utilities, rspack integration, or modern tooling. Covers logging, npm management, process spawning, git helpers, and Meteor app configuration APIs.
---

# Modern Tools

Utility packages for modern tooling, bundler integrations, and native solutions.

## tools-core (`/packages/tools-core`)

Central utility package providing helpers for npm, logging, process management, and Meteor configuration. This is the foundation for modern tool integrations.

### Logging Module (`lib/log.js`)

```javascript
import { logProgress, logError, logInfo, logSuccess } from 'meteor/tools-core';

logProgress('Building application...');  // Blue
logSuccess('Build complete');            // Green
logError('Build failed');                // Red
logInfo('Using Rspack bundler');         // Purple
```

Respects `METEOR_DISABLE_COLORS` environment variable.

### NPM Management Module (`lib/npm.js`)

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

### Process Management Module (`lib/process.js`)

| Function | Description |
|----------|-------------|
| `spawnProcess(cmd, args, opts)` | Spawns process with streaming output, color preservation |
| `stopProcess(proc, opts)` | Graceful termination with SIGTERM/SIGKILL fallback |
| `isProcessRunning(proc)` | Checks if process is still running |
| `isPortAvailable(port, host)` | Checks if port is free |
| `waitForPort(port, opts)` | Waits for port availability with timeout |

Options for `spawnProcess`: `env`, `cwd`, `detached`, `onStdout`, `onStderr`, `onExit`, `onError`

### Meteor Configuration Module (`lib/meteor.js`)

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

### Global State Module (`lib/global-state.js`)

Maintains persistent state across file changes during development:

```javascript
import { getGlobalState, setGlobalState, removeGlobalState, clearGlobalState } from 'meteor/tools-core';

setGlobalState('buildStartTime', Date.now());
const startTime = getGlobalState('buildStartTime');
```

### Git Management Module (`lib/git.js`)

| Function | Description |
|----------|-------------|
| `isGitRepository(dir)` | Checks if directory is git repo |
| `gitignoreExists(dir)` | Checks .gitignore existence |
| `ensureGitignoreExists(dir, entries)` | Creates .gitignore with initial entries |
| `getMissingGitignoreEntries(dir, entries)` | Finds missing entries |
| `addGitignoreEntries(dir, entries, ctx)` | Adds entries with context logging |

### String Utilities (`lib/string.js`)

| Function | Description |
|----------|-------------|
| `capitalizeFirstLetter(str)` | Capitalizes first character |
| `shuffleString(str)` | Shuffles string characters |
| `joinWithAnd(items, opts)` | Human-readable list ("a, b, and c") |

---

## Rspack Integration (`/packages/rspack`)

Modern bundler integration using Rspack (Rust-based Webpack alternative).

### Package Structure

| File | Description |
|------|-------------|
| `lib/constants.js` | Default versions, global state keys, build contexts |
| `lib/dependencies.js` | Dependency checking and auto-installation |
| `lib/build-context.js` | Build directory management |
| `lib/config.js` | Meteor configuration for Rspack |
| `lib/processes.js` | Rspack process spawning |
| `lib/compilation.js` | Compilation tracking |

### Build Contexts

| Context | Directory | Purpose |
|---------|-----------|---------|
| `RSPACK_BUILD_CONTEXT` | `_build` | Build output |
| `RSPACK_ASSETS_CONTEXT` | `build-assets` | Static assets |
| `RSPACK_CHUNKS_CONTEXT` | `build-chunks` | Chunk bundles |
| `RSPACK_DOCTOR_CONTEXT` | `.rsdoctor` | Analysis/diagnostics |

### Key Dependencies

- `@rspack/core` ^1.7.1
- `@meteorjs/rspack` ^0.3.56 (configuration logic)
- `@rspack/plugin-react-refresh` ^1.4.3
- `swc-loader` ^0.2.6

### Integration with tools-core

- Uses `getMeteorInitialAppEntrypoints()` for entry points
- Uses command detection functions for build mode awareness
- Uses process spawning and npm utilities

---

## TypeScript Compiler (`/packages/typescript`)

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

## WebApp & Express (`/packages/webapp`)

HTTP server integration using Express.js 5.x framework.

### Key APIs

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

### Express Exports

| Property | Description |
|----------|-------------|
| `WebApp.connectHandlers` | Express middleware registry (legacy name) |
| `WebApp.handlers` | Current middleware registry |
| `WebApp.rawConnectHandlers` | Raw Express handlers |
| `WebApp.expressApp` | Direct Express app instance |
| `WebApp.httpServer` | HTTP server instance |
| `WebApp.express` | Express module export |

**Dependencies:** express@5.1.0, cookie-parser@1.4.6, compression@1.7.4, errorhandler@1.5.1
