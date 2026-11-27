---
name: ci-runners
description: Use when adding or changing GitHub Actions jobs in Meteor, choosing a runner or job container, or managing dependency caches and checkout cleanup on reused workers.
---

# Meteor CI runners

## Choose the job

| Workload | Starting point |
| --- | --- |
| A Linux check that needs a Node image and a shell command, such as lint, unit tests or a docs build | Call [run-linux-check-in-docker.yml](../../workflows/run-linux-check-in-docker.yml) with `image` and `command`. Set `directory` for a package and `npm-lockfile` if reusing npm downloads is worthwhile. The check runs as the image's `node` user with no Docker socket or host workspace mount. |
| Meteor app tests that need Playwright and a prepared dev bundle | Add coverage to the [existing E2E groups](../e2e-testing/references/groups-and-ci.md). The [matrix](../../workflows/e2e-tests.yml) and [Accounts](../../workflows/e2e-accounts.yml) jobs share [prepare-e2e](../../actions/prepare-e2e/action.yml). The group audit only needs npm dependencies. Keep access to the Docker daemon limited to jobs that use it. |
| CLI shards, native smoke tests, Windows checks, or jobs that write labels or deploy previews | Start from the owning workflow under [workflows](../../workflows). Preserve its platform, hardware, permissions, artifacts and event conditions. The mobile suites need an emulator or simulator. The Labels PR preview and the job that applies changes have different permissions. |

For a new lightweight job, follow the [unit test caller](../../workflows/unit-tests.yml). Put triggers and read-only permissions in the caller. Include the source or test paths that should run the job and the caller's own workflow path when using path filters. The `timeout-minutes` input also bounds how long the container can live after a runner disconnects.

## Select the runner

| Where the Linux check runs | Runner |
| --- | --- |
| Public `meteor/meteor`, small checks such as unit tests and workflow lint | Standard GitHub-hosted Ubuntu. This is the reusable workflow's default. |
| Public `meteor/meteor`, trusted code style, type coverage, E2E, CLI, package or DDP tests | The repository's self-hosted Linux pool. For reusable workflow callers, set `self-hosted-in-public: true` to select it. |
| PR from another repository into public `meteor/meteor` | Standard GitHub-hosted Ubuntu for checks that execute the contributor's code. |
| Own pushes and same-repository PRs in a synchronized fork | Self-hosted Linux with the label in `METEOR_CI_LINUX_RUNNER`, default `oss-vm`. |
| PR from another repository into a synchronized fork | Disposable self-hosted Linux runners in an isolated pool with the label in `METEOR_CI_FORK_LINUX_RUNNER`, default `meteor-fork-ci`. The job waits until a matching runner is available. |

Use the base repository for routing. Every custom selector requires the `self-hosted` and `linux` labels as well as the pool label. Restrict runner groups to the intended repositories. Keep `pull_request_target` jobs that use write permissions on trusted base-branch code. Mobile jobs select their platform-specific runners in the native workflow.

## Cache and clean up

An Actions job container mounts the runner workspace. The reusable Linux check copies the checkout into its disposable container. For a multi-step job on a reused worker, give the checkout an owned subdirectory and align shell working directories, local action references, lockfile hashes and cache paths with it. E2E cold starts populate the package catalog before the app startup timeout begins. Reserve `--get-ready` for jobs that actually need every local package prepared.

When caching native binaries, scope both the key and its fallback to compatible runner architectures. When deleting cached files at job end, restore explicitly and save successful cache misses or fallback restores before cleanup. Use the primary key from restore. Run cleanup with `always()` from the surviving workspace and remove only the job's directory or container. Leave host-wide Docker pruning to [runner maintenance](../../workflows/cleanup-runners.yml).

On host jobs, put npm downloads and test or browser temporary files in the job's `RUNNER_TEMP`. Cache npm's `_cacache` directory before the runner clears job storage. Keep credentials, registry configuration, logs and environment dumps out of cache archives and run summaries. Other workers on the machine may share the host user's home and system temporary directory.

Dispatch maintenance from the protected default branch. It cleans one available worker in `METEOR_CI_LINUX_RUNNER` (default `oss-vm`). To reach a particular machine, register a unique label on that runner and pass it as `runner_label`. Use a zero threshold for workspace cleanup only. With a positive threshold, the job also checks the Docker data filesystem and prunes unused Docker resources if either disk is below target. Check the runner name, measured free space and outcome in the run summary.

Use the repository's [actionlint invocation](../../workflows/lint-workflows.yml) and exercise the changed behavior. For shared preparation, include its path in both suites' PR filters. When cleanup changes, check an exact cache hit, a cold or fallback run, and a failed run with an unrelated sibling directory present.
