---
title: Roadmap
description: Describes the high-level features and actions for the Meteor project in the near-to-medium term future.
---

## Introduction

**Up to date as of Jan 26, 2022**

This document describes the high-level features and actions for the Meteor project in the near-to-medium term future. The description of many items include sentences and ideas from Meteor community members.

As with any roadmap, this is a living document that will evolve as priorities and dependencies shift.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

If you have new feature requests or ideas you should open a new [discussion](https://github.com/meteor/meteor/discussions/new).

## Core team

The items in this section are the core team's priorities.

### Next minor releases 

- New Core Packages
  - Accounts 2FA package; [PR](https://github.com/meteor/meteor/pull/11818)
  - Better file upload support;
- TailwindCSS 3.0 JIT Support; [Discussion](https://github.com/meteor/meteor/discussions/11804)
- Tree-shaking; [PR](https://github.com/meteor/meteor/pull/11164)
- Guide review;
- Provide new async APIs where Fibers is required;
  - Mongo package with Async API; [PR](https://github.com/meteor/meteor/pull/11605)
- Finish Blaze 2.6;
- ES Modules Support;
- node: Protocol Import Support;
- Explore new ways to expose Meteor type definitions;

### Next major releases

- Support building mobile apps using CapacitorJS;
- Explore bringing Redis-oplog to core;
- Support Top-level await;
- Remove Fibers dependency from Meteor Public APIs;
- Make Fibers optional on runtime, or remove it entirely;
- Improve Dev Tools
  - Better way to define Meteor public API types;
  - Better support for mainstream IDEs;
- Launch new sections for [Meteor University](https://university.meteor.com/);
- ARM Support;
- HTTP/3 Support;
- MongoDB Change Streams Support;
- Explore Flutter as a front-end for Meteor apps;

## Community

The items in this section are not the priorities of the core team but the core team can support community members working on it.

- Finish Vue3 integration; [Basic usage](https://github.com/meteor-vue/meteor-vue3/tree/main/packages/vue3#vuejsvue3)
- Svelte real app examples; 
- SolidJS real app examples;
- React Native real app examples;

## Previous releases
- Support to MongoDB 5.0; [Migration Guide](https://guide.meteor.com/2.6-migration.html)
- Add missing binaries to Fibers fork; [Issue](https://github.com/meteor/meteor/issues/11791)
- [Meteor University launch](https://university.meteor.com/)
- [2FA OTP support in Meteor Accounts](https://forums.meteor.com/t/2fa-otp-support-in-meteor-accounts-meteor-cloud/57248)
- [Meteor + SolidJS demo](https://github.com/edemaine/solid-meteor-demo)
- TypeScript update to v4.4.1
- Mac M1 Support
- HMR now works on all architectures and legacy browsers
- New core package: accounts-passwordless
- New Meteor NPM installer
- Apollo skeleton upgraded to Apollo server v3
- [Node.js update](https://docs.meteor.com/changelog.html#v2320210624) to v14 from 12.22.1
- Cordova update to version 10
- New Skeleton for Svelte
- Repository with [Meteor Examples](https://github.com/meteor/examples)

For more completed items, refer to our [changelog](https://docs.meteor.com/changelog.html).
