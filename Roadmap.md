

# Meteor Roadmap

**Up to date as of March 17, 2017**

This document describes the high level features the Meteor project maintainers have decided to prioritize in the near- to medium-term future. A large fraction of the maintainers’ time will be dedicated to working on the features described here. As with any roadmap, this is a living document that will evolve as priorities and dependencies shift; we aim to update the roadmap with any changes or status updates on a monthly basis.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap as maintainers will prioritize their time spent reviewing PRs and issues around these contributions. This however does not mean that PRs against other features and bugs will automatically be rejected.

Items can be added to this roadmap by first getting design approval for a solution to an open issue, as outlined by our [contributing guidelines](https://github.com/meteor/meteor/blob/devel/Contributing.md). Then, when a contributor has committed to solving the issue in the short to medium term, they can submit a PR to add that work to the roadmap. All other PRs to the roadmap will be rejected.


## Page load performance improvements

*Tracking pull request: https://github.com/meteor/meteor/pull/8327*

Just as Meteor 1.4.2 took aim at rebuild performance, Meteor 1.5 will be all about production app performance, specifically client-side application startup time.

Fast initial page load times are somewhat less important for single-page reactive web apps than for other kinds of websites, but large Meteor apps with lots of packages tend to load quite a bit of JavaScript, and the cost of all that network traffic, parsing, and evaluation definitely adds up.

Speeding up page load times will require a combination of new tools for asynchronous JavaScript delivery (code splitting), dead code elimination, deferred evaluation of JavaScript modules, and performance profiling (so that developers can identify expensive packages).

### Dynamic `import(...)`

The banner feature of this effort will be first-class support for [dynamic `import(...)`](https://github.com/tc39/proposal-dynamic-import), which enables asynchronous module fetching.

Read the recent [blog post](https://blog.meteor.com/meteor-1-5-react-loadable-f029a320e59c) for an overview of how this system will work in Meteor 1.5.

Remaining work can be found [here](https://github.com/meteor/meteor/blob/release-1.5/packages/dynamic-import/TODO.md), though not all of those ideas will necessarily block the initial 1.5 release.

### Making large dependencies optional

Making it possible to remove (or dynamically load) large dependencies like `jquery`, `underscore`, and `minimongo` will have a significant impact on bundle sizes.

### More aggressive client caching

Using `Cache-Control: immutable` to cache the initial JavaScript bundle will reduce the amortized cost of downloading the initial JavaScript bundle in newer browsers.

Dynamic `import(...)` benefits dramatically from storing previously-received module versions in [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), though it may be possible to use IndexedDB in a faster way.

### Better dead code elimination

Although Meteor minifies JavaScript in production, and modules that are never imported are not included in the client bundle, Meteor could do a better job of removing code within modules that will never be used, according to static analysis. The static syntax of ECMAScript 2015 `import` and `export` declarations should make this analysis easier.

## Upgrade to Node 6

*Tracking pull request: https://github.com/meteor/meteor/pull/6923*

Upgrading Node will allow Meteor to take better advantage of native support for new ECMAScript features on the server, which should speed up build performance and may also improve runtime performance, thanks to performance improvements in Node itself.


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

*Status: Since this topic was added to the roadmap, we have introduced [completely new contribution guidelines](https://github.com/meteor/meteor/blob/devel/Contributing.md) that outline exactly how to contribute to Meteor in several ways, including triaging issues, improving documentation, submitting designs for new features, and submitting PRs for bug fixes and improvements. We encourage proposals about how to make the process better via new GitHub issues.*

Currently, it’s difficult for external developers to make meaningful contributions to Meteor as there is no clear guidance on what to work on, how best to do that work and signals around what will/won’t get merged. We plan on fixing this by creating tight documentation around how the project is developed (e.g the [Swift contribution guidelines](https://swift.org/contributing/)) and giving contributors a path towards earning increased privileges that culminate in full commit access. We’re also aiming to move more sub-projects into their own repositories that can be released on their own release schedule and more easily maintained by the community.


## Other

For more completed items, refer to the project history here: https://github.com/meteor/meteor/blob/devel/History.md

