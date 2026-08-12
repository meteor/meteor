# `rstest`

Test-only capability and Meteor-runtime executor for `@meteorjs/rstest`.

Adding `rstest` selects Rstest for `meteor test` and for selected
`meteor test-packages` whose `Package.onTest` metadata has a strong `rstest`
dependency. Explicit `--driver-package` or persistent
`meteor.testRunner: "driver"` keeps the established driver route.
The test-only package has a strong Atmosphere dependency on `rspack` and owns
its tool-host provider under `tooling/`. Meteor compiles that provider through
the narrow `Package.registerTestRunnerPlugin` API; provider code never enters
the application runtime bundle and ordinary build plugins remain forbidden in
`testOnly` packages. This mirrors the existing `rspack` +
`@meteorjs/rspack` lifecycle split without a second Atmosphere package.

Both Modern Tools capabilities install their required npm side automatically
before native Rstest starts. `rspack` owns `@meteorjs/rspack`, Rspack, and SWC;
`rstest/tooling` owns only `@meteorjs/rstest`, `@rstest/core`, and
`@rstest/adapter-rspack`. This baseline covers Node unit tests, snapshots,
reporters, native workers/sharding, and Meteor server-runtime tests.

Optional upstream features stay project-owned. `meteor-pure-client` requires
`jsdom`; Browser Mode requires `@rstest/browser` plus `playwright`; Meteor
client-runtime tests require `playwright`; external E2E requires
`@rstest/playwright` plus `playwright`; coverage requires the selected
`@rstest/coverage-*` provider. Selection validates these packages and prints an
install command, but never mutates the project to add them. Browser binaries
also remain an explicit `npx playwright install <browser>` step. Set
`meteor.autoInstallDeps` to `false` to disable required Modern Tools dependency
installation too.

Automatic package selection is architecture-aware and requires homogeneous
ownership. Mixed Rstest/Tinytest/Mocha selections fail before compilation with
separate commands; unknown/custom drivers require explicit `--driver-package`.

## Driver packages and test-runner providers

A driver package runs inside an already built Meteor test application. It
expects Meteor/Isobuild compilation, server/client runtime, and the normal
Meteor host lifecycle. `test-in-browser` and `meteortesting:mocha` follow this
model.

A test-runner provider runs inside the Meteor tool before host construction.
It can select native-only execution or request a Meteor host, supervise native
processes and browsers, pass immutable options to compiler plugins, propagate
exit status, and clean up all owned resources. Rstest needs this earlier
boundary so pure, Browser Mode, snapshot, and Playwright projects retain native
Rstest/Rspack behavior while runtime projects still execute inside a real
Meteor program.

Normal commands rely on automatic provider activation. `--test-runner <id>`
is an advanced explicit provider override. It does not select driver packages;
use `--driver-package <name>` for that route. The `driver` value is reserved
for persistent `meteor.testRunner` opt-out policy, not as a `--test-runner`
provider id. One outer provider or explicit driver owns command invocation.
For a provider-owned Meteor host, execution plan may reuse existing driver
contract internally. Rstest does this with Atmosphere `rstest`: provider owns
tool orchestration, while package's `start`/`runTests` exports run inside real
host through `meteor/test_environment`. This is not mixed CLI selection;
explicit `--driver-package` still bypasses provider.

Pure, DOM, Browser Mode, snapshot, coverage, and Playwright tests use native
Rstest APIs under `tests/rstest/pure`, `tests/rstest/browser`, and
`tests/rstest/e2e`. Tests requiring Meteor runtime import the supported API from
`meteor/rstest` and live under `tests/rstest/runtime`.

Those roots remain compatibility hints, not a required directory contract.
For ordinary colocated test files, provider runs one Rspack dependency analysis:
`@rstest/core` selects native Node, `@rstest/browser` selects Browser Mode,
`@rstest/playwright` selects external E2E, and `meteor/rstest` plus reachable
`meteor/*` selects real Meteor-host execution. Direct, transitive, dynamic, and
CommonJS dependencies participate. When import graph cannot express ownership,
environment, or architecture, fallback markers remain available. Files using
only globals can opt in with `.rstest.test.*`; `.native`, `.dom`, `.browser`,
`.meteor`, `.server`, `.client`, and `.e2e` refine environment and side.
Incompatible explicit markers fail instead of mocking or externalizing Meteor
runtime.

Pure projects also keep upstream `rs.mock`, `rs.fn`, and `rs.spyOn`. Provider
starts Rstest with `NODE_ENV=test`, preventing Meteor tool's production process
environment from disabling native mock hoisting.

```js
import { expect, test } from 'meteor/rstest';

test('has Meteor runtime', () => {
  expect(Meteor.isTest).toBe(true);
});
```

Runtime tests preserve Meteor/Isobuild ownership of Atmosphere package linking,
`Package.onTest`, test-only unibuilds, MongoDB, DDP, WebApp, server/client
architectures, and globals. Atmosphere packages remain external to native
Rspack output and resolve from the real Meteor program; they are not bundled as
ordinary npm modules.

For example, a project using every generated optional lane can install:

```sh
meteor npm install --save-dev \
  jsdom @rstest/browser @rstest/coverage-istanbul \
  @rstest/playwright playwright
npx playwright install chromium
```

Keep optional `@rstest/*` package versions compatible with installed
`@rstest/core`. Framework-specific Browser Mode adapters, Testing Library, and
custom reporters follow same project-owned rule.

Supported runtime API: `describe`, `describe.concurrent`,
`describe.sequential`, `test`, `test.concurrent`, `test.sequential`,
`test.skip`, `test.todo`, `test.only`, `beforeAll`, `afterAll`, `beforeEach`,
`afterEach`, and the matcher subset declared in `runtime/api.d.ts`. Async cases,
promise matchers, and Meteor CLI name filtering are supported. Cases remain
serial by default. Consecutive concurrent cases share one Meteor process and
database, while explicit sequential cases form ordering barriers. `beforeAll`
and `afterAll` wrap the suite once; each concurrent case owns its complete
`beforeEach`/case/`afterEach` chain. `maxConcurrency` uses native Rstest's
default of `5` and can be set in `rstest.config`. Cases and hooks have bounded,
config-derived timeouts; transport results are generation-bound,
schema-validated, single-use, and authenticated by capabilities injected only
into managed runners.

Runtime module mocking, hoisting, native Rstest snapshots, and worker-only
features are not emulated. Keep those tests in a pure Rstest project or use
explicit dependency injection. Project-owned libraries such as Sinon may spy
or stub application boundaries inside runtime tests without replacing real
Meteor or MongoDB. Unmigrated Mocha/Tinytest files remain on their real driver
route so callback `done`, Mocha `this`, hooks, reporters, and custom driver
behavior are never approximated.

## Runtime reporting and verbosity

Native projects keep Rstest's configured reporters. Meteor-backed server and
client projects use one compact Rstest-style report over the runtime transport
result. Rspack tags each loaded runtime module with its app-relative test path,
so default output prints one row per runtime file plus `Test Files` and `Tests`
totals, like Rstest's default reporter. Passing case names, reporter-added
worker labels, and machine frames stay hidden by default; skipped/todo-only
files retain their status, while failures always include case name, message, and stack. Browser
results are submitted to the server and printed once, and runtime-worker
children stay silent while the parent prints one aggregate.

Runtime discovery uses a synchronous Rspack context only for this registration
boundary. Ordinary Meteor eager test discovery remains unchanged. Rspack's
`eager` context call is promise-based, so it cannot safely hold one scoped file
identity while multiple modules register concurrently.

Use `meteor test --verbose` or top-level `meteor.verbose` to see passing runtime
cases, durations, runtime-worker attribution, and generic Meteor tool
diagnostics. Rstest ownership routing stays silent, and raw `[Meteor-Rstest]`
protocol JSON remains hidden. The generic test-runner context normalizes
the same top-level and `meteor.modern` verbosity forms used by Modern Tools,
including outside-app `test-packages` where no application `package.json`
exists:

```json
{
  "meteor": {
    "verbose": true
  }
}
```

Rstest's native reporter flag also projects verbose presentation into Meteor
runtime output, including the parallel parent aggregate, without enabling
Meteor diagnostics, Rstest ownership chatter, or machine frames:

```bash
meteor test --once --server-only --runtime-workers 4 -- --reporters=verbose
```

`--reporter=verbose` is an equivalent Rstest alias. Other native reporters keep
their native-project behavior; Meteor runtime does not emulate JSON, JUnit,
blob, dot, or custom reporter event streams.

For integration protocol troubleshooting only, set
`METEOR_RSTEST_DEBUG=1`. This exposes raw generation-bound result frames and is
independent from user-facing Meteor and reporter verbosity.

Rstest 0.11.6 does not publicly export its built-in reporter implementations;
its public custom reporter API also expects native file/suite events that the
Meteor runtime registry does not fabricate. Importing private Rstest bundles
would be version-layout coupling. The runtime formatter is therefore small and
dependency-free, while native phases continue using real Rstest reporter code.
`METEOR_DISABLE_COLORS` and `NO_COLOR` disable its ANSI styles.

## Meteor runtime workers

Server runtime files can use multiple real Meteor hosts without leaving the
normal CLI:

```sh
meteor test --once --server-only \
  --project meteor-runtime-server --runtime-workers 4
```

Runtime workers and case concurrency solve different problems. Workers
partition files across isolated Meteor hosts, ports, and Mongo databases.
Within each host, `.concurrent` schedules cases against that host's shared
runtime with the configured `maxConcurrency`; `.sequential` remains a local
barrier. Use workers when database/process isolation matters and concurrent
cases when independent work can safely share runtime state.

Rstest evaluates configuration and its native planning phase once, then sorts
selected runtime-server files, including import-inferred colocated files, and assigns non-empty
round-robin partitions. Meteor prepares local packages once and seeds its
existing caches into worker harnesses. Every worker still builds its assigned
Rspack entry and owns a distinct Meteor local directory, Rspack context, proxy
port, Mongo port/database, process group, and result file. Requested workers
are capped to selected file count.

Results retain source file, test names, worker identity, and errors and are
aggregated after all siblings finish. Default reporting exposes files, not
worker processes; verbose case rows append `[server-N]` for imbalance and
host-specific failure diagnosis. Assertion failure in one host does not cancel
others. Missing or invalid worker results are infrastructure failures, while
signals take highest exit precedence.

This option is intentionally narrower than native Rstest file workers and CI
sharding. Values above `1` currently require `meteor test --once
--server-only`; watch, client/browser, full-app, `test-packages`, driver
packages, external Mongo/ROOT URLs, Cordova, deploy, and inspect modes are
rejected. Value `1` remains the established single-host path.

Package integration note: `rstest` uses `rspack` and
`isobuild:test-runner-plugin` as intentional strong dependencies. Consumers
only add or `api.use('rstest')`; its runtime and tool-host provider are one
capability. Use `Package['name']` only when integrating an optional weak
dependency at runtime, not as an availability check for these required parts.
