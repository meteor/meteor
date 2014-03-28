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
var PackageLoader = require('./package-loader.js');

var rejectBadPath = function (p) {
  if (p.match(/\.\./))
    throw new Error("bad path: " + p);
};

///////////////////////////////////////////////////////////////////////////////
// UnipackageSlice
///////////////////////////////////////////////////////////////////////////////

// Options:
// - name [required]
// - arch [required]
// - uses
// - implies
// - noExports
// - watchSet
// - nodeModulesPath
// - prelinkFiles
// - packageVariables
// - resources

var nextUniqueSliceId = 1;
var UnipackageSlice = function (unipackage, options) {
  var self = this;
  options = options || {};
  self.pkg = unipackage;

  // These have the same meaning as they do in SourceSlice.
  self.sliceName = options.name;
  self.arch = options.arch;
  self.uses = options.uses;
  self.implies = options.implies || [];
  self.noExports = options.noExports;

  // This WatchSet will end up having the watch items from the
  // SourceSlice (such as package.js or .meteor/packages), plus all of
  // the actual source files for the slice (including items that we
  // looked at to find the source files, such as directories we
  // scanned).
  self.watchSet = options.watchSet || new watch.WatchSet();

  // Each UnipackageSlice is given a unique id when it's loaded (it is
  // not saved to disk). This is just a convenience to make it easier
  // to keep track of UnipackageSlices in a map; it's used by bundler
  // and compiler. We put some human readable info in here too to make
  // debugging easier.
  self.id = unipackage.name + "." + self.sliceName + "@" + self.arch + "#" +
    (nextUniqueSliceId ++);

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
  // Both of these are saved into slices on disk, and are inputs into the final
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
  // resolve Npm.require() calls in this slice. null if this slice
  // does not have a node_modules.
  self.nodeModulesPath = options.nodeModulesPath;
};

_.extend(UnipackageSlice.prototype, {
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
  // packageLoader is the PackageLoader that should be used to resolve
  // the package's bundle-time dependencies.
  getResources: function (bundleArch, packageLoader) {
    var self = this;

    if (! archinfo.matches(bundleArch, self.arch))
      throw new Error("slice of arch '" + self.arch + "' does not support '" +
                      bundleArch + "'?");

    // Compute imports by merging the exports of all of the packages
    // we use. Note that in the case of conflicting symbols, later
    // packages get precedence.
    //
    // We don't get imports from unordered dependencies (since they may not be
    // defined yet) or from weak dependencies (because the meaning of a name
    // shouldn't be affected by the non-local decision of whether or not an
    // unrelated package in the target depends on something).
    var imports = {}; // map from symbol to supplying package name
    compiler.eachUsedSlice(
      self.uses,
      bundleArch, packageLoader,
      {skipWeak: true, skipUnordered: true}, function (otherSlice) {
        _.each(otherSlice.packageVariables, function (symbol) {
          // Slightly hacky implementation of test-only exports.
          if (symbol.export === true ||
              (symbol.export === "tests" && self.sliceName === "tests"))
            imports[symbol.name] = otherSlice.pkg.name;
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
      noExports: self.noExports,
      packageVariables: self.packageVariables,
      includeSourceMapInstructions: archinfo.matches(self.arch, "browser"),
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
// Unipackage
///////////////////////////////////////////////////////////////////////////////

// XXX document
var Unipackage = function (packageDirectoryForBuildInfo) {
  var self = this;

  // These have the same meaning as in PackageSource.
  self.name = null;
  self.metadata = {};
  self.version = null;
  self.earliestCompatibleVersion = null;
  self.defaultSlices = {};
  self.testSlices = {};

  // XXX this is likely to go away once we have build versions
  // (also in PackageSource)
  self.packageDirectoryForBuildInfo = packageDirectoryForBuildInfo;

  // Build slices. Array of UnipackageSlice.
  self.slices = [];

  // Plugins in this package. Map from plugin name to {arch -> JsImage}.
  self.plugins = {};

  // -- Information for up-to-date checks --

  // Version number of the tool that built this unipackage
  // (compiler.BUILT_BY) or null if unknown
  self.builtBy = null;

  // If true, force the checkUpToDate to return false for this unipackage.
  self.forceNotUpToDate = false;

  // The versions that we used at build time for each of our direct
  // dependencies. Map from package name to version string.
  // XXX save to disk
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
};

_.extend(Unipackage.prototype, {
  // Make a dummy (empty) package that contains nothing of interest.
  // XXX used?
  initEmpty: function (name) {
    var self = this;
    self.name = name;
    self.defaultSlices = {'': []};
    self.testSlices = {'': []};
  },

  // This is primarily intended to be used by the compiler. After
  // calling this, call addSlice to add the slices.
  initFromOptions: function (options) {
    var self = this;
    self.name = options.name;
    self.metadata = options.metadata;
    self.version = options.version;
    self.earliestCompatibleVersion = options.earliestCompatibleVersion;
    self.defaultSlices = options.defaultSlices;
    self.testSlices = options.testSlices;
    self.packageDirectoryForBuildInfo = options.packageDirectoryForBuildInfo;
    self.plugins = options.plugins;
    self.pluginWatchSet = options.pluginWatchSet;
    self.buildTimeDirectDependencies = options.buildTimeDirectDependencies;
    self.buildTimePluginDependencies = options.buildTimePluginDependencies;
  },

  // Programmatically add a slice to this Unipackage. Should only be
  // called as part of building up a new Unipackage using
  // initFromOptions. 'options' are the options to the UnipackageSlice
  // constructor.
  addSlice: function (options) {
    var self = this;
    self.slices.push(new UnipackageSlice(self, options));
  },

  architectures: function () {
    var self = this;
    return _.uniq(_.pluck(self.slices, 'arch')).sort();
  },

  // Return the slice of the package to use for a given slice name
  // (eg, 'main' or 'test') and target architecture (eg,
  // 'os.linux.x86_64' or 'browser'), or throw an exception if
  // that packages can't be loaded under these circumstances.
  getSingleSlice: function (name, arch) {
    var self = this;

    var chosenArch = archinfo.mostSpecificMatch(
      arch, _.pluck(_.where(self.slices, { sliceName: name }), 'arch'));

    if (! chosenArch) {
      // XXX need improvement. The user should get a graceful error
      // message, not an exception, and all of this talk of slices an
      // architectures is likely to be confusing/overkill in many
      // contexts.
      throw new Error((self.name || "this app") +
                      " does not have a slice named '" + name +
                      "' that runs on architecture '" + arch + "'");
    }

    return _.where(self.slices, { sliceName: name, arch: chosenArch })[0];
  },

  // Return the slices that should be used on a given arch if the
  // package is named without any qualifiers (eg, 'ddp' rather than
  // 'ddp.client').
  //
  // On error, throw an exception, or if inside
  // buildmessage.capture(), log a build error and return [].
  getDefaultSlices: function (arch) {
    var self = this;

    var chosenArch = archinfo.mostSpecificMatch(arch,
                                                _.keys(self.defaultSlices));

    if (! chosenArch) {
      buildmessage.error(
        (self.name || "this app") +
          " is not compatible with architecture '" + arch + "'",
        { secondary: true });
      // recover by returning by no slices
      return [];
    }

    return _.map(self.defaultSlices[chosenArch], function (name) {
      return self.getSingleSlice(name, arch);
    });
  },

  // Return the slices that should be used to test the package on a
  // given arch.
  getTestSlices: function (arch) {
    var self = this;

    var chosenArch = archinfo.mostSpecificMatch(arch,
                                                _.keys(self.testSlices));
    if (! chosenArch) {
      buildmessage.error(
        (self.name || "this app") +
          " does not have tests for architecture " + arch + "'",
        { secondary: true });
      // recover by returning by no slices
      return [];
    }

    return _.map(self.testSlices[chosenArch], function (name) {
      return self.getSingleSlice(name, arch);
    });
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

    var Plugin = {
      // 'extension' is a file extension without the separation dot
      // (eg 'js', 'coffee', 'coffee.md')
      //
      // 'handler' is a function that takes a single argument, a
      // CompileStep (#CompileStep)
      registerSourceHandler: function (extension, handler) {
        if (_.has(self.sourceHandlers, extension)) {
          buildmessage.error("duplicate handler for '*." +
                             extension + "'; may only have one per Plugin",
                             { useMyCaller: true });
          // recover by ignoring all but the first
          return;
        }

        self.sourceHandlers[extension] = handler;
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
        title: "loading plugin `" + name +
          "` from package `" + self.name + "`"
        // don't necessarily have rootPath anymore
        // (XXX we do, if the unipackage was locally built, which is
        // the important case for debugging. it'd be nice to get this
        // case right.)
      }, function () {
        plugin.load({ Plugin: Plugin });
      });
    });

    self._pluginsInitialized = true;
  },

  // Load a Unipackage on disk.
  //
  // options:
  // - buildOfPath: If present, the source directory (as an absolute
  //   path on local disk) of which we think this unipackage is a
  //   build. If it's not (it was copied from somewhere else), we
  //   consider it not up to date (in the sense of checkUpToDate) so
  //   that we can rebuild it and correct the absolute paths in the
  //   dependency information.
  initFromPath: function (name, dir, options) {
    var self = this;
    options = _.clone(options || {});
    options.firstUnipackage = true;

    return self._loadSlicesFromPath(name, dir, options);
  },

  _loadSlicesFromPath: function (name, dir, options) {
    var self = this;
    options = options || {};

    var mainJson =
      JSON.parse(fs.readFileSync(path.join(dir, 'unipackage.json')));

    if (mainJson.format !== "unipackage-pre1")
      throw new Error("Unsupported unipackage format: " +
                      JSON.stringify(mainJson.format));

    var buildInfoPath = path.join(dir, 'buildinfo.json');
    var buildInfoJson = fs.existsSync(buildInfoPath) &&
      JSON.parse(fs.readFileSync(buildInfoPath));
    if (buildInfoJson) {
      if (!options.firstUnipackage) {
        throw Error("can't merge unipackages with buildinfo");
      }
    } else {
      buildInfoJson = {};
    }

    // XXX should comprehensively sanitize (eg, typecheck) everything
    // read from json files

    // Read basic buildinfo.json info

    self.builtBy = buildInfoJson.builtBy || null;

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

    // Read the watch sets for each slice
    var sliceWatchSets = {};
    _.each(buildInfoJson.sliceDependencies, function (watchSetJSON, sliceTag) {
      sliceWatchSets[sliceTag] = watch.WatchSet.fromJSON(watchSetJSON);
    });

    // Read pluginWatchSet and pluginProviderPackageDirs. (In the
    // multi-sub-unipackage case, these are guaranteed to be trivial
    // (since we check that there's no buildinfo.json), so no need to
    // merge.)
    self.pluginWatchSet = watch.WatchSet.fromJSON(
      buildInfoJson.pluginDependencies);
    self.pluginProviderPackageDirs = buildInfoJson.pluginProviderPackages || {};

    // If we are loading multiple unipackages, only take this stuff from the
    // first one.
    if (options.firstUnipackage) {
      self.name = name;
      self.metadata = {
        summary: mainJson.summary,
        internal: mainJson.internal
      };
      self.version = mainJson.version;
      self.earliestCompatibleVersion = mainJson.earliestCompatibleVersion;
    }
    // If multiple sub-unipackages specify defaultSlices or testSlices for the
    // same arch, just take the answer from the first sub-unipackage.
    self.defaultSlices = _.extend(mainJson.defaultSlices,
                                  self.defaultSlices || {});
    self.testSlices = _.extend(mainJson.testSlices,
                               self.testSlices || {});

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

    _.each(mainJson.slices, function (sliceMeta) {
      // aggressively sanitize path (don't let it escape to parent
      // directory)
      rejectBadPath(sliceMeta.path);

      // Skip slices we already have.
      var alreadyHaveSlice = _.find(self.slices, function (slice) {
        return slice.sliceName === sliceMeta.name &&
          slice.arch === sliceMeta.arch;
      });
      if (alreadyHaveSlice)
        return;

      var sliceJson = JSON.parse(
        fs.readFileSync(path.join(dir, sliceMeta.path)));
      var sliceBasePath = path.dirname(path.join(dir, sliceMeta.path));

      if (sliceJson.format!== "unipackage-slice-pre1")
        throw new Error("Unsupported unipackage slice format: " +
                        JSON.stringify(sliceJson.format));

      var nodeModulesPath = null;
      if (sliceJson.node_modules) {
        rejectBadPath(sliceJson.node_modules);
        nodeModulesPath = path.join(sliceBasePath, sliceJson.node_modules);
      }

      var prelinkFiles = [];
      var resources = [];

      _.each(sliceJson.resources, function (resource) {
        rejectBadPath(resource.file);

        var data = new Buffer(resource.length);
        // Read the data from disk, if it is non-empty. Avoid doing IO for empty
        // files, because (a) unnecessary and (b) fs.readSync with length 0
        // throws instead of acting like POSIX read:
        // https://github.com/joyent/node/issues/5685
        if (resource.length > 0) {
          var fd = fs.openSync(path.join(sliceBasePath, resource.file), "r");
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
              path.join(sliceBasePath, resource.sourceMap), 'utf8');
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
          throw new Error("bad resource type in unipackage: " +
                          JSON.stringify(resource.type));
      });

      self.slices.push(new UnipackageSlice(self, {
        name: sliceMeta.name,
        arch: sliceMeta.arch,
        uses: sliceJson.uses,
        implies: sliceJson.implies,
        noExports: !! sliceJson.noExports,
        watchSet: sliceWatchSets[sliceMeta.path],
        nodeModulesPath: nodeModulesPath,
        prelinkFiles: prelinkFiles,
        packageVariables: sliceJson.packageVariables || [],
        resources: resources
      }));
    });

    return true;
  },

  // options:
  //
  // - buildOfPath: Optional. The absolute path on local disk of the
  //   directory that was built to produce this package. Used as part
  //   of the dependency info to detect builds that were moved and
  //   then modified.
  saveToPath: function (outputPath, options) {
    var self = this;
    options = options || {};

    if (! self.version) {
      // XXX is this going to work? may need to relax it for apps?
      // that seems reasonable/useful. I guess the basic rules then
      // becomes that you can't depend on something if it doesn't have
      // a name and a version
      throw new Error("Packages without versions cannot be saved");
    }

    var builder = new Builder({ outputPath: outputPath });

    try {

      var mainJson = {
        format: "unipackage-pre1",
        summary: self.metadata.summary,
        internal: self.metadata.internal,
        version: self.version,
        earliestCompatibleVersion: self.earliestCompatibleVersion,
        slices: [],
        defaultSlices: self.defaultSlices,
        testSlices: self.testSlices,
        plugins: []
      };

      // Note: The contents of buildInfoJson (with the root directory of the
      // Meteor checkout naively deleted) gets its SHA taken to determine the
      // built package's warehouse version. So it should not contain
      // platform-dependent data and should contain all sources of change to the
      // unipackage's output.  See scripts/admin/build-package-tarballs.sh.
      var buildInfoJson = {
        builtBy: compiler.BUILT_BY,
        sliceDependencies: { },
        pluginDependencies: self.pluginWatchSet.toJSON(),
        pluginProviderPackages: self.pluginProviderPackageDirs,
        source: options.buildOfPath || undefined
      };

      builder.reserve("unipackage.json");
      builder.reserve("buildinfo.json");
      builder.reserve("head");
      builder.reserve("body");

      // Map from absolute path to npm directory in the slice, to the generated
      // filename in the unipackage we're writing.  Multiple slices can use the
      // same npm modules (eg, for now, main and tests slices), but also there
      // can be different sets of directories as well (eg, for a unipackage
      // merged with from multiple unipackages with _loadSlicesFromPath).
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

      // Slices
      _.each(self.slices, function (slice) {
        // Make up a filename for this slice
        var baseSliceName =
          (slice.sliceName === "main" ? "" : (slice.sliceName + ".")) +
          slice.arch;
        var sliceDir =
          builder.generateFilename(baseSliceName, { directory: true });
        var sliceJsonFile =
          builder.generateFilename(baseSliceName + ".json");

        mainJson.slices.push({
          name: slice.sliceName,
          arch: slice.arch,
          path: sliceJsonFile
        });

        // Save slice dependencies. Keyed by the json path rather than thinking
        // too hard about how to encode pair (name, arch).
        buildInfoJson.sliceDependencies[sliceJsonFile] =
          slice.watchSet.toJSON();

        // Figure out where the npm dependencies go.
        var nodeModulesPath = undefined;
        var needToCopyNodeModules = false;
        if (slice.nodeModulesPath) {
          if (_.has(npmDirectories, slice.nodeModulesPath)) {
            // We already have this npm directory from another slice.
            nodeModulesPath = npmDirectories[slice.nodeModulesPath];
          } else {
            // It's important not to put node_modules at the top level of the
            // unipackage, so that it is not visible from within plugins.
            nodeModulesPath = npmDirectories[slice.nodeModulesPath] =
              builder.generateFilename("npm/node_modules", {directory: true});
            needToCopyNodeModules = true;
          }
        }

        // Construct slice metadata
        var sliceJson = {
          format: "unipackage-slice-pre1",
          noExports: slice.noExports || undefined,
          packageVariables: slice.packageVariables,
          uses: _.map(slice.uses, function (u) {
            return {
              'package': u.package,
              // For cosmetic value, leave false values for these options out of
              // the JSON file.
              constraint: u.constraint || undefined,
              slice: u.slice || undefined,
              unordered: u.unordered || undefined,
              weak: u.weak || undefined
            };
          }),
          implies: (_.isEmpty(slice.implies) ? undefined : slice.implies),
          node_modules: nodeModulesPath,
          resources: []
        };

        // Output 'head', 'body' resources nicely
        var concat = { head: [], body: [] };
        var offset = { head: 0, body: 0 };
        _.each(slice.resources, function (resource) {
          if (_.contains(["head", "body"], resource.type)) {
            if (concat[resource.type].length) {
              concat[resource.type].push(new Buffer("\n", "utf8"));
              offset[resource.type]++;
            }
            if (! (resource.data instanceof Buffer))
              throw new Error("Resource data must be a Buffer");
            sliceJson.resources.push({
              type: resource.type,
              file: path.join(sliceDir, resource.type),
              length: resource.data.length,
              offset: offset[resource.type]
            });
            concat[resource.type].push(resource.data);
            offset[resource.type] += resource.data.length;
          }
        });
        _.each(concat, function (parts, type) {
          if (parts.length) {
            builder.write(path.join(sliceDir, type), {
              data: Buffer.concat(concat[type], offset[type])
            });
          }
        });

        // Output other resources each to their own file
        _.each(slice.resources, function (resource) {
          if (_.contains(["head", "body"], resource.type))
            return; // already did this one

          sliceJson.resources.push({
            type: resource.type,
            file: builder.writeToGeneratedFilename(
              path.join(sliceDir, resource.servePath),
              { data: resource.data }),
            length: resource.data.length,
            offset: 0,
            servePath: resource.servePath || undefined,
            path: resource.path || undefined
          });
        });

        // Output prelink resources
        _.each(slice.prelinkFiles, function (file) {
          var data = new Buffer(file.source, 'utf8');
          var resource = {
            type: 'prelink',
            file: builder.writeToGeneratedFilename(
              path.join(sliceDir, file.servePath),
              { data: data }),
            length: data.length,
            offset: 0,
            servePath: file.servePath || undefined
          };

          if (file.sourceMap) {
            // Write the source map.
            resource.sourceMap = builder.writeToGeneratedFilename(
              path.join(sliceDir, file.servePath + '.map'),
              { data: new Buffer(file.sourceMap, 'utf8') }
            );
          }

          sliceJson.resources.push(resource);
        });

        // If slice has included node_modules, copy them in
        if (needToCopyNodeModules) {
          builder.copyDirectory({
            from: slice.nodeModulesPath,
            to: nodeModulesPath
          });
        }

        // Control file for slice
        builder.writeJson(sliceJsonFile, sliceJson);
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

      builder.writeJson("unipackage.json", mainJson);
      builder.writeJson("buildinfo.json", buildInfoJson);
      builder.complete();
    } catch (e) {
      builder.abort();
      throw e;
    }
  },

  // Computes a hash of the versions of all the package's dependencies
  // (direct and plugin dependencies) and the slices' and plugins' watch
  // sets. Adds the result as a build identifier to the unipackage's
  // version. The caller is responsible for checking whether the
  // existing version has a build identifier already.
  addBuildIdentifierToVersion: function () {
    var self = this;
    // Gather all the dependencies' versions and organize them into
    // arrays. We use arrays to avoid relying on the order of
    // stringified object keys.
    var directDeps = [];
    var directDepsLoader = new PackageLoader(self.buildTimeDirectDependencies);
    _.each(self.buildTimeDirectDependencies, function (version, packageName) {
      var unipackage = directDepsLoader.getPackage(packageName);
      directDeps.push([unipackage.name, unipackage.version]);
    });

    // Sort direct dependencies by package name (which is the "0" property
    // of each element in the array).
    directDeps = _.sortBy(directDeps, "0");

    var pluginDeps = [];
    _.each(self.buildTimePluginDependencies, function (versions, pluginName) {
      var pluginDepsLoader = new PackageLoader(versions);
      var singlePluginDeps = [];
      _.each(versions, function (version, packageName) {
        var unipackage = pluginDepsLoader.getPackage(packageName);
        singlePluginDeps.push([unipackage.name, unipackage.version]);
      });
      singlePluginDeps = _.sortBy(singlePluginDeps, "0");
      pluginDeps.push([pluginName, singlePluginDeps]);
    });
    pluginDeps = _.sortBy(pluginDeps, "0");

    // Now that we have versions for all our dependencies, canonicalize
    // the slices' and plugins' watch sets.
    // XXX Do we need to relativize paths? Why?
    var watchFiles = [];
    var watchSet = new watch.WatchSet();
    watchSet.merge(self.pluginWatchSet);
    _.each(self.slices, function (slice) {
      watchSet.merge(slice.watchSet);
    });
    _.each(watchSet.files, function (hash, fileAbsPath) {
      watchFiles.push([fileAbsPath, hash]);
    });
    watchFiles = _.sortBy(watchFiles, "0");

    // Stick all our info into one big array, stringify it, and hash it.
    var buildIdInfo = [
      directDeps,
      pluginDeps,
      watchFiles
    ];
    var crypto = require('crypto');
    var hasher = crypto.createHash('sha1');
    hasher.update(JSON.stringify(buildIdInfo));
    var buildId = hasher.digest('hex');
    self.version = self.version + "+" + buildId;
  }
});

module.exports = Unipackage;
