# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: January 30, 2026.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

## Current project: Modern Build Stack

> We need to improve the bundle size and performance of Meteor apps. We should consider tree-shaking, code-splitting,
> and other optimizations to make our apps leaner and faster.
> To achieve that we plan to integrate or have an easy way to integrate with modern bundlers like Rspack.

[📄 Modern Build Stack Documentation](./modern-build-stack)

### Implementation plan:

#### Phase 1: Profiling

**Target Release:** 3.2 ✅

**Goal:** Add a command([meteor profile](/cli/#meteorprofile)) to measure if our changes are actually making our builds faster and smaller.

🔗 [Unlocking Meteor 3.2: New Profiling Tool to Track Bundler Performance and Size](https://dev.to/meteor/unlocking-meteor-32-new-profiling-tool-to-track-bundler-performance-and-size-1jc8)

#### Phase 2: External Transpiler Integration (SWC)

**Target Release:** 3.3 ✅

**Goal:** For this phase we want:
 - Improve our current bundler performance, via optimizations so that any meteor user can get benefits from it; And an external bundler could get
   the same benefits.
 - To have an external transpiler working with Meteor and producing a bundle that is smaller or faster than the current Meteor bundle.

🔗 [Faster Builds in Meteor 3.3: Modern Build Stack with SWC and Bundler Optimizations](https://dev.to/meteor/faster-builds-in-meteor-33-modern-build-stack-with-swc-and-bundler-optimizations-fm2)

#### Phase 3: Bundler Improvements & Feedback

**Target Release:** 3.3.2 ✅

**Goal:** Improve the build size and make meteor use less resources for building, decreasing even more build and rebuild time.
- Expanding compatibility and updates based on the feedback from the community, so that we can have a better experience with our new build tools, in this case SWC

#### Phase 4: External Bundler integration (Rspack)

**Target Release:** 3.4 ✅

**Goal:** Integrate an external bundler like Rspack with Meteor, producing a bundle that is smaller or faster than the current Meteor bundle.
- This also enables features like tree-shaking, code-splitting, full ESM support, community plugins, and other optimizations that make Meteor apps leaner, faster, and more standardized to configure.

🔗 [Meteor 3.4 is out: Rspack integration, 4x faster builds, 8x smaller bundles, and extended bundler features](https://blog.galaxycloud.app/meteor-3-4-is-out-rspack-integration-4x-faster-builds-8x-smaller-bundles-and-extended-bundler-features)

#### Phase 5: Resource Optimization & Feedback

**Target Release:** 3.4.x ⏳

**Goal:** Improve memory consumption on large apps when using Meteor and Rspack. This comes mainly from [identified optimizations on the Meteor side](https://forums.meteor.com/t/3-4-rc-3-release-candidate-faster-builds-smaller-bundles-and-modern-setups-with-the-rspack-integration/64124/225), and also from [new improvements in Rspack 2.0](https://rspack.rs/misc/planning/roadmap) as they become available.
- Expanding compatibility and updates based on community feedback, to improve the experience when working with the integrated Rspack bundler, like a clearer debugging process, more stable testing flows, and better support for different kinds of projects.

#### Documentation Strategy

We plan to document the changes in the Meteor documentation, including:
* How to use the new features
* How to integrate with the new bundler
* How the Meteor bundler pipeline works for future contributors
* Examples and guides for integrating with the new bundler

## Next project: Change streams

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

Beyond these, we also track smaller tasks delivered in each release. These focus on improving existing areas in Meteor (such as Node 24, Express Auth integration, and more), enforcing Meteor core code quality (linting and standards), easing contributions through documentation and engagement programs, and reviewing and validating existing and new community contributions.

---

For more completed items, refer to our [changelog](https://docs.meteor.com/history.html).
