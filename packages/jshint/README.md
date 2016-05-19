JSHint for Meteor
===

This packages adds a Linter Plugin that automatically runs all your JavaScript
source files through the [JSHint linter](http://jshint.com/about/), correctly
passing the global imports from the used packages.

To configure the plugin, put a `.jshintrc` file into your app's (or package's)
root, containing a valid JSON with the [JSHint
options](http://jshint.com/docs/options/).

