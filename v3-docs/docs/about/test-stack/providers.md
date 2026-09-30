---
outline:
  level: [2, 3]
---

# Test-Runner Providers

A test-runner provider connects a testing tool to the Meteor CLI before the tool decides whether to build an application host. Rstest is the first integration using this boundary. Most application developers only need the [Rstest guide](./rstest.md); this page explains the ownership model for contributors and driver authors.

## Providers and drivers solve different problems

| Concern | Test-runner provider | Runtime driver package |
| --- | --- | --- |
| Runs inside | Meteor tool process | Built Meteor test application |
| Starts work | Before host construction | After the host exists |
| Chooses execution | Native-only or Meteor-hosted plan | Executes within its host |
| Coordinates | Processes, browsers, completion, restarts, cleanup | Runtime test registration, execution, and results |
| Rstest implementation | Tool-side plugin in Atmosphere `rstest` | Server/client bridge in the same package |

The provider can avoid building a Meteor host for pure tests. When tests need real Meteor services, it requests a host and uses the existing driver startup contract inside that host. A single Atmosphere package can own both pieces without making them the same extension point.

One command has one outer provider or explicit driver owner. The Rstest provider's internal use of `driverPackage: 'rstest'` does not mean users should select `--driver-package rstest` to get the whole workflow.

## Ownership in the Rstest integration

**Meteor core** owns command selection, Isobuild, package linking, application and MongoDB processes, ports, watch generations, and host cleanup. It exposes generic services and validates provider plans.

**Atmosphere `rstest`** owns provider activation, Rstest-specific planning, the real server/client execution bridge, runtime transport, and Meteor coverage collection. Its tool plugin stays outside application runtime bundles.

**`@meteorjs/rstest`** owns the coordinator, configuration bridge, generated Rstest projects, routing support, coverage merging, and the connection to upstream Rstest. The Rspack integration supplies the relevant compilation hooks.

**Upstream Rstest** supplies the test API and native runner capabilities. Hosted tests use its file runtime; Meteor does not recreate a separate set of assertion or fixture APIs.

This keeps engine-specific behavior with the integration. Coverage collection uses generic compiler options where a core boundary is needed; Meteor core does not choose Rstest's reporters or coverage policy.

## Registration and lifecycle

A test-only Atmosphere package declares its tool plugin through `Package.registerTestRunnerPlugin`, with the `isobuild:test-runner-plugin@1.0.0` capability. Inside that plugin, `Plugin.registerTestRunner` registers the provider. This narrow API does not enable arbitrary build plugins in test-only packages.

The lifecycle has three main stages:

1. **Select and validate.** Resolve explicit policy or package activation and reject unsupported flags or mixed ownership before starting the requested work.
2. **Prepare an execution plan.** Choose `native-only` or `meteor-host` mode. A hosted plan can specify its driver, test/full-app mode, harness packages, and immutable package-scoped build-plugin options.
3. **Run and clean up.** Use the lifecycle hooks and supervised services to start native work, react to a running host, report completion, handle rebuilds, and release owned resources.

The contract includes `validate`, `prepare`, and lifecycle hooks such as `startBeforeHost`, `beforeAppRun`, `startHost`, `completeRun`, and `stop`. The name `startHost` identifies a callback after the host has started; it is not an override for spawning a different runtime executable.

A generic host service supports isolated runtime workers. Rstest's current multi-host policy restricts this to one-shot, server-only app tests, with one local database and build context per worker. See [parallelism](./rstest.md#parallelism-and-feedback) for the supported combinations.

## Other test engines

The boundary is not tied to Rstest declarations or assertions. Another integration could supply its own provider, request a Meteor host, and use a driver or executor appropriate to its engine. Existing driver-only integrations do not need to become providers unless they benefit from that earlier lifecycle.

That extension point is not automatic API compatibility. Executing `node:test` or `bun:test` files would need an engine-specific executor, completion/result handling, and explicit decisions about lifecycle and reporting. The current Rstest provider does not run those files as Rstest tests.

The Meteor host currently launches with Node's `process.execPath`; there is no configurable Node/Bun host executable. Supporting `bun test` would require a separate generic launcher change and a compatible executor, not an import alias or a different `startHost` callback.

## Contributor entry points

Start with these source files in the Meteor repository, and check the contract against the Meteor version your integration supports:

- [Provider selection](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/provider-registry.js) and [lifecycle contract](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/provider-contract.js).
- [Meteor host service](https://github.com/meteor/meteor/blob/devel/tools/cli/test-runners/meteor-hosts.js).
- [Atmosphere registration](https://github.com/meteor/meteor/blob/devel/packages/rstest/package.js) and [Rstest provider](https://github.com/meteor/meteor/blob/devel/packages/rstest/tooling/provider/provider.js).
- [Coordinator and configuration](https://github.com/meteor/meteor/tree/devel/npm-packages/meteor-rstest), including typed factory context and generated projects.
- [Runtime integration README](https://github.com/meteor/meteor/blob/devel/packages/rstest/README.md), including execution, reporting, and coverage details.

Keep the [runtime boundaries](./rstest.md#meteor-runtime-boundaries) visible when extending the integration. A new capability needs both execution support and truthful validation of unsupported combinations.
