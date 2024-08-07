# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Quick update moving items to Finished: August 7th, 2024**

**Last new items added: August 7th, 2024.**

The description of many items includes sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas, you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

### Next releases

- Improve TypeScript support for Meteor and packages ([Discussion](https://github.com/meteor/meteor/discussions/12080))
  - This should be an ongoing effort to improve the TypeScript support in Meteor and packages, as we write new code in TypeScript and get more skin in the game, it should naturally improve.
- MongoDB Change Streams support ([Discussion](https://github.com/meteor/meteor/discussions/11842))
- Integrated support for Vite (Client Bundler)
  - Tree-shaking (Client)
  - Improve Meteor build time (Client, [Discussion](https://github.com/meteor/meteor/discussions/11587))
- Replace Babel with ESBuild or SWC for the server bundle
  - Tree-shaking (Server)
  - Improve Meteor build time (Server, [Discussion](https://github.com/meteor/meteor/discussions/11587))
- Improve release CI/CD speed and reliability (optimized build times will help)
- Review and help to modernize Meteor tools ([Discussion](https://github.com/meteor/meteor/discussions/12073))
- Improve support for Windows 11 or adopt Windows with WSL
- HTTP/3 Support
- Support package.json exports fields ([Discussion](https://github.com/meteor/meteor/discussions/11727))

### Candidate items

We need to discuss further to decide whether to proceed with these implementations.

- Update and fix Meteor Client Bundler or Improve DDP Client
- Improve Passwordless package ([Discussion](https://github.com/meteor/meteor/discussions/12075))
- Support building mobile apps using CapacitorJS
- Bring Redis-oplog to core ([Repository](https://github.com/Meteor-Community-Packages/redis-oplog))
- Better file upload support via DDP ([Discussion](https://github.com/meteor/meteor/discussions/11523))

### Next educational items

- Create a new Meteor Guide ([Current Guide](https://guide.meteor.com/))
- Scaling Meteor Apps course ([Meteor University](https://university.meteor.com/))

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

For more completed items, refer to our [changelog](https://docs.meteor.com/changelog.html).
