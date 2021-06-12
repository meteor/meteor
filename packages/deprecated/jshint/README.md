# jshint
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/jshint) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/jshint)
***

JSHint for Meteor
===

This packages adds a Linter Plugin that automatically runs all your JavaScript
source files through the [JSHint linter](http://jshint.com/about/), correctly
passing the global imports from the used packages.

To configure the plugin, put a `.jshintrc` file into your app's (or package's)
root, containing a valid JSON with the [JSHint
options](http://jshint.com/docs/options/).

