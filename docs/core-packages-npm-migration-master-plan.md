# Core Packages to npm: Master Migration Plan

**Status:** Proposed

**Created:** 2026-09-09

**Scope:** Production and runtime Meteor core packages

**Source branch:** `devel`

## Executive Summary

Meteor should move reusable implementations of its security-sensitive runtime
packages to standard npm packages while retaining thin Meteor packages for
compatibility, lifecycle integration, client/server selection, assets, and
legacy `meteor/<package>` imports.

The migration is intended to make package ownership and dependency graphs
visible to npm-native security tooling, including npm audit, GitHub's dependency
graph and Dependabot, OSV-Scanner, SBOM generators, provenance tooling, and
commercial scanners. It is not a substitute for static analysis, fuzzing,
security review, or publishing advisories for vulnerabilities in Meteor-owned
source.

The repository contains 140 top-level Meteor packages. This plan covers 105
production/runtime packages and excludes 35 test-only, development-only,
build-tooling, legacy redirect, or deprecated-equivalent packages.

The highest-risk migration targets are:

1. `webapp`
2. `email`
3. `oauth` and the OAuth/account integration layer
4. `ddp-server` and `socket-stream-client`
5. `accounts-base`, `accounts-password`, and `accounts-express`
6. `mongo`, `minimongo`, `allow-deny`, and `npm-mongo`
7. `force-ssl-common` and `force-ssl`
8. `autoupdate`, `dynamic-import`, and `webapp-hashing`
9. Security primitives: `random`, `check`, `ejson`, `rate-limit`, and
   `oauth-encryption`

## Problem

Meteor packages can embed npm dependencies through `Npm.depends`, but the
Meteor package itself is not represented as a normal npm package with a
standard manifest, version identity, dependency graph, and advisory namespace.
This creates several gaps:

- scanners see embedded dependency snapshots without a first-class npm root;
- ownership and remediation are harder to connect to a released Meteor package;
- package-level SBOMs and provenance are not produced through standard npm
  workflows;
- non-registry dependencies require special handling;
- reusable logic remains coupled to the Meteor package loader and cannot be
  independently tested or consumed;
- an advisory for Meteor-owned source cannot naturally target an npm package
  version until that implementation has an npm identity.

npm audit can already scan a package lock or shrinkwrap and calculate known
dependency vulnerabilities. GitHub recommends `package-lock.json` and
`package.json` for npm dependency-graph ingestion, and OSV-Scanner supports the
standard JavaScript lockfile formats.

References:

- [npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
- [GitHub dependency graph supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/dependency-graph-supported-package-ecosystems)
- [OSV-Scanner supported manifests and lockfiles](https://google.github.io/osv-scanner/supported-languages-and-lockfiles/)

## Desired Outcome

Each appropriate runtime package has a first-class npm implementation with a
machine-readable dependency graph, independent tests, TypeScript declarations,
and a documented security-release process. Existing Meteor applications retain
compatible behavior through a small Meteor adapter until a deliberate major
release removes that adapter.

```text
                  +-----------------------------+
Meteor source --->| npm implementation package  |
                  | package.json + lockfile      |
                  +--------------+--------------+
                                 |
                    +------------+------------+
                    |                         |
              npm ecosystem            thin Meteor wrapper
          audit / OSV / Dependabot     meteor/foo compatibility
          SBOM / provenance / GHSA     globals and lifecycle hooks
```

The existing Rspack integration demonstrates the intended broad shape:
`npm-packages/meteor-rspack` owns reusable npm logic, while `packages/rspack`
integrates it into Meteor. The shared dependency engine in
`packages/tools-core/lib/deps.js` is another useful transition mechanism, but
runtime package extraction must not depend permanently on build-tool internals.

## Scope

### Included

- Production server and client runtime packages.
- Authentication, authorization, secrets, and service configuration.
- HTTP, WebSocket, DDP, MongoDB, and outbound network boundaries.
- Runtime code loading, client updates, hashing, and reload behavior.
- Runtime primitives used across security-sensitive packages.
- UI and mobile runtime packages, at lower priority.
- Thin Meteor compatibility wrappers required to preserve existing APIs.

### Excluded

The following 35 packages were reviewed and excluded from this runtime roadmap:

- **Development or testing:** `autopublish`, `boilerplate-generator-tests`,
  `dev-error-overlay`, `hot-module-replacement`, `insecure`,
  `mongo-dev-server`, `package-stats-opt-out`, `react-fast-refresh`,
  `test-helpers`, `test-in-browser`, `test-in-console`,
  `test-server-tests-in-console-once`, `tinytest`, and `tinytest-harness`.
- **Build and toolchain:** `babel-compiler`, `caching-compiler`,
  `constraint-solver`, `ecmascript`, `logic-solver`, `meteor-tool`,
  `minifier-css`, `minifier-js`, `package-version-parser`, `rspack`,
  `standard-minifier-css`, `standard-minifier-js`, `standard-minifiers`,
  `static-html`, `static-html-tools`, `tools-core`, and `typescript`.
- **Legacy or redirect-only:** `crosswalk`, `modules-runtime-hot`,
  `mongo-livedata`, and `npm-mongo-legacy`.

These exclusions should receive separate build-system, development-tooling, and
deprecation roadmaps. They are not assertions that the packages are free of
security risk.

### Non-Goals

- Removing Atmosphere support in one release.
- Changing public APIs, persisted formats, DDP wire semantics, account token
  formats, or Mongo document behavior as part of extraction.
- Combining dependency upgrades with large behavioral refactors.
- Claiming that npm publication alone discovers vulnerabilities in
  Meteor-owned source.
- Publishing an npm package when replacement by a maintained platform or
  ecosystem API is safer.

## Evidence and Current Exposure

Every in-scope package with `Npm.depends` and a committed runtime shrinkwrap was
audited against the npm advisory service on 2026-09-09. Across 25 dependency
trees, npm reported 15 vulnerable package instances: five high, seven moderate,
and three low. These results identify dependency presence, not proven
exploitability through Meteor call paths.

| Meteor package | Reported result | Security relevance |
|---|---:|---|
| `email` | 2 high | SMTP inputs, credentials, remote content, attachments, and OpenPGP signing |
| `webapp` | 1 high, 1 moderate, 2 low | Internet-facing HTTP parsing, middleware, files, cookies, and query strings |
| `force-ssl-common` | 2 high, 1 moderate | Proxy-derived transport security state; one direct dependency creates a large tree |
| `oauth` | 1 moderate, 1 low | Untrusted callbacks, redirects, request bodies, and credentials |
| `ddp-server` | 1 moderate | Remote RPC/pub-sub and WebSocket boundary |
| `logging` | 1 moderate | Widely shared runtime output and serialization path |
| `inter-process-messaging` | 1 moderate | Cross-process message boundary |
| `ecmascript-runtime` | 1 moderate | Broad client/server runtime reach |

Representative advisory evidence includes:

- [`tmp` path traversal](https://github.com/advisories/GHSA-ph9p-34f9-6g65)
- [`qs` denial of service](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
- [OpenPGP signature spoofing](https://github.com/advisories/GHSA-8qff-qr5q-5pr8)
- [Nodemailer OAuth2 TLS credential interception](https://github.com/advisories/GHSA-r7g4-qg5f-qqm2)

The current manifests also expose important structural risks:

- `webapp` declares eleven direct npm dependencies and has the largest
  security-boundary dependency tree in scope.
- `force-ssl-common` uses `forwarded-http`; its small local implementation
  inherits a disproportionately large transitive tree.
- `ddp-server` consumes `uWebSockets.js` from a Git URL, which needs explicit
  commit-level inventory and provenance handling.
- `email` always installs both Nodemailer and its OpenPGP integration.
- `dynamic-import` exposes a cross-origin endpoint that serves module source and
  uses a generated secret to select platform content. Extraction must preserve
  path containment and strengthen secret-generation and request-limit tests.

Known dependency advisories must be remediated before or independently of npm
extraction. Migration work must never be used to defer a security update.

## Prioritization Model

Each package or migration cluster is evaluated across five dimensions:

1. **Impact:** potential confidentiality, integrity, availability, account, or
   code-execution consequences.
2. **Exposure:** reachability from untrusted networks, clients, stored data, or
   deployment inputs.
3. **Reach:** number and importance of packages and applications depending on
   the behavior.
4. **Scanning gain:** improvement in dependency ownership, advisory mapping,
   SBOM coverage, and remediation through npm-native tooling.
5. **Feasibility:** ability to isolate reusable logic without changing public
   contracts or singleton behavior.

Impact and exposure take precedence. Feasibility determines implementation
order within a risk tier; it does not lower the acknowledged severity of a hard
migration.

## Criticality Ranking

| Rank | Package or cluster | Principal threat | Preferred target |
|---:|---|---|---|
| 1 | `webapp` | Request parsing or middleware bypass, traversal, remote DoS, or server compromise | npm HTTP/static core plus Meteor lifecycle adapter |
| 2 | `email` | Credential interception, SSRF/file disclosure, header injection, or forged mail | npm implementation plus settings/global wrapper |
| 3 | `oauth`, `oauth1`, `oauth2`, `accounts-oauth` | Account takeover, token theft, callback abuse, or credential disclosure | Shared npm OAuth core plus provider and Accounts adapters |
| 4 | `ddp-server`, `socket-stream-client` | Unauthenticated DoS, RPC/session confusion, or transport compromise | npm protocol/transport libraries plus WebApp adapter |
| 5 | `accounts-base`, `accounts-password`, `accounts-express` | Authentication bypass, token leakage, password compromise, or account takeover | npm domain core with injected persistence and transport |
| 6 | `mongo`, `minimongo`, `allow-deny`, `npm-mongo` | Unauthorized writes, query bypass, data corruption, or disclosure | npm query/authorization cores; direct `mongodb` dependency |
| 7 | `force-ssl-common`, `force-ssl` | Redirect bypass, spoofed proxy state, or insecure transport | npm proxy-header core plus configuration-only Meteor wrapper |
| 8 | `autoupdate`, `dynamic-import`, `webapp-hashing` | Untrusted or stale code delivery, path escape, or integrity failure | npm manifest/integrity core plus DDP/WebApp adapters |
| 9 | `random`, `check`, `ejson`, `rate-limit`, `oauth-encryption` | Weak tokens, validation bypass, parser flaws, brute force, or secret disclosure | Small independently audited npm foundations |
| 10 | `shell-server` | Command execution if its access boundary fails | npm protocol core plus narrowly scoped server adapter |

## Target Package Models

Use the safest model per package rather than applying one mechanical conversion.

### Extract npm Implementation and Retain a Meteor Wrapper

Use this for reusable logic that still requires Meteor integration:

- Accounts, OAuth, DDP, Mongo, WebApp, code delivery, and browser policy.
- Stateful primitives where existing applications require a shared singleton.
- Packages with server/client entry-point differences or Meteor-managed assets.

The npm implementation must accept explicit adapters for Meteor services. It
must not reach through undocumented globals to find Mongo, DDP, WebApp,
settings, or lifecycle state.

### Replace with Existing npm or Platform APIs

Prefer retirement or a compatibility shim over publishing another abstraction
when maintained functionality already exists:

- `npm-mongo` -> direct `mongodb` dependency.
- `base64` and `sha` -> Web/Node platform APIs where compatibility permits.
- `fetch` and `url` -> native APIs with legacy-only shims where required.
- `promise` and `es5-shim` -> supported runtime implementations.
- `geojson-utils` -> maintained ecosystem implementation after compatibility
  comparison.
- `localstorage` -> native storage behavior on supported browsers.

### Keep a Meteor-Only Meta or Configuration Wrapper

Packages whose primary value is package selection or automatic configuration
do not need independent npm implementations:

- `ddp`
- `browser-policy`
- `hot-code-push`
- `meteor-base`
- `mobile-experience`
- `force-ssl`

Their underlying logic should still be npm-based where appropriate.

## Migration Roadmap

Roadmap waves follow dependency order. Security fixes and containment work run
in parallel and do not wait for a wave.

### Immediate Containment

- [ ] Upgrade or replace vulnerable dependencies in `email`, `webapp`,
  `force-ssl-common`, `oauth`, `ddp-server`, `logging`,
  `inter-process-messaging`, and `ecmascript-runtime`.
- [ ] Add an `arm64` CI job that audits every committed production
  `.npm/package/npm-shrinkwrap.json`.
- [ ] Produce a consolidated CycloneDX or SPDX SBOM for each Meteor release.
- [ ] Inventory Git, URL, native, and vendored dependencies separately from
  registry packages.
- [ ] Define severity, embargo, advisory, backport, and coordinated npm/Meteor
  release policies.

### Wave 0: npm Foundations

Packages:

`base64`, `binary-heap`, `callback-hook`, `check`, `ddp-common`,
`diff-sequence`, `ejson`, `fetch`, `id-map`, `logging`, `mongo-id`,
`ordered-dict`, `random`, `rate-limit`, `reactive-var`, `retry`, `sha`,
`tracker`, `url`.

Objectives:

- [ ] Establish package templates, conditional exports, strict TypeScript, and
  coordinated versioning.
- [ ] Extract pure utilities before stateful primitives.
- [ ] Preserve equality, serialization, random-ID, reactivity, and retry
  semantics through cross-package contract tests.
- [ ] Decide replacement versus publication for platform-equivalent packages.

Exit gate: later waves can consume these modules through npm without creating
duplicate state or observable behavior changes.

### Wave 1: Exposed Perimeter and Dependency-Heavy Packages

Packages:

`boilerplate-generator`, `browser-policy`, `browser-policy-common`,
`browser-policy-content`, `browser-policy-framing`, `email`, `force-ssl`,
`force-ssl-common`, `oauth`, `oauth-encryption`, `routepolicy`, `server-render`,
`socket-stream-client`, `webapp`, `webapp-hashing`.

Objectives:

- [ ] Migrate `email` and `force-ssl-common` as bounded early extractions.
- [ ] Split HTTP-neutral behavior from WebApp startup and runtime configuration.
- [ ] Separate policy generation from header installation.
- [ ] Define explicit request-size, path-containment, proxy-trust, redirect,
  cookie, and header contracts.
- [ ] Preserve Cordova integration in the Meteor wrapper.

Exit gate: Internet-facing dependency trees are standard npm graphs and the
Meteor adapters contain only lifecycle and compatibility behavior.

### Wave 2: Database and DDP Boundary

Packages:

`allow-deny`, `audit-argument-checks`, `ddp`, `ddp-client`,
`ddp-rate-limiter`, `ddp-server`, `disable-oplog`, `facts-base`, `facts-ui`,
`minimongo`, `mongo`, `npm-mongo`.

Implementation order:

1. `ddp-common`, `rate-limit`, `minimongo`, and selector/modifier primitives.
2. `ddp-client` and transport behavior.
3. `allow-deny` and argument-auditing policy engines.
4. Mongo driver, cursor, observer, and oplog layers.
5. `ddp-server` method, publication, session, and transport layers.
6. Compatibility packages and operational metrics.

Exit gate: DDP wire behavior, Mongo query/update semantics, optimistic UI,
publication ordering, authorization results, and observer lifecycles pass the
existing suites and new cross-package contract tests.

### Wave 3: Identity and Authorization

Core packages:

`accounts-2fa`, `accounts-base`, `accounts-express`, `accounts-oauth`,
`accounts-password`, `accounts-passwordless`, `oauth1`, `oauth2`, `roles`, and
`service-configuration`.

Provider integrations:

`accounts-facebook`, `accounts-github`, `accounts-google`, `accounts-meetup`,
`accounts-meteor-developer`, `accounts-twitter`, `accounts-weibo`,
`facebook-oauth`, `github-oauth`, `google-oauth`, `meetup-oauth`,
`meteor-developer-oauth`, `twitter-oauth`, and `weibo-oauth`.

Provider configuration UI:

`facebook-config-ui`, `github-config-ui`, `google-config-ui`,
`meetup-config-ui`, `meteor-developer-config-ui`, `twitter-config-ui`, and
`weibo-config-ui`.

Objectives:

- [ ] Centralize token creation, hashing, rotation, expiry, and revocation.
- [ ] Preserve login-handler ordering, hooks, rate limits, and error behavior.
- [ ] Inject account storage and invocation context into npm domain logic.
- [ ] Keep password hashing algorithms optional and policy-driven without
  weakening defaults.
- [ ] Make provider packages data-driven adapters over the shared OAuth core.
- [ ] Keep provider UI separate from protocol and credential handling.

Exit gate: existing clients and servers interoperate across mixed wrapper/npm
versions without token-format, session, or persisted-data changes.

### Wave 4: Runtime and Code Delivery

Packages:

`autoupdate`, `babel-runtime`, `core-runtime`, `dynamic-import`,
`ecmascript-runtime`, `ecmascript-runtime-client`,
`ecmascript-runtime-server`, `es5-shim`, `hot-code-push`,
`inter-process-messaging`, `meteor`, `meteor-base`, `modern-browsers`, `modules`,
`modules-runtime`, `promise`, `reload`, `reload-safetybelt`, `shell-server`.

Objectives:

- [ ] Decide retirement targets for legacy polyfills before extraction.
- [ ] Specify module registry and runtime singleton ownership.
- [ ] Preserve startup order, environment flags, async context, and package
  initialization semantics.
- [ ] Add integrity, stale-version, rollback, path-containment, cross-origin,
  and request-limit tests for dynamic code delivery.
- [ ] Separate the shell protocol from command execution and authorization.

Exit gate: mixed-version applications cannot load the runtime twice, receive
unintended module source, accept stale client manifests, or lose reload state.

### Wave 5: Lower-Risk Runtime Surface

Packages:

`accounts-ui`, `accounts-ui-unstyled`, `geojson-utils`, `launch-screen`,
`localstorage`, `mobile-experience`, `mobile-status-bar`, `reactive-dict`,
`session`.

Objectives:

- [ ] Prefer native or maintained ecosystem implementations where behavior can
  be preserved.
- [ ] Keep Blaze, Cordova, and package-selection behavior in thin adapters.
- [ ] Publish only reusable state or UI-neutral logic.

Exit gate: the remaining runtime implementations either have an npm identity or
a documented decision explaining why a Meteor-only wrapper is the safer form.

## Package Contract Requirements

Every extracted npm package must provide:

- explicit ESM and CommonJS behavior where both are supported;
- conditional browser and server exports rather than runtime-only environment
  guesses;
- strict TypeScript declarations generated or checked from source;
- no hidden reliance on Meteor package globals;
- injected adapters for Mongo, DDP, WebApp, settings, logging, and lifecycle
  behavior;
- one shared instance for Accounts, Tracker, Mongo observers, DDP, module
  registries, and reload state;
- a standard `package.json` and committed lockfile;
- provenance and integrity metadata for published artifacts;
- a defined Node and browser support policy;
- a documented mapping between npm and Meteor package versions.

## Test Strategy and Acceptance Criteria

Testing is designed before each extraction. Existing coverage must be assessed
before implementation; missing boundary coverage is added before moving code.

### Package-Level Tests

- Standalone npm unit tests run without the Meteor package loader.
- Existing Meteor package tests run against the npm implementation through the
  wrapper.
- Public exports, errors, callbacks, promises, and TypeScript declarations are
  contract-tested.
- Browser/server conditional exports are tested in supported environments.
- Procedural fixtures are preferred over committed opaque test data.

### Integration Tests

- A consumer application verifies both `meteor/<package>` compatibility and
  direct npm imports.
- Mixed npm/Meteor versions fail clearly when incompatible.
- Client/server and DDP compatibility matrices cover the supported skew.
- Security-boundary packages receive malformed-input, size-limit, timeout,
  concurrency, and denial-of-service regression tests.
- Authentication and authorization packages receive token theft, expiry,
  revocation, replay, cross-origin, and privilege-boundary tests.
- Code-delivery packages receive integrity, stale-manifest, rollback, and path
  traversal tests.

### Supply-Chain Checks

- `npm audit` and OSV scan production dependencies.
- CI emits CycloneDX or SPDX SBOMs.
- Published artifacts use npm provenance where supported.
- License policy and non-registry dependency checks run in CI.
- Security advisories map both npm and Meteor affected-version ranges.

### Global Acceptance Criteria

- [ ] All 105 in-scope packages have a recorded target model.
- [ ] Every source-bearing migration has npm and wrapper ownership boundaries.
- [ ] No public API or persisted format changes without explicit approval and a
  dedicated decision record.
- [ ] Existing Meteor tests pass against the wrapper implementation.
- [ ] npm-native tests pass without relying on implicit Meteor globals.
- [ ] No duplicate runtime singleton is possible in supported install layouts.
- [ ] Security scanners identify direct and transitive production dependencies.
- [ ] A rollback can restore the prior Meteor implementation without converting
  application data.

## Rollout

Use direct, incremental rollout rather than a second parallel implementation
maintained for an extended period:

1. Add boundary tests around the current Meteor implementation.
2. Extract one coherent implementation unit into an npm workspace package.
3. Make the Meteor package import and re-export that exact implementation.
4. Run standalone, wrapper, package, and consumer tests.
5. Publish a prerelease under the Meteor-controlled npm scope.
6. Test a real generated Meteor application against the packed artifact.
7. Release npm and Meteor package versions together.
8. Monitor regressions and dependency advisories before starting the next
   tightly coupled unit.

Do not maintain two independently evolving implementations. The compatibility
wrapper must delegate to the npm implementation immediately after extraction.

## Recovery

Every migration unit must remain reversible until its compatibility window is
complete:

- retain the last Meteor-native implementation in version control;
- avoid data migrations during code extraction;
- pin the npm implementation version in the Meteor wrapper;
- publish rollback guidance with every coordinated release;
- preserve the previous Meteor package version in the package catalog;
- revert the wrapper to the prior implementation if a release-blocking defect
  cannot be corrected safely;
- never unpublish a released npm version; deprecate it and publish a corrected
  version instead.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Duplicate Accounts, Tracker, DDP, or module state | Central singleton registry and consumer tests for duplicate dependency layouts |
| Browser/server code bundled into the wrong target | Conditional exports plus browser and server packaging tests |
| Public behavior changes during extraction | Characterization tests before moving code; no cleanup refactors in the same unit |
| npm and Meteor versions drift | Automated version mapping and coordinated release checks |
| Security migration delays current fixes | Immediate containment track runs independently of extraction |
| Git/native dependencies remain opaque | Separate commit-level inventory, provenance, and platform build verification |
| Thin wrappers grow into a second implementation | Enforce adapter-only wrapper ownership in review |
| User applications receive duplicate transitive packages | Peer/host dependency strategy and packed consumer smoke tests |
| Advisory noise is mistaken for exploitability | Record reachability analysis and rationale for remediation priority |

## Governance

Each wave requires:

- an approved package-boundary specification;
- named maintainers for the npm implementation and Meteor wrapper;
- a threat model proportional to the package boundary;
- a release and rollback owner;
- security advisory ownership;
- a decision record for public API, data-format, security-boundary, or major
  architecture changes;
- completion evidence against the wave exit gate.

The roadmap should be reviewed after every completed wave. Reprioritization is
expected when new advisories, usage evidence, or architectural constraints
appear, but skipped packages and changed ordering must be recorded explicitly.

## Recommended First Execution Slice

The first implementation slice should prove the workflow without starting with
the largest package:

1. Add current shrinkwrap audit and SBOM CI coverage.
2. Remediate the known `email` dependency advisories.
3. Extract `oauth-encryption` or `rate-limit` as the first small npm foundation.
4. Extract `email` behind its Meteor wrapper.
5. Use the lessons to finalize the WebApp package boundary.

This sequence delivers immediate security value, validates the wrapper model,
and prepares the repository for the highest-impact but more tightly coupled
WebApp, DDP, Mongo, and Accounts migrations.
