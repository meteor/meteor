---
name: self-testing
description: Use when designing, adding, reviewing, or debugging Meteor CLI self-tests in tools/tests. Covers the Sandbox and Run harness, command and tool-state contracts, process assertions, fixtures, selection, and CI constraints. Use testing for shared test-value and scope guidance.
---

# CLI Self-Testing

Protect CLI and tool behavior by running Meteor commands in a controlled sandbox. Paths in prose are relative to the repository root.

## Choose the boundary

Apply the [shared testing guidance](../testing/SKILL.md) first. Choose self-tests when the failure depends on command execution, project files, package/release state, or process orchestration. Use the [unit-testing reference](../testing/references/unit-testing.md) for isolated decisions and [package-testing](../package-testing/SKILL.md) for package runtime contracts.

The sandbox supplies temporary working files, tool session state, environment overrides, and optional simulated releases. It runs real Meteor processes and can launch real apps and browsers. Isolation does not make the behavior a mock, and it does not imply that every dependency or network interaction is isolated.

The [E2E harness](../e2e-testing/SKILL.md) supports application lifecycles across creation, development, updates, tests, production, and built execution. Both harnesses can exercise real lifecycles. Choose the one that exposes the intended failure with the least additional setup, considering existing coverage. A CLI contract may need only one invocation; an application integration contract may need several phases. Neither requires every lifecycle phase for every case.

## Define useful evidence

- Assert the command's outcome: exit status, resulting files, project state, runtime effects, or a diagnostic when that diagnostic is the contract. Successful startup alone does not establish later behavior.
- Exercise commands that are part of the claim. Copying a fixture establishes preconditions; it cannot prove the command that would create that state.
- For rejected operations, verify the relevant error and consequential forbidden changes. A failure caused by missing setup is not evidence of correct rejection.
- Use process output to synchronize with meaningful progress. Assert exact output only when formatting or ordering is part of the interface being protected.
- Keep the owned failure mechanism real. A controllable substitute can exercise orchestration or recovery, but cannot prove the substituted service's persistence or protocol behavior.

## Use the existing sandbox

Read the relevant implementation before changing shared setup: [selftest.js](../../../tools/tool-testing/selftest.js) registers and selects tests, [sandbox.js](../../../tools/tool-testing/sandbox.js) manages fixtures and tool state, and [run.js](../../../tools/tool-testing/run.js) drives processes. Older examples may omit awaits required by the current harness.

- Register cases with `selftest.define` in `tools/tests/*.js`. Reuse the smallest suitable fixture from `tools/tests/apps/` or `tools/tests/packages/`.
- Create a `Sandbox` inside the test and `await sandbox.init()` before running commands. Await asynchronous fixture creation, process matching, exit checks, and shutdown.
- Use sandbox file/environment helpers for state changes. Enable `warehouse` or `fakeMongo` only when the contract needs that controlled boundary; state what those substitutions leave untested.
- `sandbox.run()` creates a lazy process controller. An awaited operation such as `match()` or `expectExit()` starts and observes execution; constructing a controller is not evidence that a command ran.
- Await `run.stop()` when a running process must release resources before the next step. Preserve runner cleanup and restore any state changed outside the sandbox.

Await `selftest.expectEqual(actual, expected)`: it loads EJSON asynchronously. `expectTrue` and `expectFalse` are synchronous. `selftest.expectThrows` also invokes its callback synchronously; use an awaited rejection assertion, such as `assert.rejects` from `node:assert/strict`, for promise failures. Check the intended error and consequential forbidden effects, and let assertion failures propagate within the test.

### Interpret process assertions correctly

| Operation | Evidence and limitation |
|-----------|-------------------------|
| `match()` / `matchErr()` | Wait for and consume output through a match; choose a marker attributable to the current action |
| `read()` / `readErr()` | Require the next output to match; use when intervening output would violate the contract |
| `expectExit(code)` | Wait for termination and check status; omitting the code only checks termination |
| `expectEnd()` | Also checks that no unmatched output remains; does not by itself require a successful exit status |
| `forbid()` / `forbidErr()` / `forbidAll()` | Inspect collected complete lines across the run; check after the relevant completion, usually exit, rather than treating these as future monitors |
| `waitSecs()` | Extends the next operation's timeout; it does not sleep or prove readiness |

## Select and verify

Run from the repository root using the checkout's `./meteor`. Replace the illustrative patterns with the target test name and source basename:

```bash
./meteor self-test --preview --file '^source-basename$' 'test-name-pattern'
./meteor self-test --retries 0 --file '^source-basename$' 'test-name-pattern'
```

Name and file filters are regular expressions; file filtering uses the basename without `.js`. Preview helps inspect selection when needed, but the execution result must confirm the intended test and any required browser client actually ran. Check tags and skips: `slow`, network requirements, platform restrictions, and custom configurations affect coverage. Use extra flags only for the selected contract.

For CI selection or environment changes, read [test-tools.yml](../../workflows/test-tools.yml) and [build-test-matrix.js](../../../scripts/ci/build-test-matrix.js). The workflow derives jobs from filtered self-test discovery, groups by source file, and has separate isolated jobs. Its retries, exclusions, and timeout scaling are not proof of local coverage. A retry-only pass needs explanation; larger timeouts need evidence of infrastructure delay.

Windows has a separate [workflow](../../workflows/windows-selftest.yml), whose [PowerShell runner](../../../scripts/windows/ci/test.ps1) selects a limited set of test-name patterns. New cases receive Windows CI coverage only when its workflow triggers and those patterns select them. For a Windows-specific contract, check both and reproduce with the checkout's `meteor.bat` on Windows; retain the required platform tags and setup.

Use the [shared regression process](../testing/SKILL.md#describe-and-verify-regressions) to establish red/green evidence and follow the shared verification limits. Report the boundary exercised, selection, result, substitutions, and skipped or unavailable dependencies. Do not broaden into full-suite or live-service runs merely because the sandbox supports them.
