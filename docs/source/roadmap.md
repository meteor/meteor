---
title: Roadmap
description: Describes the high-level features and actions for the Meteor project in the near-to-medium term future.
---

## Introduction

Last update: Setember 14, 2022.

This document describes the high-level features and actions for the Meteor project in the near-to-medium term future.
The description of many items include sentences and ideas from Meteor community members.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.


> As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

> If you have new feature requests or ideas you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

### Priorities for 2022
- Change how Meteor executes Async code or Fibers migration.
- Improve MongoDB stability and support new async API.
- Improve TypeScript support.

----

### Next releases

- Change how Meteor executes Async code; ([Discussion](https://github.com/meteor/meteor/discussions/11505))
  - Provide new async APIs where Fibers are required;
    - Mongo package with Async API; ([PR](https://github.com/meteor/meteor/pull/12028))
    - Provide async versions for Accounts and core packages;
    - Adapt Meteor Promise implementation;
- Enable Top-Level Await (TLA) on Meteor server-side; ([PR](https://github.com/meteor/meteor/pull/12095))
- Updated MongoDB driver to 4.8; ([PR](https://github.com/meteor/meteor/pull/12097))
- Make MongoDB integration stable by fixing critical issues;
- Typescript integration for Meteor packages; ([Discussion](https://github.com/meteor/meteor/discussions/12080))
- Linux ARM Support; ([PR](https://github.com/meteor/meteor/pull/11809))
- Improve release quality with test coverage and CI automation;
- Review and help to modernize Meteor tools; ([Discussion](https://github.com/meteor/meteor/discussions/12073))
- Evaluate and improve support for Meteor in VSCode; ([Repository](https://github.com/matheusccastroo/vscode-meteor-toolbox))
- New skeleton for creating Meteor apps with Chakra UI;
- Support Top-Level Await (TLA) on Reify;
- Improve support for Windows 11;
- Remove Fibers dependency from Meteor Public APIs;
- Remove Fibers entirely;

### Community items
- Release Blaze 2.6.2; ([Milestone](https://github.com/meteor/blaze/milestone/9))
- Vue 3 integration; ([Forums](https://forums.meteor.com/t/status-of-vue-3-meteor/57915/25) / [Discussion](https://github.com/meteor/meteor/discussions/11521))
- SolidJS starter template;

### Next educational items
- Create a new Meteor Guide; ([Current Guide](https://guide.meteor.com/))
- Login and Accounts course; ([Meteor University](https://university.meteor.com/))
- Scaling Meteor Apps course; ([Meteor University](https://university.meteor.com/))

### Future items
We plan to implement these items in the near future. Community help would be greatly appreciated.
- Support package.json exports fields; ([Discussion](https://github.com/meteor/meteor/discussions/11727))
- MongoDB 6.0 Support; ([Discussion](https://github.com/meteor/meteor/discussions/12092))
- Improve Meteor build time; ([Discussion](https://github.com/meteor/meteor/discussions/11587))
- HTTP/3 Support;
- Tree-shaking; ([PR](https://github.com/meteor/meteor/pull/11164))

### Candidate items
We need to discuss further to decide whether or not to proceed with these implementations.

- Update and fix Meteor Client Bundler; ([Repository](https://github.com/Urigo/meteor-client-bundler))
- Improve Passwordless package; ([Discussion](https://github.com/meteor/meteor/discussions/12075))
- Support building mobile apps using CapacitorJS;
- Bring Redis-oplog to core; ([Repository](https://github.com/Meteor-Community-Packages/redis-oplog))
- MongoDB Change Streams support; ([Discussion](https://github.com/meteor/meteor/discussions/11842))
- Better file upload support via DDP; ([Discussion](https://github.com/meteor/meteor/discussions/11523))

### Finished items

- Release Blaze 2.6.1; ([Changelog](https://www.blazejs.org/changelog.html))
- Ambassadors Program; ([Website](https://ambassador.meteor.com/))
- Demo app: SimpleTasks (Meteor + Chakra UI); ([Repository](https://github.com/fredmaiaarantes/simpletasks))
- Demo app: NFT Marketplace (Meteor + React); ([Repository](https://github.com/meteor/examples/tree/main/nft-marketplace) / [Blog post](https://blog.meteor.com/meteor-web3-building-an-nft-marketplace-9484b321e426))
- New Meteor DevTools Evolved; ([Forums](https://forums.meteor.com/t/meteor-devtools-evolved-v1-2/52710))
- Meteor Toolbox - VS Code Extension; ([Forums](https://forums.meteor.com/t/meteor-toolbox-vs-code-extension/58044))
- New router for React and Meteor; ([Forums](https://forums.meteor.com/t/new-router-for-react-and-meteor/58346))
- Meteor Desktop 3.0; ([Forums](https://forums.meteor.com/t/meteor-desktop-3-0/57863))
- New Skeleton for Tailwind CSS 3; ([Blog post](https://blog.meteor.com/meteor-2-7-2-and-the-new-tailwind-skeleton-68ccde68af42))
- Review/Update React, Vue, Blaze tutorials; ([Tutorials](https://www.meteor.com/developers/tutorials))
- Video course: "MongoDB Collections and Schemas"; ([Meteor University](https://university.meteor.com/))
- Video course: "Starting with Meteor"; ([Meteor University](https://university.meteor.com/))
- Accounts 2FA package; ([Blog post](https://blog.meteor.com/meteor-2-7-and-the-new-2fa-package-5fc53e5027e0))
- TailwindCSS 3.0 JIT Support; ([Blog post](https://blog.meteor.com/meteor-2-7-and-the-new-2fa-package-5fc53e5027e0))
- node: Protocol Import Support;
- Release Blaze 2.6; ([Changelog](https://www.blazejs.org/changelog.html))
- Support to MongoDB 5.0; ([Migration Guide](https://guide.meteor.com/2.6-migration.html))
- Add missing binaries to Fibers fork; ([Issue](https://github.com/meteor/meteor/issues/11791))
- 2FA OTP support in Meteor Accounts; ([Forums](https://forums.meteor.com/t/2fa-otp-support-in-meteor-accounts-meteor-cloud/57248))
- Meteor + SolidJS demo; ([Repository](https://github.com/edemaine/solid-meteor-demo))
- TypeScript update to v4.4.1;
- Mac M1 Support;
- HMR now works on all architectures and legacy browsers;
- New core package: accounts-passwordless;
- New Meteor NPM installer;
- Apollo skeleton upgraded to Apollo server v3;
- Node.js update to v14 from 12.22.1; ([Changelog](https://docs.meteor.com/changelog.html#v2320210624))
- Cordova update to version 10;
- New Skeleton for Svelte;
- Repository with [Meteor Examples](https://github.com/meteor/examples);

-----------

For more completed items, refer to our [changelog](https://docs.meteor.com/changelog.html).
