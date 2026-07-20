# Modern Tools Maintainer Guide

Meteor's modern tooling ecosystem revolves around three core pillars: 
1. **SWC** (Transpiler/Minifier)
2. **Rspack** (Bundler Integration)
3. **Profiler** (Performance Tooling)

This directory provides the architectural overview and maintenance guides for these components. If you are looking for user-facing documentation, please refer to the [Modern Build Stack User Guide](../../v3-docs/docs/about/modern-build-stack/).

## Table of Contents

- [Integration Architecture](#integration-architecture)
- [The `tools-core` Helpers Package](#the-tools-core-helpers-package)
- [SWC Transpiler Integration](#swc-transpiler-integration)
- [Rspack Bundler Integration](#rspack-bundler-integration)
- [Profiler Tooling](#profiler-tooling)

---

## Integration Architecture

External tools plug into Meteor's bundler lifecycle through build plugins declared in their respective `package.js` files. We use two primary integration points:

1. **`Package.registerBuildPlugin`**
   Use this to spawn external processes or configure Meteor before the bundler runs.
   *Example:* Rspack uses this to initialize its dev server and build context.
   ```javascript
   Package.registerBuildPlugin({ name, sources, use });
   ```

2. **`Plugin.registerCompiler`**
   Use this to process specific source files during the build process.
   *Example:* TypeScript and Babel integrations use this to compile their respective files.
   ```javascript
   Plugin.registerCompiler({ extensions, filenames }, factory);
   ```

> **Design Principle:** Tooling integrations are scoped to their Atmosphere packages. Running `meteor add rspack` wires in the tool; removing it cleans it up completely. The core Meteor tool maintains zero hard-coded references to these external utilities.

---

## The `tools-core` Helpers Package

The `packages/tools-core` package provides shared, `devOnly` utilities for npm management, process handling, logging, and configuration. Every modern integration builds on top of it to avoid reinventing the wheel.

For complete documentation, see [`packages/tools-core/README.md`](../../packages/tools-core/README.md).

### Core Modules Overview

- **`lib/log.js` (Logging):** Provides colorful, consistent lifecycle logging (`logProgress`, `logSuccess`, etc.) that respects `METEOR_DISABLE_COLORS`.
- **`lib/npm.js` (Dependencies):** Handles npm/yarn validation and installation. Use helpers like `installNpmDependency` and `getNodeBinaryPath` to interact with project dependencies reliably.
- **`lib/process.js` (Processes):** Exposes `spawnProcess` to manage child processes with robust defaults (color preservation, graceful termination, and port coordination).
- **`lib/meteor.js` (Introspection):** Reads user configurations and detects project characteristics (e.g., `isMeteorAppTest`, `isMeteorBlazeProject`). It manages entry points dynamically via `setMeteorAppEntrypoints`.
- **`lib/global-state.js` (State):** Manages state across incremental rebuilds using `Package.meteor.global.persistentState`.
- **`lib/git.js` & `lib/ignore.js` (File System):** Automates `.gitignore` updates and manages complex file watcher exclusion rules.

---

## SWC Transpiler Integration

SWC serves as Meteor's modern transpiler and minifier. The core bundler utilizes `@meteorjs/swc-core` for packages, while app-level code is handled via Rspack's `swc-loader`.

- 📚 **Read the Maintainer Guide:** [`swc/README.md`](swc/README.md)

---

## Rspack Bundler Integration

Rspack is our Rust-based Webpack-compatible bundler integration. The `rspack` Atmosphere package hooks into the lifecycle, while `@meteorjs/rspack` provides the default configuration framework.

- 📚 **Read the Maintainer Guide:** [`rspack/README.md`](rspack/README.md)
- 📊 **Check E2E Coverage:** [`rspack/E2E_COVERAGE.md`](rspack/E2E_COVERAGE.md)
- 🧠 **Benchmark Memory:** [`rspack/MEMORY_BENCHMARK.md`](rspack/MEMORY_BENCHMARK.md)

### Quick Start: Memory Benchmarking

To run the Rspack memory benchmark locally and analyze retention across `meteor-tool` and child processes:

```bash
# Run the baseline memory benchmark against a local app
APP_PATH=/path/to/your-app \
TOUCH_FILE=server/main.js \
node scripts/build-stack-memory-bench.js
```

---

## Profiler Tooling

The profiler instruments the Meteor build tool to track performance bottlenecks, which is exposed to users via the `meteor profile` command.

- 📚 **Read the Maintainer Guide:** [`profiler/README.md`](profiler/README.md)
