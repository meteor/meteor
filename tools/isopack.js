var compiler = require('./compiler.js');
var archinfo = require('./archinfo.js');
var _ = require('underscore');
var linker = require('./linker.js');
var buildmessage = require('./buildmessage.js');
var fs = require('fs');
var path = require('path');
var Builder = require('./builder.js');
var bundler = require('./bundler.js');
var watch = require('./watch.js');
var packageLoader = require('./package-loader.js');
var catalog = require('./catalog.js');
var files = require('./files.js');
var uniload = require('./uniload.js');
var Future = require('fibers/future');

var rejectBadPath = function (p) {
  if (p.match(/\.\./))
    throw new Error("bad path: " + p);
};

///////////////////////////////////////////////////////////////////////////////
// Unibuild
///////////////////////////////////////////////////////////////////////////////

// Options:
// - name [required]
// - arch [required]
// - uses
// - implies
// - watchSet
// - nodeModulesPath
// - prelinkFiles
// - packageVariables
// - resources

var nextBuildId = 1;
var Unibuild = function (isopack, options) {
  var self = this;
  options = options || {};
  self.pkg = isopack;

  self.arch = options.arch;

  self.uses = options.uses;
  self.implies = options.implies || [];

  // This WatchSet will end up having the watch items from the
  // SourceArch (such as package.js or .meteor/packages), plus all of
  // the actual source files for the unibuild (including items that we
  // looked at to find the source files, such as directories we
  // scanned).
  self.watchSet = options.watchSet || new watch.WatchSet();

  // Each Unibuild is given a unique id when it's loaded (it is
  // not saved to disk). This is just a convenience to make it easier
  // to keep track of Unibuilds in a map; it's used by bundler
  // and compiler. We put some human readable info in here too to make
  // debugging easier.
  self.id = isopack.name + "." + self.pkg.name + "@" + self.arch + "#" +
    (nextBuildId ++);

  // Prelink output.
  //
  // 'prelinkFiles' is the partially linked JavaScript code (an
  // array of objects with keys 'source' and 'servePath', both strings -- see
  // prelink() in linker.js)
  //
  // 'packageVariables' are variables that are syntactically globals
  // in our input files and which we capture with a package-scope
  // closure. A list of objects with keys 'name' (required) and
  // 'export' (true, 'tests', or falsy).
  //
  // Both of these are saved into unibuilds on disk, and are inputs into the final
  // link phase, which inserts the final JavaScript resources into
  // 'resources'.
  self.prelinkFiles = options.prelinkFiles;
  self.packageVariables = options.packageVariables;

  // All of the data provided for eventual inclusion in the bundle,
  // other than JavaScript that still needs to be fed through the
  // final link stage. A list of objects with these keys:
  //
  // type: "js", "css", "head", "body", "asset"
  //
  // data: The contents of this resource, as a Buffer. For example,
  // for "head", the data to insert in <head>; for "js", the
  // JavaScript source code (which may be subject to further
  // processing such as minification); for "asset", the contents of a
  // static resource such as an image.
  //
  // servePath: The (absolute) path at which the resource would prefer
  // to be served. Interpretation varies by type. For example, always
  // honored for "asset", ignored for "head" and "body", sometimes
  // honored for CSS but ignored if we are concatenating.
  //
  // sourceMap: Allowed only for "js". If present, a string.
  self.resources = options.resources;

  // Absolute path to the node_modules directory to use at runtime to
  // resolve Npm.require() calls in this unibuild. null if this unibuild
  // does not have a node_modules.
  self.nodeModulesPath = options.nodeModulesPath;
};

_.extend(Unibuild.prototype, {
  // Get the resources that this function contributes to a bundle, in
  // the same format as self.resources as documented above. This
  // includes static assets and fully linked JavaScript.
  //
  // @param bundleArch The architecture targeted by the bundle. Might
  // be more specific than self.arch.
  //
  // It is when you call this function that we read our dependent
  // packages and commit to whatever versions of them we currently
  // have in the library -- at least for the purpose of imports, which
  // is resolved at bundle time. (On the other hand, when it comes to
  // the extension handlers we'll use, we previously commited to those
  // versions at package build ('compile') time.)
  //
  // loader is the PackageLoader that should be used to resolve
  // the package's bundle-time dependencies.
  getResources: function (bundleArch, loader) {
    var self = this;

    if (! archinfo.matches(bundleArch, self.arch))
      throw new Error("unibuild of arch '" + self.arch + "' does not support '" +
                      bundleArch + "'?");

    // Compute imports by merging the exports of all of the packages
    // we use. Note that in the case of conflicting symbols, later
    // packages get precedence.
    //
    // We don't get imports from unordered dependencies (since they may not be
    // defined yet) or from weak/debugOnly dependencies (because the meaning of
    // a name shouldn't be affected by the non-local decision of whether or not
    // an unrelated package in the target depends on something).
    var imports = {}; // map from symbol to supplying package name
    compiler.eachUsedUnibuild(
      self.uses,
      bundleArch, loader,
      { skipUnordered: true, skipDebugOnly: true },
      function (depUnibuild) {
        _.each(depUnibuild.packageVariables, function (symbol) {
          // Slightly hacky implementation of test-only exports.
          if (symbol.export === true ||
              (symbol.export === "tests" && self.pkg.isTest))
            imports[symbol.name] = depUnibuild.pkg.name;
        });
      });

    // Phase 2 link
    var isApp = ! self.pkg.name;
    var files = linker.link({
      imports: imports,
      useGlobalNamespace: isApp,
      // XXX report an error if there is a package called global-imports
      importStubServePath: isApp && '/packages/global-imports.js',
      prelinkFiles: self.prelinkFiles,
      packageVariables: self.packageVariables,
      includeSourceMapInstructions: archinfo.matches(self.arch, "web"),
      name: self.pkg.name || null
    });

    // Add each output as a resource
    var jsResources = _.map(files, function (file) {
      return {
        type: "js",
        data: new Buffer(file.source, 'utf8'), // XXX encoding
        servePath: file.servePath,
        sourceMap: file.sourceMap
      };
    });

    return _.union(self.resources, jsResources); // union preserves order
  }
});

///////////////////////////////////////////////////////////////////////////////
// Isopack
///////////////////////////////////////////////////////////////////////////////

// Helper function. Takes an object mapping package name to version, and
// ensures that all the versions have real build ids (by loading them
// through a PackageLoader) rather than +local build ids (which is what
// they could have if we just read them out of the catalog).
//
// If the optional `filter` function is provided, then we will only load
// packages for which `filter(packageName, version)` returns truthy.
var getLoadedPackageVersions = function (versions, catalog, filter) {
  buildmessage.assertInCapture();

  var result = {};

  var loader = new packageLoader.PackageLoader({
    versions: versions,
    catalog: catalog
  });
  _.each(versions, function (version, packageName) {
    if (! filter || filter(packageName, version)) {
      var isopack = loader.getPackage(packageName);
      result[packageName] = isopack.version;
    }
  });
  return result;
};

var convertIsopackFormat = function (data, versionFrom, versionTo) {
  var convertedData = _.clone(data);
  if (versionFrom === versionTo) {
    return convertedData;
  }

  // XXX COMPAT WITH 0.9.3
  if (versionFrom === "unipackage-pre2" && versionTo === "isopack-1") {
    convertedData.builds = convertedData.unibuilds;
    delete convertedData.unibuilds;
    return convertedData;
  } else if (versionFrom === "isopack-1" && versionTo === "unipackage-pre2") {
    convertedData.unibuilds = convertedData.builds;
    convertedData.format = "unipackage-pre2";
    delete convertedData.builds;
    return convertedData;
  }
};

var currentFormat = "isopack-1";

// XXX document
var Isopack = function () {
  var self = this;

  // These have the same meaning as in PackageSource.
  self.name = null;
  self.metadata = {};
  self.version = null;
  self.earliestCompatibleVersion = null;
  self.isTest = false;
  self.debugOnly = false;

  // Unibuilds, an array of class Unibuild.
  self.unibuilds = [];

  // Plugins in this package. Map from plugin name to {arch -> JsImage}.
  self.plugins = {};

  self.cordovaDependencies = {};

  // -- Information for up-to-date checks --

  // Version number of the tool that built this isopack
  // (compiler.BUILT_BY) or null if unknown
  self.builtBy = null;

  // If true, force the checkUpToDate to return false for this isopack.
  self.forceNotUpToDate = false;

  // The versions that we used at build time for each of our direct
  // dependencies. Map from package name to version string.
  self.buildTimeDirectDependencies = null;

  // The complete list of versions (including transitive dependencies)
  // that we used at build time to build each of our plugins. Map from
  // plugin name to package name to version string. Note that two
  // plugins might not use the same version for the same transitive
  // dependency.
  self.buildTimePluginDependencies = null;

  // XXX this is likely to change once we have build versions
  //
  // A WatchSet for the full transitive dependencies for all plugins in this
  // package, as well as this package's package.js. If any of these dependencies
  // change, our plugins need to be rebuilt... but also, any package that
  // directly uses this package needs to be rebuilt in case the change to
  // plugins affected compilation.
  self.pluginWatchSet = new watch.WatchSet();

  // -- Loaded plugin state --

  // True if plugins have been initialized (if _ensurePluginsInitialized has
  // been called)
  self._pluginsInitialized = false;

  // Source file handlers registered by plugins. Map from extension
  // (without a dot) to a handler function that takes a
  // CompileStep. Valid only when _pluginsInitialized is true.
  self.sourceHandlers = null;

  // See description in PackageSource. If this is set, then we include a copy of
  // our own source, in addition to any other tools that were originally in the
  // isopack.
  self.includeTool = false;

  // This is tools to copy from trees on disk. This is used by the
  // isopack-merge code in tropohouse.
  self.toolsOnDisk = [];
};

_.extend(Isopack.prototype, {
  // Make a dummy (empty) package that contains nothing of interest.
  // XXX used?
  initEmpty: function (name) {
    var self = this;
    self.name = name;
  },

  // This is primarily intended to be used by the compiler. After
  // calling this, call addUnibuild to add the unibuilds.
  initFromOptions: function (options) {
    var self = this;
    self.name = options.name;
    self.metadata = options.metadata;
    self.version = options.version;
    self.earliestCompatibleVersion = options.earliestCompatibleVersion;
    self.isTest = options.isTest;
    self.plugins = options.plugins;
    self.cordovaDependencies = options.cordovaDependencies;
    self.pluginWatchSet = options.pluginWatchSet;
    self.buildTimeDirectDependencies = options.buildTimeDirectDependencies;
    self.buildTimePluginDependencies = options.buildTimePluginDependencies;
    self.npmDiscards = options.npmDiscards;
    self.includeTool = options.includeTool;
    self.debugOnly = options.debugOnly;
  },

  // Programmatically add a unibuild to this Isopack. Should only be
  // called as part of building up a new Isopack using
  // initFromOptions. 'options' are the options to the Unibuild
  // constructor.
  addUnibuild: function (options) {
    var self = this;
    self.unibuilds.push(new Unibuild(self, options));
  },

  // An sorted array of all the architectures included in this package.
  architectures: function () {
    var self = this;
    var archSet = {};
    _.each(self.unibuilds, function (unibuild) {
      archSet[unibuild.arch] = true;
    });
    _.each(self._toolArchitectures(), function (arch) {
      archSet[arch] = true;
    });
    _.each(self.plugins, function (plugin, name) {
      _.each(plugin, function (plug, arch) {
        archSet[arch] = true;
      });
    });
    var arches = _.keys(archSet).sort();
    // Ensure that our buildArchitectures string does not look like
    //    web+os+os.osx.x86_64
    // This would happen if there is an 'os' unibuild but a platform-specific
    // tool (eg, in meteor-tool).  This would confuse catalog.getBuildsForArches
    // into thinking that it would work for Linux, since the 'os' means
    // 'works on any Node server'.
    if (_.any(arches, function (a) { return a.match(/^os\./); })) {
      arches = _.without(arches, 'os');
    }
    return arches;
  },

  // A sorted plus-separated string of all the architectures included in this
  // package.
  buildArchitectures: function () {
    var self = this;
    return self.architectures().join('+');
  },

  // Returns true if we think that this isopack is platform specific (contains
  // binary builds)
  platformSpecific: function () {
    var self = this;
    return _.any(self.architectures(), function (arch) {
      return arch.match(/^os\./);
    });
  },

  tarballName: function () {
    var self = this;
    return self.name + '-' + self.version + '-' + self.buildArchitectures();
  },

  _toolArchitectures: function () {
    var self = this;
    var toolArches = _.pluck(self.toolsOnDisk, 'arch');
    self.includeTool && toolArches.push(archinfo.host());
    return _.uniq(toolArches).sort();
  },

  // Return the unibuild of the package to use for a given target architecture
  // (eg, 'os.linux.x86_64' or 'web'), or throw an exception if that
  // packages can't be loaded under these circumstances.
  getUnibuildAtArch: function (arch) {
    var self = this;

    var chosenArch = archinfo.mostSpecificMatch(
      arch, _.pluck(self.unibuilds, 'arch'));
    if (! chosenArch) {
      buildmessage.error(
        (self.name || "this app") +
          " is not compatible with architecture '" + arch + "'",
        { secondary: true });
      // recover by returning by no unibuilds
      return null;
    }
    return _.findWhere(self.unibuilds, { arch: chosenArch });
  },

  // Load this package's plugins into memory, if they haven't already
  // been loaded, and return the list of source file handlers
  // registered by the plugins: a map from extension (without a dot)
  // to a handler function that takes a CompileStep.
  getSourceHandlers: function () {
    var self = this;
    self._ensurePluginsInitialized();
    return self.sourceHandlers;
  },

  // If this package has plugins, initialize them (run the startup
  // code in them so that they register their extensions). Idempotent.
  _ensurePluginsInitialized: function () {
    var self = this;

    if (self._pluginsInitialized)
      return;

    /**
     * @global
     * @namespace Plugin
     * @summary The namespace that is exposed inside build plugin files.
     */
    var Plugin = {
      // 'extension' is a file extension without the separation dot
      // (eg 'js', 'coffee', 'coffee.md')
      //
      // 'options' can be elided. The only known option is 'isTemplate', which
      // is a bit of a hack meaning "in an app, these files should be loaded
      // before non-templates".
      //
      // 'handler' is a function that takes a single argument, a
      // CompileStep (#CompileStep)

      /**
       * @summary Inside a build plugin source file specified in
       * [Package.registerBuildPlugin](#Package-registerBuildPlugin),
       * add a handler to compile files with a certain file extension.
       * @param  {String} fileExtension The file extension that this plugin
       * should handle, without the first dot.
       * Examples: `"coffee"`, `"coffee.md"`.
       * @param  {Function} handler  A function that takes one argument,
       * a CompileStep object.
       *
       * Documentation for CompileStep is available [on the GitHub Wiki](https://github.com/meteor/meteor/wiki/CompileStep-API-for-Build-Plugin-Source-Handlers).
       * @memberOf Plugin
       * @locus Build Plugin
       */
      registerSourceHandler: function (extension, options, handler) {
        if (!handler) {
          handler = options;
          options = {};
        }

        if (_.has(self.sourceHandlers, extension)) {
          buildmessage.error("duplicate handler for '*." +
                             extension + "'; may only have one per Plugin",
                             { useMyCaller: true });
          // recover by ignoring all but the first
          return;
        }

        self.sourceHandlers[extension] = {
          handler: handler,
          isTemplate: !!options.isTemplate,
          archMatching: options.archMatching
        };
      }
    };

    self.sourceHandlers = {};
    _.each(self.plugins, function (pluginsByArch, name) {
      var arch = archinfo.mostSpecificMatch(
        archinfo.host(), _.keys(pluginsByArch));
      if (! arch) {
        buildmessage.error("package `" + name + "` is built for incompatible " +
                           "architecture");
        // Recover by ignoring plugin
        // XXX does this recovery work?
        return;
      }

      var plugin = pluginsByArch[arch];
      buildmessage.enterJob({
        title: "Loading plugin `" + name +
          "` from package `" + self.name + "`"
        // don't necessarily have rootPath anymore
        // (XXX we do, if the isopack was locally built, which is
        // the important case for debugging. it'd be nice to get this
        // case right.)
      }, function () {
        plugin.load({ Plugin: Plugin });
      });
    });

    self._pluginsInitialized = true;
  },

  // Load a Isopack on disk.
  //
  // options:
  // - buildOfPath: If present, the source directory (as an absolute
  //   path on local disk) of which we think this isopack is a
  //   build. If it's not (it was copied from somewhere else), we
  //   consider it not up to date (in the sense of checkUpToDate) so
  //   that we can rebuild it and correct the absolute paths in the
  //   dependency information.
  initFromPath: function (name, dir, options) {
    var self = this;
    options = _.clone(options || {});
    options.firstIsopack = true;

    return self._loadUnibuildsFromPath(name, dir, options);
  },

  _loadUnibuildsFromPath: function (name, dir, options) {
    var self = this;
    options = options || {};

    // In the tropohouse, isopack paths are symlinks (which can be updated if
    // more unibuilds are merged in). For any given call to
    // _loadUnibuildsFromPath, let's ensure we see a consistent isopack by
    // realpath'ing dir.
    dir = fs.realpathSync(dir);

    var mainJson;

    // deal with different versions of "isopack.json", backwards compatible
    var isopackJsonPath = path.join(dir, "isopack.json");
    if (fs.existsSync(isopackJsonPath)) {
      var isopackJson = JSON.parse(fs.readFileSync(isopackJsonPath));

      if (isopackJson[currentFormat]) {
        mainJson = isopackJson[currentFormat];
      } else {
        // This file is from the future and no longer supports this version
        throw new Error("Could not find isopack data with format " + currentFormat + ".\n" +
          "This isopack was likely built with a much newer version of Meteor.");
      }
    } else {
      // super old version with different file name
      // XXX COMPAT WITH 0.9.3
      var unipackageJsonPath = path.join(dir, "unipackage.json");
      if (fs.existsSync(unipackageJsonPath)) {
        mainJson = JSON.parse(fs.readFileSync(unipackageJsonPath));

        // in the old format, builds were called unibuilds
        // use string to make sure this doesn't get caught in a find/replace
        mainJson.builds = mainJson["unibuilds"];

        mainJson = convertIsopackFormat(mainJson,
          "unipackage-pre2", currentFormat);
      }

      if (mainJson.format !== "unipackage-pre2") {
        // We don't support pre-0.9.0 isopacks, but we do know enough to delete
        // them if we find them in .build.* somehow (rather than crash).
        if (mainJson.format === "unipackage-pre1") {
          throw new exports.OldIsopackFormatError();
        }

        throw new Error("Unsupported isopack format: " +
                        JSON.stringify(mainJson.format));
      }
    }

    // done dealing with different versions, below here
    // mainJson is the data we want

    // isopacks didn't used to know their name, but they should.
    if (_.has(mainJson, 'name') && name !== mainJson.name) {
      throw new Error("isopack " + name + " thinks its name is " +
                      mainJson.name);
    }

    var buildInfoPath = path.join(dir, 'buildinfo.json');
    var buildInfoJson = fs.existsSync(buildInfoPath) &&
      JSON.parse(fs.readFileSync(buildInfoPath));
    if (buildInfoJson) {
      if (!options.firstIsopack) {
        throw Error("can't merge isopacks with buildinfo");
      }
    } else {
      buildInfoJson = {};
    }

    // XXX should comprehensively sanitize (eg, typecheck) everything
    // read from json files

    // Read basic buildinfo.json info

    self.builtBy = buildInfoJson.builtBy || null;
    self.buildTimeDirectDependencies =
      buildInfoJson.buildTimeDirectDependencies || null;
    self.buildTimePluginDependencies =
      buildInfoJson.buildTimePluginDependencies || null;

    if (options.buildOfPath &&
        (buildInfoJson.source !== options.buildOfPath)) {
      // This catches the case where you copy a source tree that had a
      // .build directory and then modify a file. Without this check
      // you won't see a rebuild (even if you stop and restart
      // meteor), at least not until you modify the *original* copies
      // of the source files, because that is still where all of the
      // dependency info points.
      self.forceNotUpToDate = true;
    }

    // Read the watch sets for each unibuild
    var unibuildWatchSets = {};
    _.each(buildInfoJson.buildDependencies, function (watchSetJSON, unibuildTag) {
      unibuildWatchSets[unibuildTag] = watch.WatchSet.fromJSON(watchSetJSON);
    });

    // Read pluginWatchSet and pluginProviderPackageDirs. (In the
    // multi-sub-isopack case, these are guaranteed to be trivial
    // (since we check that there's no buildinfo.json), so no need to
    // merge.)
    self.pluginWatchSet = watch.WatchSet.fromJSON(
      buildInfoJson.pluginDependencies);
    self.pluginProviderPackageDirs = buildInfoJson.pluginProviderPackages || {};

    // If we are loading multiple isopacks, only take this stuff from the
    // first one.
    if (options.firstIsopack) {
      self.name = name;
      self.metadata = {
        summary: mainJson.summary
      };
      self.version = mainJson.version;
      self.earliestCompatibleVersion = mainJson.earliestCompatibleVersion;
      self.isTest = mainJson.isTest;
      self.debugOnly = !!mainJson.debugOnly;
    }
    _.each(mainJson.plugins, function (pluginMeta) {
      rejectBadPath(pluginMeta.path);

      var plugin = bundler.readJsImage(path.join(dir, pluginMeta.path));

      if (!_.has(self.plugins, pluginMeta.name)) {
        self.plugins[pluginMeta.name] = {};
      }
      // If we already loaded a plugin of this name/arch, just ignore this one.
      if (!_.has(self.plugins[pluginMeta.name], plugin.arch)) {
        self.plugins[pluginMeta.name][plugin.arch] = plugin;
      }
    });
    self.pluginsBuilt = true;
    _.each(mainJson.builds, function (unibuildMeta) {
      // aggressively sanitize path (don't let it escape to parent
      // directory)
      rejectBadPath(unibuildMeta.path);

      // Skip unibuilds we already have.
      var alreadyHaveUnibuild = _.find(self.unibuilds, function (unibuild) {
        return unibuild.arch === unibuildMeta.arch;
      });
      if (alreadyHaveUnibuild)
        return;

      var unibuildJson = JSON.parse(
        fs.readFileSync(path.join(dir, unibuildMeta.path)));
      var unibuildBasePath = path.dirname(path.join(dir, unibuildMeta.path));

      if (unibuildJson.format !== "unipackage-unibuild-pre1")
        throw new Error("Unsupported isopack unibuild format: " +
                        JSON.stringify(unibuildJson.format));

      var nodeModulesPath = null;
      if (unibuildJson.node_modules) {
        rejectBadPath(unibuildJson.node_modules);
        nodeModulesPath = path.join(unibuildBasePath, unibuildJson.node_modules);
      }

      var prelinkFiles = [];
      var resources = [];

      _.each(unibuildJson.resources, function (resource) {
        rejectBadPath(resource.file);
        var data = new Buffer(resource.length);
        // Read the data from disk, if it is non-empty. Avoid doing IO for empty
        // files, because (a) unnecessary and (b) fs.readSync with length 0
        // throws instead of acting like POSIX read:
        // https://github.com/joyent/node/issues/5685
        if (resource.length > 0) {
          var fd = fs.openSync(path.join(unibuildBasePath, resource.file), "r");
          try {
            var count = fs.readSync(
              fd, data, 0, resource.length, resource.offset);
          } finally {
            fs.closeSync(fd);
          }
          if (count !== resource.length)
            throw new Error("couldn't read entire resource");
        }

        if (resource.type === "prelink") {
          var prelinkFile = {
            source: data.toString('utf8'),
            servePath: resource.servePath
          };
          if (resource.sourceMap) {
            rejectBadPath(resource.sourceMap);
            prelinkFile.sourceMap = fs.readFileSync(
              path.join(unibuildBasePath, resource.sourceMap), 'utf8');
          }
          prelinkFiles.push(prelinkFile);
        } else if (_.contains(["head", "body", "css", "js", "asset"],
                              resource.type)) {
          resources.push({
            type: resource.type,
            data: data,
            servePath: resource.servePath || undefined,
            path: resource.path || undefined
          });
        } else
          throw new Error("bad resource type in isopack: " +
                          JSON.stringify(resource.type));
      });

      self.cordovaDependencies = mainJson.cordovaDependencies || null;

      self.unibuilds.push(new Unibuild(self, {
        name: unibuildMeta.name,
        arch: unibuildMeta.arch,
        uses: unibuildJson.uses,
        implies: unibuildJson.implies,
        watchSet: unibuildWatchSets[unibuildMeta.path],
        nodeModulesPath: nodeModulesPath,
        prelinkFiles: prelinkFiles,
        packageVariables: unibuildJson.packageVariables || [],
        resources: resources,
        cordovaDependencies: unibuildJson.cordovaDependencies
      }));
    });

    _.each(mainJson.tools, function (toolMeta) {
      toolMeta.rootDir = dir;
      // XXX check for overlap
      self.toolsOnDisk.push(toolMeta);
    });

    return true;
  },

  // options:
  //
  // - buildOfPath: Optional. The absolute path on local disk of the
  //   directory that was built to produce this package. Used as part
  //   of the dependency info to detect builds that were moved and
  //   then modified.
  // - elideBuildInfo: If set, don't write a buildinfo.json file.
  saveToPath: function (outputDir, options) {
    var self = this;
    var outputPath = outputDir;
    options = options || {};
    buildmessage.assertInCapture();
    if (!options.catalog && !options.elideBuildInfo)
      throw Error("catalog required to generate buildinfo.json");

    var builder = new Builder({ outputPath: outputPath });
    try {
      var mainJson = {
        name: self.name,
        summary: self.metadata.summary,
        version: self.version,
        earliestCompatibleVersion: self.earliestCompatibleVersion,
        isTest: self.isTest,
        builds: [],
        plugins: []
      };

      if (self.debugOnly) {
        mainJson.debugOnly = true;
      }
      if (! _.isEmpty(self.cordovaDependencies)) {
        mainJson.cordovaDependencies = self.cordovaDependencies;
      }

      var buildInfoJson = null;
      if (!options.elideBuildInfo) {
        // Note: The contents of buildInfoJson (with the root directory of the
        // Meteor checkout naively deleted) gets its SHA taken to determine the
        // built package's warehouse version. So it should not contain
        // platform-dependent data and should contain all sources of change to
        // the isopack's output.  See
        // scripts/admin/build-package-tarballs.sh.
        // XXX this script is no longer relevant; we use "build IDs" now instead
        var buildTimeDirectDeps = getLoadedPackageVersions(
          self.buildTimeDirectDependencies, options.catalog);
        var buildTimePluginDeps = {};
        _.each(self.buildTimePluginDependencies, function (versions, pluginName) {
          buildTimePluginDeps[pluginName] = getLoadedPackageVersions(
            versions, options.catalog);
        });

        buildInfoJson = {
          builtBy: compiler.BUILT_BY,
          buildDependencies: { },
          pluginDependencies: self.pluginWatchSet.toJSON(),
          pluginProviderPackages: self.pluginProviderPackageDirs,
          source: options.buildOfPath || undefined,
          buildTimeDirectDependencies: buildTimeDirectDeps,
          buildTimePluginDependencies: buildTimePluginDeps,
          cordovaDependencies: self.cordovaDependencies
        };
      }

      // XXX COMPAT WITH 0.9.3
      builder.reserve("unipackage.json");

      builder.reserve("isopack.json");
      // Reserve this even if elideBuildInfo is set, to ensure nothing else
      // writes it somehow.
      builder.reserve("buildinfo.json");
      builder.reserve("head");
      builder.reserve("body");

      // Map from absolute path to npm directory in the unibuild, to the
      // generated filename in the isopack we're writing.  Multiple builds
      // can use the same npm modules (though maybe not any more, since tests
      // have been separated?), but also there can be different sets of
      // directories as well (eg, for a isopack merged with from multiple
      // isopacks with _loadUnibuildsFromPath).
      var npmDirectories = {};

      // Pre-linker versions of Meteor expect all packages in the warehouse to
      // contain a file called "package.js"; they use this as part of deciding
      // whether or not they need to download a new package. Because packages
      // are downloaded by the *existing* version of the tools, we need to
      // include this file until we're comfortable breaking "meteor update" from
      // 0.6.4.  (Specifically, warehouse.packageExistsInWarehouse used to check
      // to see if package.js exists instead of just looking for the package
      // directory.)
      // XXX Remove this once we can.
      builder.write("package.js", {
        data: new Buffer(
          ("// This file is included for compatibility with the Meteor " +
           "0.6.4 package downloader.\n"),
          "utf8")
      });

      // Unibuilds
      _.each(self.unibuilds, function (unibuild) {
        // Make up a filename for this unibuild
        var baseUnibuildName = unibuild.arch;
        var unibuildDir =
          builder.generateFilename(baseUnibuildName, { directory: true });
        var unibuildJsonFile =
          builder.generateFilename(baseUnibuildName + ".json");
        mainJson.builds.push({
          arch: unibuild.arch,
          path: unibuildJsonFile
        });

        // Save unibuild dependencies. Keyed by the json path rather than thinking
        // too hard about how to encode pair (name, arch).
        if (buildInfoJson) {
          buildInfoJson.buildDependencies[unibuildJsonFile] =
            unibuild.watchSet.toJSON();
        }

        // Figure out where the npm dependencies go.
        var nodeModulesPath = undefined;
        var needToCopyNodeModules = false;
        if (unibuild.nodeModulesPath) {
          if (_.has(npmDirectories, unibuild.nodeModulesPath)) {
            // We already have this npm directory from another unibuild.
            nodeModulesPath = npmDirectories[unibuild.nodeModulesPath];
          } else {
            // It's important not to put node_modules at the top level of the
            // isopack, so that it is not visible from within plugins.
            nodeModulesPath = npmDirectories[unibuild.nodeModulesPath] =
              builder.generateFilename("npm/node_modules", {directory: true});
            needToCopyNodeModules = true;
          }
        }

        // Construct unibuild metadata
        var unibuildJson = {
          format: "unipackage-unibuild-pre1",
          packageVariables: unibuild.packageVariables,
          uses: _.map(unibuild.uses, function (u) {
            return {
              'package': u.package,
              // For cosmetic value, leave false values for these options out of
              // the JSON file.
              constraint: u.constraint || undefined,
              unordered: u.unordered || undefined,
              weak: u.weak || undefined
            };
          }),
          implies: (_.isEmpty(unibuild.implies) ? undefined : unibuild.implies),
          node_modules: nodeModulesPath,
          resources: []
        };

        // Output 'head', 'body' resources nicely
        var concat = { head: [], body: [] };
        var offset = { head: 0, body: 0 };
        _.each(unibuild.resources, function (resource) {
          if (_.contains(["head", "body"], resource.type)) {
            if (concat[resource.type].length) {
              concat[resource.type].push(new Buffer("\n", "utf8"));
              offset[resource.type]++;
            }
            if (! (resource.data instanceof Buffer))
              throw new Error("Resource data must be a Buffer");
            unibuildJson.resources.push({
              type: resource.type,
              file: path.join(unibuildDir, resource.type),
              length: resource.data.length,
              offset: offset[resource.type]
            });
            concat[resource.type].push(resource.data);
            offset[resource.type] += resource.data.length;
          }
        });
        _.each(concat, function (parts, type) {
          if (parts.length) {
            builder.write(path.join(unibuildDir, type), {
              data: Buffer.concat(concat[type], offset[type])
            });
          }
        });

        // Output other resources each to their own file
        _.each(unibuild.resources, function (resource) {
          if (_.contains(["head", "body"], resource.type))
            return; // already did this one

          unibuildJson.resources.push({
            type: resource.type,
            file: builder.writeToGeneratedFilename(
              path.join(unibuildDir, resource.servePath),
              { data: resource.data }),
            length: resource.data.length,
            offset: 0,
            servePath: resource.servePath || undefined,
            path: resource.path || undefined
          });
        });

        // Output prelink resources
        _.each(unibuild.prelinkFiles, function (file) {
          var data = new Buffer(file.source, 'utf8');
          var resource = {
            type: 'prelink',
            file: builder.writeToGeneratedFilename(
              path.join(unibuildDir, file.servePath),
              { data: data }),
            length: data.length,
            offset: 0,
            servePath: file.servePath || undefined
          };

          if (file.sourceMap) {
            // Write the source map.
            resource.sourceMap = builder.writeToGeneratedFilename(
              path.join(unibuildDir, file.servePath + '.map'),
              { data: new Buffer(file.sourceMap, 'utf8') }
            );
          }

          unibuildJson.resources.push(resource);
        });

        // If unibuild has included node_modules, copy them in
        if (needToCopyNodeModules) {
          builder.copyDirectory({
            from: unibuild.nodeModulesPath,
            to: nodeModulesPath,
            npmDiscards: self.npmDiscards
          });
        }

        // Control file for unibuild
        builder.writeJson(unibuildJsonFile, unibuildJson);
      });

      // Plugins
      _.each(self.plugins, function (pluginsByArch, name) {
        _.each(pluginsByArch, function (plugin) {
          var pluginDir =
                builder.generateFilename('plugin.' + name + '.' + plugin.arch,
                                         { directory: true });
          var relPath = plugin.write(builder.enter(pluginDir));
          mainJson.plugins.push({
            name: name,
            arch: plugin.arch,
            path: path.join(pluginDir, relPath)
          });
        });
      });

      // Tools
      // First, are we supposed to include our own source as a tool?
      if (self.includeTool) {
        var toolsJson = self._writeTool(builder);
        mainJson.tools = toolsJson;
      }
      // Next, what about other tools we may be merging from other isopacks?
      // XXX check for overlap
      _.each(self.toolsOnDisk, function (toolMeta) {
        toolMeta = _.clone(toolMeta);
        var rootDir = toolMeta.rootDir;
        delete toolMeta.rootDir;
        builder.copyDirectory({
          from: path.join(rootDir, toolMeta.path),
          to: toolMeta.path
        });
        if (!mainJson.tools) {
          mainJson.tools = [];
        }
        mainJson.tools.push(toolMeta);
      });

      // old unipackage.json format/filename
      // XXX COMPAT WITH 0.9.3
      builder.writeJson("unipackage.json",
        convertIsopackFormat(mainJson, currentFormat, "unipackage-pre2"));

      // write several versions of the file
      // add your new format here, and define some stuff
      // in convertIsopackFormat
      var formats = ["isopack-1"];
      var isopackJson = {};
      _.each(formats, function (format) {
        // new, extensible format - forwards-compatible
        isopackJson[format] = convertIsopackFormat(mainJson,
          currentFormat, format);
      });

      // writes one file with all of the new formats, so that it is possible
      // to invent a new format and have old versions of meteor still read the
      // old format
      //
      // This looks something like:
      // {
      //   isopack-1: {... data ...},
      //   isopack-2: {... data ...}
      // }
      builder.writeJson("isopack.json", isopackJson);

      if (buildInfoJson) {
        builder.writeJson("buildinfo.json", buildInfoJson);
      }
      builder.complete();
    } catch (e) {
      builder.abort();
      throw e;
    }
  },

  _writeTool: function (builder) {
    var self = this;
    buildmessage.assertInCapture();

    var pathsToCopy = files.runGitInCheckout(
      'ls-tree',
      '-r',  // recursive
      '--name-only',
      '--full-tree',
      'HEAD',
      // The actual trees to copy!
      'tools', 'examples', 'LICENSE.txt', 'meteor',
      'scripts/admin/launch-meteor');

    // Trim blank line and unnecessary examples.
    pathsToCopy = _.filter(pathsToCopy.split('\n'), function (f) {
      return f && !f.match(/^examples\/other/) &&
        !f.match(/^examples\/unfinished/);
    });

    var gitSha = files.runGitInCheckout('rev-parse', 'HEAD');


    var toolPath = 'meteor-tool-' + archinfo.host();
    builder = builder.enter(toolPath);
    var unipath = builder.reserve('isopacks', {directory: true});
    builder.write('.git_version.txt', {data: new Buffer(gitSha, 'utf8')});

    builder.copyDirectory({
      from: files.getCurrentToolsDir(),
      to: '',
      specificFiles: pathsToCopy
    });
    builder.copyDirectory({
      from: path.join(files.getDevBundle()),
      to: 'dev_bundle',
      ignore: bundler.ignoreFiles
    });

    // We only want to load local packages.
    var localPackageLoader = new packageLoader.PackageLoader({
      versions: null,
      catalog: catalog.uniload,
      constraintSolverOpts: { ignoreProjectDeps: true }
    });
    bundler.iterateOverAllUsedIsopacks(
      localPackageLoader, archinfo.host(), uniload.ROOT_PACKAGES,
      function (isopk) {
        // XXX assert that each name shows up once
        isopk.saveToPath(path.join(unipath, isopk.name), {
          // There's no mechanism to rebuild these packages.
          elideBuildInfo: true
        });
      });

    return [{
      name: 'meteor',
      arch: archinfo.host(),
      path: toolPath
    }];
  },

  // Computes a hash of the versions of all the package's dependencies
  // (direct and plugin dependencies) and the unibuilds' and plugins' watch
  // sets. Options are:
  //  - relativeTo: if provided, the watch set file paths are
  //    relativized to this path. If not provided, we use absolute
  //    paths.
  //  - catalog: required
  //
  // Returns the build id as a hex string.
  getBuildIdentifier: function (options) {
    var self = this;
    buildmessage.assertInCapture();
    if (!options.catalog)
      throw Error("required to specify the catalog");

    // Gather all the direct dependencies (that provide plugins) and
    // plugin dependencies' versions and organize them into arrays. We
    // use arrays to avoid relying on the order of stringified object
    // keys.
    var pluginProviders = [];
    var pluginProviderVersions = getLoadedPackageVersions(
      self.buildTimeDirectDependencies, options.catalog,
      function (packageName, version) { // filter
        if (packageName !== self.name) {
          var catalogVersion = options.catalog.getVersion(packageName, version);
          // XXX This could throw if we call it on a freshly-built
          // isopack (as opposed to one read from disk that has real
          // build ids for build-time deps instead of +local) before
          // catalog initialization has finished. See XXX at the top of
          // `getPluginProviders` in compiler.js.
          if (! catalogVersion) {
            throw new Error("No catalog version for" + packageName +
                            "version" + version + "?");
          }
          return catalogVersion.containsPlugins;
        } else {
          return false;
        }
      }
    );

    _.each(pluginProviderVersions, function (version, packageName) {
      pluginProviders.push([packageName, version]);
    });
    _.sortBy(pluginProviders, "0");


    var pluginDeps = [];
    // Mild hack documentation: versions for a pluginName can be null if this is
    // a preconstraint-solver build. (That, elsewhere, indicates to us that we
    // should only use local packages to build it -- and neatly avoids having to
    // resolve its dependencies) So, we need to check for that.
    // #UnbuiltConstraintSolverMustUseLocalPackages
    _.each(
      self.buildTimePluginDependencies,
      function (versions, pluginName) {
        versions = versions ?_.clone(versions): {};
        var singlePluginDeps = [];
        delete versions[self.name];
        _.each(
          getLoadedPackageVersions(versions, options.catalog),
          function (version, packageName) {
            if (packageName !== self.name) {
              singlePluginDeps.push([packageName, version]);
            }
          }
        );
        singlePluginDeps = _.sortBy(singlePluginDeps, "0");
        pluginDeps.push([pluginName, singlePluginDeps]);
      }
    );
    pluginDeps = _.sortBy(pluginDeps, "0");

    // Now that we have versions for all our dependencies, canonicalize
    // the unibuilds' and plugins' watch sets.
    var watchFiles = [];
    var watchSet = new watch.WatchSet();
    watchSet.merge(self.pluginWatchSet);
    _.each(self.unibuilds, function (unibuild) {
      watchSet.merge(unibuild.watchSet);
    });
    _.each(watchSet.files, function (hash, fileAbsPath) {
      var watchFilePath = fileAbsPath;
      if (options.relativeTo) {
        watchFilePath = path.relative(options.relativeTo, fileAbsPath);
      }
      watchFiles.push([watchFilePath, hash]);
    });
    watchFiles = _.sortBy(watchFiles, "0");

    // Stick all our info into one big array, stringify it, and hash it.
    var buildIdInfo = [
      self.builtBy,
      pluginProviders,
      pluginDeps,
      watchFiles
    ];
    var crypto = require('crypto');
    var hasher = crypto.createHash('sha1');
    hasher.update(JSON.stringify(buildIdInfo));
    return hasher.digest('hex');
  },

  // Adds the build identifier to the isopack's `version` field. The
  // caller is responsible for checking whether the existing version has
  // a build identifier already. Options are the same as
  // `getBuildIdentifier`.
  addBuildIdentifierToVersion: function (options) {
    var self = this;
    buildmessage.assertInCapture();
    self.version = self.version + "+" +
      self.getBuildIdentifier(options);
  }
});

exports.Isopack = Isopack;

exports.OldIsopackFormatError = function () {
  // This should always be caught anywhere where it can appear (ie, anywhere
  // that isn't definitely loading something from the tropohouse).
  this.toString = function () { return "old isopack format!" };
};

exports.isopackExistsAtPath = function (thePath) {
  // XXX COMPAT WITH 0.9.3
  // Remove unipackage.json when no longer supported
  return fs.existsSync(path.join(thePath, 'isopack.json')) ||
    fs.existsSync(path.join(thePath, 'unipackage.json'));
};
