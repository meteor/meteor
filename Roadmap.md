# Meteor Roadmap

**Up to date as of Aug 21, 2020**

This document describes the high-level features and actions for the Meteor project in the near- to medium-term future. This roadmap was built based on community feedback and to improve areas where Meteor is already strong. The description of many items include sentences and ideas from Meteor community members.

As with any roadmap, this is a living document that will evolve as priorities and dependencies shift; we aim to update the roadmap with any changes or status updates every quarter.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

PRs to the roadmap are welcome. If you are willing to contribute please open a PR explaining your ideas and what you would be able to do yourself.

Ideally, every item in this roadmap should have at least two leaders, leaders are people that are interested in the item and would like to help. If you are interested please open a PR including yourself and describing how do you want to help.

## Core

### Tree Shaking
- Leaders: [Renan Castro](https://github.com/renanccastro) / [Filipe Névola](https://github.com/filipenevola)
- Status: In Progress
- PRs: [#11107](https://github.com/meteor/meteor/pull/11107)

Implement tree shaking / dead code elimination, which involves pruning the dependency tree while scanning imports in the `ImportScanner`. We believe it should be possible to treat values like `Meteor.isProduction` and `Meteor.isServer` as constants during this process, and eliminate those branches if their conditions are false (as in https://github.com/meteor/meteor/pull/10056).

### Service worker build target
- Leaders: <you?>
- Status: -
- PRs: -

A proper service worker build target. Regular Web Workers can be built from a function.toString() but service-workers require an actual server route.

### Ultra-thin Meteor
- Leaders: [Ruither Borba](https://github.com/delki8) / [Christian Klaussner](https://github.com/klaussner)
- Status: In Progress
- PRs: https://github.com/meteor/meteor/pull/11034 https://github.com/meteor/meteor/pull/11106

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


### Hot Module Replacement
- Leaders: [zodern](https://github.com/zodern)
- Status: In Progress
- PRs: https://github.com/meteor/meteor/pull/11117

HMR in Meteor, we already have a work in progress here, you can provide feedback already, check the PR.

### Transition as much as possible to NPM
- Leaders: <you?>
- Status: -
- PRs: 
  - PoC using base64 package as example [#10996](https://github.com/meteor/meteor/pull/10996)

Migrate packages that do not depend on Meteor exclusive features to NPM and we also continue to encourage new packages to be published as NPM packages when possible.

## Cordova
### Cordova documentation
- Leaders: [Filipe Névola](https://github.com/filipenevola)
- Status: In Progress
- PRs: https://github.com/meteor/meteor/pull/11072

Provide an example with mobile native configurations already in place such as `mobile-config.js`, sample assets, Fastlane scripts, etc. Also improve docs and guide ([Forums post](https://forums.meteor.com/t/lets-create-the-ultimate-cordova-hot-code-push-faq-doc/50500)).

## DB
### Minimongo secondary index support
- Leaders: [Brian Mulhall](https://github.com/BrianMulhall)
- Status: -
- PRs: -

Improve index support for Minimongo to enable better performance in the client for databases with thousands of documents. ([Issue #10703](https://github.com/meteor/meteor/issues/10703))

## Documentation
### Step-by-step guide
- Leaders: <you?>
- Status: -
- PRs: -

Provide a nice and friendly introduction for people that are learning Meteor.

### Update Angular Tutorial
- Leaders: [Brian Mulhall](https://github.com/BrianMulhall)
- Status: -
- PRs: -

Angular tutorial should reflect latest best practices for using Meteor and Angular together.

React tutorial should reflect latest best practices for using Meteor and React together.

### PWA documentation
- Leaders: [Filipe Névola](https://github.com/filipenevola)
- Status: In Progress
- PRs: -

Provide an example with PWA configurations already in place such as `manifest`, service worker, Open Graph meta tags, etc. Also improve docs and guide.

### SSR documentation
- Leaders: [Kevin Newman](https://github.com/CaptainN) / [Eric Burel](https://github.com/eric-burel)
- Status: -
- PRs: -

Provide a skeleton with SSR configurations already in place.

Relevant issues:
- https://github.com/meteor/meteor-feature-requests/issues/174

### Tests documentation
- Leaders: [Simon Schick](https://github.com/SimonSimCity) / [Florian Bienefelt](https://github.com/Floriferous)
- Status: -
- PRs: -

Provide samples on how to run tests in Meteor these samples should include unit tests and also cypress tests.

### Svelte
- Leaders: [Brian Mulhall](https://github.com/BrianMulhall)
- Status: In Progress
- PRs: https://github.com/meteor/simple-todos-svelte

Tutorial is ready. We want a create command (--svelte) yet and more docs.

### Third-party tools with their own build steps

- Leaders: <you?>
- Status: -
- PRs: -

Remove limitations that prevent using third-party tools with their own build steps, such as Storybook or Jest.

Relevant discussions:
- https://github.com/meteor/meteor/pull/10811#issuecomment-564726713
- https://github.com/storybookjs/storybook/issues/5975

## Recently completed
### Vue.js
- Leaders: [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/simple-todos-vue

Tutorial is ready and create command meteor create --vue

### Apollo
- Leaders: [Jan Dvorak](https://github.com/StorytellerCZ)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/meteor/pull/11119

Apollo skeleton, meteor create --apollo

### Performance improvements on Windows
- Leaders: [zodern](https://github.com/zodern)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/meteor/pull/10838 https://github.com/meteor/meteor/pull/11114 https://github.com/meteor/meteor/pull/11115 https://github.com/meteor/meteor/pull/11102

Explore ideas to improve performance on Windows such as build in place.

### Update React Tutorial
- Leaders: [Leonardo Venturini](https://github.com/leonardoventurini) / [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in July 2020
- PRs: https://github.com/meteor/simple-todos-react

### React Native
- Leaders: [Nathaniel Dsouza](https://github.com/TheRealNate)
- Status: shipped in June 2020
- PRs: https://github.com/meteor/guide/pull/1041 https://github.com/meteor/guide/pull/1039 https://github.com/meteor/guide/pull/1035

Guide is ready ([check here](https://guide.meteor.com/react-native.html)).

### Update Blaze Tutorial
- Leaders: [Jan Küster](https://github.com/jankapunkt), [Harry Adel](https://github.com/harryadelb), [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in April 2020
- PRs: https://github.com/meteor/tutorials/pull/200 https://github.com/meteor/tutorials/pull/199

Blaze tutorial should reflect latest best practices.

### Update MongoDB driver
- Leaders: [Christian Klaussner](https://github.com/klaussner)
- Status: shipped in Meteor 1.10.1
- PRs: https://github.com/meteor/meteor/pull/10861 / https://github.com/meteor/meteor/pull/10723

Update to Mongodb driver from 3.2.7 to 3.5.4, this version is compatible with MongoDB 4.2.

### Update Cordova to 9
- Leaders: [Filipe Névola](https://github.com/filipenevola) / [Renan Castro](https://github.com/renanccastro)
- Status: shipped in Meteor 1.10.1
- PRs: https://github.com/meteor/meteor/pull/10861 / https://github.com/meteor/meteor/pull/10810 / https://github.com/meteor/meteor/pull/10861

Update Cordoba lib and its dependencies to latest (version 9)

### Update to Node.js 12
- Leaders: [Ben Newman](https://github.com/benjamn)
- Status: shipped in Meteor 1.9.
- PRs: https://github.com/meteor/meteor/pull/10527

Since Node.js 12 is scheduled to become the LTS version on October 1st, 2019, Meteor 1.9 will update the Node.js version used by Meteor from 8.16.1 (in Meteor 1.8.2) to 12.10.0 (the most recent current version).

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
