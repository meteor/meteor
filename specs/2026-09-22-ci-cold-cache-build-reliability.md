---
status: validating
project: meteor
project-root: /Users/leonardo/Repositories/meteor
created: 2026-09-22
updated: 2026-09-22
owner: Tool and Isobuild
decision:
supersedes:
superseded-by:
implementation:
  commits:
    - 5d5584b716
    - 372af817f2
    - 436072e959
  pull-request: 14771
---

# CI cold-cache build reliability

## Outcome

Cold-cache tool preparation and compiler-plugin self-tests complete reliably
with dev bundle 24.15.0.103 under the resource limits used by CI.

## Problem and evidence

The Babel E2E shard aborted with exit 134 while `meteor --get-ready` compiled
local package npm dependencies. The same run logged a Linux inotify failure for
a transient `.npm/package` path. Separately, Test Tools group 1 failed while
running the `^com[n-z]` compiler-plugin shard. Public CI metadata does not expose
the latter's JUnit details without authentication, so its cause remains open
until reproduced.

## Scope and non-goals

This work covers root causes reproduced in cold-cache preparation, native file
watching, and compiler-plugin self-tests. It does not change public APIs,
package formats, release compatibility, or CI resource limits merely to hide a
regression.

## Contracts

- Missing or concurrently removed watch targets must not abort tool startup.
- `--get-ready` must remain capable of preparing every local and release
  package in one invocation.
- Source-map output and compiler-plugin cache behavior must remain compatible.
- Failures that indicate genuine source, dependency, or filesystem errors must
  remain observable.

## Design

Implementation follows reproduced evidence. Regression coverage is added at
the smallest boundary that expresses each broken invariant before production
behavior changes.

```text
cold checkout -> dev bundle -> --get-ready -> local package npm rebuilds
                                      |                  |
                                      +-> file watches   +-> compiler plugins
```

## Security and data

Authentication, authorization, persisted application data, untrusted-input
handling, and external trust boundaries do not change.

## Acceptance criteria

- A cold-cache `--get-ready` run completes within the E2E workflow's 16 GiB
  container limit without a V8 heap abort.
- A watch target removed during subscription is handled without terminating
  preparation or suppressing unrelated watcher failures.
- The `^com[n-z]` self-test shard completes under its CI environment and retry
  policy.
- Existing source-map parity and focused watcher/compiler-plugin tests pass.

## Risks and recovery

Watcher recovery could conceal persistent filesystem failures, and memory
changes could alter source-map output or lifetime. Fixes must distinguish
transient absence from other errors and retain byte-parity coverage. Each unit
is independently revertible.

## Execution checklist

- [x] Reproduce and classify the Babel preparation failure.
- [x] Reproduce and classify Test Tools group 1.
- [x] Add focused regression coverage for confirmed root causes.
- [x] Implement the smallest complete fixes.
- [x] Run focused tests and CI-equivalent commands.

## Verification results

- **Passed:** A cold `--get-ready` completed in the E2E workflow's Node 22,
  6-CPU, 16 GiB ARM64 container. Native watching reproduced repeated inotify
  failures; `METEOR_WATCH_FORCE_POLLING=true` completed without those failures
  or a native abort.
- **Passed:** `npm run test:unit -- --runInBand
  ../fs/safe-watcher.test.js` passed all five watcher tests, including transient
  missing-path recovery and preservation of unexpected-error diagnostics.
- **Passed:** The previously failing `compiler plugin caching - local plugin
  with SwcCompiler` self-test passed without retries after its restart assertion
  was isolated from unrelated Mongo startup.
- **Passed:** The complete `^com[n-z]` compiler-plugin shard passed all 10 tests
  in a native ARM64 Node 22 container with the CI environment and retry policy.
- **Inferred:** The polling mitigation prevents the observed amd64 CI native
  abort because it avoids the reproduced Parcel/inotify path entirely.
- **Skipped:** The exact `meteor/circleci:2026.07.28-android-36-node-24` amd64
  shard could not execute on this ARM host; its Node process stalled in an
  emulation futex before tests began. CI remains the required amd64 confirmation.
