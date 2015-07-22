# promise [![Build Status](https://travis-ci.org/meteor/promise.svg)](https://travis-ci.org/meteor/promise)
ECMAScript 2015 Promise polyfill with Fiber support

The static methods `Promise.async` and `Promise.await` implement the
relaxed `async` and `await` functions proposed in this talk: [Why Fibers
Make Sense For Meteor](http://benjamn.github.io/goto2015-talk).

Note: as of
[v0.4.0](https://github.com/meteor/promise/releases/tag/v0.4.0), this
library no longer depends directly on the
[`fibers`](https://www.npmjs.com/package/fibers) package. If you want to
use this library in a codebase that uses `Fiber`s, make sure to set
`Promise.Fiber` to the `Fiber` constructor that you use elsewhere.  For
example,
[here](https://github.com/meteor/promise/blob/1e52f297b02ea83e7fb48ba4c2b17d3b4503c001/test/tests.js#L2-L5)
is how it's done in the test code for this repository.

If you'd like to use this package in a [Meteor](https://www.meteor.com/) project, a much simpler
approach is simply to run `meteor add [promise](https://atmospherejs.com/meteor/promise)`.
