var _ = require('underscore');
var path = require('path');

var buildmessage = require('./buildmessage.js');
var catalog = require('./catalog.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var isopackCompiler = require('./isopack-compiler.js');
var isopackModule = require('./isopack.js');

exports.IsopackCache = function (options) {
  var self = this;
  self.cacheDir = options.cacheDir;
  self.tropohouse = options.tropohouse;
  self.isopacks = {};

  files.mkdir_p(self.cacheDir);
};

_.extend(exports.IsopackCache.prototype, {
  buildLocalPackages: function (packageMap) {
    var self = this;
    buildmessage.assertInCapture();

    packageMap.eachPackage(function (name, packageInfo) {
      self._ensurePackageBuilt(name, packageMap);
    });
    console.log(self.isopacks)
  },

  // Returns the isopack (already loaded in memory) for a given name. It is an
  // error to call this if it's not already loaded! So it should only be called
  // after buildLocalPackages has returned, or in the process of building a
  // package whose dependencies have all already been built.
  getIsopack: function (name) {
    var self = this;
    if (! _.has(self.isopacks, name))
      throw Error("isopack " + name + " not yet built?");
    return self.isopacks[name];
  },

  // XXX #3006 Don't infinite recurse on circular deps
  _ensurePackageBuilt: function (name, packageMap) {
    var self = this;
    buildmessage.assertInCapture();
    if (_.has(self.isopacks, name))
      return;

    var packageInfo = packageMap.getInfo(name);
    if (! packageInfo)
      throw Error("Depend on unknown package " + name + "?");

    if (packageInfo.kind === 'local') {
      var packageNames =
            packageInfo.packageSource.getPackagesToBuildFirst(packageMap);
      _.each(packageNames, function (depName) {
        self._ensurePackageBuilt(depName, packageMap);
      });

      self._buildOnePackage(name, packageInfo, packageMap);
    } else if (packageInfo.kind === 'versioned') {
      // We need to ensure the dependencies of versioned packages are built
      // too. Because otherwise imagine a local package A with a plugin which
      // uses versioned package B which uses local package C. We do need to
      // build C before A since it will be statically linked into the plugin.
      //
      // On the other hand, we don't have to ensure that the packages that our
      // plugins depend on are built, because the plugin is precompiled. (In
      // fact, our plugin may be precompiled with a version of a package that
      // doesn't match packageMap, which can lead to lots of confusion, but
      // that's a problem for another day.)
      var versionRecord = packageMap.catalog.getVersion(
        name, packageInfo.version);
      if (! versionRecord)
        throw Error("unknown mapped " + name + "@" + packageInfo.version + "!");

      _.each(versionRecord.dependencies, function (info, depName) {
        var hasRelevantDep = _.find(info.references, function (ref) {
          return ! ref.weak && ! ref.unordered;
        });
        if (hasRelevantDep) {
          self._ensurePackageBuilt(depName, packageMap);
        }
      });

      // Load the isopack from disk.
      buildmessage.enterJob(
        "loading package " + name + "@" + packageInfo.version,
        function () {
          var isopackPath = self.tropohouse.packagePath(
            name, packageInfo.version);
          var isopack = new isopackModule.Isopack();
          isopack.initFromPath(name, isopackPath);
          self.isopacks[name] = isopack;
        });
    } else {
      throw Error("unknown packageInfo kind?");
    }
  },

  _buildOnePackage: function (name, packageInfo, packageMap) {
    var self = this;
    buildmessage.assertInCapture();
    buildmessage.enterJob("building package " + name, function () {
      var compilerResult = isopackCompiler.compile(packageInfo.packageSource, {
        packageMap: packageMap,
        isopackCache: self
      });
      if (buildmessage.jobHasMessages())
        return;

      // Save to disk, for next time!
      compilerResult.isopack.saveToPath(self._isopackDir(name), {
        buildOfPath: packageInfo.packageSource.sourceRoot,
        // XXX #3006 replace with better build info
        elideBuildInfo: true
      });

      self.isopacks[name] = compilerResult.isopack;
    });
  },

  _isopackDir: function (packageName) {
    var self = this;
    return path.join(self.cacheDir, packageName);
  }
});
