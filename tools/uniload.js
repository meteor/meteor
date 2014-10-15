var _ = require('underscore');
var bundler = require('./bundler.js');
var buildmessage = require('./buildmessage.js');
var release = require('./release.js');
var packageLoader = require("./package-loader.js");
var files = require('./files.js');
var catalog = require('./catalog.js');

// These are the only packages that may be directly loaded via this package. Add
// more to the list if you need to uniload more things! (You don't have to
// include the dependencies of the packages you directly load in this list.)
var ROOT_PACKAGES = [
  'constraint-solver',
  'dev-bundle-fetcher',
  'ejson',
  'js-analyze',
  'ddp',
  'logging',
  'meteor',
  'minifiers',
  'minimongo',
  'mongo',
  'package-version-parser',
  'boilerplate-generator',
  'webapp-hashing',
  'xmlbuilder'
];

// Load isopacks into the currently running node.js process. Use
// this to use isopacks (such as the DDP client) from command-line
// tools (such as 'meteor'). The requested packages will be loaded
// together will all of their dependencies, and each time you call
// this function you load another, distinct copy of all of the
// packages (except see note about caching below). The return value is
// an object that maps package name to package exports (that is, it is
// the Isopack object from inside the sandbox created for the newly
// loaded packages).
//
// Caching: There is a simple cache. If you call this function with
// exactly the same release and packages, we will attempt to return
// the memoized return value from the previous load (rather than
// creating a whole new copy of the packages in memory). The caching
// logic is not particularly sophisticated. For example, the cache
// will not be flushed if packages change on disk, even if it should
// be, but using a different release name will flush the cache
// completely.
//
// When run from a checkout, uniload only loads local (from the checkout)
// packages: never packages from troposphere. When run from a release build,
// uniload only loads pre-built isopacks that are distributed alongside the
// tool: never local packages or packages from troposphere (so in this mode, it
// never compiles the source of a real package).
//
// Options:
// - packages: The packages to load, as an array of strings. Each
//   string may be either "packagename" or "packagename.slice".
//
// Example usage:
//   var DDP = require('./uniload.js').load({
//     packages: ['ddp'],
//     release: release.current.name
//   }).ddp.DDP;
//   var reverse = DDP.connect('reverse.meteor.com');
//   console.log(reverse.call('reverse', 'hello world'));

var cacheRelease = undefined;
var cache = {}; // map from package names (joined with ',') to return value

var load = function (options) {
  options = options || {};

  // Check the cache first
  var cacheKey = (options.packages || []).join(',');

  if (_.has(cache, cacheKey)) {
    return cache[cacheKey];
  }

  var undeclaredPackages = _.difference(options.packages, ROOT_PACKAGES);
  if (undeclaredPackages.length) {
    throw new Error("attempt to uniload undeclared packages: " +
                    JSON.stringify(undeclaredPackages));
  }

  // Set up a minimal server-like environment (omitting the parts that
  // are specific to the HTTP server). Kind of a hack. I suspect this
  // will get refactored before too long. Note that
  // __meteor_bootstrap__.require is no longer provided.
  var env = {
    __meteor_bootstrap__: { startupHooks: [] },
    __meteor_runtime_config__: { meteorRelease: "UNILOAD" }
  };

  var ret;
  var messages = buildmessage.capture({
    title: "Loading isopack"
  }, function () {
    // Load the code. The uniloader does not call the constraint solver, unless
    // it is running from checkout, in which case it will use the constraint
    // solver to build its packages in the catalog.
    var loader = new packageLoader.PackageLoader({
      versions: null,
      catalog: catalog.uniload,
      constraintSolverOpts: { ignoreProjectDeps: true }
    });

    // Build the bundler image.
    //
    // Passing in dependency versions doesn't really make any sense here. We
    // don't know the previous dependencies of this package, and, anyway, if we
    // are running from checkout, they are all +local, and if we are running
    // from release it is a bunch of isopacks. So, we don't pass in
    // dependency versions.
    var image = bundler.buildJsImage({
      name: "load",
      packageLoader: loader,
      use: options.packages || [],
      catalog: catalog.uniload,
      ignoreProjectDeps: true
    }).image;
    ret = image.load(env);

    // Run any user startup hooks.
    while (env.__meteor_bootstrap__.startupHooks.length) {
      var hook = env.__meteor_bootstrap__.startupHooks.shift();
      hook();
    }
    // Setting this to null tells Meteor.startup to call hooks immediately.
    env.__meteor_bootstrap__.startupHooks = null;
  });

  if (messages.hasMessages()) {
    // XXX This error handling is not the best, but this should never
    // happen in a built release. In the future, the command line
    // tool will be a normal Meteor app and will be built ahead of
    // time like any other app and this case will disappear.
    process.stderr.write("Errors prevented isopack load:\n");
    process.stderr.write(messages.formatMessages());
    throw new Error("isopack load failed?");
  }

  // Save to cache
  cache[cacheKey] = ret;

  return ret;
};

var uniload = exports;
_.extend(exports, {
  load: load,
  ROOT_PACKAGES: ROOT_PACKAGES
});
