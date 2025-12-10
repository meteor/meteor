# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: June 16, 2025.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

## Current project: Bundle optimization

> We need to improve the bundle size and performance of Meteor apps. We should consider tree-shaking, code-splitting,
> and other optimizations to make our apps leaner and faster.
> To achieve that we plan to integrate or have an easy way to integrate with modern bundlers like RSPack, ESBuild, or Rollup.

**Discussion links:**

- [GitHub discussion](https://github.com/meteor/meteor/discussions/11587)
- [forums discussion](https://forums.meteor.com/t/join-the-effort-to-speed-up-meteor-bundler/63406/17)

### Implementation plan:

#### Phase 1: Profiling

**Target Release:** 3.2 ✅

**Goal:** Add a command([meteor profile](/cli/#meteorprofile)) to measure if our changes are actually making our builds faster and smaller.


#### Phase 2: External Transpiler Integration

**Target Release:** 3.3 ✅

**Goal:** For this phase we want:
 - Improve our current bundler performance, via optimizations so that any meteor user can get benefits from it; And an external bundler could get
   the same benefits.
 - To have an external transpiler working with Meteor and producing a bundle that is smaller or faster than the current Meteor bundle.


#### Phase 3: HMR Improvements

**Target Release:** 3.3 ✅

**Goal:** Improve the HMR performance, so that it is faster and more reliable on what needs to be changed.

#### Phase 4: Bundler Improvements & feedback

**Target Release:** 3.3.x ⏳

**Goal:** Improve the build size and make meteor use less resources for building, decreasing even more build and rebuild time.
- Expanding compatibility and updates based on the feedback from the community, so that we can have a better experience with our new build tools, in this case SWC

#### Phase 5: External Bundler integration

**Target Release:** 3.4 ⏳

**Goal:**  And an external bundler (like RSPack, ESBuild, or Rollup) working with Meteor and producing a bundle that is smaller or faster than the current Meteor bundle.
- This will also allow Meteor to have features like tree-shaking, code-splitting, and other optimizations that will make our apps leaner and faster.

#### Phase 6: Build Process Optimization

**Target Release:** 3.4.x ⏳

**Goal:** Improve the build size and make meteor use less resources for building, decreasing even more build and rebuild time.
- Expanding compatibility and updates based on the feedback from the community, so that we can have a better experience with our new build tools


#### Documentation Strategy

We plan to document the changes in the Meteor documentation, including:
- How to use the new features
- How to integrate with the new bundler
- How the meteor bundler pipeline works for future contributors
- Examples and guides on how to integrate with the new bundler

## Next releases

- Support package.json exports fields ([Discussion](https://github.com/meteor/meteor/discussions/11727))
- Tree-shaking

  > Tree-shaking and exports fields may be implemented by integrating with more modern build tools.

- Capacitor support

  > Capacitor is a modern alternative to Cordova; we should provide an easy way to build mobile apps using Capacitor.

- MongoDB Change Streams support ([Discussion](https://github.com/meteor/meteor/discussions/11842))

  > Change Streams is the official way to listen to changes in MongoDB. We should provide a way to use it seamlessly in Meteor. It has been planned for a long time, and now we’re in a position to do it.

- Improve TypeScript support for Meteor and packages ([Discussion](https://github.com/meteor/meteor/discussions/12080))

  > Should be an ongoing effort to improve the TypeScript support in Meteor and packages. We should provide a better experience for TypeScript users, including better type definitions and support for TypeScript features.

- Improve release CI/CD speed and reliability (optimized build times will help)
  > Our CI/CD takes too long to run, causing long queues and delays in our release process and feedback loop; we need to improve that.

### Candidate items

We need to discuss further to decide whether to proceed with these implementations.

- Performance improvements (Async Hooks/Async Local Storage optimization)
- HTTP/3 Support
- Improve DDP Client
- Improve Passwordless package ([Discussion](https://github.com/meteor/meteor/discussions/12075))
- Integrate with Tauri, it might replace Cordova and Electron in a single tool
- Bring Redis-oplog to core ([Repository](https://github.com/Meteor-Community-Packages/redis-oplog))
- Better file upload support via DDP ([Discussion](https://github.com/meteor/meteor/discussions/11523))
- Improve usage in Windows environments

### Finished items

- Change how Meteor executes Async code ([Discussion](https://github.com/meteor/meteor/discussions/11505))
  - Provide new async APIs where Fibers are required
    - Mongo package with Async API ([PR](https://github.com/meteor/meteor/pull/12028))
    - Provide async versions for Accounts and core packages
    - Adapt Meteor Promise implementation
- Enable Top-Level Await (TLA) on Meteor server-side ([PR](https://github.com/meteor/meteor/pull/12095))
- Support Top-Level Await (TLA) on Reify
- Remove Fibers dependency from Meteor Public APIs
- Remove Fibers entirely
- Update Cordova integration to Meteor 3.0
- Run Meteor on Node.js v20
- Change web engine from Connect to Express

---

For more completed items, refer to our [changelog](https://docs.meteor.com/history.html).
