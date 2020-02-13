# Meteor Roadmap

**Up to date as of December 10, 2019**

This document describes the high-level features and actions for the Meteor project in the near- to medium-term future. This roadmap was built based on community feedback and to improve areas where Meteor is already strong. The description of many items include sentences and ideas from Meteor community members.

As with any roadmap, this is a living document that will evolve as priorities and dependencies shift; we aim to update the roadmap with any changes or status updates every quarter.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

PRs to the roadmap are welcome. If you are willing to contribute please open a PR explaining your ideas and what you would be able to do yourself.

Ideally, every item in this roadmap should have at least two leaders, leaders are people that are interested in the item and would like to help. If you are interested please open a PR including yourself and describing how do you want to help.

## Core
### Update to Node.js 12
- Leaders: [Ben Newman](https://github.com/benjamn)
- Status: In Progress
- PRs: https://github.com/meteor/meteor/pull/10527

Since Node.js 12 is scheduled to become the LTS version on October 1st, 2019, Meteor 1.9 will update the Node.js version used by Meteor from 8.16.1 (in Meteor 1.8.2) to 12.10.0 (the most recent current version).

### Tree Shaking
- Leaders: [Ben Newman](https://github.com/benjamn)
- Status: -
- PRs: -

Implement tree shaking / dead code elimination, which involves pruning the dependency tree while scanning imports in the `ImportScanner`. We believe it should be possible to treat values like `Meteor.isProduction` as constants during this process, and eliminate those branches if their conditions are false.

### Service worker build target
- Leaders: <you?>
- Status: -
- PRs: -

A proper service worker build target. Regular Web Workers can be built from a function.toString() but service-workers require an actual server route.

### Ultra-thin Meteor
- Leaders: <you?>
- Status: -
- PRs: -

[Meteor 1.7](https://github.com/meteor/meteor/blob/devel/History.md#v17-2018-05-28) introduced the `meteor create --minimal` command, which generates a new application without any unnecessary Meteor packages, like `mongo` and `ddp`.

When minified and gzip-compressed, the JS bundle for this app weighs in at less than 20kB, which is much smaller than the default `meteor create` application. Nevertheless, there is still room for improvement, using techniques like bundle visualization (`meteor npm run visualize`) and converting static `import`s to dynamic `import()`s.

Additionally, minimal Meteor applications do not include the `autoupdate` package by default, because it is not strictly necessary for building an application, and its dependencies (`ddp` in particular, but no longer `mongo` or `minimongo`, thanks to [PR #10238](https://github.com/meteor/meteor/pull/10238)) contribute an additional 30kB to the JS bundle. The drawback of not using `autoupdate` is that instantaneous client refreshes are disabled, which can slow down development, so it would be great to find a way of making `autoupdate` less expensive, or enable it only in development.

In other words, we want minimal Meteor apps to be not only as tiny as possible, but also just as developer-friendly as a normal Meteor application.

Related issues:
* [MFR #31](https://github.com/meteor/meteor-feature-requests/issues/31)
* [MFR #354](https://github.com/meteor/meteor-feature-requests/issues/354)
* [Issue #9960](https://github.com/meteor/meteor/issues/9960)
* [PR #8853](https://github.com/meteor/meteor/pull/8853)
* [PR #10238](https://github.com/meteor/meteor/pull/10238)

### Page load performance improvements
- Leaders: [Seba Kerckhof](https://github.com/sebakerckhof)
- Status: -
- PRs: -

Make sure we are not delivering any dependency that is not used ([Issue #10701](https://github.com/meteor/meteor/issues/10701), [Issue #10702](https://github.com/meteor/meteor/issues/10702), [Issue #10704](https://github.com/meteor/meteor/issues/10704), [PR #10792](https://github.com/meteor/meteor/pull/10792))

### Improve Rebuild performance
- Leaders: [zodern](https://github.com/zodern) / [Marcelo T Prado](https://github.com/MarceloPrado)
- Status: -
- PRs: -

Explore ideas to improve rebuild time such as split main client bundle into several bundles, split the server bundle into several bundles, store less file content in memory, option to disabling the legacy build (at least in dev mode), etc

### Performance improvements on Windows
- Leaders: [zodern](https://github.com/zodern)
- Status: -
- PRs: -

Explore ideas to improve performance on Windows such as build in place.

### Hot Module Replacement
- Leaders: <you?>
- Status: -
- PRs: -

Explore ideas to implement HMR in Meteor.

### Transition as much as possible to NPM
- Leaders: <you?>
- Status: -
- PRs: -

Migrate packages that do not depend on Meteor exclusive features to NPM and we also continue to encourage new packages to be published as NPM packages when possible.

## Cordova
### Update Cordova to 9
- Leaders: [Filipe Névola](https://github.com/filipenevola) / [Renan Castro](https://github.com/renanccastro)
- Status: In Progress
- PRs: https://github.com/meteor/meteor/pull/10810

Update Cordoba lib and its dependencies to latest (version 9)

### Cordova documentation
- Leaders: <you?>
- Status: -
- PRs: -

Provide a skeleton with mobile native configurations already in place such as `mobile-config.js`, sample assets, Fastlane scripts, etc. Also improve docs and guide ([Forums post](https://forums.meteor.com/t/lets-create-the-ultimate-cordova-hot-code-push-faq-doc/50500)).

## DB
### Update MongoDB driver
- Leaders: <you?>
- Status: -
- PRs: https://github.com/meteor/meteor/pull/10723

Update to Mongodb driver from 3.2.7 to 3.3.5, this version is compatible with MongoDB 4.2.

### Minimongo secondary index support
- Leaders: <you?>
- Status: -
- PRs: -

Improve index support for Minimongo to enable better performance in the client for databases with thousands of documents. ([Issue #10703](https://github.com/meteor/meteor/issues/10703))

## Documentation
### Step-by-step guide
- Leaders: <you?>
- Status: -
- PRs: -

Provide a nice and friendly introduction for people that are learning Meteor.

### Update Blaze Tutorial
- Leaders: <you?>
- Status: -
- PRs: -

Blaze tutorial should reflect latest best practices.

### Update Angular Tutorial
- Leaders: <you?>
- Status: -
- PRs: -

Angular tutorial should reflect latest best practices for using Meteor and Angular together.

### Update React Tutorial
- Leaders: [Filipe Névola](https://github.com/filipenevola)
- Status: -
- PRs: -

React tutorial should reflect latest best practices for using Meteor and React together.

### PWA documentation
- Leaders: <you?>
- Status: -
- PRs: -

Provide a skeleton with PWA configurations already in place such as `manifest`, service worker, Open Graph meta tags, etc. Also improve docs and guide.

### SSR documentation
- Leaders: <you?>
- Status: -
- PRs: -

Provide a skeleton with SSR configurations already in place.

### Tests documentation
- Leaders: [Simon Schick](https://github.com/SimonSimCity) / [Florian Bienefelt](https://github.com/Floriferous)
- Status: -
- PRs: -

Provide samples on how to run tests in Meteor these samples should include unit tests and also cypress tests.

## First-class citizen Technologies
Consider Vue.js, Svelte, React Native, and Apollo as first-class citizen, for 
each technology we would like to have:  
- skeleton (meteor create)
- tutorial
- documentation (how to use)
- examples

as we already have for Blaze, React and Angular.

### Vue.js
- Leaders: <you?>
- Status: -
- PRs: -

### Svelte
- Leaders: <you?>
- Status: -
- PRs: -

### React Native
- Leaders: <you?>
- Status: -
- PRs: -

### Apollo
- Leaders: <you?>
- Status: -
- PRs: -

### Third-party tools with their own build steps

- Leaders: <you?>
- Status: -
- PRs: -

Remove limitations that prevent using third-party tools with their own build steps, such as Storybook or Jest.

Relevant discussions:
- https://github.com/meteor/meteor/pull/10811#issuecomment-564726713
- https://github.com/storybookjs/storybook/issues/5975

## Recently completed

### Different JS bundles for modern versus legacy browsers

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/9439

### Eliminate the need for an `imports` directory

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/9690, https://github.com/meteor/meteor/pull/9714, https://github.com/meteor/meteor/pull/9715

### Make Mongo more optional

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/8999

### Upgrade to Node 8

- Status: shipped in Meteor 1.6.
- PRs: https://github.com/meteor/meteor/pull/8728

### Upgrade to npm 5

- Status: shipped in Meteor 1.6

### Dynamic `import(...)`

- Status: shipped in Meteor 1.5

### Rebuild performance improvements

- Status: shipped in Meteor 1.4.2

### MongoDB updates

- Status: shipped in Meteor 1.4

### Support for Node 4 and beyond

- Status: shipped in Meteor 1.4

### View Layer

- Status: Blaze split into new repository and can be published independently as of 1.4.2

### Other

For more completed items, refer to the project history here: https://github.com/meteor/meteor/blob/devel/History.md
