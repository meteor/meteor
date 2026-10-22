# Profiler

Two profilers live in the Meteor codebase: the built-in `METEOR_PROFILE` instrumentation that prints where time is spent inside the tool, and the `meteor profile` CLI that runs a controlled benchmark suite against an app. This document covers the maintenance flow for both.

End-user docs for `meteor profile` live at [`v3-docs/docs/cli/index.md#meteorprofile`](../../../v3-docs/docs/cli/index.md). The Meteor tool's internal profiler is documented in [`tools/PERFORMANCE.md`](../../../tools/PERFORMANCE.md).

- [**What the profiler is for**](#what-the-profiler-is-for): `METEOR_PROFILE` vs `meteor profile`, when to use each.
- [**Common maintenance tasks**](#common-maintenance-tasks)
  - [Updating the `meteor profile` Script](#updating-the-meteor-profile-script)
  - [Validating Profiler Changes](#validating-profiler-changes)
  - [Debugging Notes](#debugging-notes)

## What the profiler is for

There are two complementary profilers in the codebase:

- **`METEOR_PROFILE`**, the built-in tool profiler. Setting `METEOR_PROFILE=<threshold-ms>` makes any `meteor` command print a top-down profile of all annotated calls that exceed the threshold. Annotations come from `Profile.time(...)` / `Profile.run(...)` blocks scattered through `tools/`. Useful when investigating where time is going inside the tool itself (constraint solving, package load, bundler, watcher).
- **`meteor profile`**, the benchmark CLI. Wraps `meteor run` (or `meteor build` with `--build`) with the [`meteor/performance`](https://github.com/meteor/performance) suite and reports build time and/or bundle size metrics over a controlled set of runs. Useful when comparing two branches, two Meteor versions, or before-and-after of a perf change.

Use `METEOR_PROFILE` to find out *where* time is being spent; use `meteor profile` to get a stable, repeatable measurement of *how much* time or bytes a change costs or saves.

## Common maintenance tasks

This section covers updating the `meteor profile` script and validating changes locally.

### Updating the `meteor profile` Script

The CLI implementation lives in `tools/cli/commands.js`. Updates are typically needed when the upstream `meteor/performance` repository ships a new tag or changes its monitoring script API.

**Steps to update:**

**1. Update the Pinned Performance Branch**
Locate `setupBenchmarkSuite` in `tools/cli/commands.js`. Change the `branch` constant to match the newly tagged release.

```javascript
// tools/cli/commands.js
const repoUrl = "https://github.com/meteor/performance";
const branch  = "v3.5.0"; // Bump this branch tag
```

**2. Synchronize CLI Arguments (If Needed)**
If new flags were added upstream (e.g., `--client-size`), locate `doBenchmarkCommand` and map the new flag into the `meteorSizeEnvs` environment variables.

### Validating Profiler Changes

The profiler is not covered by automated E2E tests, so manual verification is required.

**Steps to validate:**

```bash
# 1. Prepare a sandbox environment (e.g., an E2E test fixture)
cd tools/e2e-tests/apps/react

# 2. Clear the old performance script cache to force a fresh clone
rm -rf node_modules/.cache/meteor/performance

# 3. Verify the default profile run
meteor profile

# 4. Verify specific benchmarking flags
meteor profile --build
meteor profile --size
meteor profile --size-only

# 5. Verify timeouts (ensure it propagates successfully)
METEOR_IDLE_TIMEOUT=120 meteor profile
```

*Note:* If you modified the cloning logic in `setupBenchmarkSuite`, temporarily rename your system's `tar` binary to verify that the plain `git clone` fallback logic also works seamlessly.

### Debugging Notes

- **Unsupported Systems:** The profiler throws early on Windows natively. Use WSL as a workaround.
- **Git Requirements:** The script requires `git >= 2.25` to utilize `sparse-checkout`.
- **Target Branching:** Always pin the `branch` constant to a specific tag (e.g., `v3.4.0`), never `main`, to prevent unreviewed upstream changes from bleeding into all contributor environments.
- **Deep Profiling:** Combine `meteor profile` with `METEOR_PROFILE=1 meteor run` to get both the end-to-end benchmark timing and a deep trace of where time is spent inside the tool itself.
