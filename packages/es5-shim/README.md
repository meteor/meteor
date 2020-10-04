# es5-shim
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/es5-shim) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/es5-shim)
***

This package improves ECMAScript 5 compliance in all browers, particularly older browsers, and especially Internet Explorer 8 (and earlier).

Like the `ecmascript` package, `es5-shim` is [installed by default](https://github.com/meteor/meteor/blob/22bd755918/tools/static-assets/skel/.meteor/packages#L11) for all new apps. Though it technically can be removed, the expectation is that it will only be removed if the app author wishes to install an equivalent package instead (e.g. something based on [`core-js`](https://github.com/zloirock/core-js)), or wishes to drop support for older browsers altogether.

Given these assumptions, as of Meteor 1.2, packages may safely begin to rely on ES5 features that are patched or polyfilled by `es5-shim`. Packages are discouraged from depending directly on `es5-shim`, however, as that would make it considerably more difficult for app authors to remove or replace the package.
