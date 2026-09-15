# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: September 14, 2026.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://forums.meteor.com/).

## Current release: Meteor 3.6

Meteor 3.6 is in progress on the [`release-3.6`](https://github.com/meteor/meteor/tree/release-3.6) branch. Highlights so far:

- **Rspack 2.0** — upgrade the modern bundler stack to Rspack 2.x ([PR](https://github.com/meteor/meteor/pull/14360), [integration PR](https://github.com/meteor/meteor/pull/14703)) — merged
- **pnpm monorepo support** — pnpm workspace skeleton and workspace-aware dependency installs ([PR](https://github.com/meteor/meteor/pull/14421)) — merged
- **`meteor create --pwa`** — a new skeleton for installable PWAs ([PR](https://github.com/meteor/meteor/pull/14473)) — merged
- **TypeScript 6.0.3** ([PR](https://github.com/meteor/meteor/pull/14560)) — merged
- **Opt-in native TypeScript types** ([PR](https://github.com/meteor/meteor/pull/14699)) — in review
- **MongoDB 8 dev bundle** ([PR](https://github.com/meteor/meteor/pull/14663)) — in review
- **Cordova iOS 8.1.1** ([PR](https://github.com/meteor/meteor/pull/14617)) — in review

## Delivered project: Change Streams ✅

> Change Streams is the official way to listen to changes in MongoDB, but Meteor reactivity works based on polling the database for changes or via oplog mongo system that can be inefficient and lead to performance issues compared with the newest technologies we have in 2026 (especially with large datasets or high-frequency updates), so we want to leverage MongoDB Change Streams to provide real-time updates to Meteor applications in a more efficient way.

**Feedback and discussion**

🔗 [MongoDB Change Streams support in Meteor](https://forums.meteor.com/t/mongodb-change-streams-support-in-meteor/63681)

### Phase 1: Opinionated implementation

**Target Release:** 3.5 ✅
**Goal:** Ship MongoDB Change Streams support in Meteor and validate it under real-world load. In 3.5, Change Streams proved robust enough to become the **default** reactivity engine — no configuration is required to enable them, with `oplog` and `polling` as automatic fallbacks. Existing applications continue to work transparently, and apps that prefer the previous behavior can still force `oplog` via `settings.json` (`packages.mongo.reactivity`) or the `METEOR_REACTIVITY_ORDER` environment variable.

### Phase 2: Hardening & real-world feedback

**Target Release:** 3.5.1–3.5.2 (ongoing)
**Goal:** Harden Change Streams based on production feedback. Shipped so far: automatic recovery from infinite change-stream restart loops ([PR](https://github.com/meteor/meteor/pull/14607)) and fixes for method calls, such as login, hanging under change streams ([PR](https://github.com/meteor/meteor/pull/14564), [PR](https://github.com/meteor/meteor/pull/14602)) in 3.5.1; and preventing change stream observers from replaying events already covered by a causal primary snapshot, which caused intermittent login disconnects ([PR](https://github.com/meteor/meteor/pull/14697)), in 3.5.2.

## Delivered in Meteor 3.5

Alongside Change Streams, Meteor 3.5 also shipped features that landed without appearing on this roadmap:

- **DDP Session Resumption** — brief disconnects resume the previous session instead of a full re-subscribe ([PR](https://github.com/meteor/meteor/pull/14051))
- **Pluggable DDP Transport** — choose between `sockjs` (default) for maximum compatibility or the lower-latency `uws` WebSocket transport ([PR](https://github.com/meteor/meteor/pull/14231))
- **`accounts-express`** — authenticated REST/Express endpoints with the `createAuthMiddleware` middleware ([PR](https://github.com/meteor/meteor/pull/14091))

## Next priorities

The priorities listed below represent tasks that are large enough to be considered major items we want to pursue next, similar to bundler optimizations and change streams.

* Mobile/Capacitor Support ([PR](https://github.com/meteor/meteor/pull/14633))
> Capacitor is a modern alternative to Cordova; we should provide an easy way to build mobile apps using Capacitor.

* Release CI/CD Speed & Reliability
> Improve the speed and reliability of our release process, so we can improve the contribution experience by decreasing the time to run the CI/CD for PRs and releases.

* Open telemetry & Observability support ([PR](https://github.com/meteor/meteor/pull/14086))
> Provide built-in support for OpenTelemetry in Meteor, allowing developers to easily instrument their applications for observability and monitoring. This will be divided in 2 phases: 
> - Phase 1: Basic OpenTelemetry support with metrics & tracing for DDP methods and publications. 
> - Phase 2: Advanced OpenTelemetry support with logging, and integration with mongo instrumentation.

* TypeScript Improvements
> Enhance TypeScript support in Meteor, including better type definitions, improved integration with the build system, and enhanced developer experience. Opt-in native TypeScript types are targeting Meteor 3.6 ([PR](https://github.com/meteor/meteor/pull/14699)), and TypeScript 6.0.3 lands in 3.6 ([PR](https://github.com/meteor/meteor/pull/14560)).

* Test toolkit Improvements
> Improve the testing toolkit in Meteor, including better integration with popular testing frameworks, improved test runner performance, and enhanced developer experience.

Beyond these, we also track smaller tasks delivered in each release. These focus on improving existing areas in Meteor (such as Rspack 2.0, pnpm monorepo support, MongoDB 8, the PWA skeleton, and more), enforcing Meteor core code quality (linting and standards), easing contributions through documentation and engagement programs, and reviewing and validating existing and new community contributions.

## Delivered project: Modern Build Stack ✅

> Improve bundle size and build performance via tree-shaking, code-splitting, and integration with modern bundlers like Rspack.

[📄 Modern Build Stack Documentation](./modern-build-stack)

Delivered across Meteor 3.2 to 3.4.1:

- **Phase 1 (3.2): Profiling.** Added the [`meteor profile`](/cli/#meteorprofile) command to measure bundler performance and bundle size. 🔗 [Article](https://dev.to/meteor/unlocking-meteor-32-new-profiling-tool-to-track-bundler-performance-and-size-1jc8)
- **Phase 2 (3.3): External transpiler (SWC).** SWC integration plus bundler optimizations available to any Meteor user. 🔗 [Article](https://dev.to/meteor/faster-builds-in-meteor-33-modern-build-stack-with-swc-and-bundler-optimizations-fm2)
- **Phase 3 (3.3.2): Bundler improvements & feedback.** Reduced build resource usage and incorporated community feedback for the SWC stack.
- **Phase 4 (3.4): External bundler (Rspack).** Tree-shaking, code-splitting, full ESM support, and a community plugin ecosystem. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-is-out-rspack-integration-4x-faster-builds-8x-smaller-bundles-and-extended-bundler-features)
- **Phase 5 (3.4.1): Resource optimization & feedback.** Memory improvements on large apps and bundler stabilization based on real-world usage. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-1-is-out-rspack-consolidation-revitalized-examples-and-important-fixes/)

Rspack 2.0 continues in Meteor 3.6 ([PR](https://github.com/meteor/meteor/pull/14360)).

---

For more completed items, refer to our [changelog](/history).
