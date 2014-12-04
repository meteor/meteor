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
var tropohouse = require('./tropohouse.js');
var utils = require('./utils.js');
var watch = require('./watch.js');

// The ProjectContext represents all the context associated with an app:
// metadata files in the `.meteor` directory, the choice of package versions
// used by it, etc.  Any time you want to work with an app, create a
// ProjectContext and call prepareProjectForBuild on it (in a buildmessage
// context).
//
// Note that this should only be used by parts of the code that truly require a
// full project to exist; you won't find any reference to ProjectContext in
// compiler.js or isopack.js, which work on individual files (though they will
// get references to some of the objects which can be stored in a ProjectContext
// such as PackageMap and IsopackCache).  Parts of the code that should deal
// with ProjectContext include command implementations, the parts of bundler.js
// that deal with creating a full project, PackageSource.initFromAppDir, stats
// reporting, etc.
//
// Classes in this file follow the standard protocol where names beginning with
// _ should not be externally accessed.
exports.ProjectContext = function (options) {
  var self = this;
  if (!options.projectDir)
    throw Error("missing projectDir!");

  self.originalOptions = options;
  self.reset();
};

// The value is the name of the method to call to continue.
var STAGE = {
  INITIAL: '_readProjectMetadata',
  READ_PROJECT_METADATA: '_initializeCatalog',
  INITIALIZE_CATALOG: '_resolveConstraints',
  RESOLVE_CONSTRAINTS: '_downloadMissingPackages',
  DOWNLOAD_MISSING_PACKAGES: '_buildLocalPackages',
  BUILD_LOCAL_PACKAGES: '_saveChangedMetadata',
  SAVE_CHANGED_METADATA: 'DONE'
};

_.extend(exports.ProjectContext.prototype, {
  reset: function (moreOptions, resetOptions) {
    var self = this;
    // Allow overriding some options until the next call to reset; used by
    // 'meteor update' code to try various values of releaseForConstraints.
    var options = _.extend({}, self.originalOptions, moreOptions);
    // This is options that are actually directed at reset itself.
    resetOptions = resetOptions || {};

    self.projectDir = options.projectDir;
    self.tropohouse = options.tropohouse || tropohouse.default;

    self._packageMapFilename = options.packageMapFilename ||
      path.join(self.projectDir, '.meteor', 'versions');

    self._serverArchitectures = options.serverArchitectures || [];
    // We always need to download host versions of packages, at least for
    // plugins.
    self._serverArchitectures.push(archinfo.host());
    self._serverArchitectures = _.uniq(self._serverArchitectures);

    // test-packages overrides this to load local packages from your real app
    // instead of from test-runner-app.
    self._projectDirForLocalPackages = options.projectDirForLocalPackages ||
      options.projectDir;
    self._explicitlyAddedLocalPackageDirs =
      options.explicitlyAddedLocalPackageDirs;

    // Used by 'meteor rebuild'; true to rebuild all packages, or a list of
    // package names.
    self._forceRebuildPackages = options.forceRebuildPackages;

    // Set by 'meteor create' and 'meteor update' to ensure that
    // .meteor/versions is always written even if release.current does not match
    // the project's release.
    self._alwaysWritePackageMap = options.alwaysWritePackageMap;

    // Set in a few cases where we really want to only get packages from
    // checkout.
    self._ignorePackageDirsEnvVar = options.ignorePackageDirsEnvVar;

    // Set by 'meteor publish' to ensure that .meteor/packages is not written
    // even though they may do an in-memory mutation of the constraints.
    self._neverWriteProjectConstraintsFile =
      options.neverWriteProjectConstraintsFile;

    // Set by 'meteor update' to specify which packages may be updated. Array of
    // package names.
    self._upgradePackageNames = options.upgradePackageNames;

    // Set when deploying to a previous Galaxy prototype.
    self._requireControlProgram = options.requireControlProgram;

    // If explicitly specified as null, use no release for constraints.
    // If specified non-null, should be a release version catalog record.
    // If not specified, defaults to release.current.
    //
    // Note that NONE of these cases are "use the release from
    // self.releaseFile"; after all, if you are explicitly running `meteor
    // --release foo` it will override what is found in .meteor/releases.
    if (_.has(options, 'releaseForConstraints')) {
      self._releaseForConstraints = options.releaseForConstraints || null;
    } else if (release.current.isCheckout()) {
      self._releaseForConstraints = null;
    } else {
      self._releaseForConstraints = release.current.getCatalogReleaseData();
    }

    // Initialized by readProjectMetadata.
    self.releaseFile = null;
    self.projectConstraintsFile = null;
    self.packageMapFile = null;
    self.platformList = null;
    self.cordovaPluginsFile = null;
    self.appIdentifier = null;
    self.finishedUpgraders = null;

    // Initialized by initializeCatalog.
    self.projectCatalog = null;
    self.localCatalog = null;

    // Initialized by _resolveConstraints.
    self.packageMap = null;
    self.packageMapDelta = null;

    if (resetOptions.softRefreshIsopacks && self.isopackCache) {
      // Make sure we only hold on to one old isopack cache, not a linked list
      // of all of them.
      self.isopackCache.forgetPreviousIsopackCache();
      self._previousIsopackCache = self.isopackCache;
    } else {
      self._previousIsopackCache = null;
    }
    // Initialized by _buildLocalPackages.
    self.isopackCache = null;

    self._completedStage = STAGE.INITIAL;
  },

  readProjectMetadata: function () {
    this._completeStagesThrough(STAGE.READ_PROJECT_METADATA);
  },
  initializeCatalog: function () {
    this._completeStagesThrough(STAGE.INITIALIZE_CATALOG);
  },
  resolveConstraints: function () {
    this._completeStagesThrough(STAGE.RESOLVE_CONSTRAINTS);
  },
  downloadMissingPackages: function () {
    this._completeStagesThrough(STAGE.DOWNLOAD_MISSING_PACKAGES);
  },
  buildLocalPackages: function () {
    this._completeStagesThrough(STAGE.BUILD_LOCAL_PACKAGES);
  },
  saveChangedMetadata: function () {
    this._completeStagesThrough(STAGE.SAVE_CHANGED_METADATA);
  },
  prepareProjectForBuild: function () {
    // This is the same as saveChangedMetadata, but if we insert stages after
    // that one it will continue to mean "fully finished".
    this.saveChangedMetadata();
  },

  _completeStagesThrough: function (targetStage) {
    var self = this;
    buildmessage.assertInCapture();

    buildmessage.enterJob('preparing project', function () {
      while (self._completedStage !== targetStage) {
        // This error gets thrown if you request to go to a stage that's earlier
        // than where you started. Note that the error will be mildly confusing
        // because the key of STAGE does not match the value.
        if (self.completedStage === STAGE.SAVE_CHANGED_METADATA)
          throw Error("can't find requested stage " + targetStage);

        // The actual value of STAGE.FOO is the name of the method that takes
        // you to the next step after FOO.
        self[self._completedStage]();
        if (buildmessage.jobHasMessages())
          return;
      }
    });
  },

  getProjectLocalDirectory: function (subdirectory) {
    var self = this;
    return path.join(self.projectDir, '.meteor', 'local', subdirectory);
  },

  // You can call this manually if you want to do some work before resolving
  // constraints, or you can let prepareProjectForBuild do it for you.
  //
  // This should be pretty fast --- for example, we shouldn't worry about
  // needing to wait for it to be done before we open the runner proxy.
  _readProjectMetadata: function () {
    var self = this;
    buildmessage.assertInCapture();

    buildmessage.enterJob('reading project metadata', function () {
      // Ensure this is actually a project directory.
      self._ensureProjectDir();
      if (buildmessage.jobHasMessages())
        return;

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
        filename: self._packageMapFilename
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

    self._completedStage = STAGE.READ_PROJECT_METADATA;
  },

  _ensureProjectDir: function () {
    var self = this;
    files.mkdir_p(path.join(self.projectDir, '.meteor'));

    // This file existing is what makes a project directory a project directory,
    // so let's make sure it exists!
    var constraintFilePath = path.join(self.projectDir, '.meteor', 'packages');
    if (! fs.existsSync(constraintFilePath)) {
      files.writeFileAtomically(constraintFilePath, '');
    }

    // Let's also make sure we have a minimal gitignore.
    var gitignorePath = path.join(self.projectDir, '.meteor', '.gitignore');
    if (! fs.existsSync(gitignorePath)) {
      files.writeFileAtomically(gitignorePath, 'local\n');
    }
  },

  // This is a WatchSet that ends up being the WatchSet for the app's
  // initFromAppDir PackageSource. Changes to this will cause the whole app to
  // be rebuilt (client and server).
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
        metadataFile && watchSet.merge(metadataFile.watchSet);
      });

    if (self.localCatalog) {
      watchSet.merge(self.localCatalog.packageLocationWatchSet);
    }

    return watchSet;
  },

  // This WatchSet encompasses everything that users can change to restart an
  // app. We only watch this for failed bundles; for successful bundles, we have
  // more precise server-specific and client-specific WatchSets that add up to
  // this one.
  getProjectAndLocalPackagesWatchSet: function () {
    var self = this;
    var watchSet = self.getProjectWatchSet();

    // Include the loaded local packages (ie, the non-metadata files) but only
    // if we've actually gotten to the buildLocalPackages step.
    if (self.isopackCache) {
      watchSet.merge(self.isopackCache.allLoadedLocalPackagesWatchSet);
    }
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

    var depsAndConstraints = self._getRootDepsAndConstraints();
    var cachedVersions = self.packageMapFile.getCachedVersions();
    var anticipatedPrereleases = self._getAnticipatedPrereleases(
      depsAndConstraints.constraints, cachedVersions);
    var resolver = self._buildResolver();

    var solution;
    buildmessage.enterJob("selecting package versions", function () {
      var resolveOptions = {
        previousSolution: cachedVersions,
        anticipatedPrereleases: anticipatedPrereleases
      };
      if (self._upgradePackageNames)
        resolveOptions.upgrade = self._upgradePackageNames;

      try {
        solution = resolver.resolve(
          depsAndConstraints.deps, depsAndConstraints.constraints,
          resolveOptions);
      } catch (e) {
        if (!e.constraintSolverError)
          throw e;
        buildmessage.error(e.message);
      }
    });

    if (!solution)
      return;  // error is already in buildmessage

    self.packageMap = new packageMapModule.PackageMap(
      solution.answer, self.projectCatalog);

    self.packageMapDelta = new packageMapModule.PackageMapDelta({
      cachedVersions: cachedVersions,
      packageMap: self.packageMap,
      usedRCs: solution.usedRCs,
      neededToUseUnanticipatedPrereleases:
          solution.neededToUseUnanticipatedPrereleases,
      anticipatedPrereleases: anticipatedPrereleases
    });

    self._completedStage = STAGE.RESOLVE_CONSTRAINTS;
  },

  _localPackageSearchDirs: function () {
    var self = this;
    var searchDirs = [path.join(self._projectDirForLocalPackages, 'packages')];

    if (! self._ignorePackageDirsEnvVar && process.env.PACKAGE_DIRS) {
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
  _initializeCatalog: function () {
    var self = this;
    buildmessage.assertInCapture();

    self.projectCatalog = new catalog.LayeredCatalog;
    self.localCatalog = new catalogLocal.LocalCatalog({
      containingCatalog: self.projectCatalog
    });
    self.projectCatalog.setCatalogs(self.localCatalog, catalog.official);

    var searchDirs = self._localPackageSearchDirs();
    buildmessage.enterJob({ title: "scanning local packages" }, function () {
      self.projectCatalog.initialize({
        localPackageSearchDirs: searchDirs,
        explicitlyAddedLocalPackageDirs: self._explicitlyAddedLocalPackageDirs
      });
    });

    self._completedStage = STAGE.INITIALIZE_CATALOG;
  },

  _getRootDepsAndConstraints: function () {
    var self = this;

    var depsAndConstraints = {deps: [], constraints: []};

    self._addAppConstraints(depsAndConstraints);
    self._addLocalPackageConstraints(depsAndConstraints);
    self._addReleaseConstraints(depsAndConstraints);
    self._addGalaxyPrototypeConstraints(depsAndConstraints);
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

  _addLocalPackageConstraints: function (depsAndConstraints) {
    var self = this;
    _.each(self.localCatalog.getAllPackageNames(), function (packageName) {
      var versionRecord = self.localCatalog.getLatestVersion(packageName);
      var constraint =
            utils.parseConstraint(packageName + "@=" + versionRecord.version);
      // Add a constraint ("this is the only version available") but no
      // dependency (we don't automatically use all local packages!)
      depsAndConstraints.constraints.push(constraint);
    });
  },

  _addReleaseConstraints: function (depsAndConstraints) {
    var self = this;
    if (! self._releaseForConstraints)
      return;
    _.each(self._releaseForConstraints.packages, function (version, packageName) {
      var constraint = utils.parseConstraint(packageName + "@=" + version);
      // Add a constraint ("this is the only version available") but no
      // dependency (we don't automatically use all local packages!)
      depsAndConstraints.constraints.push(constraint);
    });
  },

  // We only need to build ctl if deploying to the legacy Galaxy
  // prototype. (Note that this means that we will need a new constraint
  // solution when deploying vs when running locally. This code will be deleted
  // soon anyway.)
  _addGalaxyPrototypeConstraints: function (depsAndConstraints) {
    var self = this;
    if (self._requireControlProgram) {
      depsAndConstraints.deps.push('ctl');
    }
  },

  _getAnticipatedPrereleases: function (rootConstraints, cachedVersions) {
    var self = this;

    var anticipatedPrereleases = {};
    var add = function (packageName, version) {
      if (! /-/.test(version)) {
        return;
      }
      if (! _.has(anticipatedPrereleases, packageName)) {
        anticipatedPrereleases[packageName] = {};
      }
      anticipatedPrereleases[packageName][version] = true;
    };

    // Pre-release versions that are root constraints (in .meteor/packages, in
    // the release, or the version of a local package) are anticipated.
    _.each(rootConstraints, function (constraintObject) {
      _.each(constraintObject.constraints, function (alternative) {
        var version = alternative.version;
        version && add(constraintObject.name, version);
      });
    });

    // Pre-release versions we decided to use in the past are anticipated.
    _.each(cachedVersions, function (version, packageName) {
      add(packageName, version);
    });

    return anticipatedPrereleases;
  },

  _buildResolver: function () {
    var self = this;

    var constraintSolverPackage =
          isopackets.load('constraint-solver')['constraint-solver'];
    var resolver =
          new constraintSolverPackage.ConstraintSolver.PackagesResolver(
            self.projectCatalog, {
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
    self.tropohouse.downloadPackagesMissingFromMap(self.packageMap, {
      serverArchitectures: self._serverArchitectures
    });
    self._completedStage = STAGE.DOWNLOAD_MISSING_PACKAGES;
  },

  _buildLocalPackages: function () {
    var self = this;
    buildmessage.assertInCapture();

    self.isopackCache = new isopackCacheModule.IsopackCache({
      packageMap: self.packageMap,
      cacheDir: self.getProjectLocalDirectory('isopacks'),
      tropohouse: self.tropohouse,
      previousIsopackCache: self._previousIsopackCache
    });

    if (self._forceRebuildPackages) {
      self.isopackCache.wipeCachedPackages(
        self._forceRebuildPackages === true
          ? null : self._forceRebuildPackages);
    }

    buildmessage.enterJob('building local packages', function () {
      self.isopackCache.buildLocalPackages();
    });
    self._completedStage = STAGE.BUILD_LOCAL_PACKAGES;
  },

  _saveChangedMetadata: function () {
    var self = this;

    // Save any changes to .meteor/packages.
    if (! self._neverWriteProjectConstraintsFile)
      self.projectConstraintsFile.writeIfModified();

    // Write .meteor/versions if the command always wants to (create/update),
    // or if the release of the app matches the release of the process.
    if (self._alwaysWritePackageMap ||
        (release.current.isCheckout() && self.releaseFile.isCheckout()) ||
        (! release.current.isCheckout() &&
         release.current.name === self.releaseFile.fullReleaseName)) {
      self.packageMapFile.write(self.packageMap);
    }

    self._completedStage = STAGE.SAVE_CHANGED_METADATA;
  }
});


// Represents .meteor/packages.
exports.ProjectConstraintsFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = path.join(options.projectDir, '.meteor', 'packages');
  self.watchSet = null;

  // Have we modified the in-memory representation since reading from disk?
  self._modified = null;
  // List of each line in the file; object with keys:
  // - leadingSpace (string of spaces before the constraint)
  // - constraint (as returned by utils.parseConstraint)
  // - trailingSpaceAndComment (string of spaces/comments after the constraint)
  // This allows us to rewrite the file preserving comments.
  self._constraintLines = null;
  // Maps from package name to entry in _constraintLines.
  self._constraintMap = null;
  self._readFile();
};

_.extend(exports.ProjectConstraintsFile.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    self.watchSet = new watch.WatchSet;
    self._modified = false;
    self._constraintMap = {};
    self._constraintLines = [];
    var contents = watch.readAndWatchFile(self.watchSet, self.filename);

    // No .meteor/packages? This isn't a very good project directory. In fact,
    // that's the definition of a project directory! (And that should have been
    // fixed by _ensureProjectDir!)
    if (contents === null)
      throw Error("packages file missing: " + self.filename);

    var lines = files.splitBufferToLines(contents);
    // Don't keep a record for the space at the end of the file.
    if (lines.length && _.last(lines) === '')
      lines.pop();

    _.each(lines, function (line) {
      var lineRecord =
            { leadingSpace: '', constraint: null, trailingSpaceAndComment: '' };
      self._constraintLines.push(lineRecord);
      // Strip comment.
      var match = line.match(/^([^#]*)(#.*)$/);
      if (match) {
        line = match[1];
        lineRecord.trailingSpaceAndComment = match[2];
      }
      // Strip trailing space.
      match = line.match(/^((?:.*\S)?)(\s*)$/);
      line = match[1];
      lineRecord.trailingSpaceAndComment =
        match[2] + lineRecord.trailingSpaceAndComment;
      // Strip leading space.
      match = line.match(/^(\s*)((?:\S.*)?)$/);
      lineRecord.leadingSpace = match[1];
      line = match[2];

      // No constraint? Leave lineRecord.constraint null and continue.
      if (line === '')
        return;
      lineRecord.constraint = utils.parseConstraint(line, {
        useBuildmessage: true,
        buildmessageFile: self.filename
      });
      if (! lineRecord.constraint)
        return;  // recover by ignoring

      if (_.has(self._constraintMap, lineRecord.constraint.name)) {
        buildmessage.error(
          "Package name appears twice: " + lineRecord.constraint.name, {
            // XXX should this be relative?
            file: self.filename
          });
        return;  // recover by ignoring
      }
      self._constraintMap[lineRecord.constraint.name] = lineRecord;
    });
  },

  writeIfModified: function () {
    var self = this;
    self._modified && self._write();
  },

  _write: function () {
    var self = this;
    var lines = _.map(self._constraintLines, function (lineRecord) {
      var lineParts = [lineRecord.leadingSpace];
      if (lineRecord.constraint) {
        lineParts.push(lineRecord.constraint.name);
        if (lineRecord.constraint.constraintString) {
          lineParts.push('@', lineRecord.constraint.constraintString);
        }
      }
      lineParts.push(lineRecord.trailingSpaceAndComment, '\n');
      return lineParts.join('');
    });
    files.writeFileAtomically(self.filename, lines.join(''));
    var messages = buildmessage.capture(
      { title: 're-reading .meteor/packages' },
      function () {
        self._readFile();
      });
    // We shouldn't choke on something we just wrote!
    if (messages.hasMessages())
      throw Error("wrote bad .meteor/packages: " + messages.formatMessages());
  },

  // Iterates over all constraints, in the format returned by
  // utils.parseConstraint.
  eachConstraint: function (iterator) {
    var self = this;
    _.each(self._constraintLines, function (lineRecord) {
      if (lineRecord.constraint)
        iterator(lineRecord.constraint);
    });
  },

  // Returns the constraint in the format returned by utils.parseConstraint, or
  // null.
  getConstraint: function (name) {
    var self = this;
    if (_.has(self._constraintMap, name))
      return self._constraintMap[name].constraint;
    return null;
  },

  // Adds constraints, an array of objects as returned from
  // utils.parseConstraint.
  // Does not write to disk immediately; changes are written to disk by
  // writeIfModified() which is called in the _saveChangedMetadata step
  // of project preparation.
  addConstraints: function (constraintsToAdd) {
    var self = this;
    _.each(constraintsToAdd, function (constraintToAdd) {
      var lineRecord;
      if (! _.has(self._constraintMap, constraintToAdd.name)) {
        lineRecord = {
          leadingSpace: '',
          constraint: constraintToAdd,
          trailingSpaceAndComment: ''
        };
        self._constraintLines.push(lineRecord);
        self._constraintMap[constraintToAdd.name] = lineRecord;
        self._modified = true;
        return;
      }
      lineRecord = self._constraintMap[constraintToAdd.name];
      if (_.isEqual(constraintToAdd, lineRecord.constraint))
        return;  // nothing changed
      lineRecord.constraint = constraintToAdd;
      self._modified = true;
    });
  },

  // The packages in packagesToRemove are expected to actually be in the file;
  // if you want to provide different output for packages in the file vs not,
  // you should have already done that.
  // Does not write to disk immediately; changes are written to disk by
  // writeIfModified() which is called in the _saveChangedMetadata step
  // of project preparation.
  removePackages: function (packagesToRemove) {
    var self = this;
    self._constraintLines = _.filter(
      self._constraintLines, function (lineRecord) {
        return ! (lineRecord.constraint &&
                  _.contains(packagesToRemove, lineRecord.constraint.name));
      });
    _.each(packagesToRemove, function (p) {
      delete self._constraintMap[p];
    });
    self._modified = true;
  }
});



// Represents .meteor/versions.
exports.PackageMapFile = function (options) {
  var self = this;
  buildmessage.assertInCapture();

  self.filename = options.filename;
  self.watchSet = new watch.WatchSet;
  self._versions = {};

  self._readFile();
};

_.extend(exports.PackageMapFile.prototype, {
  _readFile: function () {
    var self = this;

    var contents = watch.readAndWatchFile(self.watchSet, self.filename);
    // No .meteor/versions? That's OK, you just get to start your calculation
    // from scratch.
    if (contents === null)
      return;

    buildmessage.assertInCapture();
    var lines = files.splitBufferToLines(contents);
    _.each(lines, function (line) {
      // We don't allow comments here, since it's cruel to allow comments in a
      // file when you're going to overwrite them anyway.
      line = files.trimSpace(line);
      if (line === '')
        return;
      var constraint = utils.parseConstraint(line, {
        useBuildmessage: true,
        buildmessageFile: self.filename
      });
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
      if (! utils.isSimpleConstraint(constraint)) {
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
  // from "so, what versions should I be building with?"  Usually you want the
  // PackageMap produced by resolving constraints instead! Returns a map from
  // package name to version.
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

  self.filename = path.join(options.projectDir, '.meteor', 'platforms');
  self.watchSet = null;
  self._platforms = null;

  self._readFile();
};

// These platforms are always present and can be neither added or removed
exports.PlatformList.DEFAULT_PLATFORMS = ['browser', 'server'];

_.extend(exports.PlatformList.prototype, {
  _readFile: function () {
    var self = this;

    // Reset the WatchSet.
    self.watchSet = new watch.WatchSet;
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
      // Write the platforms to disk (automatically adding DEFAULT_PLATFORMS and
      // sorting), which automatically calls this function recursively to
      // re-reads them.
      self.write(platforms);
      return;
    }

    self._platforms = platforms;
  },

  // Replaces the current platform file with the given list and resets this
  // object (and its WatchSet) to track the new value.
  write: function (platforms) {
    var self = this;
    self._platforms = null;
    platforms = _.uniq(
      platforms.concat(exports.PlatformList.DEFAULT_PLATFORMS));
    platforms.sort();
    files.writeFileAtomically(self.filename, platforms.join('\n') + '\n');
    self._readFile();
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
  self.watchSet = null;
  // Map from plugin name to version.
  self._plugins = null;

  self._readFile();
};

_.extend(exports.CordovaPluginsFile.prototype, {
  _readFile: function () {
    var self = this;
    buildmessage.assertInCapture();

    self.watchSet = new watch.WatchSet;
    self._plugins = {};
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
  },

  write: function (plugins) {
    var self = this;
    var pluginNames = _.keys(plugins);
    pluginNames.sort();
    var lines = _.map(pluginNames, function (pluginName) {
      return pluginName + '@' + plugins[pluginName] + '\n';
    });
    files.writeFileAtomically(self.filename, lines.join(''));
    var messages = buildmessage.capture(
      { title: 're-reading .meteor/cordova-plugins' },
      function () {
        self._readFile();
      });
    // We shouldn't choke on something we just wrote!
    if (messages.hasMessages())
      throw Error("wrote bad .meteor/packages: " + messages.formatMessages());
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
  // Just the track.
  self.releaseTrack = null;
  self.releaseVersion = null;
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
  normalReleaseSpecified: function () {
    var self = this;
    return ! (self.fileMissing() || self.noReleaseSpecified()
              || self.isCheckout());
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
    self.releaseTrack = parts[0];
    self.releaseVersion = parts[1];
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
  readUpgraders: function () {
    var self = this;
    var upgraders = [];
    var lines = files.getLinesOrEmpty(self.filename);
    _.each(lines, function (line) {
      line = files.trimSpaceAndComments(line);
      if (line === '')
        return;
      upgraders.push(line);
    });
    return upgraders;
  },

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
