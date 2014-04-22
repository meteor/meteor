var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var sourcemap = require('source-map');

var files = require('./files.js');
var utils = require('./utils.js');
var watch = require('./watch.js');
var project = require('./project.js');
var buildmessage = require('./buildmessage.js');
var meteorNpm = require('./meteor-npm.js');
var Builder = require('./builder.js');
var archinfo = require('./archinfo.js');

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
var quotemeta = function (str) {
  return String(str).replace(/(\W)/g, '\\$1');
};

// Given a semver version string, return the earliest semver for which
// we are a replacement. This is used to compute the default
// earliestCompatibleVersion.
// XXX: move to utils?
var earliestCompatible = function (version) {
  // This is not the place to check to see if version parses as
  // semver. That should have been done when we first received it from
  // the user.
  var m = version.match(/^(\d)+\./);
  if (! m)
    throw new Error("not a valid version: " + version);
  return m[1] + ".0.0";
};

// A sort comparator to order files into load order.
var loadOrderSort = function (a, b) {
  // XXX HUGE HACK --
  // push html (template) files ahead of everything else. this is
  // important because the user wants to be able to say
  // Template.foo.events = { ... }
  //
  // maybe all of the templates should go in one file? packages should
  // probably have a way to request this treatment (load order
  // dependency tags?) .. who knows.
  var ishtml_a = path.extname(a) === '.html';
  var ishtml_b = path.extname(b) === '.html';
  if (ishtml_a !== ishtml_b) {
    return (ishtml_a ? -1 : 1);
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
  // options -- main and plugin.
  self.archName = options.name;

  // The architecture (fully or partially qualified) that can use this
  // build.
  self.arch = options.arch;

  // Packages used. The ordering is significant only for determining
  // import symbol priority (it doesn't affect load order), and a
  // given package could appear more than once in the list, so code
  // that consumes this value will need to guard appropriately. Each
  // element in the array has keys:
  // - package: the package name
  // - constraint: the constraint on the version of the package to use,
  //   as a string (may be null)
  // - build: the build name (optional)
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
  // something like compiler.eachUsedBuild so you also take into
  // account implied packages.
  self.uses = options.uses || [];

  // Packages which are "implied" by using this package. If a build X
  // uses this build Y, and Y implies Z, then X will effectively use Z
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
};

///////////////////////////////////////////////////////////////////////////////
// PackageSource
///////////////////////////////////////////////////////////////////////////////

var PackageSource = function () {
  var self = this;

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
  // concatenated). For non-browser targets, the only effect this will
  // have is to change the actual on-disk paths of the files in the
  // bundle, for those that care to open up the bundle and look (but
  // it's still nice to get it right).
  self.serveRoot = null;

  // Package metadata. Keys are 'summary' and 'internal'. Currently
  // both of these are optional.
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

  // Map from a system architecture to the list of SourceArch names that
  // should be included by default if this package is used without specifying an
  // architecture by default. (eg: "ddp" vs "ddp.server"). The most specific
  // sourceArch will be used.
  self.defaultArches = {};

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
  self.dependencyVersions = {dependencies: {}, plugins: {}};
};


_.extend(PackageSource.prototype, {
  // Make a dummy (empty) packageSource that contains nothing of interest.
  // XXX: Do we need this
  initEmpty: function (name) {
    var self = this;
    self.name = name;
    self.defaultArches = {'': []};
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
  // - archName
  // - use
  // - sources (array of paths or relPath/fileOptions objects)
  // - npmDependencies
  // - npmDir
  // - dependencyVersions
  initFromOptions: function (name, options) {
    var self = this;
    self.name = name;

    if (options.sources && ! _.isEmpty(options.sources.length) &&
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

    var build = new SourceArch(self, {
      name: options.archName,
      arch: "os",
      uses: _.map(options.use, utils.parseSpec),
      getSourcesFunc: function () { return sources; },
      nodeModulesPath: nodeModulesPath
    });

    self.architectures.push(build);

    if (! self._checkCrossBuildVersionConstraints())
      throw new Error("only one build, so how can consistency check fail?");

    self.defaultArches = {'os': [options.archName]};

    self.dependencyVersions = options.dependencyVersions ||
        {dependencies: {}, plugins: {}};
  },

  // Initialize a PackageSource from a package.js-style package directory. Uses
  // the name field provided and the name/test fields in the package.js file to
  // figre out if this is a test package (load from on_test) or a use package
  // (load from on_use).
  //
  // name: name of the package.
  // dir: location of directory on disk.
  initFromPackageDir: function (name, dir) {
    var self = this;
    var isPortable = true;
    self.name = name;
    self.sourceRoot = dir;
    self.serveRoot = path.join(path.sep, 'packages', name);

    if (! fs.existsSync(self.sourceRoot))
      throw new Error("putative package directory " + dir + " doesn't exist?");

    var fileAndDepLoader = null;
    var npmDependencies = null;

    var packageJsPath = path.join(self.sourceRoot, 'package.js');
    var code = fs.readFileSync(packageJsPath);
    var packageJsHash = Builder.sha1(code);

    // Any package that depends on us needs to be rebuilt if our package.js file
    // changes, because a change to package.js might add or remove a plugin,
    // which could change a file from being handled by extension vs treated as
    // an asset.
    self.pluginWatchSet.addFile(packageJsPath, packageJsHash);

    // == 'Package' object visible in package.js ==
    var Package = {
      // Set package metadata. Options:
      // - summary: for 'meteor list'
      // - internal: if true, hide in list
      // - version: package version string (semver)
      // - test: name of the test package (string)
      // - earliestCompatibleVersion: version string
      // There used to be a third option documented here,
      // 'environments', but it was never implemented and no package
      // ever used it.
      describe: function (options) {
        _.each(options, function (value, key) {
          if (key === "summary" || key === "internal")
            self.metadata[key] = value;
          else if (key === "version")
            // XXX validate that version parses -- and that it doesn't
            // contain a +!
            self.version = value;
          else if (key === "earliestCompatibleVersion")
            self.earliestCompatibleVersion = value;
          else if (key === "name") {
            // Do nothing, actually. This tells us that we are not building a
            // test package, but that's roughly what we assumed anyway.
          }
          else if (key === "test") {
            if (name === value) {
              self.isTest = true;
            } else {
              self.test = value;
            }
          }
          else
            buildmessage.error("unknown attribute '" + key + "' " +
                               "in package description");
        });
      },

      on_use: function (f) {
        if (!self.isTest) {
          if (fileAndDepLoader) {
            buildmessage.error("duplicate on_use handler; a package may have " +
                               "only one", { useMyCaller: true });
            // Recover by ignoring the duplicate
            return;
          }
          fileAndDepLoader = f;
        }
      },

      on_test: function (f) {
        if (self.isTest) {
          if (fileAndDepLoader) {
            buildmessage.error("duplicate on_test handler; a package may have " +
                               "only one", { useMyCaller: true });
            // Recover by ignoring the duplicate
            return;
          }
          fileAndDepLoader = f;
        }
      },

      // XXX COMPAT WITH 0.6.4
      // extension doesn't contain a dot
      register_extension: function () {
        buildmessage.error(
          "Package.register_extension() is no longer supported. Use " +
            "Package._transitional_registerBuildPlugin instead.",
              { useMyCaller: true });
            // recover by ignoring
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
      }
    };

    // == 'Npm' object visible in package.js ==
    var Npm = {
      depends: function (_npmDependencies) {
        // XXX make npmDependencies be per build, so that production
        // doesn't have to ship all of the npm modules used by test
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

    if (! self.version) {
      if (! buildmessage.jobHasMessages()) {
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

    if (self.version && ! self.earliestCompatibleVersion) {
      self.earliestCompatibleVersion =
        earliestCompatible(self.version);
    }

    // source files used
    var sources = {client: [], server: []};

    // symbols exported
    var exports = {client: [], server: []};

    // packages used and implied (keys are 'package', 'build', 'unordered', and
    // 'weak').  an "implied" package is a package that will be used by a build
    // which uses us.
    var uses =  {client: [], server: []};
    var implies = {client: [], server: []};

    // For this old-style, on_use/on_test/where-based package, figure
    // out its dependencies by calling its on_xxx functions and seeing
    // what it does.
    //
    // We have a simple strategy. Call its on_xxx handler with no
    // 'where', which is what happens when the package is added
    // directly to an app, and see what files it adds to the client
    // and the server. Call the former the client version of the
    // package, and the latter the server version. Then, when a
    // package is used, include it in both the client and the server
    // by default. This simple strategy doesn't capture even 10% of
    // the complexity possible with on_use, on_test, and where, but
    // probably is sufficient for virtually all packages that actually
    // exist in the field, if not every single
    // one. #OldStylePackageSupport

    if (fileAndDepLoader) {
      var toArray = function (x) {
        if (x instanceof Array)
          return x;
        return x ? [x] : [];
      };

      var allWheres = ['client', 'server'];
      var toWhereArray = function (where) {
        if (!(where instanceof Array)) {
          where = where ? [where] : allWheres;
        }
        where = _.uniq(where);
        var realWhere = _.intersection(where, allWheres);
        if (realWhere.length !== where.length) {
          var badWheres = _.difference(where, allWheres);
          // avoid using _.each so as to not add more frames to skip
          for (var i = 0; i < badWheres.length; ++i) {
            buildmessage.error(
              "Invalid 'where' argument: '" + badWheres[i] + "'",
              // skip toWhereArray in addition to the actual API function
              {useMyCaller: 1});
          };
          // recover by using the real ones only
        }
        return realWhere;
      };

      var api = {
        // Called when this package wants to make another package be
        // used. Can also take literal package objects, if you have
        // anonymous packages you want to use (eg, app packages)
        //
        // @param where 'client', 'server', or an array of those.
        // The default is ['client', 'server'].
        //
        // options can include:
        //
        // - role: DEPRECATED. defaults to "use", but you could pass something
        //   like "test" if for some reason you wanted to include a
        //   package's tests (XXX: OK to remove this?)
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
            _.each(where, function (w) {
              if (options.role && options.role !== "use")
                throw new Error("Role override is no longer supported");
              uses[w].push(_.extend(utils.parseSpec(name), {
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
            _.each(where, function (w) {
              // We don't allow weak or unordered implies, since the main
              // purpose of imply is to provide imports and plugins.
              implies[w].push(utils.parseSpec(name));
            });
          });
        },

        // Top-level call to add a source file to a package. It will
        // be processed according to its extension (eg, *.coffee
        // files will be compiled to JavaScript).
        add_files: function (paths, where, fileOptions) {
          paths = toArray(paths);
          where = toWhereArray(where);

          _.each(paths, function (path) {
            _.each(where, function (w) {
              var source = {relPath: path};
              if (fileOptions)
                source.fileOptions = fileOptions;
              sources[w].push(source);
            });
          });
        },

        // Export symbols from this package.
        //
        // @param symbols String (eg "Foo") or array of String
        // @param where 'client', 'server', or an array of those.
        // The default is ['client', 'server'].
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
            _.each(where, function (w) {
              exports[w].push({name: symbol, testOnly: !!options.testOnly});
            });
          });
        },
        // XXX COMPAT WITH 0.6.4
        error: function () {
          // I would try to support this but I don't even know what
          // its signature was supposed to be anymore
          buildmessage.error(
            "api.error(), ironically, is no longer supported",
            { useMyCaller: true });
          // recover by ignoring
        },
        // XXX COMPAT WITH 0.6.4
        registered_extensions: function () {
          buildmessage.error(
            "api.registered_extensions() is no longer supported",
            { useMyCaller: true });
          // recover by returning dummy value
          return [];
        }
      };

      try {
        fileAndDepLoader(api);
      } catch (e) {
        buildmessage.exception(e);
        // Recover by ignoring all of the source files in the
        // packages and any remaining role handlers. It violates the
        // principle of least surprise to half-run a role handler
        // and then continue.
        sources = {client: [], server: []};
        fileAndDepLoader = null;
        self.pluginInfo = {};
        npmDependencies = null;
      }
    }

    // Make sure that if a dependency was specified in multiple
    // builds, the constraint is exactly the same.
    if (! self._checkCrossBuildVersionConstraints()) {
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

    // Create source architectures, one for the server and one for the client.
    _.each(["browser", "os"], function (arch) {
      var where = (arch === "browser") ? "client" : "server";

      // Everything depends on the package 'meteor', which sets up
      // the basic environment) (except 'meteor' itself, and js-analyze
      // which needs to be loaded by the linker).
      // XXX add a better API for js-analyze to declare itself here
      if (! (name === "meteor" && !self.isTest) && name !== "js-analyze") {
        // Don't add the dependency if one already exists. This allows the
        // package to create an unordered dependency and override the one that
        // we'd add here. This is necessary to resolve the circular dependency
        // between meteor and underscore (underscore has an unordered
        // dependency on meteor dating from when the .js extension handler was
        // in the "meteor" package).
        var alreadyDependsOnMeteor =
              !! _.find(uses[where], function (u) {
                return u.package === "meteor" && !u.build;
              });
        if (! alreadyDependsOnMeteor)
          uses[where].unshift({ package: "meteor" });
      }

      // Each build has its own separate WatchSet. This is so that, eg, a test
      // build's dependencies doesn't end up getting merged into the
      // pluginWatchSet of a package that uses it: only the use build's
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

    // Default builds
    self.defaultArches = { browser: ['main'], 'os': ['main'] };

    // If we have built this before, read the versions that we ended up using.
    var versionsFile = path.join(self.sourceRoot, "versions.json");
    if (fs.existsSync(versionsFile)) {
      try {
        var data = fs.readFileSync(versionsFile, 'utf8');
        self.dependencyVersions = JSON.parse(data);
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

  },

  // Initialize a package from an application directory (has .meteor/packages).
  initFromAppDir: function (appDir, ignoreFiles) {
    var self = this;
    appDir = path.resolve(appDir);
    self.name = null;
    self.sourceRoot = appDir;
    self.serveRoot = path.sep;

    _.each(["client", "server"], function (archName) {
      // Determine used packages
      var names = project.getPackages(appDir);
      var arch = archName === "server" ? "os" : "browser";

      // Create build
      var build = new SourceArch(self, {
        name: archName,
        arch: arch,
        uses: _.map(names, utils.parseSpec)
      });
      self.architectures.push(build);

      // Watch control files for changes
      // XXX this read has a race with the actual reads that are used
      _.each([path.join(appDir, '.meteor', 'packages'),
              path.join(appDir, '.meteor', 'release')], function (p) {
                watch.readAndWatchFile(build.watchSet, p);
              });

      // Determine source files
      build.getSourcesFunc = function (extensions, watchSet) {
        var sourceInclude = _.map(
          extensions,
          function (ext) {
            return new RegExp('\\.' + quotemeta(ext) + '$');
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

        var otherBuildRegExp =
              (archName === "server" ? /^client\/$/ : /^server\/$/);

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
                    otherBuildRegExp].concat(sourceExclude)
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
            exclude: [/^tests\/$/, otherBuildRegExp].concat(sourceExclude)
          }));
        }

        // We've found all the source files. Sort them!
        sources.sort(loadOrderSort);

        // Convert into relPath/fileOptions objects.
        sources = _.map(sources, function (relPath) {
          var sourceObj = {relPath: relPath};

          // Special case: on the client, JavaScript files in a
          // `client/compatibility` directory don't get wrapped in a closure.
          if (archName === "client" && relPath.match(/\.js$/)) {
            var clientCompatSubstr =
                  path.sep + 'client' + path.sep + 'compatibility' + path.sep;
            if ((path.sep + relPath).indexOf(clientCompatSubstr) !== -1)
              sourceObj.fileOptions = {bare: true};
          }
          return sourceObj;
        });

        // Now look for assets for this build.
        var assetDir = archName === "client" ? "public" : "private";
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

    if (! self._checkCrossBuildVersionConstraints()) {
      // should never happen since we created the builds from
      // .meteor/packages, which doesn't have a way to express
      // different constraints for different builds
      throw new Error("conflicting constraints in a package?");
    }

    self.defaultArches = { browser: ['client'], 'os': ['server'] };
  },

  // True if the package defines any plugins.
  containsPlugins: function () {
    var self = this;
    return ! _.isEmpty(self.pluginInfo);
  },

  // Return dependency metadata for all builds, in the format needed
  // by the package catalog.
  //
  // Options:
  // - logError: if true, if something goes wrong, log a buildmessage
  //   and return null rather than throwing an exception.
  // - skipWeak: omit weak dependencies
  // - skipUnordered: omit unordered dependencies
  getDependencyMetadata: function (options) {
    var self = this;
    var ret = self._computeDependencyMetadata(options);
    if (! ret) {
      if (options.logError)
        return null;
      else
        throw new Error("inconsistent dependency constraint across builds?");
    }
    return ret;
  },

  // Record the versions of the dependencies that we used to actually build the
  // package on disk and save them into the packageSource. Next time we build
  // the package, we will look at them for optimization & repeatable builds.
  //
  // versions:
  // - dependencies: results of running the constraint solver on the dependency
  //   metadata of this package
  // - plugins: results of running the constraint solver on the plugin
  //   dependency data for this package.
  recordDependencyVersions: function (versions) {
    var self = this;

    // There is always a possibility that we might want to change the format of
    // this file, so let's keep track of what it is.
    versions["format"] = "1.0";

    // In case we need to rebuild from this package Source, it will be
    // convenient to keep the results on hand and not reread from disk.
    this.dependencyVersions = versions;

    // Most of our disk i/o happens through the builder, so it makes sense to
    // use it to write this to disk, even though we are neither bundling nor
    // compiling this file right now.
    try {
      // Currently, unnamed packages are apps, and apps have a different
      // versions file format and semantics. So, we don't need to and cannot
      // record dependencyVersions for those, and that's OK for now.
      //
      // Uniload sets its sourceRoot to "/", which is a little strange. Uniload
      // does not need to store dependency versions either.
      if (self.name && self.sourceRoot !== "/") {
        var versionsFile = path.join(self.sourceRoot, "versions.json");
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

  // If dependencies aren't consistent across builds, return false and
  // also log a buildmessage error if inside a buildmessage job. Else
  // return true.
  // XXX: Check that this is used when refactoring is done.
  _checkCrossBuildVersionConstraints: function () {
    var self = this;
    return !! self._computeDependencyMetadata({ logError: true });
  },

  // Compute the return value for getDependencyMetadata, or return
  // null if there is a dependency that doesn't have the same
  // constraint across all builds (and, if logError is true, log a
  // buildmessage error).
  //
  // For options, see getDependencyMetadata.
  _computeDependencyMetadata: function (options) {
    var self = this;
    options = options || {};

    var dependencies = {};
    var allConstraints = {}; // for error reporting. package name to array
    var failed = false;

    _.each(self.architectures, function (build) {
      // We need to iterate over both uses and implies, since implied packages
      // also constitute dependencies.
      _.each(_.union(build.uses, build.implies), function (use) {
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

        d.references.push({
          build: build.archName,
          arch: archinfo.withoutSpecificOs(build.arch),
          targetBuild: use.build,  // usually undefined, for "default builds"
          weak: use.weak,
          unordered: use.unordered
        });
      });
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
