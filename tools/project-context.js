var _ = require('underscore');
var fs = require('fs');
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

  // Initialized by readProjectMetadata.
  self.releaseFile = null;
  self.projectConstraintsFile = null;
  self.packageMapFile = null;
  self.platformList = null;
  self.cordovaPluginsFile = null;
  self.appIdentifier = null;
  self.finishedUpgraders = null;

  // Initialized by _resolveConstraints.
  self.packageMap = null;
  self.isopackCache = null;
};

_.extend(exports.ProjectContext.prototype, {
  prepareProjectForBuild: function () {
    var self = this;
    buildmessage.assertInCapture();

    buildmessage.enterJob('preparing project', function () {
      self.readProjectMetadata();
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

  // You can call this manually if you want to do some work before resolving
  // constraints, or you can let prepareProjectForBuild do it for you.
  readProjectMetadata: function () {
    var self = this;
    buildmessage.assertInCapture();

    // Has this been called already?
    if (self.releaseFile)
      return;

    buildmessage.enterJob('reading project metadata', function () {
      // Read .meteor/release.
      self.releaseFile = new exports.ReleaseFile({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/packages.
      self.projectConstraintsFile = new exports.ProjectConstraintsFile({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/versions.
      self.packageMapFile = new exports.PackageMapFile({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/cordova-plugins.
      self.cordovaPluginsFile = new exports.CordovaPluginsFile({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/platforms, creating it if necessary.
      self.platformList = new exports.PlatformList({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;

      // Read .meteor/.id, creating it if necessary.
      self._ensureAppIdentifier();
      if (buildmessage.jobHasMessages())
        return;

      // Set up an object that knows how to read and write
      // .meteor/.finished-upgraders.
      self.finishedUpgraders = new exports.FinishedUpgraders({
        projectDir: self.projectDir
      });
      if (buildmessage.jobHasMessages())
        return;
    });
  },

  getProjectWatchSet: function () {
    // We don't cache a projectWatchSet on this object, since some of the
    // metadata files can be written by us (eg .meteor/versions
    // post-constraint-solve).
    var self = this;
    var watchSet = new watch.WatchSet;
    _.each(
      [self.releaseFile, self.projectConstraintsFile, self.packageMapFile,
       self.platformList, self.cordovaPluginsFile],
      function (metadataFile) {
        watchSet.merge(metadataFile.watchSet);
      });
    return watchSet;
  },

  _ensureAppIdentifier: function () {
    var self = this;
    var identifierFile = path.join(self.projectDir, '.meteor', '.id');

    // Find the first non-empty line, ignoring comments. We intentionally don't
    // put this in a WatchSet, since changing this doesn't affect the built app
    // much (and there's no real reason to update it anyway).
    var lines = files.getLinesOrEmpty(identifierFile);
    var appId = _.find(_.map(lines, files.trimSpaceAndComments), _.identity);

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

    // XXX #3006 For commands other than create and test-packages, show package
    // changes. This code used to exist in project.js.

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

    // XXX #3006 make sure that this conditional is correct for update too

    // If we're running from a release but the app is unpinned, or vice versa,
    // don't save the package map.
    if (release.current.isCheckout() !== self.releaseFile.isCheckout())
      return;

    // If we're running from a release but it's not the same release as the app,
    // don't save the package map.
    if (! release.current.isCheckout() &&
        release.current.name !== self.releaseFile.fullReleaseName) {
      return;
    }

    self.packageMapFile.write(self.packageMap);
  }
});


// Represents .meteor/packages.
exports.ProjectConstraintsFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'packages');
  self.watchSet = new watch.WatchSet;
  // XXX #3006 Use a better data structure so that we can rewrite the file
  // later. But for now this maps from package name to parsed constraint.
  self._constraints = null;
  self._readFile();
};

_.extend(exports.ProjectConstraintsFile.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    self._constraints = {};
    var contents = watch.readAndWatchFile(self.watchSet, self.filename);

    // No .meteor/packages? That's OK, you just get no packages.
    if (contents === null)
      return;
    var lines = files.splitBufferToLines(contents);
    _.each(lines, function (line) {
      line = files.trimSpaceAndComments(line);
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
      // We don't allow comments here, since it's cruel to allow comments in a
      // file when you're going to overwrite them anyway.
      line = files.trimSpace(line);
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
  self.watchSet = new watch.WatchSet;
  self._platforms = null;

  self._readFile();
};

// These platforms are always present and can be neither added or removed
exports.PlatformList.DEFAULT_PLATFORMS = ['browser', 'server'];

_.extend(exports.PlatformList.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    var contents = watch.readAndWatchFile(self.watchSet, self.filename);

    var platforms = contents ? files.splitBufferToLines(contents) : [];
    // We don't allow comments here, since it's cruel to allow comments in a
    // file when you're going to overwrite them anyway.
    platforms = _.uniq(_.compact(_.map(platforms, files.trimSpace)));
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
      // Reset and start over.
      self.watchSet = new watch.WatchSet;
      self._readFile();
      return;
    }

    self._platforms = platforms;
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


// Represents .meteor/cordova-plugins.
exports.CordovaPluginsFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'cordova-plugins');
  self.watchSet = new watch.WatchSet;
  // Map from plugin name to version.
  self._plugins = {};

  self._readFile();
};

_.extend(exports.CordovaPluginsFile.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    var contents = watch.readAndWatchFile(self.watchSet, self.filename);
    // No file?  No plugins.
    if (contents === null)
      return;

    var lines = files.splitBufferToLines(contents);
    _.each(lines, function (line) {
      line = files.trimSpaceAndComments(line);
      if (line === '')
        return;

      // We just do a standard split here, not utils.parseConstraint, since
      // cordova plugins don't necessary obey the same naming conventions as
      // Meteor packages.
      var parts = line.split('@');
      if (parts.length !== 2) {
        buildmessage.error("Cordova plugin must specify version: " + line, {
          // XXX should this be relative?
          file: self.filename
        });
        return;  // recover by ignoring
      }
      if (_.has(self._plugins, parts[0])) {
        buildmessage.error("Plugin name appears twice: " + parts[0], {
          // XXX should this be relative?
          file: self.filename
        });
        return;  // recover by ignoring
      }
      self._plugins[parts[0]] = parts[1];
    });
  },

  getPluginVersions: function () {
    var self = this;
    return _.clone(self._plugins);
  }
});



// Represents .meteor/release.
exports.ReleaseFile = function (options) {
  var self = this;

  self.filename = path.join(options.projectDir, '.meteor', 'release');
  self.watchSet = null;
  // The release name actually written in the file.  Null if no fill.  Empty if
  // the file is empty.
  self.unnormalizedReleaseName = null;
  // The full release name (with METEOR@ if it's missing in
  // unnormalizedReleaseName).
  self.fullReleaseName = null;
  // FOO@bar unless FOO === "METEOR" in which case "Meteor bar".
  self.displayReleaseName = null;
  self._readFile();
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
  isCheckout: function () {
    var self = this;
    return self.unnormalizedReleaseName === 'none';
  },

  _readFile: function () {
    var self = this;

    // Start a new watchSet, in case we just overwrote this.
    self.watchSet = new watch.WatchSet;
    var contents = watch.readAndWatchFile(self.watchSet, self.filename);
    // If file doesn't exist, leave unnormalizedReleaseName empty; fileMissing
    // will be true.
    if (contents === null)
      return;

    var lines = _.compact(_.map(files.splitBufferToLines(contents),
                                files.trimSpaceAndComments));
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

  write: function (releaseName) {
    var self = this;
    files.writeFileAtomically(self.filename, releaseName + '\n');
    self._readFile();
  }
});


// Represents .meteor/.finished-upgraders.
// This is only used in a few places, so we don't cache its value in memory;
// we just read it when we need it. There's also no need to add it to a
// watchSet because we don't need to rebuild when it changes.
exports.FinishedUpgraders = function (options) {
  var self = this;

  self.filename = path.join(
    options.projectDir, '.meteor', '.finished-upgraders');
};

_.extend(exports.FinishedUpgraders.prototype, {
  // XXX #3006 add a read method

  appendUpgraders: function (upgraders) {
    var self = this;

    var current = null;
    try {
      current = fs.readFileSync(self.filename, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw e;
    }

    var appendText = '';
    if (current === null) {
      // We're creating this file for the first time. Include a helpful comment.
      appendText =
"# This file contains information which helps Meteor properly upgrade your\n" +
"# app when you run 'meteor update'. You should check it into version control\n" +
"# with your project.\n" +
"\n";
    } else if (current.length && current[current.length - 1] !== '\n') {
      // File has an unterminated last line. Let's terminate it.
      appendText = '\n';
    }

    _.each(upgraders, function (upgrader) {
      appendText += upgrader + '\n';
    });

    fs.appendFileSync(self.filename, appendText);
  }
});
