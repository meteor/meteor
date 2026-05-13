# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: April 30, 2026.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://forums.meteor.com/).

## Current project: Change streams

> Change Streams is the official way to listen to changes in MongoDB, btw Meteor reactivity works based on polling the database for changes or via oplog mongo system that can be inefficient and lead to performance issues compared with the newst techlogies we have in 2026 (especially with large datasets or high-frequency updates), so we want to leverage MongoDB Change Streams to provide real-time updates to Meteor applications in a more efficient way.

**Feedback and discussion**

🔗 [MongoDB Change Streams support in Meteor](https://forums.meteor.com/t/mongodb-change-streams-support-in-meteor/63681)

### Phase 1: Opined implementation

**Target Release:** 3.5 ⏳
**Goal:** Implement a first version for MongoDB Change Streams in Meteor, allowing developers to opt-in to using change streams for real-time updates with a simple configuration option. This version should be transparent to existing applications, allowing them to continue using the current reactivity system while providing an easy path to switch to change streams via settings.json file or environment variable.

### Phase 2: Configurable implementation + feedbacks

**Target Release:** 3.5.x ⏳

**Goal:** Make MongoDB Change Streams more configurable to bring better performance in specific scenarios for real-time updates in Meteor, while gathering feedback from the community to refine and improve the implementation based on real-world usage.

## Next priorities

The priorities listed below represent tasks that are large enough to be considered major items we want to pursue next, similar to bundler optimizations and change streams.

* Mobile/Capacitor Support
> Capacitor is a modern alternative to Cordova; we should provide an easy way to build mobile apps using Capacitor.

* Release CI/CD Speed & Reliability
> Improve the speed and reliability of our release process, so we can improve the contribution experience by decreasing the time to run the CI/CD for PRs and releases.

* Open telemetry & Observability support ([PR](https://github.com/meteor/meteor/pull/14086))
> Provide built-in support for OpenTelemetry in Meteor, allowing developers to easily instrument their applications for observability and monitoring. This will be divided in 2 phases: 
> - Phase 1: Basic OpenTelemetry support with metrics & tracing for DDP methods and publications. 
> - Phase 2: Advanced OpenTelemetry support with logging, and integration with mongo instrumentation.

* TypeScript Improvements
> Enhance TypeScript support in Meteor, including better type definitions, improved integration with the build system, and enhanced developer experience.

* Test toolkit Improvements
> Improve the testing toolkit in Meteor, including better integration with popular testing frameworks, improved test runner performance, and enhanced developer experience.

Beyond these, we also track smaller tasks delivered in each release. These focus on improving existing areas in Meteor (such as Node 24, Express Auth integration, Rspack 2.0, and more), enforcing Meteor core code quality (linting and standards), easing contributions through documentation and engagement programs, and reviewing and validating existing and new community contributions.

## Delivered project: Modern Build Stack ✅

> Improve bundle size and build performance via tree-shaking, code-splitting, and integration with modern bundlers like Rspack.

[📄 Modern Build Stack Documentation](./modern-build-stack)

Delivered across Meteor 3.2 to 3.4.1:

- **Phase 1 (3.2): Profiling.** Added the [`meteor profile`](/cli/#meteorprofile) command to measure bundler performance and bundle size. 🔗 [Article](https://dev.to/meteor/unlocking-meteor-32-new-profiling-tool-to-track-bundler-performance-and-size-1jc8)
- **Phase 2 (3.3): External transpiler (SWC).** SWC integration plus bundler optimizations available to any Meteor user. 🔗 [Article](https://dev.to/meteor/faster-builds-in-meteor-33-modern-build-stack-with-swc-and-bundler-optimizations-fm2)
- **Phase 3 (3.3.2): Bundler improvements & feedback.** Reduced build resource usage and incorporated community feedback for the SWC stack.
- **Phase 4 (3.4): External bundler (Rspack).** Tree-shaking, code-splitting, full ESM support, and a community plugin ecosystem. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-is-out-rspack-integration-4x-faster-builds-8x-smaller-bundles-and-extended-bundler-features)
- **Phase 5 (3.4.1): Resource optimization & feedback.** Memory improvements on large apps and bundler stabilization based on real-world usage. 🔗 [Article](https://blog.galaxycloud.app/meteor-3-4-1-is-out-rspack-consolidation-revitalized-examples-and-important-fixes/)

---

For more completed items, refer to our [changelog](/history).
