var _ = require('underscore');
var buildmessage = require('../../utils/buildmessage.js');
var files = require('../../fs/files.js');
var watch = require('../../fs/watch.js');
var PackageSource = require('../../isobuild/package-source.js');
import { KNOWN_ISOBUILD_FEATURE_PACKAGES } from '../../isobuild/compiler.js';
import { sync as glob } from "glob";
import { Profile } from "../../tool-env/profile.js";
import {
  optimisticHashOrNull,
} from "../../fs/optimistic.js";

// LocalCatalog represents packages located in the application's
// package directory, other package directories specified via an
// environment variable, and core packages in the repo if meteor is
// being run from a git checkout.
var LocalCatalog = function (options) {
  var self = this;
  options = options || {};

  // Package server data.  Maps package name to a {packageSource, packageRecord,
  // versionRecord} object.
  self.packages = {};

  self.initialized = false;

    // Local directories to search for package source trees
  self.localPackageSearchDirs = null;

  // Package source trees added explicitly through a directory (not through a
  // parent search directory). We mainly use this to allow the user to run
  // test-packages against a package in a specific directory.
  self.explicitlyAddedLocalPackageDirs = [];

  // All packages found either by localPackageSearchDirs or
  // explicitlyAddedLocalPackageDirs. There is a hierarchy of packages, as
  // detailed below and there can only be one local version of a package at a
  // time. This refers to the package by the specific package directory that we
  // need to process.
  self.effectiveLocalPackageDirs = [];

  // A WatchSet that detects when the set of packages and their locations
  // changes. ie, the listings of 'packages' directories, and the contents of
  // package.js files underneath.  It does NOT track the rest of the source of
  // the packages: that wouldn't be helpful to the runner since it would be too
  // coarse to tell if a change is client-only or not.  (But any change to the
  // layout of where packages live counts as a non-client-only change.)
  self.packageLocationWatchSet = new watch.WatchSet;

  self._nextId = 1;
};

_.extend(LocalCatalog.prototype, {
  toString: function () {
    var self = this;
    return "LocalCatalog [localPackageSearchDirs=" +
      JSON.stringify(self.localPackageSearchDirs) + "]";
  },

  // Initialize the Catalog. This must be called before any other
  // Catalog function.

  // options:
  //  - localPackageSearchDirs: an array of paths on local disk, that contain
  //    subdirectories, that each contain a source tree for a package that
  //    should override the packages on the package server. For example, if
  //    there is a package 'foo' that we find through localPackageSearchDirs,
  //    then we will ignore all versions of 'foo' that we find through the
  //    package server. Directories that don't exist (or paths that aren't
  //    directories) will be silently ignored.
  //  - explicitlyAddedLocalPackageDirs: an array of paths which THEMSELVES
  //    are package source trees.  Takes precedence over packages found
  //    via localPackageSearchDirs.
  //  - buildingIsopackets: true if we are building isopackets
  initialize(options) {
    var self = this;
    buildmessage.assertInCapture();

    options = options || {};

    const addPatternsToList =
      Profile("addPatternsToList", (patterns, list) => {
        if (! patterns) {
          return;
        }

        patterns.forEach(pattern => {
          if (process.platform === "win32") {
            pattern = files.convertToOSPath(pattern);

            if (pattern.charAt(1) === ":") {
              // Get rid of drive prefix, e.g. C:
              pattern = pattern.slice(2);
            }

            // Convert to /forward/slash/path without /C
            pattern = files.convertToPosixPath(pattern, true);
          }

          // Note: glob expects POSIX-style paths, even on Windows.
          // https://github.com/isaacs/node-glob/blob/master/README.md#windows
          glob(pattern).forEach(
            p => list.push(files.pathResolve(p))
          );
        });
      });

    addPatternsToList(
      options.localPackageSearchDirs,
      self.localPackageSearchDirs = [],
    );

    addPatternsToList(
      options.explicitlyAddedLocalPackageDirs,
      self.explicitlyAddedLocalPackageDirs = [],
    );

    self._computeEffectiveLocalPackages();
    self._loadLocalPackages(options.buildingIsopackets);
    self.initialized = true;
  },

  // Throw if the catalog's self.initialized value has not been set to true.
  _requireInitialized: function () {
    var self = this;

    if (! self.initialized)
      throw new Error("catalog not initialized yet?");
  },

  // Return an array with the names of all of the packages that we know about,
  // in no particular order.
  getAllPackageNames: function (options) {
    var self = this;
    self._requireInitialized();

    return _.keys(self.packages);
  },

  // Return an array with the names of all of the non-test packages that we know
  // about, in no particular order.
  getAllNonTestPackageNames: function ({
    // Iff options.includeNonCore is truthy, packages in
    // meteor/packages/non-core/*/packages will be returned.
    includeNonCore = true,
  } = {}) {
    var self = this;
    self._requireInitialized();

    var ret = [];

    const nonCoreDir = files.pathJoin(
      files.getCurrentToolsDir(),
      "packages",
      "non-core"
    ) + files.pathSep;

    _.each(self.packages, function ({
      packageSource: { sourceRoot },
      versionRecord: { isTest },
    }, name) {
      if (isTest) {
        return;
      }

      if (! includeNonCore &&
          sourceRoot.startsWith(nonCoreDir)) {
        return;
      }

      ret.push(name);
    });

    return ret;
  },

  // Returns general (non-version-specific) information about a
  // package, or null if there is no such package.
  getPackage: function (name, options) {
    var self = this;
    self._requireInitialized();
    options = options || {};

    if (!_.has(self.packages, name))
      return null;
    return self.packages[name].packageRecord;
  },

  // Given a package, returns an array of the versions available (ie, the one
  // version we have, or an empty array).
  getSortedVersions: function (name) {
    var self = this;
    self._requireInitialized();

    if (!_.has(self.packages, name))
      return [];
    return [self.packages[name].versionRecord.version];
  },

  // Given a package, returns an array of the version records available (ie, the
  // one version we have, or an empty array). This method is intended for use by
  // Version Solver's CatalogLoader.
  //
  // As a special case, if name is an isobuild:* pseudo-package, returns
  // (minimal) information about it as well.
  getSortedVersionRecords: function (name) {
    var self = this;
    self._requireInitialized();

    if (_.has(KNOWN_ISOBUILD_FEATURE_PACKAGES, name)) {
      return KNOWN_ISOBUILD_FEATURE_PACKAGES[name].map(
        version => ({version, packageName: name, dependencies: {}})
      );
    }

    if (!_.has(self.packages, name))
      return [];
    return [self.packages[name].versionRecord];
  },

  // Return information about a particular version of a package, or
  // null if there is no such package or version.
  getVersion: function (name, version) {
    var self = this;
    self._requireInitialized();

    if (!_.has(self.packages, name))
      return null;
    var versionRecord = self.packages[name].versionRecord;
    if (versionRecord.version !== version)
      return null;
    return versionRecord;
  },

  // As getVersion, but returns info on the latest version of the
  // package, or null if the package doesn't exist or has no versions.
  getLatestVersion: function (name) {
    var self = this;

    if (!_.has(self.packages, name))
      return null;
    return self.packages[name].versionRecord;
  },

  getVersionBySourceRoot: function (sourceRoot) {
    var self = this;
    var packageObj = _.find(self.packages, function (p) {
      return p.packageSource.sourceRoot === sourceRoot;
    });
    if (! packageObj)
      return null;
    return packageObj.versionRecord;
  },

  // Compute self.effectiveLocalPackageDirs from self.localPackageSearchDirs and
  // self.explicitlyAddedLocalPackageDirs.
  _computeEffectiveLocalPackages() {
    var self = this;
    buildmessage.assertInCapture();

    self.effectiveLocalPackageDirs = [];

    buildmessage.enterJob("looking for packages", function () {
      _.each(self.explicitlyAddedLocalPackageDirs, (explicitDir) => {
        const packageJsPath = files.pathJoin(explicitDir, "package.js");
        const packageJsHash = optimisticHashOrNull(packageJsPath);

        if (packageJsHash) {
          self.packageLocationWatchSet.addFile(
            packageJsPath,
            packageJsHash,
          );

          self.effectiveLocalPackageDirs.push(explicitDir);

        } else {
          // We asked specifically for this directory, but it has no package!
          buildmessage.error("package has no package.js file", {
            file: explicitDir
          });
        }
      });

      _.each(self.localPackageSearchDirs, function (searchDir) {
        var possiblePackageDirs = watch.readAndWatchDirectory(
          self.packageLocationWatchSet, {
            absPath: searchDir,
            include: [/\/$/]
          });
        // Not a directory? Ignore.
        if (possiblePackageDirs === null)
          return;

        _.each(possiblePackageDirs, function (subdir) {
          // readAndWatchDirectory adds a slash to the end of directory names to
          // differentiate them from filenames. Remove it.
          subdir = subdir.substr(0, subdir.length - 1);
          var absPackageDir = files.pathJoin(searchDir, subdir);

          // Consider a directory to be a package source tree if it contains
          // 'package.js'. (We used to support isopacks in
          // localPackageSearchDirs, but no longer.)

          const packageJsPath = files.pathJoin(absPackageDir, "package.js");
          const packageJsHash = optimisticHashOrNull(packageJsPath);

          if (packageJsHash) {
            // Let earlier package directories override later package
            // directories.
            self.packageLocationWatchSet.addFile(
              packageJsPath,
              packageJsHash,
            );

            // We don't know the name of the package, so we can't deal with
            // duplicates yet. We are going to have to rely on the fact that we
            // are putting these in in order, to be processed in order.
            self.effectiveLocalPackageDirs.push(absPackageDir);
          }
        });
      });
    });
  },

  _loadLocalPackages(buildingIsopackets) {
    var self = this;
    buildmessage.assertInCapture();

    // Load the package source from a directory. We don't know the names of our
    // local packages until we do this.
    //
    // THIS MUST BE RUN IN LOAD ORDER. Let's say that we have two directories
    // for mongo-livedata. The first one processed by this function will be
    // canonical.  The second one will be ignored.
    //
    // (note: this is the behavior that we want for overriding things in
    //  checkout.  It is not clear that you get good UX if you have two packages
    //  with the same name in your app. We don't check that.)
    var initSourceFromDir = function (packageDir, definiteName) {
      var packageSource = new PackageSource;
      buildmessage.enterJob({
        title: "reading package from `" + packageDir + "`",
        rootPath: packageDir
      }, function () {
        var initFromPackageDirOptions = {
          buildingIsopackets: !! buildingIsopackets
        };
        // If we specified a name, then we know what we want to get and should
        // pass that into the options. Otherwise, we will use the 'name'
        // attribute from package-source.js.
        if (definiteName) {
          initFromPackageDirOptions.name = definiteName;
        }
        packageSource.initFromPackageDir(packageDir, initFromPackageDirOptions);
        if (buildmessage.jobHasMessages())
          return;  // recover by ignoring

        // Now that we have initialized the package from package.js, we know its
        // name.
        var name = packageSource.name;

        // We should only have one package dir for each name; in this case, we
        // are going to take the first one we get (since we preserved the order
        // in which we loaded local package dirs when running this function.)
        if (_.has(self.packages, name))
          return;

        self.packages[name] = {
          packageSource: packageSource,
          packageRecord: {
            _id: "PID" + self._nextId++,
            name: name,
            maintainers: null,
            lastUpdated: null
          },
          versionRecord: {
            _id: "VID" + self._nextId++,
            packageName: name,
            testName: packageSource.testName,
            version: packageSource.version,
            publishedBy: null,
            description: packageSource.metadata.summary,
            git: packageSource.metadata.git,
            dependencies: packageSource.getDependencyMetadata(),
            source: null,
            lastUpdated: null,
            published: null,
            isTest: packageSource.isTest,
            debugOnly: packageSource.debugOnly,
            prodOnly: packageSource.prodOnly,
            testOnly: packageSource.testOnly,
            containsPlugins: packageSource.containsPlugins()
          }
        };

        // If this is NOT a test package AND it has tests (tests will be
        // marked as test packages by package source, so we will not recurse
        // infinitely), then process that too.
        if (!packageSource.isTest && packageSource.testName) {
          initSourceFromDir(packageSource.sourceRoot, packageSource.testName);
        }
      });
    };

    // Load the package sources for packages and their tests into
    // self.packages.
    buildmessage.enterJob('initializing packages', function() {
      _.each(self.effectiveLocalPackageDirs, function (dir) {
        initSourceFromDir(dir);
      });
    });
  },

  getPackageSource: function (name) {
    var self = this;
    if (! _.has(self.packages, name))
      return null;
    return self.packages[name].packageSource;
  }
});

["initialize",
 "_computeEffectiveLocalPackages",
 "_loadLocalPackages",
].forEach(function (method) {
  this[method] = Profile("LocalCatalog#" + method, this[method]);
}, LocalCatalog.prototype);

exports.LocalCatalog = LocalCatalog;
