# fetch
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/fetch) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/fetch)
***

Isomorphic polyfill for the [WHATWG `fetch()` API](https://fetch.spec.whatwg.org/).

In [modern browsers](https://github.com/meteor/meteor/tree/release-1.7/packages/modern-browsers),
the native `fetch()` API can be used without a polyfill. In other words,
this package has almost no footprint in modern browsers. This package
[calls `setMinimumBrowserVersions`](./server.js) to enforce minimum modern
browser versions. However, `fetch()` has been supported natively by most
browsers for long enough that these minimum versions are unlikely to make
any difference in the `isModern` test, compared to more recent features
like `async` functions.

In legacy browsers, the
[`whatwg-fetch`](http://npmjs.org/package/whatwg-fetch) polyfill is
used. Thanks to Meteor's modern/legacy system, this polyfill adds no weight
to the modern JS bundle.

In Node, the [`node-fetch`](https://www.npmjs.com/package/node-fetch)
polyfill is used. Note: unlike the client polyfills, the Node polyfill
does not define the `fetch` function globally. However, any application or
package that depends on the Meteor `fetch` package can refer to `fetch` as
if it was a global function (or `import { fetch } from "meteor/fetch"`).
