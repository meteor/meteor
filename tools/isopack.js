var compiler = require('./compiler.js');
var archinfo = require('./archinfo.js');
var _ = require('underscore');
var linker = require('./linker.js');
var buildmessage = require('./buildmessage.js');
var Builder = require('./builder.js');
var bundler = require('./bundler.js');
var watch = require('./watch.js');
var files = require('./files.js');
var isopackets = require("./isopackets.js");
var isopackCacheModule = require('./isopack-cache.js');
var packageMapModule = require('./package-map.js');
var colonConverter = require('./colon-converter.js');
var Future = require('fibers/future');
var Console = require('./console.js').Console;
var Profile = require('./profile.js').Profile;

var rejectBadPath = function (p) {
  if (p.match(/\.\./))
    throw new Error("bad path: " + p);
};

///////////////////////////////////////////////////////////////////////////////
// Unibuild
///////////////////////////////////////////////////////////////////////////////

// Options:
// - kind [required] (main/plugin/app)
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

  self.kind = options.kind;
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
  self.id = self.pkg.name + "." + self.kind + "@" + self.arch + "#" +
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
  getResources: Profile(
    "Unibuild#getResources", function (bundleArch, options) {
    var self = this;
    var isopackCache = options.isopackCache;
    if (! isopackCache)
      throw Error("no isopackCache?");

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

    var addImportsForUnibuild = function (depUnibuild) {
      _.each(depUnibuild.packageVariables, function (symbol) {
        // Slightly hacky implementation of test-only exports.
        if (symbol.export === true ||
            (symbol.export === "tests" && self.pkg.isTest))
          imports[symbol.name] = depUnibuild.pkg.name;
      });
    };
    compiler.eachUsedUnibuild({
      dependencies: self.uses,
      arch: bundleArch,
      isopackCache: isopackCache,
      skipUnordered: true,
      skipDebugOnly: true
    }, addImportsForUnibuild);

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
  })
});

///////////////////////////////////////////////////////////////////////////////
// Isopack
///////////////////////////////////////////////////////////////////////////////

// Meteor has a packaging system called "Isobuild". Isobuild knows how to
// compile the same JavaScript code-base to different architectures: browser,
// node.js-like server environment (could be Rhino or other) or a webview in a
// Cordova mobile app.
//
// Each package used by Isobuild forms an Isopack. Isopack is a package format
// containing source code for each architecture it can be ran on.
// Each separate part built for a separate architecture is called "Unibuild".
//
// There are multiple reasons why we can't call it just "build" and historically
// the name "Unibuild" has been associated with parts of Isopacks. We also can't
// call it "Isobuild" because this is the brand-name of the whole
// build/packaging system.
var Isopack = function () {
  var self = this;

  // These have the same meaning as in PackageSource.
  self.name = null;
  self.metadata = {};
  self.version = null;
  self.isTest = false;
  self.debugOnly = false;

  // Unibuilds, an array of class Unibuild.
  self.unibuilds = [];

  // Plugins in this package. Map from plugin name to {arch -> JsImage}.
  self.plugins = {};

  self.cordovaDependencies = {};

  // -- Information for up-to-date checks --
  // Data in this section is only set if the Isopack was directly created by
  // compiler.compile or read from a package compiled by IsopackCache (with its
  // isopack-buildinfo.json file). They are not set for Isopacks read from
  // the tropohouse.

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

  // XXX doc
  self.pluginProviderPackageMap = null;
};

Isopack.currentFormat = "isopack-1";

Isopack.knownFormats = ["unipackage-pre2", "isopack-1"];
Isopack.convertOneStepForward = function (data, fromFormat) {
  var convertedData = _.clone(data);
  // XXX COMPAT WITH 0.9.3
  if (fromFormat === "unipackage-pre2") {
    convertedData.builds = convertedData.unibuilds;
    delete convertedData.unibuilds;
    return convertedData;
  }
};
Isopack.convertOneStepBackward = function (data, fromFormat) {
  var convertedData = _.clone(data);
  if (fromFormat === "isopack-1") {
    convertedData.unibuilds = convertedData.builds;
    convertedData.format = "unipackage-pre2";
    delete convertedData.builds;
    return convertedData;
  }
};
Isopack.convertIsopackFormat = Profile(
  "Isopack.convertIsopackFormat", function (data, fromFormat, toFormat) {
  var fromPos = _.indexOf(Isopack.knownFormats, fromFormat);
  var toPos = _.indexOf(Isopack.knownFormats, toFormat);
  var step = fromPos < toPos ? 1 : -1;

  if (fromPos === -1)
    throw new Error("Can't convert from unknown Isopack format: " + fromFormat);
  if (toPos === -1)
    throw new Error("Can't convert to unknown Isopack format: " + toFormat);

  while (fromPos !== toPos) {
    if (step > 0) {
      data = Isopack.convertOneStepForward(data, fromFormat);
    } else {
      data = Isopack.convertOneStepBackward(data, fromFormat);
    }

    fromPos += step;
    fromFormat = Isopack.knownFormats[fromPos];
  }

  return data;
});

// Read the correct file from isopackDirectory and convert to current format
// of the isopack metadata. Returns null if there is no package here.
Isopack.readMetadataFromDirectory =
  Profile("Isopack.readMetadataFromDirectory", function (isopackDirectory) {
  var metadata;

  // deal with different versions of "isopack.json", backwards compatible
  var isopackJsonPath = files.pathJoin(isopackDirectory, "isopack.json");
  var unipackageJsonPath = files.pathJoin(isopackDirectory, "unipackage.json");

  if (files.exists(isopackJsonPath)) {
    var isopackJson = JSON.parse(files.readFile(isopackJsonPath));

    if (isopackJson[Isopack.currentFormat]) {
      metadata = isopackJson[Isopack.currentFormat];
    } else {
      // This file is from the future and no longer supports this version
      throw new Error("Could not find isopack data with format " + Isopack.currentFormat + ".\n" +
        "This isopack was likely built with a much newer version of Meteor.");
    }
  } else if (files.exists(unipackageJsonPath)) {
    // super old version with different file name
    // XXX COMPAT WITH 0.9.3
    if (files.exists(unipackageJsonPath)) {
      metadata = JSON.parse(files.readFile(unipackageJsonPath));

      // in the old format, builds were called unibuilds
      // use string to make sure this doesn't get caught in a find/replace
      metadata.builds = metadata["unibuilds"];

      metadata = Isopack.convertIsopackFormat(metadata,
        "unipackage-pre2", Isopack.currentFormat);
    }

    if (metadata.format !== "unipackage-pre2") {
      // We don't support pre-0.9.0 isopacks, but we do know enough to delete
      // them if we find them in an isopack cache somehow (rather than crash).
      if (metadata.format === "unipackage-pre1") {
        throw new exports.OldIsopackFormatError();
      }

      throw new Error("Unsupported isopack format: " +
                      JSON.stringify(metadata.format));
    }
  }

  return metadata;
});

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
    self.isTest = options.isTest;
    self.plugins = options.plugins;
    self.cordovaDependencies = options.cordovaDependencies;
    self.pluginWatchSet = options.pluginWatchSet;
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

  setPluginProviderPackageMap: function (pluginProviderPackageMap) {
    var self = this;
    self.pluginProviderPackageMap = pluginProviderPackageMap;
  },

  getSourceFilesUnderSourceRoot: Profile(
    "Isopack#getSourceFilesUnderSourceRoot", function (sourceRoot) {
    var self = this;
    var sourceFiles = {};
    var anySourceFiles = false;
    var addSourceFilesFromWatchSet = function (watchSet) {
      _.each(watchSet.files, function (hash, filename) {
        anySourceFiles = true;
        var relativePath = files.pathRelative(sourceRoot, filename);
        // We only want files that are actually under sourceRoot.
        if (relativePath.substr(0, 3) === '..' + files.pathSep)
          return;
        sourceFiles[relativePath] = true;
      });
    };
    addSourceFilesFromWatchSet(self.pluginWatchSet);
    _.each(self.unibuilds, function (u) {
      addSourceFilesFromWatchSet(u.watchSet);
    });

    // Were we actually built from source or loaded from an IsopackCache? If so
    // then there should be at least one source file in some WatchSet. If not,
    // return null.
    if (! anySourceFiles)
      return null;
    return _.keys(sourceFiles);
  }),

  // An sorted array of all the architectures included in this package.
  architectures: Profile("Isopack#architectures", function () {
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
  }),

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
    return colonConverter.convert(self.name) + '-' + self.version;
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
  getUnibuildAtArch: Profile("Isopack#getUnibuildAtArch", function (arch) {
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
  }),

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
  _ensurePluginsInitialized: Profile(
    "Isopack#_ensurePluginsInitialized", function () {
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
      // 'options' can be omitted. The only known option is 'isTemplate', which
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
        title: "loading plugin `" + name +
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
  }),

  // Load a Isopack on disk.
  //
  // options:
  // - isopackBuildInfoJson: parsed isopack-buildinfo.json object,
  //   if loading from an IsopackCache.
  initFromPath: Profile(
    "Isopack#initFromPath", function (name, dir, options) {
    var self = this;
    options = _.clone(options || {});
    options.firstIsopack = true;

    return self._loadUnibuildsFromPath(name, dir, options);
  }),

  _loadUnibuildsFromPath: function (name, dir, options) {
    var self = this;
    options = options || {};

    // In the tropohouse, isopack paths are symlinks (which can be updated if
    // more unibuilds are merged in). For any given call to
    // _loadUnibuildsFromPath, let's ensure we see a consistent isopack by
    // realpath'ing dir.
    dir = files.realpath(dir);

    var mainJson = Isopack.readMetadataFromDirectory(dir);

    // isopacks didn't used to know their name, but they should.
    if (_.has(mainJson, 'name') && name !== mainJson.name) {
      throw new Error("isopack " + name + " thinks its name is " +
                      mainJson.name);
    }

    // If we're loading from an IsopackCache, we need to load the WatchSets
    // which will be used by the bundler.  (builtBy is only used by
    // IsopackCache._checkUpToDate. pluginProviderPackageMap will actually be
    // set by IsopackCache afterwards, because it has access to an appropriate
    // PackageMap which can be subset to create a new PackageMap object.)
    var unibuildWatchSets = {};
    if (options.isopackBuildInfoJson) {
      if (! options.firstIsopack)
        throw Error("can't merge isopacks with buildinfo");

      // XXX should comprehensively sanitize (eg, typecheck) everything
      // read from json files

      // Read the watch sets for each unibuild
      _.each(
        options.isopackBuildInfoJson.unibuildDependencies,
        function (watchSetJSON, unibuildTag) {
          unibuildWatchSets[unibuildTag] =
            watch.WatchSet.fromJSON(watchSetJSON);
        });

      // Read pluginWatchSet. (In the multi-sub-isopack case, these are
      // guaranteed to be trivial (since we check that there's no
      // isopackBuildInfoJson), so no need to merge.)
      self.pluginWatchSet = watch.WatchSet.fromJSON(
        options.isopackBuildInfoJson.pluginDependencies);
    }

    // If we are loading multiple isopacks, only take this stuff from the
    // first one.
    if (options.firstIsopack) {
      self.name = name;
      self.metadata = {
        summary: mainJson.summary
      };
      self.version = mainJson.version;
      self.isTest = mainJson.isTest;
      self.debugOnly = !!mainJson.debugOnly;
    }
    _.each(mainJson.plugins, function (pluginMeta) {
      rejectBadPath(pluginMeta.path);

      var plugin = bundler.readJsImage(files.pathJoin(dir, pluginMeta.path));

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
        files.readFile(files.pathJoin(dir, unibuildMeta.path)));

      var unibuildBasePath =
        files.pathDirname(files.pathJoin(dir, unibuildMeta.path));

      if (unibuildJson.format !== "unipackage-unibuild-pre1")
        throw new Error("Unsupported isopack unibuild format: " +
                        JSON.stringify(unibuildJson.format));

      var nodeModulesPath = null;
      if (unibuildJson.node_modules) {
        rejectBadPath(unibuildJson.node_modules);
        nodeModulesPath =
          files.pathJoin(unibuildBasePath, unibuildJson.node_modules);
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
          var fd =
            files.open(files.pathJoin(unibuildBasePath, resource.file), "r");
          try {
            var count = files.read(
              fd, data, 0, resource.length, resource.offset);
          } finally {
            files.close(fd);
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
            prelinkFile.sourceMap = files.readFile(
              files.pathJoin(unibuildBasePath, resource.sourceMap), 'utf8');
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

      self.unibuilds.push(new Unibuild(self, {
        // At some point we stopped writing 'kind's to the metadata file, so
        // default to main.
        kind: unibuildMeta.kind || 'main',
        arch: unibuildMeta.arch,
        uses: unibuildJson.uses,
        implies: unibuildJson.implies,
        watchSet: unibuildWatchSets[unibuildMeta.path],
        nodeModulesPath: nodeModulesPath,
        prelinkFiles: prelinkFiles,
        packageVariables: unibuildJson.packageVariables || [],
        resources: resources
      }));
    });

    self.cordovaDependencies = mainJson.cordovaDependencies || null;

    _.each(mainJson.tools, function (toolMeta) {
      toolMeta.rootDir = dir;
      // XXX check for overlap
      self.toolsOnDisk.push(toolMeta);
    });

    return true;
  },

  hasCordovaUnibuild: function () {
    var self = this;
    return _.any(self.unibuilds, function (unibuild) {
      return unibuild.arch === 'web.cordova';
    });
  },

  // options:
  //
  // - includeIsopackBuildInfo: If set, write an isopack-buildinfo.json file.
  saveToPath: Profile("Isopack#saveToPath", function (outputDir, options) {
    var self = this;
    var outputPath = outputDir;
    options = options || {};

    var builder = new Builder({ outputPath: outputPath });
    try {
      var mainJson = {
        name: self.name,
        summary: self.metadata.summary,
        version: self.version,
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

      var isopackBuildInfoJson = null;
      if (options.includeIsopackBuildInfo) {
        isopackBuildInfoJson = {
          builtBy: compiler.BUILT_BY,
          unibuildDependencies: {},
          // pluginDependencies defines a WatchSet that any package that could
          // use this package as a plugin needs to watch. So it always contains
          // our package.js (because modifications to package.js could add a new
          // plugin), as well as any files making up plugins in our package.
          pluginDependencies: self.pluginWatchSet.toJSON(),
          pluginProviderPackageMap: self.pluginProviderPackageMap.toJSON(),
          includeCordovaUnibuild: self.hasCordovaUnibuild()
        };
      }

      // XXX COMPAT WITH 0.9.3
      builder.reserve("unipackage.json");

      builder.reserve("isopack.json");
      // Reserve this even if includeIsopackBuildInfo is not set, to ensure
      // nothing else writes it somehow.
      builder.reserve("isopack-buildinfo.json");

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
          kind: unibuild.kind,
          arch: unibuild.arch,
          path: unibuildJsonFile
        });

        // Save unibuild dependencies. Keyed by the json path rather than thinking
        // too hard about how to encode pair (name, arch).
        if (isopackBuildInfoJson) {
          isopackBuildInfoJson.unibuildDependencies[unibuildJsonFile] =
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
              file: files.pathJoin(unibuildDir, resource.type),
              length: resource.data.length,
              offset: offset[resource.type]
            });
            concat[resource.type].push(resource.data);
            offset[resource.type] += resource.data.length;
          }
        });
        _.each(concat, function (parts, type) {
          if (parts.length) {
            builder.write(files.pathJoin(unibuildDir, type), {
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
              files.pathJoin(unibuildDir, resource.servePath),
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
              files.pathJoin(unibuildDir, file.servePath),
              { data: data }),
            length: data.length,
            offset: 0,
            servePath: file.servePath || undefined
          };

          if (file.sourceMap) {
            // Write the source map.
            resource.sourceMap = builder.writeToGeneratedFilename(
              files.pathJoin(unibuildDir, file.servePath + '.map'),
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
            npmDiscards: self.npmDiscards,
            symlink: false
          });
        }

        // Control file for unibuild
        builder.writeJson(unibuildJsonFile, unibuildJson);
      });

      // Plugins
      _.each(self.plugins, function (pluginsByArch, name) {
        _.each(pluginsByArch, function (plugin) {
          // XXX the name of the plugin doesn't typically contain a colon, but
          // escape it just in case.
          var pluginDir = builder.generateFilename(
            'plugin.' + colonConverter.convert(name) + '.' + plugin.arch,
            { directory: true });
          var pluginBuild = plugin.write(builder.enter(pluginDir));
          mainJson.plugins.push({
            name: name,
            arch: plugin.arch,
            path: files.pathJoin(pluginDir, pluginBuild.controlFile)
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
          from: files.pathJoin(rootDir, toolMeta.path),
          to: toolMeta.path,
          symlink: false
        });
        if (!mainJson.tools) {
          mainJson.tools = [];
        }
        mainJson.tools.push(toolMeta);
      });

      // old unipackage.json format/filename
      // XXX COMPAT WITH 0.9.3
      builder.writeJson("unipackage.json",
        Isopack.convertIsopackFormat(mainJson, Isopack.currentFormat, "unipackage-pre2"));

      // write several versions of the file
      // add your new format here, and define some stuff
      // in convertIsopackFormat
      var formats = ["isopack-1"];
      var isopackJson = {};
      _.each(formats, function (format) {
        // new, extensible format - forwards-compatible
        isopackJson[format] = Isopack.convertIsopackFormat(mainJson,
          Isopack.currentFormat, format);
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

      if (isopackBuildInfoJson) {
        builder.writeJson("isopack-buildinfo.json", isopackBuildInfoJson);
      }
      builder.complete();
    } catch (e) {
      builder.abort();
      throw e;
    }
  }),

  _writeTool: Profile("Isopack#_writeTool", function (builder) {
    var self = this;

    var pathsToCopy = files.runGitInCheckout(
      'ls-tree',
      '-r',  // recursive
      '--name-only',
      '--full-tree',
      'HEAD',
      // The actual trees to copy!
      'tools', 'examples', 'LICENSE.txt', 'LICENSES',
      'meteor', 'meteor.bat', 'scripts/admin/launch-meteor',
      'packages/package-version-parser/package-version-parser.js',
      'packages/meteor/flush-buffers-on-exit-in-windows.js');

    // Trim blank line and unnecessary examples.
    pathsToCopy = _.filter(pathsToCopy.split('\n'), function (f) {
      return f && !f.match(/^examples\/other/) &&
        !f.match(/^examples\/unfinished/);
    });

    var gitSha = files.runGitInCheckout('rev-parse', 'HEAD');


    var toolPath = 'mt-' + archinfo.host();
    builder = builder.enter(toolPath);
    builder.reserve('isopackets', {directory: true});
    builder.write('.git_version.txt', {data: new Buffer(gitSha, 'utf8')});

    builder.copyDirectory({
      from: files.getCurrentToolsDir(),
      to: '',
      specificFiles: pathsToCopy,
      symlink: false
    });

    // Include the dev bundle, but drop a few things that are only used by
    // self-test (which isn't supported from release).
    var devBundleIgnore = _.clone(bundler.ignoreFiles);
    devBundleIgnore.push(/BrowserStackLocal/, /browserstack-webdriver/);
    builder.copyDirectory({
      from: files.pathJoin(files.getDevBundle()),
      to: 'dev_bundle',
      ignore: devBundleIgnore,
      symlink: false
    });

    // Build all of the isopackets now, so that no build step is required when
    // you're actually running meteor from a release in order to load packages.
    var isopacketBuildContext = isopackets.makeIsopacketBuildContext();

    var messages = buildmessage.capture(function () {
      // We rebuild them in the order listed in ISOPACKETS. This is not strictly
      // necessary here, since any isopackets loaded as part of the build
      // process are going to be the current tool's isopackets, not the
      // isopackets that we're writing out.
      _.each(isopackets.ISOPACKETS, function (packages, isopacketName) {
        buildmessage.enterJob({
          title: "compiling " + isopacketName + " packages for the tool"
        }, function () {
          isopacketBuildContext.isopackCache.buildLocalPackages(packages);
          if (buildmessage.jobHasMessages())
            return;

          var image = bundler.buildJsImage({
            name: "isopacket-" + isopacketName,
            packageMap: isopacketBuildContext.packageMap,
            isopackCache: isopacketBuildContext.isopackCache,
            use: packages
          }).image;
          if (buildmessage.jobHasMessages())
            return;

          image.write(
            builder.enter(files.pathJoin('isopackets', isopacketName)));
        });
      });
    });
    // This is a build step ... but it's one that only happens in development,
    // and similar to a isopacket load failure, it can just crash the app
    // instead of being handled nicely.
    if (messages.hasMessages()) {
      Console.error("Errors prevented tool build:");
      Console.error(messages.formatMessages());
      throw new Error("tool build failed?");
    }

    return [{
      name: 'meteor',
      arch: archinfo.host(),
      path: toolPath
    }];
  }),

  getMergedWatchSet: Profile("Isopack#getMergedWatchSet", function () {
    var self = this;
    var watchSet = self.pluginWatchSet.clone();
    _.each(self.unibuilds, function (unibuild) {
      watchSet.merge(unibuild.watchSet);
    });
    return watchSet;
  }),

  // Similar to PackageSource.getPackagesToLoadFirst.
  getStrongOrderedUsedAndImpliedPackages: Profile(
    "Isopack#getStrongOrderedUsedAndImpliedPackages", function () {
    var self = this;
    var packages = {};
    var processUse = function (use) {
      if (use.weak || use.unordered)
        return;
      packages[use.package] = true;
    };

    _.each(self.unibuilds, function (unibuild) {
      _.each(unibuild.uses, processUse);
      _.each(unibuild.implies, processUse);
    });
    return _.keys(packages);
  })
});

exports.Isopack = Isopack;

exports.OldIsopackFormatError = function () {
  // This should always be caught anywhere where it can appear (ie, anywhere
  // that isn't definitely loading something from the tropohouse).
  this.toString = function () { return "old isopack format!" };
};
