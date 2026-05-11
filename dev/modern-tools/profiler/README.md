# Profiler

Two profilers live in the Meteor codebase: the built-in `METEOR_PROFILE` instrumentation that prints where time is spent inside the tool, and the `meteor profile` CLI that runs a controlled benchmark suite against an app. This document covers the maintenance flow for both.

End-user docs for `meteor profile` live at [`v3-docs/docs/cli/index.md#meteorprofile`](../../../v3-docs/docs/cli/index.md). The Meteor tool's internal profiler is documented in [`tools/PERFORMANCE.md`](../../../tools/PERFORMANCE.md).

- [**What the profiler is for**](#what-the-profiler-is-for): `METEOR_PROFILE` vs `meteor profile`, when to use each.
- [**Common maintenance tasks**](#common-maintenance-tasks): updating the `meteor profile` script and validating changes.

## What the profiler is for

There are two complementary profilers in the codebase:

- **`METEOR_PROFILE`**, the built-in tool profiler. Setting `METEOR_PROFILE=<threshold-ms>` makes any `meteor` command print a top-down profile of all annotated calls that exceed the threshold. Annotations come from `Profile.time(...)` / `Profile.run(...)` blocks scattered through `tools/`. Useful when investigating where time is going inside the tool itself (constraint solving, package load, bundler, watcher).
- **`meteor profile`**, the benchmark CLI. Wraps `meteor run` (or `meteor build` with `--build`) with the [`meteor/performance`](https://github.com/meteor/performance) suite and reports build time and/or bundle size metrics over a controlled set of runs. Useful when comparing two branches, two Meteor versions, or before-and-after of a perf change.

Use `METEOR_PROFILE` to find out *where* time is being spent; use `meteor profile` to get a stable, repeatable measurement of *how much* time or bytes a change costs or saves.

## Common maintenance tasks

### Update the `meteor profile` script

The CLI lives in `tools/cli/commands.js`. Two functions matter:

- `setupBenchmarkSuite(profilingPath)` at the top of the `meteor profile` flow. It clones the `meteor/performance` repository (sparse, `scripts/` only) into `<app>/node_modules/.cache/meteor/performance/scripts`. The clone uses a pinned branch:

  ```js
  const repoUrl = "https://github.com/meteor/performance";
  const branch  = "v3.4.0";
  ```

  Bump that `branch` constant when a new tag of the performance repo ships. Both the tar-based and the plain-`git clone` fallbacks use the same constant, so updating it once is enough.

- `doBenchmarkCommand(options)` invokes `scripts/monitor-bundler.sh <projectDir> <timestamp> <meteor-options>` with `METEOR_BUNDLE_SIZE`, `METEOR_BUNDLE_SIZE_ONLY`, and `METEOR_BUNDLE_BUILD` env vars derived from the `--size`, `--size-only`, and `--build` CLI flags. If the performance repo renames its script or its env contract, mirror the change here.

The `meteor profile` command itself is registered just below, at `main.registerCommand({ name: 'profile', ... }, doBenchmarkCommand)`. Options are merged from `buildCommands.options` and `runCommandOptions.options`, so most `meteor run` and `meteor build` flags pass through transparently.

#### When the script needs updating

- The pinned branch in `meteor/performance` has a new tag with metric changes worth picking up.
- A new sub-flag is added (for example, a separate `--client-size`). Add it to the `options:` block and forward it through `meteorSizeEnvs` / `meteorOptions`.
- A breaking change in the underlying `monitor-bundler.sh` contract requires a new env var or argument.

#### Validating that the profiler still works after changes

The profiler is not exercised by self-test or E2E; validate manually:

1. Pick a test app. Any of `tools/e2e-tests/apps/*` or a fresh `meteor create` works.
2. Run a fresh sandbox so the benchmark cache is cloned from scratch:

   ```bash
   rm -rf node_modules/.cache/meteor/performance
   meteor profile
   ```

   The output should include "Meteor profiling suite cloned to: ...", followed by the monitor running through the build.
3. Run with each flag and confirm the expected metric prints:

   ```bash
   meteor profile --build
   meteor profile --size
   meteor profile --size-only
   ```

4. Try a long build with `METEOR_IDLE_TIMEOUT=120` to confirm the timeout option still propagates.
5. If the change touched the clone path, delete the cache directory and run again to confirm both the tar path and the `git clone` fallback still produce a usable `scripts/` directory. (Force the fallback by temporarily renaming `tar` on `PATH`.)

#### Debugging notes

- The profiler is unsupported on Windows; `doBenchmarkCommand` throws early. WSL is the workaround.
- The clone fails fast if `git --version` is below 2.25. The script uses `git sparse-checkout` which requires that minimum.
- The cache directory is per-app (`<projectDir>/node_modules/.cache/meteor/performance`). If the suite scripts ever drift between projects, that is where to clean up.
- The performance repo's branch is pinned by tag (`v3.4.0` at time of writing). Avoid pointing at `main`, since unreviewed changes in the benchmark suite will silently affect every contributor's results.
- For deeper investigations, combine `meteor profile` with `METEOR_PROFILE=1 meteor run` (run separately): the first gives the end-to-end metric, the second points at the hot spots inside the tool.
