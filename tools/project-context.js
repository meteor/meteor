var _ = require('underscore');
var path = require('path');

var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var catalog = require('./catalog.js');
var catalogLocal = require('./catalog-local.js');
var catalogRemote = require('./catalog-remote.js');
var Console = require('./console.js').Console;
var files = require('./files.js');
var isopackCacheModule = require('./isopack-cache.js');
var isopackets = require('./isopackets.js');
var packageMapModule = require('./package-map.js');
var release = require('./release.js');
var utils = require('./utils.js');
var watch = require('./watch.js');

// This class follows the standard protocol where names beginning with _ should
// not be externally accessed.
exports.ProjectContext = function (options) {
  var self = this;
  if (!options.projectDir)
    throw Error("missing projectDir!");
  if (!options.tropohouse)
    throw Error("missing tropohouse!");

  self.projectDir = options.projectDir;
  self.tropohouse = options.tropohouse;

  self._serverArchitectures = options.serverArchitectures || [];
  // We always need to download host versions of packages, at least for plugins.
  self._serverArchitectures.push(archinfo.host());
  self._serverArchitectures = _.uniq(self._serverArchitectures);

  // A WatchSet for all the files read by this class (eg .meteor/packages, etc).
  self.projectWatchSet = new watch.WatchSet;

  self.projectConstraintsFile = null;
  self.packageMapFile = null;
  self.platformList = null;
  self.appIdentifier = null;
  self.packageMap = null;
  self.isopackCache = null;

  // XXX #3006: Things we're leaving off for now:
  //  - combinedConstraints
  //  - cordovaPlugins
  //  - muted (???)
};

_.extend(exports.ProjectContext.prototype, {
  prepareProjectForBuild: function () {
    var self = this;
    buildmessage.assertInCapture();

    buildmessage.enterJob('preparing project', function () {
      self._readProjectMetadata();
      if (buildmessage.jobHasMessages())
        return;

      self._resolveConstraints();
      if (buildmessage.jobHasMessages())
        return;

      self._downloadMissingPackages();
      if (buildmessage.jobHasMessages())
        return;

      self._buildLocalPackages();
      if (buildmessage.jobHasMessages())
        return;

      self._savePackageMap();
      if (buildmessage.jobHasMessages())
        return;
    });
  },

  getProjectLocalDirectory: function (subdirectory) {
    var self = this;
    return path.join(self.projectDir, '.meteor', 'local', subdirectory);
  },

  _readProjectMetadata: function () {
    var self = this;
    buildmessage.assertInCapture();

    buildmessage.enterJob('reading project metadata', function () {
      // Read .meteor/release.
      self.releaseFile = new exports.ReleaseFile({
        projectDir: self.projectDir,
        watchSet: self.projectWatchSet
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/packages.
      self.projectConstraintsFile = new exports.ProjectConstraintsFile({
        projectDir: self.projectDir,
        watchSet: self.projectWatchSet
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/versions. We don't load it into self.projectWatchSet until
      // we get to the _savePackageMap stage, since we may modify it.
      self.packageMapFile = new exports.PackageMapFile({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/platforms, creating it if necessary.
      self.platformList = new exports.PlatformList({
        projectDir: self.projectDir,
        watchSet: self.projectWatchSet
      });
      if (buildmessage.jobHasMessages())
        return;

      self._ensureAppIdentifier();
      if (buildmessage.jobHasMessages())
        return;
    });
  },

  _ensureAppIdentifier: function () {
    var self = this;
    var identifierFile = path.join(self.projectDir, '.meteor', '.id');

    // Find the first non-empty line, ignoring comments. We intentionally don't
    // put this in projectWatchSet, since changing this doesn't affect the built
    // app much (and there's no real reason to update it anyway).
    var lines = files.getLinesOrEmpty(identifierFile);
    var appId = _.find(_.map(lines, files.trimLine), _.identity);

    // If the file doesn't exist or has no non-empty lines, regenerate the
    // token.
    if (!appId) {
      appId = utils.randomToken() + utils.randomToken() + utils.randomToken();

      var comment = (
"# This file contains a token that is unique to your project.\n" +
"# Check it into your repository along with the rest of this directory.\n" +
"# It can be used for purposes such as:\n" +
"#   - ensuring you don't accidentally deploy one app on top of another\n" +
"#   - providing package authors with aggregated statistics\n" +
"\n");
      files.writeFileAtomically(identifierFile, comment + appId + '\n');
    }

    self.appIdentifier = appId;
  },

  _resolveConstraints: function () {
    var self = this;
    buildmessage.assertInCapture();
    var cat = self._makeProjectCatalog();
    // Did we already report an error via buildmessage?
    if (! cat)
      return;

    var depsAndConstraints = self._getRootDepsAndConstraints(cat);
    var resolver = self._buildResolver(cat);

    var solution;
    buildmessage.enterJob("selecting package versions", function () {
      try {
        solution = resolver.resolve(
          depsAndConstraints.deps, depsAndConstraints.constraints, {
            previousSolution: self.packageMapFile.getCachedVersions()
          });
      } catch (e) {
        if (!e.constraintSolverError)
          throw e;
        buildmessage.error(e.message);
      }
    });

    if (!solution)
      return;  // error is already in buildmessage

    // XXX #3006 Check solution.usedRCs and maybe print something about it. This
    // code used to exist in catalog.js.

    self.packageMap = new packageMapModule.PackageMap(solution.answer, cat);
  },

  _localPackageSearchDirs: function () {
    var self = this;
    var searchDirs = [path.join(self.projectDir, 'packages')];

    if (process.env.PACKAGE_DIRS) {
      // User can provide additional package directories to search in
      // PACKAGE_DIRS (colon-separated).
      _.each(process.env.PACKAGE_DIRS.split(':'), function (p) {
        searchDirs.push(path.resolve(p));
      });
    }

    if (files.inCheckout()) {
      // Running from a checkout, so use the Meteor core packages from the
      // checkout.
      searchDirs.push(path.join(files.getCurrentToolsDir(), 'packages'));
    }
    return searchDirs;
  },

  // Returns a layered catalog with information about the packages that can be
  // used in this project. Processes the package.js file from all local packages
  // but does not compile the packages.
  //
  // Must be run in a buildmessage context. On build error, returns null.
  _makeProjectCatalog: function () {
    var self = this;
    buildmessage.assertInCapture();

    var cat = new catalog.LayeredCatalog;
    cat.setCatalogs(new catalogLocal.LocalCatalog({ containingCatalog: cat }),
                    catalog.official);

    var searchDirs = self._localPackageSearchDirs();
    buildmessage.enterJob({ title: "scanning local packages" }, function () {
      cat.initialize({ localPackageSearchDirs: searchDirs });
      if (buildmessage.jobHasMessages())
        cat = null;
    });
    return cat;
  },

  _getRootDepsAndConstraints: function (cat) {
    var self = this;

    var depsAndConstraints = {deps: [], constraints: []};

    self._addAppConstraints(depsAndConstraints);
    self._addLocalPackageConstraints(depsAndConstraints, cat.localCatalog);
    // XXX #3006 Add constraints from the release
    // XXX #3006 Add constraints from other programs, if we reimplement that.
    // XXX #3006 Add a dependency on ctl
    return depsAndConstraints;
  },

  _addAppConstraints: function (depsAndConstraints) {
    var self = this;

    self.projectConstraintsFile.eachConstraint(function (constraint) {
      // Add a dependency ("this package must be used") and a constraint
      // ("... at this version (maybe 'any reasonable')").
      depsAndConstraints.deps.push(constraint.name);
      depsAndConstraints.constraints.push(constraint);
    });
  },

  _addLocalPackageConstraints: function (depsAndConstraints, localCat) {
    var self = this;
    _.each(localCat.getAllPackageNames(), function (packageName) {
      var versionRecord = localCat.getLatestVersion(packageName);
      var constraint =
            utils.parseConstraint(packageName + "@=" + versionRecord.version);
      // Add a constraint ("this is the only version available") but no
      // dependency (we don't automatically use all local packages!)
      depsAndConstraints.constraints.push(constraint);
    });
  },

  _buildResolver: function (cat) {
    var self = this;

    var constraintSolverPackage =
          isopackets.load('constraint-solver')['constraint-solver'];
    var resolver =
      new constraintSolverPackage.ConstraintSolver.PackagesResolver(cat, {
        nudge: function () {
          Console.nudge(true);
        }
      });
    return resolver;
  },

  _downloadMissingPackages: function () {
    var self = this;
    buildmessage.assertInCapture();
    if (!self.packageMap)
      throw Error("which packages to download?");
    // XXX #3006 This downloads archinfo.host packages. How about
    //     for deploy?
    self.tropohouse.downloadPackagesMissingFromMap(self.packageMap, {
      serverArchitectures: self._serverArchitectures
    });
  },

  _buildLocalPackages: function () {
    var self = this;
    buildmessage.assertInCapture();

    self.isopackCache = new isopackCacheModule.IsopackCache({
      cacheDir: self.getProjectLocalDirectory('isopacks'),
      tropohouse: self.tropohouse
    });

    buildmessage.enterJob('building local packages', function () {
      self.isopackCache.buildLocalPackages(self.packageMap);
    });
  },

  _savePackageMap: function () {
    var self = this;

    // XXX #3006 support the alwaysRecord case (used for create and update with
    // --release)

    // If the user forced us to an explicit release, then maybe we shouldn't
    // record versions (because they are based on a different release than the
    // recorded .meteor/release), unless we are updating or creating, in which
    // case, we should.
    if (!release.explicit) {
      self.packageMapFile.write(self.packageMap);
    }

    // Either way, we should remember the hash of the versions file we read or
    // wrote.
    self.projectWatchSet.merge(self.packageMapFile.watchSet);
  }
});


// Represents .meteor/packages.
exports.ProjectConstraintsFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'packages');
  // XXX #3006 Use a better data structure so that we can rewrite the file
  // later. But for now this maps from package name to parsed constraint.
  self._constraints = {};

  self._readFile(options.watchSet);
};

_.extend(exports.ProjectConstraintsFile.prototype, {
  _readFile: function (watchSet) {
    var self = this;
    buildmessage.assertInCapture();

    var contents = watch.readAndWatchFile(watchSet, self.filename);
    // No .meteor/packages? That's OK, you just get no packages.
    if (contents === null)
      return;
    var lines = files.splitBufferToLines(contents);
    _.each(lines, function (line) {
      line = files.trimLine(line);
      if (line === '')
        return;
      try {
        var constraint = utils.parseConstraint(line);
      } catch (e) {
        if (!e.versionParserError)
          throw e;
        buildmessage.exception(e);
      }
      if (!constraint)
        return;  // recover by ignoring
      if (_.has(self._constraints, constraint.name)) {
        buildmessage.error("Package name appears twice: " + constraint.name, {
          // XXX should this be relative?
          file: self.filename
        });
        return;  // recover by ignoring
      }
      self._constraints[constraint.name] = constraint;
    });
  },

  // Iterates over all constraints, in the format returned by
  // utils.parseConstraint.
  eachConstraint: function (iterator) {
    var self = this;
    _.each(self._constraints, function (constraint) {
      iterator(constraint);
    });
  }
});



// Represents .meteor/versions.
exports.PackageMapFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'versions');
  self.watchSet = new watch.WatchSet;
  self._versions = {};

  self._readFile();
};

_.extend(exports.PackageMapFile.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    var contents = watch.readAndWatchFile(self.watchSet, self.filename);
    // No .meteor/versions? That's OK, you just get to start your calculation
    // from scratch.
    if (contents === null)
      return;
    var lines = files.splitBufferToLines(contents);
    _.each(lines, function (line) {
      line = files.trimLine(line);
      if (line === '')
        return;
      try {
        var constraint = utils.parseConstraint(line);
      } catch (e) {
        if (!e.versionParserError)
          throw e;
        buildmessage.exception(e);
      }
      if (!constraint)
        return;  // recover by ignoring

      // If a package appears multiple times in .meteor/versions, we just ignore
      // the second one. This file is more meteor-controlled than
      // .meteor/packages and people shouldn't be surprised to see it
      // automatically fixed.
      if (_.has(self._versions, constraint.name))
        return;

      // We expect this constraint to be "foo@1.2.3", not a lack of a constraint
      // or something with "||" or "@=".
      if (constraint.constraints.length !== 1 ||
          constraint.constraints[0].type !== "compatible-with") {
        buildmessage.error("Bad version: " + line, {
          // XXX should this be relative?
          file: self.filename
        });
        return;  // recover by ignoring
      }

      self._versions[constraint.name] = constraint.constraints[0].version;
    });
  },

  // Note that this is really specific to wanting to know what versions are in
  // the .meteor/versions file on disk, which is a slightly different question
  // from "so, what versions should I be building with?"  Usually you want a
  // PackageMap instead!
  getCachedVersions: function () {
    var self = this;
    return _.clone(self._versions);
  },

  write: function (packageMap) {
    var self = this;
    var newVersions = packageMap.toVersionMap();

    // Only write the file if some version changed. (We don't need to do no-op
    // writes, even if they fix sorting in the file.)
    if (_.isEqual(self._versions, newVersions))
      return;

    self._versions = newVersions;
    var packageNames = _.keys(self._versions);
    packageNames.sort();
    var lines = [];
    _.each(packageNames, function (packageName) {
      lines.push(packageName + "@" + self._versions[packageName] + "\n");
    });
    var fileContents = new Buffer(lines.join(''));
    files.writeFileAtomically(self.filename, fileContents);

    // Replace our watchSet with one for the new contents of the file.
    var hash = watch.sha1(fileContents);
    self.watchSet = new watch.WatchSet;
    self.watchSet.addFile(self.filename, hash);
  }
});



// Represents .meteor/platforms. We take no effort to maintain comments or
// spacing here.
exports.PlatformList = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'platforms');
  self._platforms = null;

  self._readFile(options.watchSet);
};

// These platforms are always present and can be neither added or removed
exports.PlatformList.DEFAULT_PLATFORMS = ['browser', 'server'];

_.extend(exports.PlatformList.prototype, {
  _readFile: function (watchSet) {
    var self = this;
    buildmessage.assertInCapture();

    var tempWatchSet = new watch.WatchSet;

    var contents = watch.readAndWatchFile(tempWatchSet, self.filename);

    var platforms = contents ? files.splitBufferToLines(contents) : [];
    platforms = _.uniq(_.compact(_.map(platforms, files.trimLine)));
    platforms.sort();

    // Missing some of the default platforms (or the whole file)? Add them and
    // try again.
    if (_.difference(exports.PlatformList.DEFAULT_PLATFORMS,
                     platforms).length) {
      platforms = _.uniq(platforms.concat(
        exports.PlatformList.DEFAULT_PLATFORMS));
      platforms.sort();
      self._platforms = platforms;
      self.write();
      self._platforms = null;
      self._readFile(watchSet);
      return;
    }

    self._platforms = platforms;
    watchSet.merge(tempWatchSet);
  },

  write: function () {
    var self = this;
    files.writeFileAtomically(self.filename, self._platforms.join('\n') + '\n');
  },

  getPlatforms: function () {
    var self = this;
    return _.clone(self._platforms);
  },

  getCordovaPlatforms: function () {
    var self = this;
    return _.difference(self._platforms,
                        exports.PlatformList.DEFAULT_PLATFORMS);
  },

  getWebArchs: function () {
    var self = this;
    var archs = [ "web.browser" ];
    if (! _.isEmpty(self.getCordovaPlatforms())) {
      archs.push("web.cordova");
    }
    return archs;
  }
});


// Represents .meteor/release.
exports.ReleaseFile = function (options) {
  var self = this;

  self.filename = path.join(options.projectDir, '.meteor', 'release');
  // The release name actually written in the file.  Null if no fill.  Empty if
  // the file is empty.
  self.unnormalizedReleaseName = null;
  // The full release name (with METEOR@ if it's missing in
  // unnormalizedReleaseName).
  self.fullReleaseName = null;
  // FOO@bar unless FOO === "METEOR" in which case "Meteor bar".
  self.displayReleaseName = null;
  self._readFile(options.watchSet);
};

_.extend(exports.ReleaseFile.prototype, {
  fileMissing: function () {
    var self = this;
    return self.unnormalizedReleaseName === null;
  },
  noReleaseSpecified: function () {
    var self = this;
    return self.unnormalizedReleaseName === '';
  },

  _readFile: function (watchSet) {
    var self = this;

    var contents = watch.readAndWatchFile(watchSet, self.filename);
    // If file doesn't exist, leave unnormalizedReleaseName empty; fileMissing
    // will be true.
    if (contents === null)
      return;

    var lines = _.compact(_.map(files.splitBufferToLines(contents),
                                files.trimLine));
    // noReleaseSpecified will be true.
    if (!lines.length) {
      self.unnormalizedReleaseName = '';
      return;
    }

    self.unnormalizedReleaseName = lines[0];
    var parts = utils.splitReleaseName(self.unnormalizedReleaseName);
    self.fullReleaseName = parts[0] + '@' + parts[1];
    self.displayReleaseName = utils.displayRelease(parts[0], parts[1]);
  },

  write: function () {
    var self = this;
    // XXX #3006 fill out
  }
});
