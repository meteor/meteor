

# Meteor Roadmap

**Up to date as of March 9, 2018**

This document describes the high level features the Meteor project maintainers have decided to prioritize in the near- to medium-term future. A large fraction of the maintainers’ time will be dedicated to working on the features described here. As with any roadmap, this is a living document that will evolve as priorities and dependencies shift; we aim to update the roadmap with any changes or status updates on a monthly basis.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap as maintainers will prioritize their time spent reviewing PRs and issues around these contributions. This however does not mean that PRs against other features and bugs will automatically be rejected.

Items can be added to this roadmap by first getting design approval for a solution to an open issue, as outlined by our [contributing guidelines](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md). Then, when a contributor has committed to solving the issue in the short to medium term, they can submit a PR to add that work to the roadmap. All other PRs to the roadmap will be rejected.

## Different JS bundles for modern versus legacy browsers

*Pull request: https://github.com/meteor/meteor/pull/9439*

Despite amazing progress in the latest versions of popular web browsers to support the vast majority of the ECMAScript specification, most web applications are still forced to compile their JavaScript for the oldest browsers they want to support, which means native support for the latest features is usually off-limits.

Starting in Meteor 1.6.2, Meteor will build two different client JS bundles, one for modern browsers (`web.browser`) and another for legacy browsers (`web.browser.legacy` and `web.cordova`), in addition to the server bundle which targets Node 8. Package authors can use these architectures to include files only in legacy browsers, or only in modern browsers, while also setting minimum browser versions for the native features they require. As of this writing, modern browsers are loosely defined as any browsers with native support for `async` functions and `await` expressions, which represents [more than 80% of web usage today](https://caniuse.com/#feat=async-functions).

While it was tempting to compile even more bundles for different categories of browser support, the reality of the web today is that most users have access to self-updating "evergreen" browsers, with nearly complete ECMAScript support, and the market share of evergreen browsers is only going to increase with time. For everyone else, Meteor will automatically provide the same level of compilation provided to everyone by Meteor 1.6.1 and before. It's also a lot easier to test two different bundles in representative browsers than it is to test a whole matrix of possibilities.

As a result of these changes, a typical new Meteor app will have a modern client JS bundle that is one quarter to one third the size of the legacy JS bundle. A new app created with `meteor create --release 1.6.2-beta.12 --minimal new-app` will have a modern JS bundle just 15KB in size (minified + gzip), for example.

## Out of the box support for advanced React features

React is the most popular way to build UIs in JavaScript today, and a great companion to the rest of the features provided by Meteor. Meteor's zero-configuration environment provides a great opportunity to make features React apps depend on work out of the box. This includes features like:

1. Automatic selection of development vs. production build of React (completed)
2. Abstraction for isomorphic server-side rendering ([ongoing](https://github.com/meteor/meteor/blob/devel/packages/server-render/README.md))
3. Integration of [dynamic imports](https://blog.meteor.com/dynamic-imports-in-meteor-1-5-c6130419c3cd) with React SSR
4. Full support for optimized CSS-in-JS features of libraries like [styled-components](https://www.styled-components.com/)

We think Meteor has a clear set of benefits when compared to other popular React frameworks like Create React App and Next.js.

## Remove blockers to Meteor adoption

### Support the latest stable version of Node

*Tracking pull request: https://github.com/meteor/meteor/pull/8728*

See [above](https://github.com/meteor/meteor/blob/devel/Roadmap.md#upgrade-to-node-8). Developers deserve to use the latest underlying technologies, and Meteor is uniquely able to smooth over any rough edges in early/experimental versions of technologies like Node. A number of developers are already using beta versions of Meteor 1.6 to deploy their apps, because the benefits outweigh the risks for them. Just as Meteor 1.5 climbed to more than 50% usage in less than two months, we expect Meteor 1.6 to become the most widely used version of Meteor soon after its release.

### Eliminate the need for an `imports` directory

*Status: possible using `meteor.mainModule` in `package.json` in `1.6.2-beta.12`.*
*Pull requests: https://github.com/meteor/meteor/pull/9690, https://github.com/meteor/meteor/pull/9714, https://github.com/meteor/meteor/pull/9715*

When Meteor 1.3 first introduced a module system based on [CommonJS](http://wiki.commonjs.org/wiki/Modules/1.1) and [ECMAScript module syntax](2ality.com/2014/09/es6-modules-final.html), we had to provide a way for developers to migrate their apps from the old ways of loading code, whereby all files were evaluated eagerly during application startup.

The best solution at the time was to introduce a special `imports` directory to contain modules that should be loaded lazily (rather than eagerly), when first imported.

Most other Node applications work this way by default: every module is lazy, and therefore must be imported by another module, and evaluation starts with one "entry point" module (typically specified by the `"main"` field in `package.json`).

It should be possible for Meteor apps to opt into this behavior, and optionally get rid of their special `imports` directories. The mechanism for opting in will very likely involve putting something in your `package.json` file that specifies entry point modules for both client and server.

### Make the `meteor` command-line tool installable from npm

Installing `meteor` from npm would enable developers to use it as build tool for npm-based projects, and would simplify the Meteor release process by getting rid of the "dev bundle" (essentially the npm dependencies of the command-line tool).

The biggest blockers to this project are

1. deciding whether/how to preserve Meteor release versions, and
2. changing the API of the package server so that you don't have to download the entire package database locally.

## Page load performance improvements

*Ongoing*

Speeding up page load times will require a combination of new tools for asynchronous JavaScript delivery (code splitting), dead code elimination, deferred evaluation of JavaScript modules, and performance profiling (so that developers can identify expensive packages).

### Making large dependencies optional

Making it possible to remove (or dynamically load) large dependencies like `jquery`, `underscore`, and `minimongo` will have a significant impact on bundle sizes.

### More aggressive client caching

Using `Cache-Control: immutable` to cache the initial JavaScript bundle will reduce the amortized cost of downloading the initial JavaScript bundle in newer browsers.

Dynamic `import(...)` benefits dramatically from storing previously-received module versions in [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), though it may be possible to use IndexedDB in a faster way.

### Better dead code elimination

Although Meteor minifies JavaScript in production, and modules that are never imported are not included in the client bundle, Meteor could do a better job of removing code within modules that will never be used, according to static analysis. The static syntax of ECMAScript 2015 `import` and `export` declarations should make this analysis easier.


## Full transition to npm

*Status: We encourage publishing Meteor-related packages to npm where possible. We are investigating ways to make it possible to move some parts of Meteor core onto npm without making the installation process more complex.*

The community has rallied around npm as the de-facto standard package manager for JavaScript. We believe committing fully to npm will strengthen the entire JavaScript ecosystem by removing fragmentation, will benefit existing Meteor developers by making it seamless to use any JavaScript package and increase Meteor adoption by aligning it with JavaScript best practices.

1.3 introduced `npm install` support along with ES2015 modules. In the future, we would like to transition the Meteor package ecosystem over entirely from Atmosphere to npm. We are still in the early conceptual design phase and expect to update the roadmap once we have a design in place that will underpin further development.


## GraphQL Data: SQL, REST, performance

*Status: In progress at [http://dev.apollodata.com/](http://dev.apollodata.com/)*

We're building a next generation GraphQL-focused data stack for modern applications called Apollo. We believe that this spiritual successor to the data part of the Meteor stack is impactful enough to deserve it's own fully fledged project that is compatible with other languages and frameworks. Apollo is born from the Meteor project and works perfectly with Meteor today.

Apollo is our approach to giving Meteor developers SQL and other database support, the ability to choose between realtime and static data, and improved performance analysis. We are working on providing better tools and documentation for Meteor developers to integrate Apollo into their apps, and welcome contributions in this area. The next priority for Apollo and Meteor is enabling Meteor developers to choose to replace MongoDB entirely with GraphQL on top of other storage engines.

Even though Apollo could eventually be a complete replacement for Meteor’s included Mongo/DDP data stack, you should feel good about Meteor’s existing data system. We are currently open to ideas around performance and stability improvements.



# **Recently completed**

## Make Mongo more optional

*Pull request: https://github.com/meteor/meteor/pull/8999*

Meteor has depended on Mongo for as long as the Meteor project has existed. However, we care deeply about supporting other data storage systems (especially via [GraphQL](https://www.apollodata.com/)), and would like to make it possible to avoid using Mongo altogether.

Since Meteor 1.6.2-beta.9, `meteor create --minimal minimal-app` will create an app with very few packages, without any dependency on Mongo.

## Upgrade to Node 8

*Status: shipped in Meteor 1.6.*
*Pull request: https://github.com/meteor/meteor/pull/8728*

Upgrading Node will allow Meteor to take better advantage of native support for new ECMAScript features on the server, which should speed up build performance and also improve runtime performance, thanks to performance improvements in Node itself.

Perhaps even more importantly, newer versions of Node support a vastly improved debugging experience. Not only can you use native Chrome DevTools and many other debugging clients (WebStorm, VS Code, etc.) to debug your app (no more [`node-inspector`](https://www.npmjs.com/package/node-inspector)), but also the Node process runs at full speed while debugging, so you don't have to wait as long for problems to manifest themselves.

## Upgrade to npm 5

*Status: implemented since `1.6-beta.4`.*

It’s been an interesting year for npm clients. Once unrivaled as the tool of choice for installing npm packages, the `npm` command-line tool faced some serious competition starting last September from an innovative tool called `yarn`, which promised fast, reproducible installs based on `yarn.lock` files.

The popularity of `yarn` led Meteor to support `meteor yarn` in addition to `meteor npm` (though you had to `meteor npm install --global yarn` first, so `npm` still had an advantage). Our own  Galaxy Server and Optics apps, which are built with Meteor, switched over to `yarn` soon after its release. The appeal was undeniable.

This competition was a good thing for JavaScript developers, first because yarn solved some long-standing problems with `npm`, and later because `npm@5` responded by shipping its own implementation of some similar features, with `package-lock.json` files and automatic addition of npm install-ed packages to `package.json`.

These improvements to `npm` will benefit all Meteor developers, even those who keep using `yarn`, because package dependencies specified with `Npm.depends` are automatically installed using `npm`, and `npm@5` performs those installations much faster and more reliably.

Meteor is careful to remain agnostic about how you choose to populate your `node_modules` directories, so we fully expect that `meteor npm` and `meteor yarn` will remain equally good alternatives for that purpose.

## Dynamic `import(...)`

*Status: Shipped in 1.5*

The banner feature of this effort will be first-class support for [dynamic `import(...)`](https://github.com/tc39/proposal-dynamic-import), which enables asynchronous module fetching.

Read the recent [blog post](https://blog.meteor.com/meteor-1-5-react-loadable-f029a320e59c) for an overview of how this system will work in Meteor 1.5.

Remaining work can be found [here](https://github.com/meteor/meteor/blob/release-1.5/packages/dynamic-import/TODO.md), though not all of those ideas will necessarily block the initial 1.5 release.


## Rebuild performance improvements

*Status: Shipped in 1.4.2*

Rebuild performance refers to the length of time between changing a file in development and being able to reload your app in a browser. After extensive profiling to identify performance hot-spots, and with careful caching of previously completed work, Meteor 1.4.2 takes substantially less time to rebuild most apps, especially larger apps.


## MongoDB updates

*Status: Shipped in 1.4*

The mongo driver that currently ships with Meteor is old and doesn’t reliably work with connecting to MongoDB 3.2 databases (e.g [#6258](https://github.com/meteor/meteor/issues/6258)). We want to update to the latest driver [#5763](https://github.com/meteor/meteor/issues/5763).
In addition, we'd like to update the dev bundle to ship with the latest stable version of MongoDB (3.2) [#5809](https://github.com/meteor/meteor/issues/5809) as MongoDB 2.6 will be officially sunsetted at the end of October, 2016.


## Support for Node 4 and beyond

*Status: Shipped in 1.4*

We want to be able to update the version of Node that ships with Meteor to 4 and eventually 6 [#5124](https://github.com/meteor/meteor/issues/5124). [#6537](https://github.com/meteor/meteor/issues/6537) lays the groundwork to overcome the main blocker for updating to Node 4, that is, needing to rebuild all existing Meteor packages that contain binary dependencies.


## View Layer

*Status: Blaze split into new repository and can be published independently as of 1.4.2*

Our plans around the view layer are to maintain strong integrations (along with guidance) with React, Angular and Blaze. We'll make essential fixes to Blaze but most likely won't be adding new features ourselves. We encourage you to help build the features you need at the [meteor/blaze](https://github.com/meteor/blaze) repository.


## Project Governance/Community Contribution

*Status: Since this topic was added to the roadmap, we have introduced [completely new contribution guidelines](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md) that outline exactly how to contribute to Meteor in several ways, including triaging issues, improving documentation, submitting designs for new features, and submitting PRs for bug fixes and improvements. We encourage proposals about how to make the process better via new GitHub issues.*

Currently, it’s difficult for external developers to make meaningful contributions to Meteor as there is no clear guidance on what to work on, how best to do that work and signals around what will/won’t get merged. We plan on fixing this by creating tight documentation around how the project is developed (e.g the [Swift contribution guidelines](https://swift.org/contributing/)) and giving contributors a path towards earning increased privileges that culminate in full commit access. We’re also aiming to move more sub-projects into their own repositories that can be released on their own release schedule and more easily maintained by the community.


## Other

For more completed items, refer to the project history here: https://github.com/meteor/meteor/blob/devel/History.md
