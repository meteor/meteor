var _ = require('underscore');
var library = require('./library.js');
var bundler = require('./bundler.js');

// Load unipackages into the currently running node.js process. Use
// this to use unipackages (such as the DDP client) from command-line
// tools (such as 'meteor'.) The requested packages will be loaded
// together will all of their dependencies, and each time you call
// this function you load another, distinct copy of all of the
// packages. The return value is an object that maps package name to
// package exports (that is, it is the Package object from inside the
// sandbox created for the newly loaded packages.)
//
// Options:
// - library: The Library to use to retrieve packages and their
//   dependencies. Required.
// - packages: The packages to load, as an array of strings. Each
//   string may be either "packagename" or "packagename.slice".
// - release: Optional. Not used to load packages! The release name to
//   pass into the app with __meteor_runtime_config__ (essentially
//   this determines what Meteor.release will return within the loaded
//   environment)
//
// Example usage:
//   var Meteor = require('./unipackage.js').load({
//     library: context.library,
//     packages: ['livedata'],
//     release: context.releaseVersion
//   }).meteor.Meteor;
//   var reverse = Meteor.connect('reverse.meteor.com');
//   console.log(reverse.call('reverse', 'hello world'));

var load = function (options) {
  options = options || {};
  if (! (options.library instanceof library.Library))
    throw new Error("unipackage.load requires a library");

  // Set up a minimal server-like environment (omitting the parts that
  // are specific to the HTTP server.) Kind of a hack. I suspect this
  // will get refactored before too long. Note that
  // __meteor_bootstrap__.require is no longer provided.
  var env = {
    __meteor_bootstrap__: { startup_hooks: [] },
    __meteor_runtime_config__: { meteorRelease: options.release }
  };

  // Load the code
  var plugin = bundler.buildPlugin({
    name: "load",
    library: options.library,
    use: options.packages || []
  });
  var ret = plugin.load(env);

  // Run any user startup hooks.
  _.each(env.__meteor_bootstrap__.startup_hooks, function (x) { x(); });

  return ret;
};

var unipackage = exports;
_.extend(exports, {
  load: load
});
