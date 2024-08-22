# Roadmap

Describes the high-level features and actions for the Meteor project in the near-to-medium term future.

## Introduction

**Quick update moving items to Finished: June 1, 2023**

**Last new items added: September 14, 2022.**

The description of many items include sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.


> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

### Meteor 3.0 release

- Change how Meteor executes Async code; ([Discussion](https://github.com/meteor/meteor/discussions/11505))
  - Provide new async APIs where Fibers are required;
    - Mongo package with Async API; ([PR](https://github.com/meteor/meteor/pull/12028))
    - Provide async versions for Accounts and core packages;
    - Adapt Meteor Promise implementation;
- Enable Top-Level Await (TLA) on Meteor server-side; ([PR](https://github.com/meteor/meteor/pull/12095))
- Support Top-Level Await (TLA) on Reify;
- Remove Fibers dependency from Meteor Public APIs;
- Remove Fibers entirely;
- Update Cordova integration to Meteor 3.0;
- Run Meteor on Node.js 18;
- Change web engine from Connect to Express;

### Next releases

- Improve TypeScript support for Meteor and packages; ([Discussion](https://github.com/meteor/meteor/discussions/12080))
- Linux ARM Support; ([PR](https://github.com/meteor/meteor/pull/11809))
- Improve release quality with test coverage and CI automation;
- Review and help to modernize Meteor tools; ([Discussion](https://github.com/meteor/meteor/discussions/12073))
- Improve support for Windows 11 or adopt Windows with WSL;
- Improve Meteor build time; ([Discussion](https://github.com/meteor/meteor/discussions/11587))
- HTTP/3 Support;
- Tree-shaking; ([PR](https://github.com/meteor/meteor/pull/11164))
- Support package.json exports fields; ([Discussion](https://github.com/meteor/meteor/discussions/11727))

### Candidate items
We need to discuss further to decide whether or not to proceed with these implementations.

- Update and fix Meteor Client Bundler or Improve DDP Client;
- Improve Passwordless package; ([Discussion](https://github.com/meteor/meteor/discussions/12075))
- Support building mobile apps using CapacitorJS;
- Bring Redis-oplog to core; ([Repository](https://github.com/Meteor-Community-Packages/redis-oplog))
- MongoDB Change Streams support; ([Discussion](https://github.com/meteor/meteor/discussions/11842))
- Better file upload support via DDP; ([Discussion](https://github.com/meteor/meteor/discussions/11523))

### Next educational items

- Create a new Meteor Guide; ([Current Guide](https://guide.meteor.com/))
- Scaling Meteor Apps course; ([Meteor University](https://university.meteor.com/))

### Finished items

- New Async Tracker; ([Blog Post](https://blog.meteor.com/new-meteor-js-2-10-and-the-async-tracker-feature-ffdbe817c801))
- New Suspense hooks for React + Meteor; ([Blog Post](https://blog.meteor.com/new-suspense-hooks-for-meteor-5391570b3007))
- Release Blaze 2.7 supporting async calls; ([Changelog](https://www.blazejs.org/changelog.html))
- New Scaffold API / generate command; ([Blog Post](https://blog.meteor.com/new-meteor-2-9-and-the-scaffold-api-8b5b2b2b2b2b))
- Types added to the core; ([Blog Post](https://blog.meteor.com/new-meteor-2-8-1-and-adding-types-to-the-core-8a6ee56f0141))
- Update Apollo skeleton NPM dependencies;
- MongoDB 6.0 Support; ([Discussion](https://github.com/meteor/meteor/discussions/12092) / [Blog Post](https://blog.meteor.com/new-meteor-2-11-and-the-new-embedded-mongodb-19767076961b))
- Vite integration;
- SolidJS integration;
- Vue 3 integration; ([Forums](https://forums.meteor.com/t/status-of-vue-3-meteor/57915/25) / [Discussion](https://github.com/meteor/meteor/discussions/11521))
- SolidJS starter template;
- Login and Accounts Course; ([Meteor University](https://university.meteor.com/))
- Updated MongoDB driver to 4.8; ([PR](https://github.com/meteor/meteor/pull/12097))
- Make MongoDB integration stable by fixing critical issues;
- New skeleton for creating Meteor apps with Chakra UI;
- Evaluate and improve support for Meteor in VSCode; ([Repository](https://github.com/matheusccastroo/vscode-meteor-toolbox))
- Release Blaze 2.6.2; ([Blog Post](https://blog.meteor.com/new-meteor-js-2-12-and-the-blaze-2-6-2-release-b72c2a7a593f))

-----------

For more completed items, refer to our [changelog](https://docs.meteor.com/changelog.html).
