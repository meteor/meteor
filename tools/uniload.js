var _ = require('underscore');
var path = require('path');
var bundler = require('./bundler.js');
var Builder = require('./builder.js');
var buildmessage = require('./buildmessage.js');
var release = require('./release.js');
var packageLoader = require("./package-loader.js");
var files = require('./files.js');
var catalog = require('./catalog.js');
var compiler = require('./compiler.js');
var config = require('./config.js');
var watch = require('./watch.js');

// XXX document ISOPACKETS

var ISOPACKETS = {
  // Note: when running from a checkout, js-analyze must always be the
  // the first to be rebuilt, because it might need to be loaded as part
  // of building other isopackets.
  'js-analyze': ['js-analyze'],
  'ddp': ['ddp'],
  'mongo': ['mongo'],
  'ejson': ['ejson'],
  'minifiers': ['minifiers'],
  'dev-bundle-fetcher': ['dev-bundle-fetcher'],
  'constraint-solver': ['constraint-solver'],
  'cordova-support': ['boilerplate-generator', 'logging', 'webapp-hashing',
                      'xmlbuilder'],
  'logging': ['logging']
};

// Caches isopackets in memory (each isopacket only needs to be loaded
// once).  This is a map from isopacket name to either:
//
//  - The 'Package' dictionary, if the isopacket has already been loaded
//    into memory
//  - null, if the isopacket hasn't been loaded into memory but its on-disk
//    instance is known to be ready
//
// The subtlety here is that when running from a checkout, we don't want to
// accidentally load an isopacket before ensuring that it doesn't need to be
// rebuilt. But we do want to be able to load the js-analyze isopacket as part
// of building other isopackets in ensureIsopacketsLoadable.
var loadedIsopackets = {};

var loadIsopacket = function (isopacketName) {
  if (_.has(loadedIsopackets, isopacketName)) {
    if (loadedIsopackets[isopacketName]) {
      return loadedIsopackets[isopacketName];
    }

    // This is the case where the isopacket is up to date on disk but not
    // loaded.
    var isopacket = loadIsopacketFromDisk(isopacketName);
    loadedIsopackets[isopacketName] = isopacket;
    return isopacket;
  }

  if (_.has(ISOPACKETS, isopacketName)) {
    throw Error("Can't load isopacket before it has been verified: "
                + isopacketName);
  }

  throw Error("Unknown isopacket: " + isopacketName);
};

var isopacketPath = function (isopacketName) {
  return path.join(config.getIsopacketRoot(), isopacketName);
};

var calledEnsure = false;
var ensureIsopacketsLoadable = function () {
  if (calledEnsure) {
    throw Error("can't ensureIsopacketsLoadable twice!");
  }
  calledEnsure = true;

  // If we're not running from checkout, then there's nothing to build and we
  // can declare that all isopackets are loadable.
  if (!files.inCheckout()) {
    _.each(ISOPACKETS, function (packages, name) {
      loadedIsopackets[name] = null;
    });
    return;
  }

  // Build all the packages that we can load with uniload.  We only want to
  // load local packages.
  var localPackageLoader = new packageLoader.PackageLoader({
    versions: null,
    // XXX get rid of catalog.uniload
    catalog: catalog.uniload,
    constraintSolverOpts: { ignoreProjectDeps: true }
  });

  var messages = buildmessage.capture(function () {
    _.each(ISOPACKETS, function (packages, isopacketName) {
      var isopacketRoot = isopacketPath(isopacketName);
      var existingBuildinfo = files.readJSONOrNull(
        path.join(isopacketRoot, 'isopacket-buildinfo.json'));
      var needRebuild = !existingBuildinfo;
      if (!needRebuild && existingBuildinfo.builtBy !== compiler.BUILT_BY) {
        needRebuild = true;
      }
      if (!needRebuild) {
        var watchSet = watch.WatchSet.fromJSON(existingBuildinfo.watchSet);
        if (!watch.isUpToDate(watchSet)) {
          needRebuild = true;
        }
      }
      if (!needRebuild) {
        // Great, it's loadable without a rebuild.
        loadedIsopackets[isopacketName] = null;
        return;
      }

      buildmessage.enterJob({
        title: "Compiling " + isopacketName + " packages for the tool"
      }, function () {
        var built = bundler.buildJsImage({
          name: "isopacket-" + isopacketName,
          packageLoader: localPackageLoader,
          use: packages,
          catalog: catalog.uniload,
          ignoreProjectDeps: true
        });

        if (buildmessage.jobHasMessages())
          return;
        var builder = new Builder({outputPath: isopacketRoot});
        builder.writeJson('isopacket-buildinfo.json', {
          builtBy: compiler.BUILT_BY,
          watchSet: built.watchSet.toJSON()
        });
        built.image.write(builder);
        builder.complete();
        // It's loadable now.
        loadedIsopackets[isopacketName] = null;
      });
    });
  });

  // This is a build step ... but it's one that only happens in development, so
  // it can just crash the app instead of being handled nicely.
  if (messages.hasMessages()) {
    process.stderr.write("Errors prevented tool build:\n");
    process.stderr.write(messages.formatMessages());
    throw new Error("isopacket build failed?");
  }
};

// XXX DEAL WITH COMMENT
//
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

var loadIsopacketFromDisk = function (isopacketName) {
  var image = bundler.readJsImage(
    path.join(isopacketPath(isopacketName), 'program.json'));

  // An incredibly minimalist version of the environment from
  // tools/server/boot.js.  Kind of a hack.
  var env = {
    __meteor_bootstrap__: { startupHooks: [] },
    __meteor_runtime_config__: { meteorRelease: "ISOPACKET" }
  };

  var ret;
  var messages = buildmessage.capture({
    title: "Loading isopacket `" + isopacketName + "`"
  }, function () {
    ret = image.load(env);
  });

  // This is a build step ... but it's one that only happens in development, so
  // it can just crash the app instead of being handled nicely.
  if (messages.hasMessages()) {
    process.stderr.write("Errors prevented isopacket load:\n");
    process.stderr.write(messages.formatMessages());
    throw new Error("isopacket load failed?");
  }

  // Run any user startup hooks.
  while (env.__meteor_bootstrap__.startupHooks.length) {
    var hook = env.__meteor_bootstrap__.startupHooks.shift();
    hook();
  }
  // Setting this to null tells Meteor.startup to call hooks immediately.
  env.__meteor_bootstrap__.startupHooks = null;

  return ret;
};

var uniload = exports;
_.extend(exports, {
  loadIsopacket: loadIsopacket,
  ensureIsopacketsLoadable: ensureIsopacketsLoadable,
  ISOPACKETS: ISOPACKETS
});
