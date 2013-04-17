var _ = require('underscore');
var library = require('./library.js');
var bundler = require('./bundler.js');

// Load unipackages into the currently running node.js process. Use
// this to use unipackages (such as the DDP client) from command-line
// tools (such as 'meteor'.) The package's exports will be available
// as usual in Package.packagename. They will not be copied into your
// scope.
//
// Currently this may only be called once. This is because in the
// future we want to support packages that have portions that are
// conditionally included (whether slices like 'ddp.server', or units
// like an individual function in DomUtils) and the only way to add
// symbols to package's namespace once it's been initially set up is
// to use eval. We're not quite ready to sign up for eval because we'd
// first want to see how much that usage of it frustrates the
// JIT. (It's also because we currently go through the motions of
// setting up a 'proper' server environment and running any startup
// hooks -- this may or may not be the right call.)
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

var load = function (options) {
  options = options || {};
  if (typeof __meteor_bootstrap__ !== "undefined")
    throw new Error("unipackage.load may only be called once");
  if (! (options.library instanceof library.Library))
    throw new Error("unipackage.load requires a library");

  // Set up a minimal server-like environment (omitting the parts that
  // are specific to the HTTP server.) Kind of a hack. I suspect this
  // will get refactored before too long. Note that
  // __meteor_bootstrap__.require is no longer provided.
  __meteor_bootstrap__ = { startup_hooks: [] };
  __meteor_runtime_config__ = { meteorRelease: options.release };

  // Load the code
  bundler._load(options.library, options.packages || []);

  // Run any user startup hooks.
  _.each(__meteor_bootstrap__.startup_hooks, function (x) { x(); });
};

var unipackage = exports;
_.extend(exports, {
  load: load
});