var fs = require('fs');
var sourcemap = require('source-map');

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
var quotemeta = function (str) {
  return String(str).replace(/(\W)/g, '\\$1');
};

// XXX should unify this with utils.parseConstraint
var parseSpec = function (spec) {
  var m = spec.match(/^([^\/@]+)(\/([^@]+))?(@(.+))?$/)
  if (! m)
    throw new Error("Bad package spec: " + spec);
  var ret = { package: m[1] };
  if (m[3])
    ret.slice = m[3];
  if (m[5])
    ret.constraint = m[5];
  return ret;
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
// SourceSlice
///////////////////////////////////////////////////////////////////////////////

// Options:
// - name [required]
// - arch [required] (XXX: For now.)
// - uses
// - implies
// - getSourcesFunc
// - noExports
// - declaredExports
// - watchSet
// - nodeModulesPath
//
// Do not include the source files in watchSet. They will be
// added at compile time when the sources are actually read.
var SourceSlice = function (pkg, options) {
  var self = this;
  options = options || {};
  self.pkg = pkg;

  // Name for this slice. For example, the "client" in "ddp.client"
  // (which, NB, we might load on server arches).
  self.sliceName = options.name;

  // The architecture (fully or partially qualified) that can use this
  // slice.
  self.arch = options.arch;

  // Packages used. The ordering is significant only for determining
  // import symbol priority (it doesn't affect load order), and a
  // given package could appear more than once in the list, so code
  // that consumes this value will need to guard appropriately. Each
  // element in the array has keys:
  // - package: the package name
  // - constraint: the constraint on the version of the package to use,
  //   as a string (may be null)
  // - slice: the slice name (optional)
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
  // something like compiler.eachUsedSlice so you also take into
  // account implied packages.

  // Packages which are "implied" by using this package. If a slice X
  // uses this slice Y, and Y implies Z, then X will effectively use Z
  // as well (and get its imports and plugins).  An array of objects
  // of the same type as the elements of self.uses (although for now
  // unordered and weak are not allowed).
  self.implies = options.implies || [];

  // A function that returns the source files for this slice. Array of
  // objects with keys "relPath" and "fileOptions". Null if loaded
  // from unipackage.
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

  // True if this slice is not permitted to have any exports, and in
  // fact should not even define `Package.name` (ie, test slices).
  self.noExports = options.noExports || false;

  // Symbols that this slice should export. List of symbols (as
  // strings). Null on packages where noExports is set.
  self.declaredExports = options.declaredExports || null;

  // Files and directories that we want to monitor for changes in
  // development mode, such as source files and package.js, as a
  // watch.WatchSet.
  self.watchSet = options.watchSet || new watch.WatchSet();

  // Absolute path to the node_modules directory to use at runtime to
  // resolve Npm.require() calls in this slice. null if this slice
  // does not have a node_modules.
  self.nodeModulesPath = options.nodeModulesPath;
};

///////////////////////////////////////////////////////////////////////////////
// PackageSource
///////////////////////////////////////////////////////////////////////////////

var PackageSource = function (packageDirectoryForBuildInfo) {
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

  // The package's directory. This is used only by other packages that use this
  // package in their buildinfo.json (to detect that they need to be rebuilt if
  // the PackageLoader resolves it to a different package); it is not used to
  // read files or anything else. Notably, it should be the same if a package is
  // read from a source tree or read from the .build unipackage inside that
  // source tree.
  self.packageDirectoryForBuildInfo = packageDirectoryForBuildInfo;

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

  // Available editions/subpackages ("slices") of this package. Array
  // of SourceSlice.
  self.slices = [];

  // Map from an arch to the list of slice names that should be
  // included by default if this package is used without specifying a
  // slice (eg, as "ddp" rather than "ddp.server"). The most specific
  // arch will be used.
  self.defaultSlices = {};

  // Map from an arch to the list of slice names that should be
  // included when this package is tested. The most specific arch will
  // be used.
  self.testSlices = {};

  // The information necessary to build the plugins in this
  // package. Map from plugin name to object with keys 'name', 'use',
  // 'sources', and 'npmDependencies'.
  self.pluginInfo = {};
};

_.extend(PackageSource.prototype, {
  // Make a dummy (empty) packageSource that contains nothing of interest.
  // XXX: Do we need this
  initEmpty: function (name) {
    var self = this;
    self.name = name;
    self.defaultSlices = {'': []};
    self.testSlices = {'': []};
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
  // Note that this does not set a version on the package!
  //
  // Options:
  // - sourceRoot (required if sources present)
  // - serveRoot (required if sources present)
  // - sliceName
  // - use
  // - sources (array of paths or relPath/fileOptions objects)
  // - npmDependencies
  // - npmDir
  initFromOptions: function (name, options) {
    var self = this;
    self.name = name;

    if (options.sources && ! _.isEmpty(options.sources.length) &&
        (! options.sourceRoot || ! options.serveRoot))
      throw new Error("When source files are given, sourceRoot and " +
                      "serveRoot must be specified");
    self.sourceRoot = options.sourceRoot || path.sep;
    self.serveRoot = options.serveRoot || path.sep;

    var isPortable = true;
    var nodeModulesPath = null;
    meteorNpm.ensureOnlyExactVersions(options.npmDependencies);
    if (options.npmDir) {
      // Always run updateDependencies, even if there are no dependencies: there
      // may be a .npm directory on disk to delete.
      if (meteorNpm.updateDependencies(name, options.npmDir,
                                       options.npmDependencies)) {
        // At least one dependency was installed, and there were no errors.
        if (!meteorNpm.dependenciesArePortable(options.npmDir))
          isPortable = false;
        nodeModulesPath = path.join(options.npmDir, 'node_modules');
      }
    }

    var sources = _.map(options.sources, function (source) {
      if (typeof source === "string")
        return {relPath: source};
      return source;
    });

    var arch = isPortable ? "os" : archinfo.host();
    var slice = new SourceSlice(self, {
      name: options.sliceName,
      arch: arch,
      uses: _.map(options.use, parseSpec),
      getSourcesFunc: function () { return sources; },
      nodeModulesPath: nodeModulesPath
    });
    self.slices.push(slice);

    if (! self._checkCrossSliceVersionConstraints())
      throw new Error("only one slice, so how can consistency check fail?");

    self.defaultSlices = {'os': [options.sliceName]};
  },

  // Initialize a PackageSource from a package.js-style package
  // directory.
  initFromPackageDir: function (name, dir, options) {
    var self = this;
    var isPortable = true;
    options = options || {};
    self.name = name;
    self.sourceRoot = dir;
    self.serveRoot = path.join(path.sep, 'packages', name);

    if (! fs.existsSync(self.sourceRoot))
      throw new Error("putative package directory " + dir + " doesn't exist?");

    var roleHandlers = {use: null, test: null};
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
      // - earliestCompatibleVersion: version string
      // There used to be a third option documented here,
      // 'environments', but it was never implemented and no package
      // ever used it.
      describe: function (options) {
        _.each(options, function (value, key) {
          if (key === "summary" || key === "internal")
            self.metadata[key] = value;
          else if (key === "version")
            // XXX validate that version parses
            self.version = value;
          else if (key === "earliestCompatibleVersion")
            self.earliestCompatibleVersion = value;
          else
            buildmessage.error("unknown attribute '" + key + "' " +
                               "in package description");
        });
      },

      on_use: function (f) {
        if (roleHandlers.use) {
          buildmessage.error("duplicate on_use handler; a package may have " +
                             "only one", { useMyCaller: true });
          // Recover by ignoring the duplicate
          return;
        }

        roleHandlers.use = f;
      },

      on_test: function (f) {
        if (roleHandlers.test) {
          buildmessage.error("duplicate on_test handler; a package may have " +
                             "only one", { useMyCaller: true });
          // Recover by ignoring the duplicate
          return;
        }

        roleHandlers.test = f;
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
        // XXX make npmDependencies be per slice, so that production
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
      roleHandlers = {use: null, test: null};
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
    var sources = {use: {client: [], server: []},
                   test: {client: [], server: []}};

    // symbols exported
    var exports = {client: [], server: []};

    // packages used and implied (keys are 'package', 'slice', 'unordered', and
    // 'weak').  an "implied" package is a package that will be used by a slice
    // which uses us. (since you can't use a test slice, only the use slice can
    // have "implies".)
    var uses = {use: {client: [], server: []},
                test: {client: [], server: []}};
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
    _.each(["use", "test"], function (role) {
      if (roleHandlers[role]) {
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
          // - role: defaults to "use", but you could pass something
          //   like "test" if for some reason you wanted to include a
          //   package's tests
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
                uses[role][w].push(_.extend(parseSpec(name), {
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
            if (role === "test") {
              buildmessage.error(
                "api.imply() is only allowed in on_use, not on_test.",
                { useMyCaller: true });
              // recover by ignoring
              return;
            }

            names = toArray(names);
            where = toWhereArray(where);

            _.each(names, function (name) {
              _.each(where, function (w) {
                // We don't allow weak or unordered implies, since the main
                // purpose of imply is to provide imports and plugins.
                implies[w].push(parseSpec(name));
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
                sources[role][w].push(source);
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
            if (role === "test") {
              buildmessage.error("You cannot export symbols from a test.",
                                 { useMyCaller: true });
              // recover by ignoring
              return;
            }
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
          roleHandlers[role](api);
        } catch (e) {
          buildmessage.exception(e);
          // Recover by ignoring all of the source files in the
          // packages and any remaining role handlers. It violates the
          // principle of least surprise to half-run a role handler
          // and then continue.
          sources = {use: {client: [], server: []},
                     test: {client: [], server: []}};
          roleHandlers = {use: null, test: null};
          self.pluginInfo = {};
          npmDependencies = null;
        }
      }
    });


    // Make sure that if a dependency was specified in multiple
    // slices, the constraint is exactly the same.
    if (! self._checkCrossSliceVersionConstraints()) {
      // A build error was written. Recover by ignoring the
      // fact that we have differing constraints.
    }

    // Grab any npm dependencies. Keep them in a cache in the package
    // source directory so we don't have to do this from scratch on
    // every build.

    // We used to put this directly in .npm, but in linker-land, the package's
    // own NPM dependencies go in .npm/package and build plugin X's goes in
    // .npm/plugin/X. Notably, the former is NOT an ancestor of the latter, so
    // that a build plugin does NOT see the package's node_modules.
    // XXX maybe there should be separate NPM dirs for use vs test?
    var packageNpmDir =
          path.resolve(path.join(self.sourceRoot, '.npm', 'package'));

    // If this package was previously built with pre-linker versions, it may
    // have files directly inside `.npm` instead of nested inside
    // `.npm/package`. Clean them up if they are there.
    var preLinkerFiles = [
      'npm-shrinkwrap.json', 'README', '.gitignore', 'node_modules'];
    _.each(preLinkerFiles, function (f) {
      files.rm_recursive(path.join(self.sourceRoot, '.npm', f));
    });

    // go through a specialized npm dependencies update process,
    // ensuring we don't get new versions of any
    // (sub)dependencies. this process also runs mostly safely
    // multiple times in parallel (which could happen if you have
    // two apps running locally using the same package)
    // We run this even if we have no dependencies, because we might
    // need to delete dependencies we used to have.
    var nodeModulesPath = null;
    if (meteorNpm.updateDependencies(name, packageNpmDir, npmDependencies)) {
      nodeModulesPath = path.join(packageNpmDir, 'node_modules');
      if (! meteorNpm.dependenciesArePortable(packageNpmDir))
        isPortable = false;
    }

    // Create slices
    var osArch = isPortable ? "os" : archinfo.host();
    _.each(["use", "test"], function (role) {
      _.each(["browser", osArch], function (arch) {
        var where = (arch === "browser") ? "client" : "server";

        // Everything depends on the package 'meteor', which sets up
        // the basic environment) (except 'meteor' itself, and js-analyze
        // which needs to be loaded by the linker).
        // XXX add a better API for js-analyze to declare itself here
        if (! (name === "meteor" && role === "use") && name !== "js-analyze") {
          // Don't add the dependency if one already exists. This allows the
          // package to create an unordered dependency and override the one that
          // we'd add here. This is necessary to resolve the circular dependency
          // between meteor and underscore (underscore has an unordered
          // dependency on meteor dating from when the .js extension handler was
          // in the "meteor" package).
          var alreadyDependsOnMeteor =
            !! _.find(uses[role][where], function (u) {
              return u.package === "meteor" && !u.slice;
            });
          if (! alreadyDependsOnMeteor)
            uses[role][where].unshift({ package: "meteor" });
        }

        // Each slice has its own separate WatchSet. This is so that, eg, a test
        // slice's dependencies doesn't end up getting merged into the
        // pluginWatchSet of a package that uses it: only the use slice's
        // dependencies need to go there!
        var watchSet = new watch.WatchSet();
        watchSet.addFile(packageJsPath, packageJsHash);

        self.slices.push(new SourceSlice(self, {
          name: ({ use: "main", test: "tests" })[role],
          arch: arch,
          uses: uses[role][where],
          implies: role === "use" && implies[where] || undefined,
          getSourcesFunc: function () { return sources[role][where]; },
          noExports: role === "test",
          declaredExports: role === "use" ? exports[where] : null,
          watchSet: watchSet,
          nodeModulesPath: arch === osArch && nodeModulesPath || undefined
        }));
      });
    });

    // Default slices
    self.defaultSlices = { browser: ['main'], 'os': ['main'] };
    self.testSlices = { browser: ['tests'], 'os': ['tests'] };
  },

  // Initialize a package from an application directory (has .meteor/packages).
  //
  // XXX XXX make dependencies provide packageLoader
  initFromAppDir: function (appDir, packageLoader, ignoreFiles) {
    var self = this;
    appDir = path.resolve(appDir);
    self.name = null;
    self.sourceRoot = appDir;
    self.serveRoot = path.sep;

    _.each(["client", "server"], function (sliceName) {
      // Determine used packages
      var names = project.getPackages(appDir);
      var arch = sliceName === "server" ? "os" : "browser";

      // Create slice
      var slice = new SourceSlice(self, {
        name: sliceName,
        arch: arch,
        uses: _.map(names, parseSpec)
      });
      self.slices.push(slice);

      // Watch control files for changes
      // XXX this read has a race with the actual reads that are used
      _.each([path.join(appDir, '.meteor', 'packages'),
              path.join(appDir, '.meteor', 'release')], function (p) {
                watch.readAndWatchFile(slice.watchSet, p);
              });

      // Determine source files
      slice.getSourcesFunc = function (extensions, watchSet) {
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

        var otherSliceRegExp =
              (sliceName === "server" ? /^client\/$/ : /^server\/$/);

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
                    otherSliceRegExp].concat(sourceExclude)
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
            exclude: [/^tests\/$/, otherSliceRegExp].concat(sourceExclude)
          }));
        }

        // We've found all the source files. Sort them!
        sources.sort(loadOrderSort);

        // Convert into relPath/fileOptions objects.
        sources = _.map(sources, function (relPath) {
          var sourceObj = {relPath: relPath};

          // Special case: on the client, JavaScript files in a
          // `client/compatibility` directory don't get wrapped in a closure.
          if (sliceName === "client" && relPath.match(/\.js$/)) {
            var clientCompatSubstr =
                  path.sep + 'client' + path.sep + 'compatibility' + path.sep;
            if ((path.sep + relPath).indexOf(clientCompatSubstr) !== -1)
              sourceObj.fileOptions = {bare: true};
          }
          return sourceObj;
        });

        // Now look for assets for this slice.
        var assetDir = sliceName === "client" ? "public" : "private";
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

    if (! self._checkCrossSliceVersionConstraints()) {
      // should never happen since we created the slices from
      // .meteor/packages, which doesn't have a way to express
      // different constraints for different slices
      throw new Error("conflicting constraints in a package?");
    }

    self.defaultSlices = { browser: ['client'], 'os': ['server'] };
  },

  // Return dependency metadata for all slices, in the format needed
  // by the package catalog.
  getDependencyMetadata: function () {
    var self = this;
    var ret = self._computeDependencyMetadata();
    if (! ret)
      throw new Error("inconsistent dependency constraint across slices?");
    return ret;
  },

  // If dependencies aren't consistent across slices, return false and
  // also log a buildmessage error if inside a buildmessage job. Else
  // return true.
  // XXX: Check that this is used when refactoring is done.
  _checkCrossSliceVersionConstraints: function () {
    var self = this;
    return !! self._computeDependencyMetadata(true);
  },

  // Compute the return value for getDependencyMetadata, or return
  // null if there is a dependency that doesn't have the same
  // constraint across all slices (and, if logError is true, log a
  // buildmessage error).
  _computeDependencyMetadata: function (logError) {
    var self = this;
    var dependencies = {};
    var allConstraints = {}; // for error reporting. package name to array
    var failed = false;

    _.each(self.slices, function (slice) {
      // XXX also iterate over "implies"
      _.each(slice.uses, function (use) {
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
          slice: slice.sliceName,
          arch: archinfo.withoutSpecificOs(slice.arch),
          targetSlice: use.slice,  // usually undefined, for "default slices"
          weak: use.weak,
          unordered: use.unordered
        });
      });
    });

    if (failed && logError) {
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
  },

  // Compute build-time dependencies for this package and return a
  // PackageLoader that can be used to load all of this package's
  // build-time dependencies.
  //
  // XXX this is called from several places (eg, checkUpToDate and
  // build) and each time it's called we recompute it. It should
  // really be memoized.
  _makeBuildTimePackageLoader: function () {
    var self = this;

    // #RunningTheConstraintSolverToBuildAPackage

    var dependencyMetadata =
      self._computeDependencyMetadata(true /* logError */);
    if (! dependencyMetadata) {
      // If _computeDependencyMetadata failed, I guess we can try to
      // recover by returning a PackageLoader with no versions in
      // it. This will cause a lot of 'package not found' errors, so a
      // better approach would proabably be to actually have this
      // function return null and make the caller do a better job of
      // recovering.
      return new packageLoader.PackageLoader({ });
    }

    var constraints = {};
    _.each(dependencyMetadata, function (info, packageName) {
      constraints[packageName] = info.constraint;
    });

    var constraintSolver = require('./constraint-solver.js');
    var resolver = new constraintSolver.Resolver;
    var versions = resolver.resolve(constraints);
    console.log("YAAAAAAY", versions);

    return new packageLoader.PackageLoader({ versions: versions });
  }
});

module.exports = PackageSource;
