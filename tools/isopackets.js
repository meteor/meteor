var _ = require('underscore');
var path = require('path');
var bundler = require('./bundler.js');
var Builder = require('./builder.js');
var buildmessage = require('./buildmessage.js');
var files = require('./files.js');
var compiler = require('./compiler.js');
var config = require('./config.js');
var watch = require('./watch.js');
var Console = require('./console.js').Console;
var isopackCacheModule = require('./isopack-cache.js');
var packageMapModule = require('./package-map.js');

// An isopacket is a predefined set of isopackages which the meteor command-line
// tool can load into its process. This is how we use the DDP client and many
// other packages inside the tool. The isopackets are listed below in the
// ISOPACKETS constant.
//
// All packages that are in isopackets and all of their transitive dependencies
// must be part of the core Meteor git checkout (not loaded from troposphere).
//
// The requested packages will be loaded together will all of their
// dependencies. If you request to load the same isopacket more than once, you
// will efficiently get the same pre-loaded isopacket. On the other hand, two
// different loaded isopackets contain distinct copies of all of their packages
// copy of all of the packages. The return value is an object that maps package
// name to package exports (that is, it is the Package object from inside the
// sandbox created for the newly loaded packages).
//
// For built releases, all of the isopackets are pre-compiled (as JsImages,
// similar to a plugin or a server program) into the tool.
//
// When run from a checkout, all isopackets are re-compiled early in the startup
// process if any of their sources have changed.
//
// Example usage:
//   var DDP = require('./isopackets.js').load('ddp').ddp.DDP;
//   var reverse = DDP.connect('reverse.meteor.com');
//   Console.info(reverse.call('reverse', 'hello world'));


// All of the defined isopackets. Whenever they are being built, they will be
// built in the order listed here (which is mostly relevant for js-analyze).
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

// The main entry point: loads and returns an isopacket from cache or from
// disk. Does not do a build step: ensureIsopacketsLoadable must be called
// first!
var load = function (isopacketName) {
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

// ensureIsopacketsLoadable is called at startup and ensures that all isopackets
// exist on disk as up-to-date loadable programs.
var calledEnsure = false;
var ensureIsopacketsLoadable = function () {
  if (calledEnsure) {
    throw Error("can't ensureIsopacketsLoadable twice!");
  }
  calledEnsure = true;

  // If we're not running from checkout, then there's nothing to build and we
  // can declare that all isopackets are loadable.
  if (! files.inCheckout()) {
    _.each(ISOPACKETS, function (packages, name) {
      loadedIsopackets[name] = null;
    });
    return;
  }

  // We make these objects lazily later.
  var isopacketCatalog = null;
  var isopackCache = null;
  var packageMap = null;

  var failedPackageBuild = false;
  // Look at each isopacket. Check to see if it's on disk and up to date. If
  // not, build it. We rebuild them in the order listed in ISOPACKETS, which
  // ensures that we deal with js-analyze first.
  var messages = buildmessage.capture(function () {
    _.each(ISOPACKETS, function (packages, isopacketName) {
      if (failedPackageBuild)
        return;

      var isopacketRoot = isopacketPath(isopacketName);
      var existingBuildinfo = files.readJSONOrNull(
        path.join(isopacketRoot, 'isopacket-buildinfo.json'));
      var needRebuild = ! existingBuildinfo;
      if (! needRebuild && existingBuildinfo.builtBy !== compiler.BUILT_BY) {
        needRebuild = true;
      }
      if (! needRebuild) {
        var watchSet = watch.WatchSet.fromJSON(existingBuildinfo.watchSet);
        if (! watch.isUpToDate(watchSet)) {
          needRebuild = true;
        }
      }
      if (! needRebuild) {
        // Great, it's loadable without a rebuild.
        loadedIsopackets[isopacketName] = null;
        return;
      }

      // We're going to need to build! Make a catalog and loader if we haven't
      // yet.
      if (! isopacketCatalog) {
        isopacketCatalog = newIsopacketBuildingCatalog();
        // Make an isopack cache that doesn't save isopacks to disk and has no
        // access to versioned packages.
        isopackCache = new isopackCacheModule.IsopackCache;
        var versions = {};
        _.each(isopacketCatalog.getAllPackageNames(), function (packageName) {
          versions[packageName] =
            isopacketCatalog.getLatestVersion(packageName).version;
        });
        packageMap = new packageMapModule.PackageMap(
          versions, isopacketCatalog);
      }

      buildmessage.enterJob({
        title: "Bundling " + isopacketName + " packages for the tool"
      }, function () {
        // Build the packages into the in-memory IsopackCache.
        isopackCache.buildLocalPackages(packageMap, packages);
        if (buildmessage.jobHasMessages())
          return;

        // Now bundle them into a program.
        var built = bundler.buildJsImage({
          name: "isopacket-" + isopacketName,
          packageMap: packageMap,
          isopackCache: isopackCache,
          use: packages,
          catalog: isopacketCatalog
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
    Console.error("Errors prevented isopacket build:");
    Console.printMessages(messages);
    throw new Error("isopacket build failed?");
  }
};

// Returns a new all-local-packages catalog to be used for building isopackets.
var newIsopacketBuildingCatalog = function () {
  if (! files.inCheckout())
    throw Error("No need to build isopackets unless in checkout!");

  // XXX #3006 once a lot more refactors are done, this should be able to just
  // be a LocalCatalog. There's no reason that resolveConstraints should be
  // called here!
  var catalogBootstrapCheckout = require('./catalog-bootstrap-checkout.js');
  var isopacketCatalog = new catalogBootstrapCheckout.BootstrapCatalogCheckout;
  var messages = buildmessage.capture(
    { title: "Scanning local core packages" },
    function () {
      // When running from a checkout, isopacket building does use local
      // packages, but *ONLY THOSE FROM THE CHECKOUT*: not app packages or
      // $PACKAGE_DIRS packages.  One side effect of this: we really really
      // expect them to all build, and we're fine with dying if they don't
      // (there's no worries about needing to springboard).
      isopacketCatalog.initialize({
        localPackageSearchDirs: [path.join(
          files.getCurrentToolsDir(), 'packages')]
      });
    });
  if (messages.hasMessages()) {
    Console.error("=> Errors while scanning core packages:");
    Console.printMessages(messages);
    throw new Error("isopacket scan failed?");
  }
  return isopacketCatalog;
};

// Loads a built isopacket from disk. Always loads (the cache is in 'load', not
// this function). Does not run a build process; it must already be built.
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
    Console.error("Errors prevented isopacket load:");
    Console.printMessages(messages);
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

var isopackets = exports;
_.extend(exports, {
  load: load,
  ensureIsopacketsLoadable: ensureIsopacketsLoadable,
  ISOPACKETS: ISOPACKETS,
  newIsopacketBuildingCatalog: newIsopacketBuildingCatalog
});
