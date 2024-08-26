# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Last updated: August 22nd, 2024.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

### Next releases

- Improve TypeScript support for Meteor and packages ([Discussion](https://github.com/meteor/meteor/discussions/12080))
> Should be an ongoing effort to improve the TypeScript support in Meteor and packages, as we write new code in TypeScript and get more skin in the game, it should naturally improve. This doesn’t mean we will actively refactor working code.

- Performance improvements for Meteor 3.0
> After the removal of fibers, we became heavily reliant on async resources and consequently Async Hooks/Async Local Storage, that has a performance cost, we need to optimize that.

- Bringing community packages to the core
> Some packages are widely used and should be part of the core, so this involves identifying and moving them there.

- MongoDB Change Streams support ([Discussion](https://github.com/meteor/meteor/discussions/11842))
> Change Streams is the official way to listen to changes in MongoDB; we should provide a way to use it in Meteor, seamlessly. It has been planned for a long time, and now we’re in a position to do it.

- Integrated support for Vite (Client Bundler, [Discussion](https://github.com/meteor/meteor/discussions/11587))
> Vite is a fast and modern client bundler with an amazing ecosystem. It has many potential benefits for Meteor: build performance, tree-shaking, making our codebase leaner, and focusing on what we do best.

- Replace Babel with ESBuild, Rollup, SWC, or another tool for the server bundle ([Discussion](https://github.com/meteor/meteor/discussions/11587))
> Babel is a great tool, but it's slow and has some limitations; we should consider replacing it with a faster and more modern tool for the server bundle. We could potentially use the same tools Vite uses.

- Support package.json exports fields ([Discussion](https://github.com/meteor/meteor/discussions/11727))
- Tree-shaking

> Tree sharking and exports fields may be implemented by integrating with more modern build tools, see previous items.

- Improve release CI/CD speed and reliability (optimized build times will help)
> Sometimes our CI/CD takes too long to run, causing long queues and delays in our release process and feedback loop, we need to improve that.

- Improve support for Windows 11
> We had many complaints in the past, we need to research and make architectural improvements to make it easier to support Windows, not just punctual fixes.

- Document better Windows with WSL
> It's already possible to use Meteor on Windows with WSL, but we need to document it better

- HTTP/3 Support
> HTTP/3 is the next version of the HTTP protocol. We should support it in Meteor to leverage its performance and security benefits.

### Candidate items

We need to discuss further to decide whether to proceed with these implementations.

- Improve DDP Client
- Improve Passwordless package ([Discussion](https://github.com/meteor/meteor/discussions/12075))
- Integrate with Tauri, it might replace Cordova and Electron in a single tool
- Support building mobile apps using CapacitorJS
- Bring Redis-oplog to core ([Repository](https://github.com/Meteor-Community-Packages/redis-oplog))
- Better file upload support via DDP ([Discussion](https://github.com/meteor/meteor/discussions/11523))

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

-----------

For more completed items, refer to our [changelog](https://docs.meteor.com/history.html).