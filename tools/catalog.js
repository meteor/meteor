var fs = require('fs');
var path = require('path');
var semver = require('semver');
var _ = require('underscore');
var packageClient = require('./package-client.js');
var archinfo = require('./archinfo.js');
var packageCache = require('./package-cache.js');
var PackageSource = require('./package-source.js');
var unipackage = require('./unipackage.js');
var compiler = require('./compiler.js');
var buildmessage = require('./buildmessage.js');
var tropohouse = require('./tropohouse.js');
var watch = require('./watch.js');
var files = require('./files.js');
var utils = require('./utils.js');
var baseCatalog = require('./catalog-base.js').BaseCatalog;
var files = require('./files.js');
var fiberHelpers = require('./fiber-helpers.js');

var catalog = exports;

/////////////////////////////////////////////////////////////////////////////////////
//  Server Catalog
/////////////////////////////////////////////////////////////////////////////////////

// The serverlog syncs up with the server. It doesn't care about local
// packages. When the user wants information about the state of the package
// world (ex: search), we should use this catalog first.
var ServerCatalog = function () {
  var self = this;

  // Set this to true if we are not going to connect to the remote package
  // server, and will only use the cached data.json file for our package
  // information. This means that the catalog might be out of date on the latest
  // developments.
  self.offline = null;

  // We inherit from the protolog class, since we are a catalog.
  baseCatalog.call(self);
};

ServerCatalog.prototype = Object.create(baseCatalog.prototype);

_.extend(ServerCatalog.prototype, {
  initialize : function (options) {
    var self = this;
    options = options || {};

    // We should to figure out if we are intending to connect to the package
    // server.
    self.offline = options.offline ? options.offline : false;

    // Set all the collections to their initial values.
    self.reset();

    // The server catalog is always initialized.
    self.initialized = true;

    // This is set to an array while refresh() is running; if another refresh()
    // call happens during a yield, instead of doing a second refresh it just
    // waits for the first to finish.
    self._refreshFutures = null;

  },

  // Refresh the packages in the catalog. Print a warning if we cannot connect
  // to the package server.
  //
  // If a refresh is already in progress (which is yielding), it just waits for
  // the in-progress refresh to finish.
  refresh: function () {
    var self = this;
    self._requireInitialized();

    if (self._refreshFutures) {
      var f = new Future;
      self._refreshFutures.push(f);
      f.wait();
      return;
    }

    self._refreshFutures = [];

    var thrownError = null;
    try {
      self._refresh();
    } catch (e) {
      thrownError = e;
    }

    while (self._refreshFutures.length) {
      var fut = self._refreshFutures.pop();
      if (thrownError) {
        // XXX is it really right to throw the same error multiple times?
        fut.throw(thrownError);
      } else {
        fut.return();
      }
    }
    self._refreshFutures = null;
  },

  // Refresh the packages in the catalog. Prints a warning if we cannot connect
  // to the package server, and intend to.
  _refresh: function () {
    var self = this;

    var localData = packageClient.loadCachedServerData();
    var allPackageData;
    if (! self.offline ) {
      allPackageData = packageClient.updateServerPackageData(localData);
      if (! allPackageData) {
        // If we couldn't contact the package server, use our local data.
        allPackageData = localData;
        // XXX should do some nicer error handling here (return error to
        // caller and let them handle it?)
        process.stderr.write("Warning: could not connect to package server\n");
      }
    } else {
      allPackageData = localData;
    }

    // Reset all collections back to their original state.
    self.reset();

    // Insert the server packages into the catalog.
    if (allPackageData && allPackageData.collections) {
      self._insertServerPackages(allPackageData);
    }

    // XXX: Then refresh the non-server catalog here.
  }
});

/////////////////////////////////////////////////////////////////////////////////////
//  Constraint Catalog
/////////////////////////////////////////////////////////////////////////////////////

// Unlike the server catalog, the local catalog knows about local packages. This
// is what we use to resolve dependencies. The local catalog does not contain
// full information about teh server's state, because local packages take
// precedence (and we want to optimize retrieval of relevant data). It also
// doesn't bother to sync up to the server, and just relies on the server
// catalog to provide it with the right information through data.json.
var CompleteCatalog = function () {
  var self = this;

  // Local directories to search for package source trees
  self.localPackageDirs = null;

  // Packages specified by addLocalPackage: added explicitly through a
  // directory. We mainly use this to allow the user to run test-packages against a
  // package in a specific directory.
  self.localPackages = {}; // package name to source directory

  // All packages found either by localPackageDirs or localPackages. There is a
  // hierarghy of packages, as detailed below and there can only be one local
  // version of a package at a time.
  self.effectiveLocalPackages = {}; // package name to source directory

  // Constraint solver using this catalog.
  self.resolver = null;

  // We inherit from the protolog class, since we are a catalog.
  baseCatalog.call(self);
};

CompleteCatalog.prototype = Object.create(baseCatalog.prototype);

_.extend(CompleteCatalog.prototype, {
  // Initialize the Catalog. This must be called before any other
  // Catalog function.

  // options:
  //  - localPackageDirs: an array of paths on local disk, that
  //    contain subdirectories, that each contain a source tree for a
  //    package that should override the packages on the package
  //    server. For example, if there is a package 'foo' that we find
  //    through localPackageDirs, then we will ignore all versions of
  //    'foo' that we find through the package server. Directories
  //    that don't exist (or paths that aren't directories) will be
  //    silently ignored.
  initialize: function (options) {
    var self = this;

    options = options || {};

    // initializing this here to make it clear that this exists and we have
    // access to it -- a map of names of local packages to their package
    // sources. We call upon this when we compile the package.
    self.packageSources = {};

    // At this point, effectiveLocalPackageDirs is just the local package
    // directories, since we haven't had a chance to add any other local
    // packages. Nonetheless, let's set those.
    self.localPackageDirs =
      _.filter(options.localPackageDirs || [], utils.isDirectory);
    self._recomputeEffectiveLocalPackages();

    // Lastly, let's read through the data.json file and then put through the
    // local overrides.
    self.refresh();

    // Finally, initialize the constraint solver for this catalog. We have to do
    // this at the end, after we have loaded enough stuff to load packages.
    self._initializeResolver();
  },

  // Given a set of constraints, returns a det of dependencies that satisfy the
  // constraint.
  //
  // Calls the constraint solver, if one already exists. If the project
  // currently in use has a versions file, that file will be used as a
  // comprehensive version lock: the returned dependencies will be a subset
  // of the project's dependencies, using the same versions.
  //
  // If no constraint solver has been initialized (probably because we are
  // trying to compile its dependencies), return null. (This interacts with the
  // package loader to redirect to only using local packages, which makes sense,
  // since we must be running from checkout).
  //
  // - constraints: a set of constraints that we are trying to resolve.
  //   XXX: In some format!
  // - resolverOpts: options for the constraint solver. See the resolver.resolve
  //   function in the constraint solver package.
  // - opts: (options for this function)
  //   - ignoreProjectDeps: ignore the dependencies of the project, do not
  //     attempt to use them as the previous versions or expect the final answer
  //     to be a subset.
  //
  // Returns an object mapping a package name to a version, or null.
  resolveConstraints : function (constraints, resolverOpts, opts) {
    var self = this;
    opts = opts || {};
    self._requireInitialized();

    // Kind of a hack, as per specification. We don't have a constraint solver
    // initialized yet. We are probably trying to build the constraint solver
    // package, or one of its dependencies. Luckily, we know that this means
    // that we are running from checkout and all packages are local, so we can
    // just use those versions. #UnbuiltConstraintSolverMustUseLocalPackages
    if (!self.resolver) {
      return null;
    };

    // Looks like we are not going to be able to avoid calling the constraint
    // solver, so let's process the input (constraints) into the correct
    // arguments to the constraint solver.
    //
    // -deps: list of package names that we depend on
    // -constr: constraints of form {packageName: String, version: String} with
    //  {type: exact} for exact constraints.
    //
    // Weak dependencies are constraints (they constrain the result), but not
    // dependencies.
    var deps = [];
    var constr = [];
    _.each(constraints, function (constraint) {
      constraint = _.clone(constraint);
      if (!constraint.weak) {
        deps.push(constraint.packageName);
      }
      delete constraint.weak;
      if (constraint.version) {
        _.extend(constr, constraint);
      }
    });

    var project = require("./project.js").project;
    // If we are called with 'ignore projectDeps', then we don't even look to
    // see what the project thinks and recalculate everything. Similarly, if the
    // project root path has not been initialized, we are probably running
    // outside of a project, and have nothing to look at for guidance.
    if (opts.ignoreProjectDeps || !project.viableDepSource) {
      return self.resolver.resolve(deps, constr, resolverOpts);
    }

    // Override the previousSolutions with the project's dependencies
    // value. (They probably come from the package's own lock file, but we
    // ignore that when running in a project) Then, call the constraint solver,
    // to get the valid transitive subset of those versions to record for our
    // solution. (We don't just return the original version lock because we want
    // to record the correct transitive dependencies)
    var versions = project.getVersions();
    resolverOpts.previousSolution = versions;
    var solution = self.resolver.resolve(deps, constr, resolverOpts);

    // In case this ever comes up, just to be sure, here is some code to check
    // that everything in the solution is in the original versions. This should
    // never be false if we did everything right at project loading and it is
    // computationally annoying, so unless we are actively debugging, we
    // shouldn't use it.
    // _.each(solution, function (version, package) {
    //  if (versions[package] !== version) {
    //    throw new Error ("differing versions for " + package + ":" +
    //                     resolverOpts.previousSolution[package] + " vs "
    //                     +  version + " ?");
    //  }
    // });

    return solution;
  },
  // Refresh the packages in the catalog.
  //
  // Reread server data from data.json on disk, then load local overrides on top
  // of that information. Sets initialized to true.
  refresh: function () {
    var self = this;

    self.reset();
    var localData = packageClient.loadCachedServerData();
    self._insertServerPackages(localData);
    self._recomputeEffectiveLocalPackages();
    self._addLocalPackageOverrides();

    self.initialized = true;

    // Rebuild the resolver, since packages may have changed.
    self._initializeResolver();
  },

  _initializeResolver: function () {
    var self = this;
    var uniload = require('./uniload.js');
    var constraintSolverPackage =  uniload.load({
      packages: [ 'constraint-solver']
    })['constraint-solver'];
    self.resolver =
      new constraintSolverPackage.ConstraintSolver.PackagesResolver(self);
  },

  // Compute self.effectiveLocalPackages from self.localPackageDirs
  // and self.localPackages.
  _recomputeEffectiveLocalPackages: function () {
    var self = this;

    self.effectiveLocalPackages = {};

    _.each(self.localPackageDirs, function (localPackageDir) {
      if (! utils.isDirectory(localPackageDir))
        return;
      var contents = fs.readdirSync(localPackageDir);
      _.each(contents, function (item) {
        var packageDir = path.resolve(path.join(localPackageDir, item));
        if (! utils.isDirectory(packageDir))
          return;

        // Consider a directory to be a package source tree if it
        // contains 'package.js'. (We used to support unipackages in
        // localPackageDirs, but no longer.)
        if (fs.existsSync(path.join(packageDir, 'package.js'))) {
          // Let earlier package directories override later package
          // directories.

          // XXX XXX for now, get the package name from the
          // directory. in a future refactor, should instead build the
          // package right here and get the name from the (not yet
          // added) 'name' attribute in package.js.
          if (! _.has(self.effectiveLocalPackages, item))
            self.effectiveLocalPackages[item] = packageDir;
        }
      });
    });

    _.extend(self.effectiveLocalPackages, self.localPackages);
  },

  // Add all packages in self.effectiveLocalPackages to the catalog,
  // first removing any existing packages that have the same name.
  //
  // If _setInitialized is provided and true, then as soon as the
  // metadata for the local packages has been loaded into the catalog,
  // mark the catalog as initialized. This is a bit of a hack.
  //
  // XXX emits buildmessages. are callers expecting that?
  _addLocalPackageOverrides: function (_setInitialized) {
    var self = this;

    // Remove all packages from the catalog that have the same name as
    // a local package, along with all of their versions and builds.
    var removedVersionIds = {};
    _.each(self.effectiveLocalPackages, function (dir, packageName) {
      if (!_.has(self.versions, packageName))
        return;
      _.each(self.versions[packageName], function (record) {
        removedVersionIds[record._id] = true;
      });
      delete self.versions[packageName];
    });

    self.builds = _.filter(self.builds, function (build) {
      return ! _.has(removedVersionIds, build.versionId);
    });

    self.packages = _.filter(self.packages, function (pkg) {
      return ! _.has(self.effectiveLocalPackages, pkg.name);
    });

    // Load the source code and create Package and Version
    // entries from them. We have to do this before we can run the
    // constraint solver.
    var packageSources = {}; // name to PackageSource

    var initVersionRecordFromSource =  function (packageDir, name) {
      var packageSource = new PackageSource;
      var broken = false;
      buildmessage.enterJob({
        title: "reading package `" + name + "`",
        rootPath: packageDir
      }, function () {
        // All packages in the catalog must have versions.
        packageSource.initFromPackageDir(name, packageDir, {
          requireVersion: true
        });
        if (buildmessage.jobHasMessages())
          broken = true;
      });
      if (broken)
        return;  // recover by ignoring

      packageSources[name] = packageSource;

      self.packages.push({
        name: name,
        maintainers: null,
        lastUpdated: null
      });

      // This doesn't have great birthday-paradox properties, but we
      // don't have Random.id() here (since it comes from a
      // unipackage), and making an index so we can see if a value is
      // already in use would complicated the code. Let's take the bet
      // that by the time we have enough local packages that this is a
      // problem, we either will have made tools into a star, or we'll
      // have made Catalog be backed by a real database.
      var versionId = "local-" + Math.floor(Math.random() * 1000000000);

      // Accurate version numbers are of supreme importance, because
      // we use version numbers (of build-time dependencies such as
      // the coffeescript plugin), together with source file hashes
      // and the notion of a repeatable build, to decide when a
      // package build is out of date and trigger a rebuild of the
      // package.
      //
      // The package we have just loaded may declare its version to be
      // 1.2.3, but that doesn't mean it's really the official version
      // 1.2.3 of the package. It only gets that version number
      // officially when it's published to the package server. So what
      // we'd like to do here is give it a version number like
      // '1.2.3+<buildid>', where <buildid> is a hash of everything
      // that's necessary to repeat the build exactly: all of the
      // package's source files, all of the package's build-time
      // dependencies, and the version of the Meteor build tool used
      // to build it.
      //
      // Unfortunately we can't actually compute such a buildid yet
      // since it depends on knowing the build-time dependencies of
      // the package, which requires that we run the constraint
      // solver, which can only be done once we've populated the
      // catalog, which is what we're trying to do right now.
      //
      // So we have a workaround. For local packages we will fake the
      // version in the catalog by setting the buildid to 'local', as
      // in '1.2.3+local'. This is enough for the constraint solver to
      // run, but any code that actually relies on accurate versions
      // (for example, code that checks if a build is up to date)
      // needs to be careful to get the versions not from the catalog
      // but from the actual built Unipackage objects, which will have
      // accurate versions (with precise buildids) even for local
      // packages.
      var version = packageSource.version;
      if (version.indexOf('+') !== -1)
        throw new Error("version already has a buildid?");
      version = version + "+local";

      if (_.has(self.versions, name))
        throw Error("should have deleted " + name + " above?");
      self.versions[name] = {};
      self.versions[name][version] = {
        _id: versionId,
        packageName: name,
        testName: packageSource.testName,
        version: version,
        publishedBy: null,
        earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
        description: packageSource.metadata.summary,
        dependencies: packageSource.getDependencyMetadata(),
        source: null,
        lastUpdated: null,
        published: null,
        isTest: packageSource.isTest,
        containsPlugins: packageSource.containsPlugins()
      };

      // Test packages are not allowed to have tests. Any time we recurse into
      // this function, it will be with test marked as true, so recursion
      // will terminate quickly.
      if (!packageSource.isTest && packageSource.testName) {
        self.effectiveLocalPackages[packageSource.testName] = packageSource.sourceRoot;
        initVersionRecordFromSource(packageSource.sourceRoot, packageSource.testName);
      }
    };

    // Add the records for packages and their tests. With underscore, each only
    // runs on the original members of the collection, so it is safe to modify
    // effectiveLocalPackages in initPackageSource (to add test packages).
    _.each(self.effectiveLocalPackages, initVersionRecordFromSource);

    // We have entered records for everything, and we are going to build lazily,
    // so we are done.
    if (_setInitialized)
      self.initialized = true;

    // Save the package sources and the list of all unbuilt packages. We will
    // build them lazily when someone asks for them.
    self.packageSources = packageSources;
    self.unbuilt = _.clone(self.effectiveLocalPackages);
  },

  // Given a version string that may or may not have a build ID, convert it into
  // the catalog's internal format for local versions -- [version
  // number]+local. (for example, 1.0.0+local).
  _getLocalVersion: function (version) {
    if (version)
      return version.split("+")[0] + "+local";
    return version;
  },

  // Returns the latest unipackage build if the package has already been
  // compiled and built in the directory, and null otherwise.
  _maybeGetUpToDateBuild : function (name) {
    var self = this;
    var sourcePath = self.effectiveLocalPackages[name];
    var buildDir = path.join(sourcePath, '.build.' + name);
    if (fs.existsSync(buildDir)) {
      var unip = new unipackage.Unipackage;
      try {
        unip.initFromPath(name, buildDir, { buildOfPath: sourcePath });
      } catch (e) {
        if (!(e instanceof unipackage.OldUnipackageFormatError))
          throw e;
        // Ignore unipackage-pre1 builds
        return null;
      }
      if (compiler.checkUpToDate(self.packageSources[name], unip)) {
        return unip;
      }
    }
    return null;
  },

  // Recursively builds packages. Takes a package, builds its dependencies, then
  // builds the package. Sends the built package to the package cache, to be
  // pre-cached for future reference. Puts the build record in the built records
  // collection.
  //
  // Takes in the following arguments:
  //
  // - name: name of the package
  // - onStack: stack of packages to be built in this round. Since we are
  //   building packages recursively, we want to pass the stack around to check
  //   for circular dependencies.
  //
  // Why does this happen in the catalog and not, for example, the package
  // cache? If we build in package cache, we need to send the record over to the
  // catalog. If we build in catalog, we need to send the package over to
  // package cache. It could go either way, but since a lot of the information
  // that we use is in the catalog already, we build it here.
  _build : function (name, onStack) {
    var self = this;

    var unip = null;

    if (! _.has(self.unbuilt, name)) {
      return;
    }

    delete self.unbuilt[name];


    // Go through the build-time constraints. Make sure that they are built,
    // either because we have built them already, or because we are about to
    // build them.
    var deps = compiler.getBuildOrderConstraints(self.packageSources[name]);
    _.each(deps, function (dep) {

      // We don't need to build non-local packages. It has been built. Return.
      if  (!self.isLocalPackage(dep.name)) {
        return;
      }

      // Make sure that the version we need for this dependency is actually the
      // right local version. If it is not, then using the local build will not
      // give us the right answer. This should never happen!... but we would
      // rather fail than surprise someone with an incorrect build.
      //
      // The catalog doesn't understand buildID versions, so let's strip out the
      // buildID.
      var version = self._getLocalVersion(dep.version);
      var packageVersion =
            self._getLocalVersion(self.packageSources[dep.name].version);
      if (version !== packageVersion) {
        throw new Error("unknown version for local package? " + name);
      }

      // We have the right package. Let's make sure that this is not a circular
      // dependency that we can't resolve.
      if (_.has(onStack, dep.name)) {
        // Allow a circular dependency if the other thing is already
        // built and doesn't need to be rebuilt.
        unip = self._maybeGetUpToDateBuild(dep.name);
        if (unip) {
          return;
        } else {
          buildmessage.error("circular dependency between packages " +
                             name + " and " + dep.name);
          // recover by not enforcing one of the depedencies
          return;
        }
      }

      // Put this on the stack and send recursively into the builder.
      onStack[dep.name] = true;
      self._build(dep.name, onStack);
      delete onStack[dep.name];
    });

    // Now build this package if it needs building
    var sourcePath = self.effectiveLocalPackages[name];
    unip = self._maybeGetUpToDateBuild(name);

    if (! unip) {
      // Didn't have a build or it wasn't up to date. Build it.
      buildmessage.enterJob({
        title: "building package `" + name + "`",
        rootPath: sourcePath
      }, function () {
        unip = compiler.compile(self.packageSources[name]).unipackage;
        if (! buildmessage.jobHasMessages()) {
          // Save the build, for a fast load next time
          try {
            var buildDir = path.join(sourcePath, '.build.'+ name);
            files.addToGitignore(sourcePath, '.build*');
            unip.saveToPath(buildDir, { buildOfPath: sourcePath });
          } catch (e) {
            // If we can't write to this directory, we don't get to cache our
            // output, but otherwise life is good.
            if (!(e && (e.code === 'EACCES' || e.code === 'EPERM')))
              throw e;
          }
        }
      });
    }
    // And put a build record for it in the catalog
    var versionId = self.getLatestVersion(name);

    packageCache.packageCache.cachePackageAtPath(
      name, sourcePath, unip);

    self.builds.push({
      buildArchitectures: unip.buildArchitectures(),
      builtBy: null,
      build: null, // this would be the URL and hash
      versionId: versionId,
      lastUpdated: null,
      buildPublished: null
    });
  },
  // Add a local package to the catalog. `name` is the name to use for
  // the package and `directory` is the directory that contains the
  // source tree for the package.
  //
  // If a package named `name` exists on the package server, it will
  // be overridden (it will be as if that package doesn't exist on the
  // package server at all). And for now, it's an error to call this
  // function twice with the same `name`.
  addLocalPackage: function (name, directory) {
    var self = this;
    self._requireInitialized();

    var resolvedPath = path.resolve(directory);
    if (_.has(self.localPackages, name) &&
        self.localPackages[name] !== resolvedPath) {
      throw new Error("Duplicate local package '" + name + "'");
    }
    self.localPackages[name] = resolvedPath;

    // If we were making lots of calls to addLocalPackage, we would
    // want to coalesce the calls to refresh somehow, but I don't
    // think we'll actually be doing that so this should be fine.
    // #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self.refresh();
  },

  // Reverse the effect of addLocalPackage.
  removeLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    if (! _.has(self.localPackages, name))
      throw new Error("no such local package?");
    delete self.localPackages[name];

    // see #CallingRefreshEveryTimeLocalPackagesChange
    self._recomputeEffectiveLocalPackages();
    self.refresh();
  },

  // True if `name` is a local package (is to be loaded via
  // localPackageDirs or addLocalPackage rather than from the package
  // server)
  isLocalPackage: function (name) {
    var self = this;
    self._requireInitialized();

    return _.has(self.effectiveLocalPackages, name);
  },

  // Register local package directories with a watchSet. We want to know if a
  // package is created or deleted, which includes both its top-level source
  // directory and its main package metadata file.
  //
  // This will watch the local package directories that are in effect when the
  // function is called.  (As set by the most recent call to
  // setLocalPackageDirs.)
  watchLocalPackageDirs: function (watchSet) {
    var self = this;
    self._requireInitialized();

    _.each(self.localPackageDirs, function (packageDir) {
      var packages = watch.readAndWatchDirectory(watchSet, {
        absPath: packageDir,
        include: [/\/$/]
      });
      _.each(packages, function (p) {
        watch.readAndWatchFile(watchSet,
                               path.join(packageDir, p, 'package.js'));
        watch.readAndWatchFile(watchSet,
                               path.join(packageDir, p, 'unipackage.json'));
      });
    });
  },

  // Rebuild all source packages in our search paths. If two packages
  // have the same name only the one that we would load will get
  // rebuilt.
  //
  // If namedPackages is provided, it is an array of the only packages that need
  // to be rebuilt.
  //
  // Returns a count of packages rebuilt.
  rebuildLocalPackages: function (namedPackages) {
    var self = this;
    self._requireInitialized();

    // Clear any cached builds in the package cache.
    packageCache.packageCache.refresh();

    if (namedPackages) {
      var bad = false;
      _.each(namedPackages, function (namedPackage) {
        if (!_.has(self.effectiveLocalPackages, namedPackage)) {
          buildmessage.enterJob(
            { title: "rebuilding " + namedPackage }, function () {
              buildmessage.error("unknown package");
            });
          bad = true;
        }
      });
      if (bad)
        return;
    }

    // Go through the local packages and remove all of their build
    // directories. Now, no package will be up to date and all of them will have
    // to be rebuilt.
    var count = 0;
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      if (namedPackages && !_.contains(namedPackages, name))
        return;
      var buildDir = path.join(loadPath, '.build.' + name);
      files.rm_recursive(buildDir);
    });

    // Now, go (again) through the local packages and ask the packageCache to
    // load each one of them. Since the packageCache will not find any old
    // builds (and have no cache), it will be forced to recompile them.
    _.each(self.effectiveLocalPackages, function (loadPath, name) {
      if (namedPackages && !_.contains(namedPackages, name))
        return;
      packageCache.packageCache.loadPackageAtPath(name, loadPath);
      count ++;
    });

    return count;
  },

  // Given a name and a version of a package, return a path on disk
  // from which we can load it. If we don't have it on disk (we
  // haven't downloaded it, or it just plain doesn't exist in the
  // catalog) return null.
  //
  // Doesn't download packages. Downloading should be done at the time
  // that .meteor/versions is updated.
  //
  // HACK: Version can be null if you are certain that the package is to be
  // loaded from local packages. In the future, version should always be
  // required and we should confirm that the version on disk is the version that
  // we asked for. This is to support unipackage loader not having a version
  // manifest.
  getLoadPathForPackage: function (name, version) {
    var self = this;
    self._requireInitialized();

    // Check local packages first.
    if (_.has(self.effectiveLocalPackages, name)) {

      // If we don't have a build of this package, we need to rebuild it.
      if (_.has(self.unbuilt, name)) {
        self._build(name, {});
      };

      // Return the path.
      return self.effectiveLocalPackages[name];
    }

    if (! version) {
      throw new Error(name + " not a local package, and no version specified?");
    }

    var packageDir = tropohouse.default.packagePath(name, version);
    if (fs.existsSync(packageDir)) {
      return packageDir;
    }
     return null;
  }
});


// This is the catalog that's used to answer the specific question of "so what's
// on the server?".  It does not contain any local catalogs.  Typically, we call
// catalog.official.refresh() to update data.json.
catalog.official = new ServerCatalog();

// This is the catalog that's used to actually drive the constraint solver: it
// contains local packages, and since local packages always beat server
// packages, it doesn't contain any information about the server version of
// local packages.
catalog.complete = new CompleteCatalog();
