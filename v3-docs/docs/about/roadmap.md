# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: November 19, 2026.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://forums.meteor.com/).

## Supporting the roadmap

[![Support Meteor. Build what comes next. Become a sponsor.](/support-meteor-banner.png)](https://www.meteor.com/sponsorship)

Companies that sponsor Meteor support ongoing maintenance, security, and the development of new features. Their support helps move the projects on this roadmap forward, bring more community improvements into releases, and strengthen support for teams building with Meteor.

Sponsorship funds go back into the community through the [Meteor Contributor Sponsorship Program](https://forums.meteor.com/t/introducing-the-meteor-contributor-sponsorship-program/64790), supporting key independent contributors. Their sustained work on features, reviews, testing, documentation, and helping other contributors increases our capacity to deliver this roadmap and respond to users' needs.

🔗 [Sponsor Meteor](https://www.meteor.com/sponsorship) · [GitHub Sponsors](https://github.com/sponsors/meteor)

## Current projects

Our immediate focus is stabilizing recent releases and addressing security reports, alongside the ongoing Capacitor and Blaze work.

### Release stabilization

> Resolve regressions reported against Meteor 3.6 and earlier affected releases, and turn application feedback into validated patch releases.

**Status:** Working through reported issues and release follow-ups for Meteor 3.6.2.
**Goal:** Prioritize production-impacting regressions, reproduce failures, add meaningful regression coverage, and validate fixes on the affected release lines. This includes reviewing community fixes and preparing backports where needed.

🔗 [Meteor 3.6.2 stabilization milestone](https://github.com/meteor/meteor/milestone/135)

### Security follow-up

> Investigate current security reports and dependency advisories, validate fixes, and coordinate updates for affected releases.

**Status:** Ongoing review and remediation for upcoming Meteor 3.6.x patches and backported releases, following the security releases [3.6.1](/history#v3-6-1-2026-11-12), [3.5.5](/history#v3-5-5-2026-11-12), and [3.4.4](/history#v3-4-4-2026-11-12).
**Goal:** Address newly reported vulnerabilities and remaining hardening work, verify compatibility and upgrade behavior, and prepare the necessary security backports for affected earlier release lines. Security fixes may ship alongside the stabilization work above or in separate security releases, depending on urgency and readiness. Published fixes are recorded in the delivered security project below.

### Native stack (CapacitorJS)

> Provide a modern way to build Android and iOS applications with CapacitorJS, keeping Meteor's build pipeline, familiar CLI workflow, and Hot Code Push while using Capacitor's native projects and plugin ecosystem.

**Feedback and discussion**

🔗 [CapacitorJS is coming to Meteor as its modern native stack](https://forums.meteor.com/t/capacitorjs-is-coming-to-meteor-as-its-modern-native-stack/64722)

**Status:** Experimental integration available from a source checkout ([PR](https://github.com/meteor/meteor/pull/14633)). The implementation includes Capacitor 8, native plugins, bundled and live-reload modes, Hot Code Push, production builds, a Cordova migration guide, and [companion examples](https://github.com/meteor/examples/pull/47).
**Goal:** Prepare an initial opt-in beta and gather real application and Cordova migration feedback. Broader Android and iOS validation, review, and adoption feedback will guide the path to a stable release.

The integration introduces reusable tool-extension APIs so native targets can evolve through packages. Cordova remains supported while Capacitor is developed.

### Blaze 3.1

> Modernize Blaze with an optional jQuery dependency, native DOM event handling, and improvements to async helpers, reactive updates, and error reporting. Preserve a compatibility path for applications using jQuery.

**Status:** [Blaze 3.1](https://github.com/meteor/blaze/pull/492) has published `3.1.0-beta.1`. [Meteor integration](https://github.com/meteor/meteor/pull/14754) and [documentation deployment](https://github.com/meteor/blaze/pull/531) remain in progress.
**Goal:** Consolidate the beta through application feedback, validate the native and jQuery backends with Meteor, finish the documentation rollout, and prepare RC and stable releases.

## Next priorities

These priorities remain on the roadmap beyond our immediate focus. Together with the current projects above, they will form the basis of a new roadmap for 2027, where scope, sequencing, and release targets will be refined.

* Testing infrastructure for Meteor applications and packages ([PR](https://github.com/meteor/meteor/pull/14804))
> Provide a modern workflow for unit, component, browser, end-to-end, and real Meteor runtime tests. An experimental Rstest integration already implements application and Atmosphere package testing, snapshots, coverage, watch mode, and isolated runtime workers. Further review, compatibility validation, and publication remain ahead of broader adoption. 🔗 [Discussion](https://forums.meteor.com/t/meteor-rstest-a-natural-modern-testing-integration-for-meteor-rspack-apps/64744)

* OpenTelemetry & Observability support ([PR](https://github.com/meteor/meteor/pull/14086))
> Build on the [`instrumentation` package](/packages/instrumentation) delivered in Meteor 3.6 to provide OpenTelemetry support. The proposed integration remains unreleased, with the following goals:
> - Phase 1: Validate and ship server-side tracing and metrics for methods, publications, and DDP connections.
> - Phase 2: Extend observability with logging and HTTP/MongoDB instrumentation integrations.

Beyond these, each release includes runtime and dependency updates, security and reliability fixes, Meteor core code quality improvements, documentation, and community contributions. Release scope is tracked in the [milestones](https://github.com/meteor/meteor/milestones); work in progress is subject to review and validation before inclusion.

## Delivered project: Modern Build Stack ✅

> Improve bundle size and build performance via tree-shaking, code-splitting, and integration with modern bundlers like Rspack.

[📄 Modern Build Stack Documentation](./modern-build-stack)

**First delivered in:** 3.2. Delivered across Meteor 3.2 to 3.6:

- **Phase 1 (3.2): Profiling.** Added the [`meteor profile`](/cli/#meteorprofile) command to measure bundler performance and bundle size. 🔗 [Article](https://dev.to/meteor/unlocking-meteor-32-new-profiling-tool-to-track-bundler-performance-and-size-1jc8)
- **Phase 2 (3.3): External transpiler (SWC).** SWC integration plus bundler optimizations available to any Meteor user. 🔗 [Article](https://dev.to/meteor/faster-builds-in-meteor-33-modern-build-stack-with-swc-and-bundler-optimizations-fm2)
- **Phase 3 (3.3.2): Bundler improvements & feedback.** Reduced build resource usage and incorporated community feedback for the SWC stack.
- **Phase 4 (3.4): External bundler (Rspack).** Tree-shaking, code-splitting, full ESM support, and a community plugin ecosystem. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-is-out-rspack-integration-4x-faster-builds-8x-smaller-bundles-and-extended-bundler-features)
- **Phase 5 (3.4.1): Resource optimization & feedback.** Memory improvements on large apps and bundler stabilization based on real-world usage. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-1-is-out-rspack-consolidation-revitalized-examples-and-important-fixes/)
- **Phase 6 (3.5 to 3.6): Consolidation & Rspack 2.** Build/test isolation, cache and memory improvements, automatic build dependency installation, Rspack 2 support, React Compiler integration, and pnpm workspace support. 🔗 [Changelog](/history#v3-6-0-2026-11-10)

## Delivered project: Release CI/CD Speed & Reliability ✅

> Shorten contributor feedback and make release preparation and validation more repeatable through CI automation, real application tests, and shared workflows.

**First delivered in:** 3.4. Delivered across Meteor 3.4 to 3.6:

- **Phase 1 (3.4): GitHub Actions & parallel E2E.** Moved Travis testing to GitHub Actions and added parallel application test groups for the Rspack integration. 🔗 [Travis migration](https://github.com/meteor/meteor/pull/14026) · [E2E CI](https://github.com/meteor/meteor/pull/14010)
- **Phase 2 (3.4.1): CI migration & release preparation.** Moved CircleCI tool/package testing to GitHub Actions, with caching, concurrency controls, and test artifacts. Added AI-assisted workflows for changelogs, package versions, and documentation-gap analysis, with maintainer review. 🔗 [CircleCI migration](https://github.com/meteor/meteor/pull/14326) · [Release workflows](https://github.com/meteor/meteor/pull/14293)
- **Phase 3 (3.5 to 3.6): Validation & publication safeguards.** Expanded browser, package, production-build, and native tests; improved process cleanup and retry isolation; shared local and CI test-group selection; and added dev-bundle publication checks. 🔗 [E2E cleanup](https://github.com/meteor/meteor/pull/14424) · [Testing guide](https://github.com/meteor/meteor/blob/devel/DEVELOPMENT.md#tests) · [Publication safeguards](https://github.com/meteor/meteor/pull/14868)

## Delivered project: Change Streams ✅

> Use MongoDB Change Streams to deliver reactive updates, with automatic fallback to oplog tailing or polling when a deployment or query cannot use Change Streams.

**First delivered in:** 3.5.

**Feedback and discussion**

🔗 [MongoDB Change Streams support in Meteor](https://forums.meteor.com/t/mongodb-change-streams-support-in-meteor/63681)

[📄 Change Streams Documentation](/performance/change-streams-observer-driver)

### Phase 1: Default implementation

**Delivered in:** [3.5](/history#v3-5-0-2026-06-30) ✅
**Goal:** Ship MongoDB Change Streams support in Meteor. Change Streams became the **default** reactivity engine in 3.5 for supported MongoDB deployments and queries, with `oplog` and `polling` as automatic fallbacks. Applications can still force `oplog` via `settings.json` (`packages.mongo.reactivity`) or the `METEOR_REACTIVITY_ORDER` environment variable.

### Phase 2: Hardening & real-world feedback

**Delivered across:** [3.5.1](/history#v3-5-1-2026-08-04) to [3.6](/history#v3-6-0-2026-11-10) ✅
**Goal:** Improve recovery, write synchronization, and query compatibility based on application feedback. Shipped fixes cover lost stream history, stalled methods, multiple MongoDB connections, snapshot/event races, oversized change events, and fallback for unsupported selectors. Performance still depends on the application's queries and database workload; ongoing fixes continue through regular releases.

## Delivered project: Security hardening & backports ✅

> Deliver coordinated Meteor and Node.js security fixes, with validated backports for affected earlier releases.

**First delivered in:** 3.5.3, with backports in 3.4.2 and 3.3.3. Further coordinated updates followed across the affected release lines:

- **Phase 1: Framework hardening.** OAuth token validation, DDP error handling, field authorization, dynamic imports, shell persistence, and deployment discovery fixes. Delivered in [3.5.3](/history#v3-5-3-2026-10-13), [3.4.2](/history#v3-4-2-2026-10-13), and [3.3.3](/history#v3-3-3-2026-10-13).
- **Phase 2: Runtime updates & further hardening.** Node.js security updates, token-consumption fixes, safe handling of prototype-named fields, and HTTP/TLS hardening. Delivered in [3.5.4](/history#v3-5-4-2026-10-27), [3.4.3](/history#v3-4-3-2026-10-27), and [3.3.4](/history#v3-3-4-2026-10-27).
- **Phase 3: Coordinated security updates.** Updated Node.js within each release line's major version and hardened accounts, DDP, MongoDB reactivity, archive extraction, the installer, and Cordova asset handling. Delivered in [3.6.1](/history#v3-6-1-2026-11-12), [3.5.5](/history#v3-5-5-2026-11-12), and [3.4.4](/history#v3-4-4-2026-11-12).

## Delivered project: TypeScript Improvements ✅

> Give Meteor applications and packages native TypeScript declarations, improving editor support, type checking, and package-author integration.

**First delivered in:** [3.6](/history#v3-6-0-2026-11-10) ✅

- Generate declarations for installed packages with `meteor types`, and publish package declarations with `api.types()`.
- Use native declarations by default in new TypeScript, TypeScript + Tailwind, Angular, and Svelte apps.
- Adopt native declarations explicitly in existing apps while preserving the existing `@types/meteor` and `zodern:types` provider choices during an upgrade.
- Validate core declarations through compilation, type tests, and package coverage checks in CI.

[📄 Native TypeScript Types Documentation](/cli/using-core-types) · [Implementation](https://github.com/meteor/meteor/pull/14699)

## Other delivered improvements ✅

These previously planned improvements are available in released versions:

- **Meteor 3.5: DDP & authentication.** DDP session resumption, [pluggable transports](/performance/ddp-transport), authenticated Express endpoints with [`accounts-express`](/packages/accounts-express), and async rate-limiter matchers. 🔗 [Changelog](/history#v3-5-0-2026-06-30)
- **Meteor 3.5.2: Cordova maintenance.** Cordova CLI 13 and `cordova-android` 15 support, with expanded native verification. 🔗 [Changelog](/history#v3-5-2-2026-09-04)
- **Meteor 3.5 to 3.6: Runtime updates.** Node.js 24 in [3.5](/history#v3-5-0-2026-06-30), then Node.js 26 and the MongoDB 8 local development database in [3.6](/history#v3-6-0-2026-11-10).
- **Meteor 3.6: App creation & CLI.** PWA and pnpm workspace templates, Git-based app and package installation, interactive package selection, and shell completion. 🔗 [Changelog](/history#v3-6-0-2026-11-10)
- **Meteor 3.6: Instrumentation.** The [`instrumentation` package](/packages/instrumentation) exposes lifecycle events for methods, publications, and DDP connections. 🔗 [Changelog](/history#v3-6-0-2026-11-10)
- **Meteor Agent Skills 1.1.0: Developer guidance.** The first official [catalog](/ai/agent-skills), validated with Meteor 3.6, supports Meteor development workflows and continues to evolve with releases. 🔗 [Release](https://github.com/meteor/agent-skills/releases/tag/v1.1.0)

---

For more completed items, refer to our [changelog](/history).
