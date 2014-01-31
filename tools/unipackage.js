var _ = require('underscore');
var library = require('./library.js');
var bundler = require('./bundler.js');
var buildmessage = require('./buildmessage.js');

// Load unipackages into the currently running node.js process. Use
// this to use unipackages (such as the DDP client) from command-line
// tools (such as 'meteor'). The requested packages will be loaded
// together will all of their dependencies, and each time you call
// this function you load another, distinct copy of all of the
// packages (except see note about caching below). The return value is
// an object that maps package name to package exports (that is, it is
// the Package object from inside the sandbox created for the newly
// loaded packages).
//
// Caching: There is a simple cache. If you call this function with
// exactly the same library, release, and packages, we will attempt to
// return the memoized return value from the previous load (rather
// than creating a whole new copy of the packages in memory). The
// caching logic is not particularly sophisticated. For example,
// whenever you call load() with a different library the cache is
// flushed.
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
//   var DDP = require('./unipackage.js').load({
//     library: release.current.library,
//     packages: ['livedata'],
//     release: release.current.name
//   }).livedata.DDP;
//   var reverse = DDP.connect('reverse.meteor.com');
//   console.log(reverse.call('reverse', 'hello world'));

var cacheLibrary = null;
var cacheRelease = null;
var cache = null; // map from package names (joined with ',') to return value

var load = function (options) {
  options = options || {};
  if (! (options.library instanceof library.Library))
    throw new Error("unipackage.load requires a library");

  // Check the cache first
  if (cacheLibrary !== options.library ||
      cacheRelease !== options.release) {
    cacheLibrary = options.library;
    cacheRelease = options.release;
    cache = {};
  }
  var cacheKey = (options.packages || []).join(',');
  if (_.has(cache, cacheKey)) {
    return cache[cacheKey];
  }

  // Set up a minimal server-like environment (omitting the parts that
  // are specific to the HTTP server). Kind of a hack. I suspect this
  // will get refactored before too long. Note that
  // __meteor_bootstrap__.require is no longer provided.
  var env = {
    __meteor_bootstrap__: { startup_hooks: [] },
    __meteor_runtime_config__: { meteorRelease: options.release }
  };

  var ret;
  var messages = buildmessage.capture({
    title: "loading unipackage"
  }, function () {
    // Load the code
    var image = bundler.buildJsImage({
      name: "load",
      library: options.library,
      use: options.packages || []
    }).image;
    ret = image.load(env);

    // Run any user startup hooks.
    _.each(env.__meteor_bootstrap__.startup_hooks, function (x) { x(); });
  });

  if (messages.hasMessages()) {
    // XXX This error handling is not the best, but this should never
    // happen in a built release. In the future, the command line
    // tool will be a normal Meteor app and will be built ahead of
    // time like any other app and this case will disappear.
    process.stdout.write("Errors prevented unipackage load:\n");
    process.stdout.write(messages.formatMessages());
    throw new Error("unipackage load failed?");
  }

  // Save to cache
  cache[cacheKey] = ret;

  return ret;
};

var unipackage = exports;
_.extend(exports, {
  load: load
});
