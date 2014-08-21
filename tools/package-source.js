var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var semver = require('semver');
var sourcemap = require('source-map');

var files = require('./files.js');
var utils = require('./utils.js');
var watch = require('./watch.js');
var buildmessage = require('./buildmessage.js');
var meteorNpm = require('./meteor-npm.js');
var Builder = require('./builder.js');
var archinfo = require('./archinfo.js');
var release = require('./release.js');
var catalog = require('./catalog.js');

// XXX: This is a medium-term hack, to avoid having the user set a package name
// & test-name in package.describe. We will change this in the new control file
// world in some way.
var AUTO_TEST_PREFIX = "local-test:";
var isTestName = function (name) {
  var nameStart = name.slice(0, AUTO_TEST_PREFIX.length);
  return nameStart === AUTO_TEST_PREFIX;
};
var genTestName = function (name) {
  return AUTO_TEST_PREFIX + name;
};

// Given a semver version string, return the earliest semver for which
// we are a replacement. This is used to compute the default
// earliestCompatibleVersion.
// XXX: move to utils?
var earliestCompatible = function (version) {
  // This is not the place to check to see if version parses as
  // semver. That should have been done when we first received it from
  // the user.
  var parsed = semver.parse(version);
  if (! parsed)
    throw new Error("not a valid version: " + version);
  return parsed.major + ".0.0";
};

// Returns a sort comparator to order files into load order.
// templateExtensions should be a list of extensions like 'html'
// which should be loaded before other extensions.
var loadOrderSort = function (templateExtensions) {
  var templateExtnames = {};
  _.each(templateExtensions, function (extension) {
    templateExtnames['.' + extension] = true;
  });

  return function (a, b) {
    // XXX MODERATELY SIZED HACK --
    // push template files ahead of everything else. this is
    // important because the user wants to be able to say
    //   Template.foo.events = { ... }
    // in a JS file and not have to worry about ordering it
    // before the corresponding .html file.
    //
    // maybe all of the templates should go in one file?
    var isTemplate_a = _.has(templateExtnames, path.extname(a));
    var isTemplate_b = _.has(templateExtnames, path.extname(b));
    if (isTemplate_a !== isTemplate_b) {
      return (isTemplate_a ? -1 : 1);
    }

    // main.* loaded last
    var ismain_a = (path.basename(a).indexOf('main.') === 0);
    var ismain_b = (path.basename(b).indexOf('main.') === 0);
    if (ismain_a !== ismain_b) {
      return (ismain_a ? 1 : -1);
    }

    // /lib/ loaded first
    var islib_a = (a.indexOf(path.sep + 'lib' + path.sep) !== -1 ||
                   a.indexOf('lib' + path.sep) === 0);
    var islib_b = (b.indexOf(path.sep + 'lib' + path.sep) !== -1 ||
                   b.indexOf('lib' + path.sep) === 0);
    if (islib_a !== islib_b) {
      return (islib_a ? -1 : 1);
    }

    // deeper paths loaded first.
    var len_a = a.split(path.sep).length;
    var len_b = b.split(path.sep).length;
    if (len_a !== len_b) {
      return (len_a < len_b ? 1 : -1);
    }

    // otherwise alphabetical
    return (a < b ? -1 : 1);
  };
};

// XXX We currently have a 1 to 1 mapping between 'where' and 'arch'.
// In the future, we may let people specify different 'where' and 'arch'.
var mapWhereToArch = function (where) {
  if (where === 'server') {
    return 'os';
  } else {
    // Transform client.* into web.*
    return 'web.' + where.split('.').slice(1).join('.');
  }
};

///////////////////////////////////////////////////////////////////////////////
// SourceArch
///////////////////////////////////////////////////////////////////////////////

// Options:
// - name [required]
// - arch [required]
// - uses
// - implies
// - getSourcesFunc
// - declaredExports
// - watchSet
//
// Do not include the source files in watchSet. They will be
// added at compile time when the sources are actually read.
var SourceArch = function (pkg, options) {
  var self = this;
  options = options || {};
  self.pkg = pkg;

  // Name for this sourceArchitecture. At the moment, there are really two
  // options -- main and plugin. We use these in linking
  self.archName = options.name;

  // The architecture (fully or partially qualified) that can use this
  // unibuild.
  self.arch = options.arch;

  // Packages used. The ordering is significant only for determining
  // import symbol priority (it doesn't affect load order), and a
  // given package could appear more than once in the list, so code
  // that consumes this value will need to guard appropriately. Each
  // element in the array has keys:
  // - package: the package name
  // - constraint: the constraint on the version of the package to use,
  //   as a string (may be null)
  // - unordered: If true, we don't want the package's imports and we
  //   don't want to force the package to load before us. We just want
  //   to ensure that it loads if we load.
  // - weak: If true, we don't *need* to load the other package, but
  //   if the other package ends up loaded in the target, it must
  //   be forced to load before us. We will not get its imports
  //   or plugins.
  // It is an error for both unordered and weak to be true, because
  // such a dependency would have no effect.
  //
  // In most places, instead of using 'uses' directly, you want to use
  // something like compiler.eachUsedUnibuild so you also take into
  // account implied packages.
  self.uses = options.uses || [];

  // Packages which are "implied" by using this package. If a unibuild X
  // uses this unibuild Y, and Y implies Z, then X will effectively use Z
  // as well (and get its imports and plugins).  An array of objects
  // of the same type as the elements of self.uses (although for now
  // unordered and weak are not allowed).
  self.implies = options.implies || [];

  // A function that returns the source files for this architecture. Array of
  // objects with keys "relPath" and "fileOptions". Null if loaded from
  // unipackage.
  //
  // fileOptions is optional and represents arbitrary options passed
  // to "api.add_files"; they are made available on to the plugin as
  // compileStep.fileOptions.
  //
  // This is a function rather than a literal array because for an
  // app, we need to know the file extensions registered by the
  // plugins in order to compute the sources list, so we have to wait
  // until build time (after we have loaded any plugins, including
  // local plugins in this package) to compute this.
  self.getSourcesFunc = options.getSourcesFunc || null;

  // Symbols that this architecture should export. List of symbols (as
  // strings).
  self.declaredExports = options.declaredExports || null;

  // Files and directories that we want to monitor for changes in
  // development mode, as a watch.WatchSet. In the latest refactoring
  // of the code, this does not include source files or directories,
  // but only control files such as package.js and .meteor/packages,
  // since the rest are not determined until compile time.
  self.watchSet = options.watchSet || new watch.WatchSet;

  // See the field of the same name in PackageSource.
  self.noSources = false;
};

///////////////////////////////////////////////////////////////////////////////
// PackageSource
///////////////////////////////////////////////////////////////////////////////

var PackageSource = function (catalog) {
  var self = this;

  // Which catalog this PackageSource works with.
  if (!catalog)
    throw Error("Must provide catalog");
  self.catalog = catalog;

  // The name of the package, or null for an app pseudo-package or
  // collection. The package's exports will reside in Package.<name>.
  // When it is null it is linked like an application instead of like
  // a package.
  self.name = null;

  // The path relative to which all source file paths are interpreted
  // in this package. Also used to compute the location of the
  // package's .npm directory (npm shrinkwrap state).
  self.sourceRoot = null;

  // Path that will be prepended to the URLs of all resources emitted
  // by this package (assuming they don't end up getting
  // concatenated). For non-web targets, the only effect this will
  // have is to change the actual on-disk paths of the files in the
  // bundle, for those that care to open up the bundle and look (but
  // it's still nice to get it right).
  self.serveRoot = null;


  // Package metadata. Keys are 'summary' and 'git'. Currently all of these are
  // optional.
  self.metadata = {};

  // Package version as a semver string. Optional; not all packages
  // (for example, the app) have versions.
  // XXX when we have names, maybe we want to say that all packages
  // with names have versions? certainly the reverse is true
  self.version = null;

  // The earliest version for which this package is supposed to be a
  // compatible replacement. Set if and only if version is set.
  self.earliestCompatibleVersion = null;

  // Available architectures of this package. Array of SourceArch.
  self.architectures = [];

  // The information necessary to build the plugins in this
  // package. Map from plugin name to object with keys 'name', 'use',
  // 'sources', and 'npmDependencies'.
  self.pluginInfo = {};

  // Analogous to watchSet in SourceArch but for plugins. At this
  // stage will typically contain just 'package.js'.
  self.pluginWatchSet = new watch.WatchSet;

  // npm packages used by this package (on os.* architectures only).
  // Map from npm package name to the required version of the package
  // as a string.
  self.npmDependencies = {};

  // Absolute path to a directory on disk that serves as a cache for
  // the npm dependencies, so we don't have to fetch them on every
  // build. Required not just if we have npmDependencies, but if we
  // ever could have had them in the past.
  self.npmCacheDirectory = null;

  // Dependency versions that we used last time that we built this package. If
  // the constraint solver thinks that they are still a valid set of
  // dependencies, we will use them again to build this package. This makes
  // building packages slightly more efficient and ensures repeatable builds.
  self.dependencyVersions = {dependencies: {}, pluginDependencies: {}};

  // If this package has a corresponding test package (for example,
  // underscore-test), defined in the same package.js file, store its value
  // here.
  self.testName = null;

  // Test packages are dealt with differently in the linker (and not published
  // to the catalog), so we need to keep track of them.
  self.isTest = false;

  // If this is set, we will take the currently running git checkout and bundle
  // the meteor tool from it inside this package as a tool. We will include
  // built unipackages for all the packages in uniload.ROOT_PACKAGES as well as
  // their transitive (strong) dependencies.
  self.includeTool = false;

  // If this is true, then this package has no source files. (But the converse
  // is not true: this is only set to true by one particular constructor.) This
  // is specifically so that a few pieces of code can detect the wrapper "load"
  // package that uniload uses and not do extra work that doesn't make sense in
  // the uniload context.
  self.noSources = false;

  // If this is true, the package source comes from the package server, and
  // should be treated as immutable. The only reason that we have it is so we
  // can build it, and we should expect to use exactly the same inputs
  // (package.js and version lock file) as we did when it was created. If we
  // ever need to modify it, we should throw instead.
  self.immutable = false;

  // Is this a core package? Core packages don't record version files, because
  // core packages are only ever run from checkout. For the preview release,
  // core packages do not need to specify their versions at publication (since
  // there isn't likely to be any exciting version skew yet), but we will
  // specify the correct restrictions at 0.90.
  // XXX: 0.90 package versions.
  self.isCore = false;

  // Alternatively, we can also specify noVersionFile directly. Useful for not
  // recording version files for js images of plugins, since those go into the
  // overall package versions file (if one exists). In the future, we can make
  // this option transparent to the user in package.js.
  self.noVersionFile = false;

  // The list of where that we can target. Doesn't include 'client' because
  // it is expanded into 'client.*'.
  self.allWheres = ['server', 'client.browser', 'client.cordova'];
};


_.extend(PackageSource.prototype, {
  // Make a dummy (empty) packageSource that contains nothing of interest.
  // XXX: Do we need this
  initEmpty: function (name) {
    var self = this;
    self.name = name;
  },

  // Programmatically initialize a PackageSource from scratch.
  //
  // Unlike user-facing methods of creating a package
  // (initFromPackageDir, initFromAppDir) this does not implicitly add
  // a dependency on the 'meteor' package. If you want such a
  // dependency then you must add it yourself.
  //
  // If called inside a buildmessage job, it will keep going if things
  // go wrong. Be sure to call jobHasMessages to see if it actually
  // succeeded.
  //
  // The architecture is hardcoded to be "os".
  //
  // Note that this does not set a version on the package!
  //
  // Options:
  // - sourceRoot (required if sources present)
  // - serveRoot (required if sources present)
  // - use
  // - sources (array of paths or relPath/fileOptions objects)
  // - npmDependencies
  // - npmDir
  // - dependencyVersions
  initFromOptions: function (name, options) {
    var self = this;
    self.name = name;

    if (options.sources && ! _.isEmpty(options.sources) &&
        (! options.sourceRoot || ! options.serveRoot))
      throw new Error("When source files are given, sourceRoot and " +
                      "serveRoot must be specified");
    self.sourceRoot = options.sourceRoot || path.sep;
    self.serveRoot = options.serveRoot || path.sep;

    var nodeModulesPath = null;
    meteorNpm.ensureOnlyExactVersions(options.npmDependencies);
    self.npmDependencies = options.npmDependencies;
    self.npmCacheDirectory = options.npmDir;

    var sources = _.map(options.sources, function (source) {
      if (typeof source === "string")
        return {relPath: source};
      return source;
    });

    var sourceArch = new SourceArch(self, {
      name: options.archName,
      arch: "os",
      uses: _.map(options.use, utils.splitConstraint),
      getSourcesFunc: function () { return sources; },
      nodeModulesPath: nodeModulesPath
    });

    if (!sources.length) {
      self.noSources = true;
      sourceArch.noSources = true;
    }

    self.architectures.push(sourceArch);

    if (! self._checkCrossUnibuildVersionConstraints())
      throw new Error("only one unibuild, so how can consistency check fail?");

    self.dependencyVersions = options.dependencyVersions ||
        {dependencies: {}, pluginDependencies: {}};

    self.noVersionFile = options.noVersionFile;
  },

  // Initialize a PackageSource from a package.js-style package directory. Uses
  // the name field provided and the name/test fields in the package.js file to
  // figre out if this is a test package (load from on_test) or a use package
  // (load from on_use).
  //
  // name: name of the package.
  // dir: location of directory on disk.
  // options:
  //   -requireVersion: This is a package that is going in a catalog or being
  //    published to the server. It must have a version. (as opposed to, for
  //    example, a program)
  //   -defaultVersion: The default version if none is specified. Only assigned
  //    if the version is required.
  //   -immutable: This package source is immutable. Do not write anything,
  //    including version files. Instead, its only purpose is to be used as
  //    guideline for a repeatable build.
  //   -name: override the name of this package with a different name.
  initFromPackageDir: function (dir, options) {
    var self = this;
    buildmessage.assertInCapture();
    var isPortable = true;
    options = options || {};

    // If we know what package we are initializing, we pass in a
    // name. Otherwise, we are intializing the base package specified by 'name:'
    // field in Package.Describe. In that case, it is clearly not a test
    // package. (Though we could be initializing a specific package without it
    // being a test, for a variety of reasons).
    if (options.name) {
      self.isTest = isTestName(options.name);
      self.name = options.name;
    }

    self.sourceRoot = dir;

    // If we are running from checkout we may be looking at a core package. If
    // we are, let's remember this for things like not recording version files.
    if (files.inCheckout()) {
      var packDir = path.join(files.getCurrentToolsDir(), 'packages');
      if (path.dirname(self.sourceRoot) === packDir) {
        self.isCore = true;
      }
    }
    if (! fs.existsSync(self.sourceRoot))
      throw new Error("putative package directory " + dir + " doesn't exist?");

    var fileAndDepLoader = null;
    var npmDependencies = null;

    var packageJsPath = path.join(self.sourceRoot, 'package.js');
    var code = fs.readFileSync(packageJsPath);
    var packageJsHash = Builder.sha1(code);

    var releaseRecord = null;
    var hasTests = false;

    // Any package that depends on us needs to be rebuilt if our package.js file
    // changes, because a change to package.js might add or remove a plugin,
    // which could change a file from being handled by extension vs treated as
    // an asset.
    self.pluginWatchSet.addFile(packageJsPath, packageJsHash);

    // == 'Package' object visible in package.js ==
    var Package = {
      // Set package metadata. Options:
      // - summary: for 'meteor list' & package server
      // - version: package version string (semver)
      // - earliestCompatibleVersion: version string
      // There used to be a third option documented here,
      // 'environments', but it was never implemented and no package
      // ever used it.
      describe: function (options) {
        _.each(options, function (value, key) {
          if (key === "summary" ||
              key === "git") {
            self.metadata[key] = value;
          } else if (key === "version") {
            // XXX validate that version parses -- and that it doesn't
            // contain a +!
            self.version = value;
          } else if (key === "earliestCompatibleVersion") {
            self.earliestCompatibleVersion = value;
          } else if (key === "name" && !self.isTest) {
            if (!self.name) {
              self.name = value;
            } else if (self.name !== value) {
              // Woah, so we requested a non-test package by name, and it is not
              // the name that we find inside. That's super weird.
              buildmessage.error(
                "trying to initialize a nonexistent base package " + value);
            }
          }
          else {
          // Do nothing. We might want to add some keys later, and we should err on
          // the side of backwards compatibility.
          }
        });
      },

      onUse: function (f) {
        if (!self.isTest) {
          if (fileAndDepLoader) {
            buildmessage.error("duplicate onUse handler; a package may have " +
                               "only one", { useMyCaller: true });
            // Recover by ignoring the duplicate
            return;
          }
          fileAndDepLoader = f;
        }
      },

      // Backwards compatibility for old interfaces.
      on_use: function (f) {
        this.onUse(f);
      },

      onTest: function (f) {
        // If we are not initializing the test package, then we are initializing
        // the normal package and have now noticed that it has tests. So, let's
        // register the test. This is a medium-length hack until we have new
        // control files.
        if (!self.isTest) {
          hasTests = true;
          return;
        }

        // We are initializing the test, so proceed as normal.
        if (self.isTest) {
          if (fileAndDepLoader) {
            buildmessage.error("duplicate onTest handler; a package may have " +
                               "only one", { useMyCaller: true });
            // Recover by ignoring the duplicate
            return;
          }
          fileAndDepLoader = f;
        }
      },

      // Backwards compatibility for old interfaces.
      on_test: function (f) {
        this.onTest(f);
      },

      // Define a plugin. A plugin extends the build process for
      // targets that use this package. For example, a Coffeescript
      // compiler would be a plugin. A plugin is its own little
      // program, with its own set of source files, used packages, and
      // npm dependencies.
      //
      // This is an experimental API and for now you should assume
      // that it will change frequently and radically (thus the
      // '_transitional_'). For maximum R&D velocity and for the good
      // of the platform, we will push changes that break your
      // packages that use this API. You've been warned.
      //
      // Options:
      // - name: a name for this plugin. required (cosmetic -- string)
      // - use: package to use for the plugin (names, as strings)
      // - sources: sources for the plugin (array of string)
      // - npmDependencies: map from npm package name to required
      //   version (string)
      _transitional_registerBuildPlugin: function (options) {
        // Tests don't have plugins; plugins initialized in the control file
        // belong to the package and not to the test. (This will be less
        // confusing in the new control file format).
        if (self.isTest) {
          return;
        }

        if (! ('name' in options)) {
          buildmessage.error("build plugins require a name",
                             { useMyCaller: true });
          // recover by ignoring plugin
          return;
        }

        if (options.name in self.pluginInfo) {
          buildmessage.error("this package already has a plugin named '" +
                             options.name + "'",
                             { useMyCaller: true });
          // recover by ignoring plugin
          return;
        }

        if (options.name.match(/\.\./) || options.name.match(/[\\\/]/)) {
          buildmessage.error("bad plugin name", { useMyCaller: true });
          // recover by ignoring plugin
          return;
        }

        // XXX probably want further type checking
        self.pluginInfo[options.name] = options;
      },

      includeTool: function () {
        if (!files.inCheckout()) {
          buildmessage.error("Package.includeTool() can only be used with a " +
                             "checkout of meteor");
        } else if (self.includeTool) {
          buildmessage.error("Duplicate includeTool call");
        } else {
          self.includeTool = true;
        }
      }
    };

    // == 'Npm' object visible in package.js ==
    var Npm = {
      depends: function (_npmDependencies) {
        // XXX make npmDependencies be separate between use and test, so that
        // production doesn't have to ship all of the npm modules used by test
        // code
        if (npmDependencies) {
          buildmessage.error("Npm.depends may only be called once per package",
                             { useMyCaller: true });
          // recover by ignoring the Npm.depends line
          return;
        }
        if (typeof _npmDependencies !== 'object') {
          buildmessage.error("the argument to Npm.depends should be an " +
                             "object, like this: {gcd: '0.0.0'}",
                             { useMyCaller: true });
          // recover by ignoring the Npm.depends line
          return;
        }

        // don't allow npm fuzzy versions so that there is complete
        // consistency when deploying a meteor app
        //
        // XXX use something like seal or lockdown to have *complete*
        // confidence we're running the same code?
        try {
          meteorNpm.ensureOnlyExactVersions(_npmDependencies);
        } catch (e) {
          buildmessage.error(e.message, { useMyCaller: true, downcase: true });
          // recover by ignoring the Npm.depends line
          return;
        }

        npmDependencies = _npmDependencies;
      },

      require: function (name) {
        var nodeModuleDir = path.join(self.sourceRoot,
                                      '.npm', 'package', 'node_modules', name);
        if (fs.existsSync(nodeModuleDir)) {
          return require(nodeModuleDir);
        } else {
          try {
            return require(name); // from the dev bundle
          } catch (e) {
            buildmessage.error("can't find npm module '" + name +
                               "'. Did you forget to call 'Npm.depends'?",
                               { useMyCaller: true });
            // recover by, uh, returning undefined, which is likely to
            // have some knock-on effects
            return undefined;
          }
        }
      }
    };

    try {
      files.runJavaScript(code.toString('utf8'), {
        filename: 'package.js',
        symbols: { Package: Package, Npm: Npm }
      });
    } catch (e) {
      buildmessage.exception(e);

      // Could be a syntax error or an exception. Recover by
      // continuing as if package.js is empty. (Pressing on with
      // whatever handlers were registered before the exception turns
      // out to feel pretty disconcerting -- definitely violates the
      // principle of least surprise.) Leave the metadata if we have
      // it, though.
      fileAndDepLoader = null;
      self.pluginInfo = {};
      npmDependencies = null;
    }

    // In the past, we did not require a Package.Describe.name field. So, it is
    // possible that we are initializing a package that doesn't use it and
    // expects us to be implicit about it.
    if (!self.name) {
      // For backwards-compatibility, we will take the package name from the
      // directory of the package. That was what we used to do: in fact, we used
      // to only do that.
      self.name = path.basename(dir);
    }

    // Check to see if our name is valid.

    try {
      utils.validatePackageName(self.name);
    } catch (e) {
      if (!e.versionParserError)
        throw e;
      buildmessage.error(e.message);
    }

    if (self.version === null && options.requireVersion) {
      if (options.defaultVersion) {
        self.version = options.defaultVersion;
      } else if (! buildmessage.jobHasMessages()) {
        // Only write the error if there have been no errors so
        // far. (Otherwise if there is a parse error we'll always get
        // this message, because we won't have been able to run any
        // code.)
        buildmessage.error("A version must be specified for the package. " +
                           "Set it with Package.describe.");
      }
      // Recover by leaving the version unset. This is sort of
      // unfortunate (it means that whereever we work with Package
      // objects, we need to consider the possibility that their
      // version is not set) but short of failing the build we have no
      // alternative. Using a dummy version like "1.0.0" would cause
      // endless confusion and a fake version like "unknown" wouldn't
      // parse as semver. Anyway, apps don't have versions, so it's
      // not like we didn't already have to think about this case.
    }

    if (self.version !== null && typeof(self.version) !== "string") {
      if (!buildmessage.jobHasMessages()) {
        buildmessage.error("The package version (specified with "
                           + "Package.describe) must be a string.");
      }
      // Recover by pretending there was no version (see above).
      self.version = null;
    }

    if (self.version !== null) {
      var parsedVersion = semver.parse(self.version);
      if (!parsedVersion) {
        if (!buildmessage.jobHasMessages()) {
          buildmessage.error(
            "The package version (specified with Package.describe) must be "
              + "valid semver (see http://semver.org/).");
        }
        // Recover by pretending there was no version (see above).
        self.version = null;
      } else if (parsedVersion.build.length) {
        if (!buildmessage.jobHasMessages()) {
          buildmessage.error(
            "The package version (specified with Package.describe) may not "
            + "contain a plus-separated build ID.");
        }
        // Recover by pretending there was no version (see above).
        self.version = null;
      }
    }

    if (self.version !== null && ! self.earliestCompatibleVersion) {
      self.earliestCompatibleVersion =
        earliestCompatible(self.version);
    }

    // source files used
    var sources = {};

    // symbols exported
    var exports = {};

    // packages used and implied (keys are 'package', 'unordered', and
    // 'weak').  an "implied" package is a package that will be used by a unibuild
    // which uses us.
    var uses = {};
    var implies = {};

    _.each(self.allWheres, function (where) {
      sources[where] = [];
      exports[where] = [];
      uses[where] = [];
      implies[where] = [];
    });

    // Iterates over the list of target archs and calls f(arch) for all archs
    // that match an element of 'wheres'.
    var forAllMatchingWheres = function (wheres, f) {
      _.each(wheres, function (where) {
        _.each(self.allWheres, function (matchWhere) {
          if (archinfo.matches(matchWhere, where)) {
            f(matchWhere);
          }
        });
      });
    };

    // For this old-style, on_use/on_test/where-based package, figure
    // out its dependencies by calling its on_xxx functions and seeing
    // what it does.
    //
    // We have a simple strategy. Call its on_xxx handler with no
    // 'where', which is what happens when the package is added
    // directly to an app, and see what files it adds to the client
    // and the server. When a package is used, include it in both the client
    // and the server by default. This simple strategy doesn't capture even
    // 10% of the complexity possible with on_use, on_test, and where, but
    // probably is sufficient for virtually all packages that actually
    // exist in the field, if not every single one. #OldStylePackageSupport

    if (fileAndDepLoader) {
      var toArray = function (x) {
        if (x instanceof Array)
          return x;
        return x ? [x] : [];
      };

      var toWhereArray = function (where) {
        if (!(where instanceof Array)) {
          where = where ? [where] : self.allWheres;
        }
        where = _.uniq(where);
        _.each(where, function (inputWhere) {
          var isMatch = _.any(_.map(self.allWheres, function (actualWhere) {
            return archinfo.matches(actualWhere, inputWhere);
          }));
          if (! isMatch) {
            buildmessage.error(
              "Invalid 'where' argument: '" + inputWhere + "'",
              // skip toWhereArray in addition to the actual API function
              {useMyCaller: 2});
          }
        });
        return where;
      };

      var api = {
        // Called when this package wants to make another package be
        // used. Can also take literal package objects, if you have
        // anonymous packages you want to use (eg, app packages)
        //
        // @param where 'web', 'web.browser', 'web.cordova', 'server',
        // or an array of those.
        // The default is ['web', 'server'].
        //
        // options can include:
        //
        // - unordered: if true, don't require this package to load
        //   before us -- just require it to be loaded anytime. Also
        //   don't bring this package's imports into our
        //   namespace. If false, override a true value specified in
        //   a previous call to use for this package name. (A
        //   limitation of the current implementation is that this
        //   flag is not tracked per-environment or per-role.)  This
        //   option can be used to resolve circular dependencies in
        //   exceptional circumstances, eg, the 'meteor' package
        //   depends on 'handlebars', but all packages (including
        //   'handlebars') have an implicit dependency on
        //   'meteor'. Internal use only -- future support of this
        //   is not guaranteed. #UnorderedPackageReferences
        //
        // - weak: if true, don't require this package to load at all, but if
        //   it's going to load, load it before us.  Don't bring this
        //   package's imports into our namespace and don't allow us to use
        //   its plugins. (Has the same limitation as "unordered" that this
        //   flag is not tracked per-environment or per-role; this may
        //   change.)
        use: function (names, where, options) {
          // Support `api.use(package, {weak: true})` without where.
          if (_.isObject(where) && !_.isArray(where) && !options) {
            options = where;
            where = null;
          }
          options = options || {};

          names = toArray(names);
          where = toWhereArray(where);

          // A normal dependency creates an ordering constraint and a "if I'm
          // used, use that" constraint. Unordered dependencies lack the
          // former; weak dependencies lack the latter. There's no point to a
          // dependency that lacks both!
          if (options.unordered && options.weak) {
            buildmessage.error(
              "A dependency may not be both unordered and weak.",
              { useMyCaller: true });
            // recover by ignoring
            return;
          }

          _.each(names, function (name) {
            forAllMatchingWheres(where, function (w) {
              uses[w].push(_.extend(utils.splitConstraint(name), {
                unordered: options.unordered || false,
                weak: options.weak || false
              }));
            });
          });
        },

        // Called when this package wants packages using it to also use
        // another package.  eg, for umbrella packages which want packages
        // using them to also get symbols or plugins from their components.
        imply: function (names, where) {
          names = toArray(names);
          where = toWhereArray(where);

          _.each(names, function (name) {
            forAllMatchingWheres(where, function (w) {
              // We don't allow weak or unordered implies, since the main
              // purpose of imply is to provide imports and plugins.
              implies[w].push(utils.splitConstraint(name));
            });
          });
        },

        // Top-level call to add a source file to a package. It will
        // be processed according to its extension (eg, *.coffee
        // files will be compiled to JavaScript).
        addFiles: function (paths, where, fileOptions) {
          paths = toArray(paths);
          where = toWhereArray(where);

          _.each(paths, function (path) {
            forAllMatchingWheres(where, function (w) {
              var source = {relPath: path};
              if (fileOptions)
                source.fileOptions = fileOptions;
              sources[w].push(source);
            });
          });
        },

        // Use this release to resolve unclear dependencies for this package. If
        // you don't fill in dependencies for some of your implies/uses, we will
        // look at the packages listed in the release to figure that out.
        versionsFrom: function (release) {
          if (releaseRecord) {
            buildmessage.error("api.versionsFrom may only be specified once.",
                               { useMyCaller: true });
            // recover by ignoring
            return;
          }

          // If you don't specify a track, use our default.
          if (release.indexOf('@') === -1) {
            release = catalog.DEFAULT_TRACK + "@" + release;
          }

          var relInf = release.split('@');
          // XXX: Error handling
          if (relInf.length !== 2)
            throw new Error("Incorrect release spec");
          // XXX: We pass in true to override the fact that we know that teh
          // catalog may not be initialized, but we are pretty sure that the
          // releases are there anyway. This is not the right way to do this
          // long term.
          releaseRecord = catalog.official.getReleaseVersion(
            relInf[0], relInf[1], true);
          if (!releaseRecord) {
            buildmessage.error("Unknown release "+ release);
           }
        },

        // Export symbols from this package.
        //
        // @param symbols String (eg "Foo") or array of String
        // @param where 'web', 'server', 'web.browser', 'web.cordova'
        // or an array of those.
        // The default is ['web', 'server'].
        // @param options 'testOnly', boolean.
        export: function (symbols, where, options) {
          // Support `api.export("FooTest", {testOnly: true})` without
          // where.
          if (_.isObject(where) && !_.isArray(where) && !options) {
            options = where;
            where = null;
          }
          options = options || {};

          symbols = toArray(symbols);
          where = toWhereArray(where);

          _.each(symbols, function (symbol) {
            // XXX be unicode-friendlier
            if (!symbol.match(/^([_$a-zA-Z][_$a-zA-Z0-9]*)$/)) {
              buildmessage.error("Bad exported symbol: " + symbol,
                                 { useMyCaller: true });
              // recover by ignoring
              return;
            }
            forAllMatchingWheres(where, function (w) {
              exports[w].push({name: symbol, testOnly: !!options.testOnly});
            });
          });
        }
      };

      // XXX COMPAT WITH 0.8.x
      api.add_files = api.addFiles;

      try {
        fileAndDepLoader(api);
      } catch (e) {
        buildmessage.exception(e);
        // Recover by ignoring all of the source files in the
        // packages and any remaining handlers. It violates the
        // principle of least surprise to half-run a handler
        // and then continue.
        sources = {};
        _.each(self.allWheres, function (where) {
          sources[where] = [];
        });

        fileAndDepLoader = null;
        self.pluginInfo = {};
        npmDependencies = null;
      }
    }

    // If we have specified a release, then we should go through the
    // dependencies and fill in the unspecified constraints with the versions in
    // the release (if possible).
    if (releaseRecord) {
      var packages = releaseRecord.packages;

      // Given a dependency object with keys package (the name of the package)
      // and constraint (the version constraint), if the constraint is null,
      // look in the packages field in the release record and fill in from
      // there.
      var setFromRel = function (dep) {
        if (! dep.constraint && _.has(packages, dep.package)) {
          dep.constraint = packages[dep.package];
        };
        return dep;
      };

      // For all implies and uses, fill in the unspecified dependencies from the
      // release.
      _.each(self.allWheres, function (label) {
        uses[label] = _.map(uses[label], setFromRel);
        implies[label] = _.map(implies[label], setFromRel);
      });
     };

    // Make sure that if a dependency was specified in multiple
    // unibuilds, the constraint is exactly the same.
    if (! self._checkCrossUnibuildVersionConstraints()) {
      // A build error was written. Recover by ignoring the
      // fact that we have differing constraints.
    }

    // Save information about npm dependencies. To keep metadata
    // loading inexpensive, we won't actually fetch them until build
    // time.

    // We used to put the cache directly in .npm, but in linker-land,
    // the package's own NPM dependencies go in .npm/package and build
    // plugin X's goes in .npm/plugin/X. Notably, the former is NOT an
    // ancestor of the latter, so that a build plugin does NOT see the
    // package's node_modules.  XXX maybe there should be separate NPM
    // dirs for use vs test?
    self.npmCacheDirectory =
      path.resolve(path.join(self.sourceRoot, '.npm', 'package'));
    self.npmDependencies = npmDependencies;

    // If this package was previously built with pre-linker versions,
    // it may have files directly inside `.npm` instead of nested
    // inside `.npm/package`. Clean them up if they are there. (Kind
    // of grody to do this here but it'll be fine for now, especially
    // since this is only for compatibility with very old versions of
    // Meteor.)
    var preLinkerFiles = [
      'npm-shrinkwrap.json', 'README', '.gitignore', 'node_modules'];
    _.each(preLinkerFiles, function (f) {
      files.rm_recursive(path.join(self.sourceRoot, '.npm', f));
    });

    // Create source architectures, one for the server and one for each web
    // arch.
    _.each(self.allWheres, function (where) {
      var arch = mapWhereToArch(where);

      // Everything depends on the package 'meteor', which sets up
      // the basic environment) (except 'meteor' itself, and js-analyze
      // which needs to be loaded by the linker).
      // XXX add a better API for js-analyze to declare itself here
      if (self.name !== "meteor" && self.name !== "js-analyze" &&
          !process.env.NO_METEOR_PACKAGE) {
        // Don't add the dependency if one already exists. This allows the
        // package to create an unordered dependency and override the one that
        // we'd add here. This is necessary to resolve the circular dependency
        // between meteor and underscore (underscore has an unordered
        // dependency on meteor dating from when the .js extension handler was
        // in the "meteor" package).
        var alreadyDependsOnMeteor =
              !! _.find(uses[where], function (u) {
                return u.package === "meteor";
              });
        if (! alreadyDependsOnMeteor)
          uses[where].unshift({ package: "meteor" });
      }

      // Each unibuild has its own separate WatchSet. This is so that, eg, a test
      // unibuild's dependencies doesn't end up getting merged into the
      // pluginWatchSet of a package that uses it: only the use unibuild's
      // dependencies need to go there!
      var watchSet = new watch.WatchSet();
      watchSet.addFile(packageJsPath, packageJsHash);

      self.architectures.push(new SourceArch(self, {
        name: "main",
        arch: arch,
        uses: uses[where],
        implies: implies[where],
        getSourcesFunc: function () { return sources[where]; },
        declaredExports: exports[where],
        watchSet: watchSet
      }));
    });

    // If we have built this before, read the versions that we ended up using.
    var versionsFile = self.versionsFilePath();
    if (versionsFile && fs.existsSync(versionsFile)) {
      try {
        var data = fs.readFileSync(versionsFile, 'utf8');
        var dependencyData = JSON.parse(data);
        self.dependencyVersions = {
          "pluginDependencies": _.object(dependencyData.pluginDependencies),
          "dependencies": _.object(dependencyData.dependencies),
          "toolVersion": dependencyData.toolVersion
          };
      } catch (err) {
        // We 'recover' by not reading the dependency versions. Log a line about
        // it in case it is unexpected. We don't buildmessage because it doesn't
        // really interrupt our workflow, but the user might want to know about
        // it anyway. We shouldn't get here unless, for example, the user tried
        // to manually edit the json file incorrectly, or there is some bizarre
        // ondisk corruption.
        console.log("Could not read versions file for " + self.name +
                    ". Recomputing dependency versions from scratch.");
      }
    };

    // If immutable is set, then we should make a note to never mutate this
    // packageSource. We should never change its dependency versions, for
    // example.
    if (options.immutable) {
      self.immutable = true;
    };

    // Serve root of the package.
    self.serveRoot = path.join(path.sep, 'packages', self.name);

    // Name of the test.
    if (hasTests) {
      self.testName = genTestName(self.name);
    }
  },

  // Initialize a package from an application directory (has .meteor/packages).
  initFromAppDir: function (appDir, ignoreFiles) {
    var self = this;
    appDir = path.resolve(appDir);
    self.name = null;
    self.sourceRoot = appDir;
    self.serveRoot = path.sep;

    _.each(self.allWheres, function (where) {
      // Determine used packages
      var project = require('./project.js').project;
      var names = project.getConstraints();
      var arch = mapWhereToArch(where);
      // XXX what about /client.browser/* etc, these directories could also
      // be for specific client targets.

      // Create unibuild
      var sourceArch = new SourceArch(self, {
        name: where,
        arch: arch,
        uses: _.map(names, utils.dealConstraint)
      });
      self.architectures.push(sourceArch);

      // Watch control files for changes
      // XXX this read has a race with the actual reads that are used
      _.each([path.join(appDir, '.meteor', 'packages'),
              path.join(appDir, '.meteor', 'release')], function (p) {
                watch.readAndWatchFile(sourceArch.watchSet, p);
              });

      // Determine source files
      sourceArch.getSourcesFunc = function (extensions, watchSet) {
        var sourceInclude = _.map(
          extensions,
          function (isTemplate, ext) {
            return new RegExp('\\.' + utils.quotemeta(ext) + '$');
          }
        );
        var sourceExclude = [/^\./].concat(ignoreFiles);

        // Wrapper around watch.readAndWatchDirectory which takes in and returns
        // sourceRoot-relative directories.
        var readAndWatchDirectory = function (relDir, filters) {
          filters = filters || {};
          var absPath = path.join(self.sourceRoot, relDir);
          var contents = watch.readAndWatchDirectory(watchSet, {
            absPath: absPath,
            include: filters.include,
            exclude: filters.exclude
          });
          return _.map(contents, function (x) {
            return path.join(relDir, x);
          });
        };

        // Read top-level source files.
        var sources = readAndWatchDirectory('', {
          include: sourceInclude,
          exclude: sourceExclude
        });

        var otherUnibuildRegExp =
              (where === "server" ? /^client\/$/ : /^server\/$/);

        // The paths that we've called checkForInfiniteRecursion on.
        var seenPaths = {};
        // Used internally by fs.realpathSync as an optimization.
        var realpathCache = {};
        var checkForInfiniteRecursion = function (relDir) {
          var absPath = path.join(self.sourceRoot, relDir);
          try {
            var realpath = fs.realpathSync(absPath, realpathCache);
          } catch (e) {
            if (!e || e.code !== 'ELOOP')
              throw e;
            // else leave realpath undefined
          }
          if (realpath === undefined || _.has(seenPaths, realpath)) {
            buildmessage.error("Symlink cycle detected at " + relDir);
            // recover by returning no files
            return true;
          }
          seenPaths[realpath] = true;
          return false;
        };

        // Read top-level subdirectories. Ignore subdirectories that have
        // special handling.
        var sourceDirectories = readAndWatchDirectory('', {
          include: [/\/$/],
          exclude: [/^packages\/$/, /^programs\/$/, /^tests\/$/,
                    /^public\/$/, /^private\/$/,
                    otherUnibuildRegExp].concat(sourceExclude)
        });
        checkForInfiniteRecursion('');

        while (!_.isEmpty(sourceDirectories)) {
          var dir = sourceDirectories.shift();

          // remove trailing slash
          dir = dir.substr(0, dir.length - 1);

          if (checkForInfiniteRecursion(dir))
            return [];  // pretend we found no files

          // Find source files in this directory.
          Array.prototype.push.apply(sources, readAndWatchDirectory(dir, {
            include: sourceInclude,
            exclude: sourceExclude
          }));

          // Find sub-sourceDirectories. Note that we DON'T need to ignore the
          // directory names that are only special at the top level.
          Array.prototype.push.apply(sourceDirectories, readAndWatchDirectory(dir, {
            include: [/\/$/],
            exclude: [/^tests\/$/, otherUnibuildRegExp].concat(sourceExclude)
          }));
        }

        // We've found all the source files. Sort them!
        var templateExtensions = [];
        _.each(extensions, function (isTemplate, ext) {
          isTemplate && templateExtensions.push(ext);
        });
        sources.sort(loadOrderSort(templateExtensions));

        // Convert into relPath/fileOptions objects.
        sources = _.map(sources, function (relPath) {
          var sourceObj = {relPath: relPath};

          // Special case: on the client, JavaScript files in a
          // `client/compatibility` directory don't get wrapped in a closure.
          if (archinfo.matches(arch, "web") && relPath.match(/\.js$/)) {
            var clientCompatSubstr =
                  path.sep + 'client' + path.sep + 'compatibility' + path.sep;
            if ((path.sep + relPath).indexOf(clientCompatSubstr) !== -1)
              sourceObj.fileOptions = {bare: true};
          }
          return sourceObj;
        });

        // Now look for assets for this unibuild.
        var assetDir = archinfo.matches(arch, "web") ? "public" : "private";
        var assetDirs = readAndWatchDirectory('', {
          include: [new RegExp('^' + assetDir + '/$')]
        });

        if (!_.isEmpty(assetDirs)) {
          if (!_.isEqual(assetDirs, [assetDir + '/']))
            throw new Error("Surprising assetDirs: " + JSON.stringify(assetDirs));

          while (!_.isEmpty(assetDirs)) {
            dir = assetDirs.shift();
            // remove trailing slash
            dir = dir.substr(0, dir.length - 1);

            if (checkForInfiniteRecursion(dir))
              return [];  // pretend we found no files

            // Find asset files in this directory.
            var assetsAndSubdirs = readAndWatchDirectory(dir, {
              include: [/.?/],
              // we DO look under dot directories here
              exclude: ignoreFiles
            });

            _.each(assetsAndSubdirs, function (item) {
              if (item[item.length - 1] === '/') {
                // Recurse on this directory.
                assetDirs.push(item);
              } else {
                // This file is an asset.
                sources.push({
                  relPath: item,
                  fileOptions: {
                    isAsset: true
                  }
                });
              }
            });
          }
        }

        return sources;
      };
    });

    if (! self._checkCrossUnibuildVersionConstraints()) {
      // should never happen since we created the unibuilds from
      // .meteor/packages, which doesn't have a way to express
      // different constraints for different unibuilds
      throw new Error("conflicting constraints in a package?");
    }
  },

  // True if the package defines any plugins.
  containsPlugins: function () {
    var self = this;
    return ! _.isEmpty(self.pluginInfo);
  },

  // Return dependency metadata for all unibuilds, in the format needed
  // by the package catalog.
  //
  // Options:
  // - logError: if true, if something goes wrong, log a buildmessage
  //   and return null rather than throwing an exception.
  // - skipWeak: omit weak dependencies
  // - skipUnordered: omit unordered dependencies
  getDependencyMetadata: function (options) {
    var self = this;
    options = options || {};
    var ret = self._computeDependencyMetadata(options);
    if (! ret) {
      if (options.logError)
        return null;
      else
        throw new Error("inconsistent dependency constraint across unibuilds?");
    }
    return ret;
  },

  // Record the versions of the dependencies that we used to actually build the
  // package on disk and save them into the packageSource. Next time we build
  // the package, we will look at them for optimization & repeatable builds.
  //
  // constraints:
  // - dependencies: results of running the constraint solver on the dependency
  //   metadata of this package
  // - pluginDependenciess: results of running the constraint solver on the
  //   plugin dependency data for this package.
  // currentTool: string of the tool version that we are using
  //  (ex: meteor-tool@1.0.0)
  recordDependencyVersions: function (constraints, currentTool) {
    var self = this;
    var versions = _.extend(constraints, {"toolVersion": currentTool });

    // If we don't have a versions file path (because, probably, we are not
    // supposed to record one for this package), then we clearly cannot record
    // on.
    var versionsFile = self.versionsFilePath();
    if (!versionsFile) {
      return;
    }

    // If nothing has changed, don't bother rewriting the versions file.
    if (_.isEqual(self.dependencyVersions, versions)) return;

    // If something has changed, and this is an immutable package source, then
    // we have done something terribly, terribly wrong. Throw.
    if (self.immutable) {
      throw new Error(
        "Version lock for " + self.name + " should never change. Recorded as "
          + JSON.stringify(self.dependencyVersions) + ", calculated as "
          + JSON.stringify(versions));
    };

    // In case we need to rebuild from this package Source, it will be
    // convenient to keep the results on hand and not reread from disk.
    self.dependencyVersions = _.clone(versions);

    // There is always a possibility that we might want to change the format of
    // this file, so let's keep track of what it is.
    versions["format"] = "1.0";

    // When we write versions to disk, we want to alphabetize by package name,
    // both for readability and also for consistency (so two packages built with
    // the same versions have the exact same versions file).
    //
    // This takes in an object mapping key to value and returns an array of
    // <key, value> pairs, alphabetized by key.
    var alphabetize = function (object) {
      return _.sortBy(_.pairs(object),
        function (pair) {
           return pair[0];
        });
    };

    // Both plugins and direct dependencies are objects mapping package name to
    // version number. When we write them on disk, we will convert them to
    // arrays of <packageName, version> and alphabetized by packageName.
    versions["dependencies"] = alphabetize(versions["dependencies"]);
    versions["pluginDependencies"]
      = alphabetize(versions["pluginDependencies"]);

    try {
      // Currently, unnamed packages are apps, and apps have a different
      // versions file format and semantics. So, we don't need to and cannot
      // record dependencyVersions for those, and that's OK for now.
      //
      // Uniload sets its sourceRoot to "/", which is a little strange. Uniload
      // does not need to store dependency versions either.
      if (self.name && self.sourceRoot !== "/") {
        fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2), 'utf8');
      }
    } catch (e) {
      // We 'recover' by not saving the dependency versions. Log a line about it
      // in case it is unexpected. We don't buildmessage because it doesn't
      // really interrupt our workflow, but the user might want to know about it
      // anyway.
      console.log("Could not write versions file for ", self.name);
    }
 },

  // Returns the filepath to the file containing the version lock for this
  // package, or null if we don't think that this package should have
  // a versions file.
  versionsFilePath : function () {
    var self = this;
    // If we are running from checkout and looking at a core package,
    // don't record its versions. We know what its versions are, and having
    // those extra version lock files is kind of annoying.
    //
    // (This is a medium-term hack. We can build something more modular if
    //  there is any demand for it)
    // See #PackageVersionFilesHack
    if (self.isCore) {
      return null;
    }

    // If we have specified to not record a version file for this package,
    // don't. Currently used to avoid recording version files for separately
    // compiled plugins.
    if (self.noVersionFile) {
      return null;
    }

    // Lastly, we don't record versions files for test packages because we don't
    // see any particularly good reason to do it, and it is confusing to the
    // users.
    if (self.isTest) {
      return null;
    }

    // All right, fine, return a path to the versions file.
    return path.join(self.sourceRoot, "versions.json");
  },

  // If dependencies aren't consistent across unibuilds, return false and
  // also log a buildmessage error if inside a buildmessage job. Else
  // return true.
  // XXX: Check that this is used when refactoring is done.
  _checkCrossUnibuildVersionConstraints: function () {
    var self = this;
    return !! self._computeDependencyMetadata({ logError: true });
  },

  // Compute the return value for getDependencyMetadata, or return
  // null if there is a dependency that doesn't have the same
  // constraint across all unibuilds (and, if logError is true, log a
  // buildmessage error).
  //
  // For options, see getDependencyMetadata.
  _computeDependencyMetadata: function (options) {
    var self = this;
    options = options || {};

    var dependencies = {};
    var allConstraints = {}; // for error reporting. package name to array
    var failed = false;

    _.each(self.architectures, function (arch) {
      // We need to iterate over both uses and implies, since implied packages
      // also constitute dependencies.
      var processUse = function (implied, use) {
        // We can't really have a weak implies (what does that even mean?) but
        // we check for that elsewhere.
        if ((use.weak && options.skipWeak) ||
            (use.unordered && options.skipUnordered))
          return;

        if (!_.has(dependencies, use.package)) {
          dependencies[use.package] = {
            constraint: null,
            references: []
          };
          allConstraints[use.package] = [];
        }
        var d = dependencies[use.package];

        if (use.constraint) {
          allConstraints[use.package].push(use.constraint);

          if (d.constraint === null) {
            d.constraint = use.constraint;
          } else if (d.constraint !== use.constraint) {
            failed = true;
          }
        }

        var reference = {
          arch: archinfo.withoutSpecificOs(arch.arch)
        };
        if (use.weak) {
          reference.weak = true;
        }
        if (use.unordered) {
          reference.unordered = true;
        }
        if (implied) {
          reference.implied = true;
        }
        d.references.push(reference);
      };
      _.each(arch.uses, _.partial(processUse, false));
      _.each(arch.implies, _.partial(processUse, true));
    });

    if (failed && options.logError) {
      _.each(allConstraints, function (constraints, name) {
        constraints = _.uniq(constraints);
        if (constraints.length > 1) {
          buildmessage.error(
            "The version constraint for a dependency must be the same " +
              "at every place it is mentioned in a package. " +
              "'" + name + "' is constrained both as "  +
              constraints.join(' and ') + ". Change them to match.");
          // recover by returning false (the caller had better detect
          // this and use its own recovery logic)
        }
      });
    }

    return failed ? null : dependencies;
  }
});

module.exports = PackageSource;
