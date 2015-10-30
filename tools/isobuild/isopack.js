var compiler = require('./compiler.js');
var archinfo = require('../utils/archinfo.js');
var _ = require('underscore');
var linker = require('./linker.js');
var buildmessage = require('../utils/buildmessage.js');
var Builder = require('./builder.js');
var bundler = require('./bundler.js');
var watch = require('../fs/watch.js');
var files = require('../fs/files.js');
var isopackets = require('../tool-env/isopackets.js');
var colonConverter = require('../utils/colon-converter.js');
var utils = require('../utils/utils.js');
var buildPluginModule = require('./build-plugin.js');
var Console = require('../console/console.js').Console;
var Profile = require('../tool-env/profile.js').Profile;

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
// - declaredExports
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

  // 'declaredExports' are the variables which are exported from this package.
  // A list of objects with keys 'name' (required) and 'testOnly' (boolean,
  // defaults to false).
  self.declaredExports = options.declaredExports;

  // All of the data provided for eventual inclusion in the bundle,
  // other than JavaScript that still needs to be fed through the
  // final link stage. A list of objects with these keys:
  //
  // type: "source", "head", "body", "asset". (resources produced by
  // legacy source handlers can also be "js" or "css".
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
  //
  // fileOptions: for "source", the options passed to `api.addFiles`.
  // plugin-specific.
  //
  // extension: for "source", the file extension that this matched
  // against at build time. null if matched against a specific filename.
  self.resources = options.resources;

  // Absolute path to the node_modules directory to use at runtime to
  // resolve Npm.require() calls in this unibuild. null if this unibuild
  // does not have a node_modules.
  self.nodeModulesPath = options.nodeModulesPath;
};

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
  self.prodOnly = false;

  // Unibuilds, an array of class Unibuild.
  self.unibuilds = [];

  // Plugins in this package. Map from plugin name to {arch -> JsImage}.
  // Plugins are package-supplied classes and functions that can change the
  // build process: introduce a new source processor (compiler, minifier,
  // linter)
  self.plugins = {};

  self.cordovaDependencies = {};

  // isobuild:* pseudo-packages which this package depends on.
  self.isobuildFeatures = [];

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

  // True if plugins have been initialized (if ensurePluginsInitialized has
  // been called)
  self._pluginsInitialized = false;

  // The SourceProcessors registered by plugins defined by this package.  Each
  // value is a SourceProcessorSet. sourceProcessors.compiler includes the
  // legacy source handlers as well.
  // Valid when self._pluginsInitialized is true.
  self.sourceProcessors = {
    compiler: null,
    linter: null,
    minifier: null
  };

  // See description in PackageSource. If this is set, then we include a copy of
  // our own source, in addition to any other tools that were originally in the
  // isopack.
  self.includeTool = false;

  // This is tools to copy from trees on disk. This is used by the
  // isopack-merge code in tropohouse.
  self.toolsOnDisk = [];

  // A map of package dependencies that can provide a plugin for this isopack.
  // In practice, it is every direct dependency and implied packages.
  self.pluginProviderPackageMap = null;

  // A directory on disk that plugins can use for caching. Should be created
  // by the code that initializes the Isopack. If not provided, plugins don't
  // get a disk cache.
  self.pluginCacheDir = null;

  // An in-memory only buildmessage.MessageSet object that is printed by the
  // build tool when the app is linted. Is also printed when a package
  // represented by Isopack is published.
  self.lintingMessages = null;
};

Isopack.knownFormats = ["unipackage-pre2", "isopack-1", "isopack-2"];

// These functions are designed to convert isopack metadata between
// versions. They were designed to convert between unipackage-pre2 and
// isopack-1. The differences between these formats are essentially syntactical,
// not semantic, and occur entirely in the isopack.json file, not in the
// individual unibuild json files. These functions are written assuming those
// constraints, and were not actually useful in the isopack-1/isopack-2
// transition,where most of the changes are in the unibuild level, and there's
// actual semantic changes involved. So they are not actually used as much as
// they were before.
Isopack.convertOneStepForward = function (data, fromFormat) {
  var convertedData = _.clone(data);
  // XXX COMPAT WITH 0.9.3
  if (fromFormat === "unipackage-pre2") {
    convertedData.builds = convertedData.unibuilds;
    delete convertedData.unibuilds;
    return convertedData;
  }
  if (fromFormat === "isopack-1") {
    // For now, there's no difference in this direction at the isopack level.
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
  if (fromFormat === "isopack-2") {
    // The conversion from isopack-2 requires converting the nested
    // unibuild data as well.  This shouldn't happen.
    throw Error("Can't automatically convert backwards from isopack-2");
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
  var metadata = null;
  let originalVersion = null;

  // deal with different versions of "isopack.json", backwards compatible
  var isopackJsonPath = files.pathJoin(isopackDirectory, "isopack.json");
  var unipackageJsonPath = files.pathJoin(isopackDirectory, "unipackage.json");

  if (files.exists(isopackJsonPath)) {
    var isopackJson = JSON.parse(files.readFile(isopackJsonPath));

    if (isopackJson['isopack-2']) {
      metadata = isopackJson['isopack-2'];
      originalVersion = 'isopack-2';
    } else if (isopackJson['isopack-1']) {
      metadata = Isopack.convertIsopackFormat(
        isopackJson['isopack-1'], 'isopack-1', 'isopack-2');
      originalVersion = 'isopack-1';
    } else {
      // This file is from the future and no longer supports this version
      throw new Error("Could not find isopack data supported any supported format (isopack-1 or isopack-2).\n" +
        "This isopack was likely built with a much newer version of Meteor.");
    }
  } else if (files.exists(unipackageJsonPath)) {
    // super old version with different file name
    // XXX COMPAT WITH 0.9.3
    if (files.exists(unipackageJsonPath)) {
      metadata = JSON.parse(files.readFile(unipackageJsonPath));

      metadata = Isopack.convertIsopackFormat(metadata,
        "unipackage-pre2", "isopack-2");
      originalVersion = 'unipackage-pre2';
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

  return {metadata, originalVersion};
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
    self.prodOnly = options.prodOnly;
    self.pluginCacheDir = options.pluginCacheDir || null;
    self.isobuildFeatures = options.isobuildFeatures;
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
  getUnibuildAtArch: Profile("Isopack#getUnibuildAtArch", function (
    arch, {allowWrongPlatform} = {}) {
    var self = this;

    let chosenArch = archinfo.mostSpecificMatch(
      arch, _.pluck(self.unibuilds, 'arch'));
    if (! chosenArch && allowWrongPlatform && arch.match(/^os\./)) {
      // Special-case: we're looking for a specific server platform and it's
      // not available. (eg, we're deploying from a Mac to Linux and are
      // processing a local package with binary npm deps).  If we have "allow
      // wrong platform" turned on, search again for the host version, which
      // might find the Mac version.  We'll detect this case later and provide
      // package.json instead of Mac binaries.
      chosenArch =
        archinfo.mostSpecificMatch(archinfo.host(), _.pluck(self.unibuilds, 'arch'));
    }
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

  _checkPluginsInitialized: function () {
    var self = this;
    if (self._pluginsInitialized)
      return;
    throw Error("plugins not yet initialized?");
  },

  // If this package has plugins, initialize them (run the startup
  // code in them so that they register their extensions). Idempotent.
  ensurePluginsInitialized: Profile("Isopack#ensurePluginsInitialized", function () {
    var self = this;

    buildmessage.assertInJob();

    if (self._pluginsInitialized)
      return;

    self.sourceProcessors.compiler = new buildPluginModule.SourceProcessorSet(
      self.displayName(), { hardcodeJs: true, singlePackage: true });
    self.sourceProcessors.linter = new buildPluginModule.SourceProcessorSet(
      self.displayName(), { singlePackage: true, allowConflicts: true });
    self.sourceProcessors.minifier = new buildPluginModule.SourceProcessorSet(
      self.displayName(), { singlePackage: true });

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
        // Make a new Plugin API object for this plugin.
        var Plugin = self._makePluginApi();
        plugin.load({ Plugin: Plugin });
      });
    });

    // Instantiate each of the registered batch plugins.  Note that we don't
    // do this directly in the registerCompiler (etc) call, because we want
    // to allow people to do something like:
    //   Plugin.registerCompiler({...}, function () { return new C; });
    //   var C = function () {...}
    // and so we want to wait for C to be defined.
    _.each(self.sourceProcessors, (sourceProcessorSet) => {
      _.each(sourceProcessorSet.allSourceProcessors, (sourceProcessor) => {
        sourceProcessor.instantiatePlugin();
      });
    });

    self._pluginsInitialized = true;
  }),

  _makePluginApi: function () {
    var isopack = this;

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
       * @deprecated since 1.2
       * XXX COMPAT WITH 1.1
       */
      registerSourceHandler: function (extension, options, handler) {
        if (!handler) {
          handler = options;
          options = {};
        }

        // The popular package mquandalle:bower has a call to
        // `registerSourceHandler('json', null)` for some reason, to
        // work around some behavior of Meteor believed to be a bug. We
        // think that new features of registerCompiler like being able
        // to register for filenames will allow them to drop that line,
        // but in the meantime we might as well not choke on it. (The
        // old implementation coincidentally didn't choke.)
        if (!handler) {
          handler = function () {};
        }

        isopack.sourceProcessors.compiler.addLegacyHandler({
          extension,
          handler,
          packageDisplayName: isopack.displayName(),
          isTemplate: !!options.isTemplate,
          archMatching: options.archMatching
        });
      },

      _registerSourceProcessor: function (
        {extensions, filenames, archMatching, isTemplate},
        factory,
        {sourceProcessorSet, methodName, featurePackage}) {
        if (!isopack.featureEnabled(featurePackage)) {
          // This error is OK because we only define 1.0.0 for each of these
          // feature packages (in compiler.KNOWN_ISOBUILD_FEATURE_PACKAGES).
          buildmessage.error(
            `your package must \`api.use('${ featurePackage }@1.0.0')\` in ` +
              `order for its plugins to call Plugin.${ methodName }`);
          return;
        }

        const hasExtensions = (extensions &&
                               extensions instanceof Array &&
                               extensions.length > 0);
        const hasFilenames = (filenames &&
                              filenames instanceof Array &&
                              filenames.length > 0);
        if (! (hasExtensions || hasFilenames)) {
          buildmessage.error("Plugin." + methodName + " must specify a " +
                             "non-empty array of extensions or filenames",
                             { useMyCaller: 3 });
          // recover by ignoring
          return;
        }

        // Don't let extensions or filenames try to look for directories (in the
        // way that WatchSet expresses them).
        if (extensions && extensions.some(e => e.endsWith('/'))) {
          buildmessage.error(
            `Plugin.${methodName}: extensions may not end in /`);
          // recover by ignoring
          return;
        }
        if (filenames && filenames.some(f => f.endsWith('/'))) {
          buildmessage.error(
            `Plugin.${methodName}: filenames may not end in /`);
          // recover by ignoring
          return;
        }

        if (typeof factory !== 'function') {
          buildmessage.error(methodName + " call must "
                             + "specify a factory function",
                             { useMyCaller: 3 });
          // recover by ignoring
          return;
        }

        const sp = new buildPluginModule.SourceProcessor({
          isopack: isopack,
          extensions: extensions,
          filenames: filenames,
          archMatching: archMatching,
          isTemplate: isTemplate,
          factoryFunction: factory,
          methodName: methodName
        });
        // This logs a buildmessage on conflicts.
        sourceProcessorSet.addSourceProcessor(sp);
      },

      // Compilers are part of the Batch Plugins API.
      //
      // A compiler plugin is provided by packages to participate in
      // the build process. A compiler can register file extensions and
      // filenames it handles and the build tool will call the compiler's
      // `processFilesForTarget` method once for each target (eg, the server
      // or client program) with all of the files in the target.
      //
      // Compilers are run on application bundling (in bundle.js).
      // This is different from the legacy registerSourceHandler API,
      // which runs on a single file at a time when a *package* is built.
      // Published Isopack packages contain the original sources of
      // files handled by registerCompiler, not the generated output,
      // so compilers can be involved in the very end, when the app is bundled
      // (not in package publish time).  (Note that this requires a new
      // Isopack format, 'isopack-2'; versions of packages published with new
      // compilers cannot be used with previous releases of Meteor, but
      // Version Solver knows this and will select an older compatible
      // version if possible.
      //
      // Unlike the legacy API called "source handlers" (deprecated in
      // Meteor 1.2), compiler plugins can handle all files for the target,
      // making independent decisions about caching and dependencies resolution.
      //
      // The factory function must return an instance of a compiler.
      //
      // Note: It's important to ensure that all plugins that want to call
      // plugin compiler use the isobuild:compiler-plugin fake package, so that
      // Version Solver will not let you use registerCompiler plugins with old
      // versions of the tool.

      /**
       * @summary Inside a build plugin source file specified in
       * [Package.registerBuildPlugin](#Package-registerBuildPlugin),
       * add a compiler that will handle files with certain extensions or
       * filenames.
       * @param {Object} options
       * @param {String[]} options.extensions The file extensions that this
       * plugin should handle, without the first dot.
       * Examples: `["coffee", "coffee.md"]`.
       * @param {String[]} options.filenames The list of filenames
       * that this plugin should handle. Examples: `["config.json"]`.
       * @param {Function} factory A function that returns an instance
       * of a compiler class.
       *
       * More detailed documentation for build plugins is available [on the GitHub Wiki](https://github.com/meteor/meteor/wiki/Build-Plugins-API).
       * @memberOf Plugin
       * @locus Build Plugin
       */
      registerCompiler: function (options, factory) {
        Plugin._registerSourceProcessor(options || {}, factory, {
          sourceProcessorSet: isopack.sourceProcessors.compiler,
          methodName: "registerCompiler",
          featurePackage: "isobuild:compiler-plugin"
        });
      },

      // Linters are part of the Batch Plugin API.
      //
      // A linter plugin provides a Linter instance. The linter is
      // given a batch of source files for the target according to
      // linter's declared file extensions and filenames (e.g.: '*.js',
      // '.jshintrc').
      //
      // Linters don't output any files. They can only raise an error
      // message on one of the source files to force the build tool to
      // print a linting message.
      //
      // The factory function must return an instance of the linter.
      // The linter must have the `processFilesForPackage` method that
      // has two arguments:
      // - inputFiles - LinterFile - sources instances
      // - options - Object
      //   - globals - a list of strings - global variables that can be
      //     used in the target's scope as they are dependencies of the
      //     package or the app. e.g.: "Minimongo" or "Webapp".
      //
      // Unlike compilers and minifiers, linters run on one package
      // at a time.  Linters are run by `meteor run`, `meteor publish`,
      // and `meteor lint`.

      /**
       * @summary Inside a build plugin source file specified in
       * [Package.registerBuildPlugin](#Package-registerBuildPlugin),
       * add a linter that will handle files with certain extensions or
       * filenames.
       * @param {Object} options
       * @param {String[]} options.extensions The file extensions that this
       * plugin should handle, without the first dot.
       * Examples: `["js", "es6", "jsx"]`.
       * @param {Function} factory A function that returns an instance
       * of a linter class.
       *
       * More detailed documentation for build plugins is available [on the GitHub Wiki](https://github.com/meteor/meteor/wiki/Build-Plugins-API).
       * @memberOf Plugin
       * @locus Build Plugin
       */
      registerLinter: function (options, factory) {
        Plugin._registerSourceProcessor(options || {}, factory, {
          sourceProcessorSet: isopack.sourceProcessors.linter,
          methodName: "registerLinter",
          featurePackage: "isobuild:linter-plugin"
        });
      },

      // Minifiers are part of the Batch Plugin API.
      //
      // The minifiers are applied in the very end of the bundling
      // process, after the linters and compilers. Unlike linters and
      // compilers, minifiers are given the output of compilers and not
      // the source files the application developer supplied.
      //
      // The minifier plugins can fill into 2 types of minifiers: CSS or JS.
      // When the minifier is added to an app, it is used during "bundling" to
      // compress the app code and each package's code separately.
      // Only minifier packages directly used by an app (or implied by a package
      // directly used by the app) are active: using a minifer's package in
      // another package does nothing.
      //
      // So far, the minifiers are only run on client targets such as
      // web.browser and web.cordova.
      //
      // The factory function must return an instance of a
      // minifier. The method `processFilesForBundle` is passed a list of
      // files, possibly a linked file per target (for JavaScript files).
      //
      // - files - processed files to minify
      // - options - Object
      //   - minifyMode - string - 'development' or 'production', based
      //     on the bundling mode

      /**
       * @summary Inside a build plugin source file specified in
       * [Package.registerBuildPlugin](#Package-registerBuildPlugin),
       * add a linter that will handle files with certain extensions or
       * filenames.
       * @param {Object} options
       * @param {String[]} options.extensions The file extensions that this
       * plugin should handle, without the first dot. Can only be "js" or "css".
       * Examples: `["js", "css"]`.
       * @param {String[]} options.filenames The list of filenames
       * that this plugin should handle. Examples: `["config.json"]`.
       * @param {Function} factory A function that returns an instance
       * of a minifier class.
       *
       * More detailed documentation for build plugins is available [on the GitHub Wiki](https://github.com/meteor/meteor/wiki/Build-Plugins-API).
       * @memberOf Plugin
       * @locus Build Plugin
       */
      registerMinifier: function (options, factory) {
        var badUsedExtension = _.find(options.extensions, function (ext) {
          return ! _.contains(['js', 'css'], ext);
        });

        if (badUsedExtension !== undefined) {
          buildmessage.error(badUsedExtension + ': Minifiers are only allowed to register "css" or "js" extensions.');
          return;
        }

        if (options.filenames) {
          buildmessage.error("Plugin.registerMinifier does not accept `filenames`");
          return;
        }

        Plugin._registerSourceProcessor(options || {}, factory, {
          sourceProcessorSet: isopack.sourceProcessors.minifier,
          methodName: "registerMinifier",
          featurePackage: "isobuild:minifier-plugin"
        });
      },

      nudge: function () {
        Console.nudge(true);
      },

      convertToOSPath: files.convertToOSPath,
      convertToStandardPath: files.convertToStandardPath,
      path: {
        join: files.pathJoin,
        normalize: files.pathNormalize,
        relative: files.pathRelative,
        resolve: files.pathResolve,
        dirname: files.pathDirname,
        basename: files.pathBasename,
        extname: files.pathExtname,
        sep: files.pathSep
      },
      fs: files.fsFixPath
    };
    return Plugin;
  },

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

    if (options.pluginCacheDir) {
      self.pluginCacheDir = options.pluginCacheDir;
    }

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

    var {metadata: mainJson} = Isopack.readMetadataFromDirectory(dir);
    if (! mainJson) {
      throw new Error("No metadata files found for isopack at: " + dir);
    }

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
      self.prodOnly = !!mainJson.prodOnly;
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

      if (unibuildJson.format !== "unipackage-unibuild-pre1" &&
          unibuildJson.format !== "isopack-2-unibuild") {
        throw new Error("Unsupported isopack unibuild format: " +
                        JSON.stringify(unibuildJson.format));
      }

      // Is this unibuild the legacy pre-"compiler plugin" format which contains
      // "prelink" resources of pre-processed JS files (as well as the
      // "packageVariables" field) instead of individual "source" resources (and
      // a "declaredExports" field)?
      var unibuildHasPrelink =
            unibuildJson.format === "unipackage-unibuild-pre1";

      var nodeModulesPath = null;
      if (unibuildJson.node_modules) {
        rejectBadPath(unibuildJson.node_modules);
        nodeModulesPath =
          files.pathJoin(unibuildBasePath, unibuildJson.node_modules);
      }

      var resources = [];

      _.each(unibuildJson.resources, function (resource) {
        rejectBadPath(resource.file);
        var data = files.readBufferWithLengthAndOffset(
          files.pathJoin(unibuildBasePath, resource.file),
          resource.length, resource.offset);

        if (resource.type === "prelink") {
          if (! unibuildHasPrelink) {
            throw Error("Unexpected prelink resource in " +
                        unibuildJson.format + " at " + dir);
          }
          // We found a "prelink" resource, because we're processing a package
          // published with an older version of Meteor which did not create
          // isopack-2 isopacks and which always preprocessed and linked all JS
          // files instead of leaving that until bundle time.  Let's pretend it
          // was just a single js source file, but leave a "legacyPrelink" field
          // on it so we can not re-link that part (and not re-analyze for
          // assigned variables).
          var prelinkResource = {
            type: "source",
            extension: "js",
            data: data,
            path: resource.servePath,
            // It's a shame to have to calculate the hash here instead of having
            // it on disk, but this only runs for legacy packages anyway.
            hash: watch.sha1(data),
            // Legacy prelink files definitely don't have a source processor!
            // They were created by an Isobuild that didn't even know about
            // source processors!
            usesDefaultSourceProcessor: true,
            legacyPrelink: {
              packageVariables: unibuildJson.packageVariables || []
            }
          };
          if (resource.sourceMap) {
            rejectBadPath(resource.sourceMap);
            prelinkResource.legacyPrelink.sourceMap = files.readFile(
              files.pathJoin(unibuildBasePath, resource.sourceMap), 'utf8');
          }
          resources.push(prelinkResource);
        } else if (resource.type === "source") {
          resources.push({
            type: "source",
            extension: resource.extension,
            usesDefaultSourceProcessor:
              !! resource.usesDefaultSourceProcessor,
            data: data,
            path: resource.path,
            hash: resource.hash,
            fileOptions: resource.fileOptions
          });
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

      var declaredExports;
      if (unibuildHasPrelink) {
        // Legacy unibuild; it stores packageVariables and says some of them
        // are exports.
        declaredExports = [];
        _.each(unibuildJson.packageVariables, function (pv) {
          if (pv.export) {
            declaredExports.push({
              name: pv.name,
              testOnly: pv.export === 'tests'
            });
          }
        });
      } else {
        declaredExports = unibuildJson.declaredExports || [];
      }

      unibuildJson.uses && unibuildJson.uses.forEach((use) => {
        if (!use.weak && compiler.isIsobuildFeaturePackage(use.package) &&
            self.isobuildFeatures.indexOf(use.package) === -1) {
          self.isobuildFeatures.push(use.package);
        }
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
        declaredExports: declaredExports,
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

  canWriteLegacyBuilds() {
    function isResourceSafeForLegacyBuilds(resource) {
      // The only new kind of resource is "source"; other resources are
      // unchanged from legacy builds.
      if (resource.type !== "source") {
        return true;
      }

      // CSS is safe for legacy builds. (We assume everyone is using the
      // SourceProcessor from the 'meteor' package.)
      if (resource.extension === "css") {
        return true;
      }

      // If this JS resource uses hard-coded support for plain old ES5, then it
      // is safe to write as part of a legacy Isopack.
      if (resource.extension === "js" && resource.usesDefaultSourceProcessor) {
        return true;
      }

      // Nope, this package cannot be represented as an isopack-1 Isopack
      // because it uses a file implemented by registerCompiler other than the
      // very basic JS and CSS types.
      return false;
    }

    return this.unibuilds.every(
      unibuild => unibuild.resources.every(isResourceSafeForLegacyBuilds)
    );
  },

  // options:
  //
  // - includeIsopackBuildInfo: If set, write an isopack-buildinfo.json file.
  // - includePreCompilerPluginIsopackVersions: By default, saveToPath only
  //   creates an isopack of format 'isopack-2', with unibuilds of format
  //   'isopack-2-unibuild'.  These isopacks may contain "source" resources,
  //   which are processed at *bundle* time by compiler plugins.  They cannot be
  //   properly processed by older tools.  If this flag is set, saveToPath also
  //   tries to save data for older formats (isopack-1 and unipackage-pre2),
  //   converting JS and CSS "source" resources into "prelink" and "css"
  //   resources.  This is not possible if there are "source" resources other
  //   than JS or CSS; however, such packages must indirectly depend on the
  //   "isobuild:compiler-plugin" pseudo-package which is not compatible with
  //   older releases.  For packages that can't be converted to the older
  //   format, this function silently only saves the newer format.  (The point
  //   of this flag is allow us to optimize cases that never need to write the
  //   older format, such as the per-app isopack cache.)
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
      if (self.prodOnly) {
        mainJson.prodOnly = true;
      }
      if (! _.isEmpty(self.cordovaDependencies)) {
        mainJson.cordovaDependencies = self.cordovaDependencies;
      }

      const writeLegacyBuilds = (
        options.includePreCompilerPluginIsopackVersions
          && self.canWriteLegacyBuilds());

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

      var unibuildInfos = [];

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

        var jsResourcesForLegacyPrelink = [];

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
          format: "isopack-2-unibuild",
          declaredExports: unibuild.declaredExports,
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

          // If we're going to write a legacy prelink file later, track the
          // original form of the resource object (with the source in a Buffer,
          // etc) instead of the later version.  #HardcodeJs
          if (writeLegacyBuilds &&
              resource.type === "source" &&
              resource.extension == "js") {
            jsResourcesForLegacyPrelink.push({
              data: resource.data,
              hash: resource.hash,
              servePath: unibuild.pkg._getServePath(resource.path),
              bare: resource.fileOptions && resource.fileOptions.bare,
              sourceMap: resource.sourceMap,
              // If this file was actually read from a legacy isopack and is
              // itself prelinked, this will be an object with some metadata
              // about it, and we can skip re-running prelink later.
              legacyPrelink: resource.legacyPrelink
            });
          }

          unibuildJson.resources.push({
            type: resource.type,
            extension: resource.extension,
            file: builder.writeToGeneratedFilename(
              files.pathJoin(unibuildDir,
                             resource.servePath || resource.path),
              { data: resource.data }),
            length: resource.data.length,
            offset: 0,
            usesDefaultSourceProcessor:
              resource.usesDefaultSourceProcessor || undefined,
            servePath: resource.servePath || undefined,
            path: resource.path || undefined,
            hash: resource.hash || undefined,
            fileOptions: resource.fileOptions || undefined
          });
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
        unibuildInfos.push({
          unibuild: unibuild,
          unibuildJson: unibuildJson,
          jsResourcesForLegacyPrelink: jsResourcesForLegacyPrelink
        });
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
          var pluginEntry = {
            name: name,
            arch: plugin.arch,
            path: files.pathJoin(pluginDir, pluginBuild.controlFile)
          };
          mainJson.plugins.push(pluginEntry);
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

      var mainLegacyJson = null;
      if (writeLegacyBuilds) {
        mainLegacyJson = _.clone(mainJson);
        mainLegacyJson.builds = [];

        _.each(unibuildInfos, function (unibuildInfo) {
          var unibuild = unibuildInfo.unibuild;
          var unibuildJson = unibuildInfo.unibuildJson;
          var jsResourcesForLegacyPrelink =
                unibuildInfo.jsResourcesForLegacyPrelink;
          var legacyFilename = builder.generateFilename(
            unibuild.arch + '-legacy.json');
          var legacyDir = unibuild.arch + '-legacy';
          mainLegacyJson.builds.push({
            kind: unibuild.kind,
            arch: unibuild.arch,
            path: legacyFilename
          });

          unibuildJson.format = 'unipackage-unibuild-pre1';
          var newResources = [];
          _.each(unibuildJson.resources, function (resource) {
            if (resource.type !== 'source') {
              newResources.push(resource);
            } else if (resource.extension === 'css') {
              // Convert this resource from a new-style "source" to an
              // old-style "css".
              newResources.push({
                type: 'css',
                file: resource.file,
                length: resource.length,
                offset: resource.offset,
                servePath: self._getServePath(resource.path)
              });
            } else if (resource.extension === 'js') {
              // Skip; we saved this in jsResourcesForLegacyPrelink above
              // already, in the format that linker.prelink understands.
            } else {
              throw Error(
                "shouldn't write legacy builds for non-JS/CSS source "
                  + JSON.stringify(resource));
            }
          });

          var prelinkFile, prelinkData, packageVariables;
          if (jsResourcesForLegacyPrelink.length === 1 &&
              jsResourcesForLegacyPrelink[0].legacyPrelink) {
            // Aha!  This isopack was actually a legacy isopack in the first
            // place! So this source file is already the output of prelink,
            // and we don't need to reprocess it.
            prelinkFile = jsResourcesForLegacyPrelink[0];
            // XXX It's weird that the type of object going in and out of
            // linker.prelink is different (so that this prelinkData
            // assignment differs from that below), ah well.
            prelinkData = prelinkFile.data;
            packageVariables =
              jsResourcesForLegacyPrelink[0].legacyPrelink.packageVariables;
          } else {
            // Determine captured variables, legacy way. First, start with the
            // exports. We'll add the package variables after running prelink.
            packageVariables = [];
            var packageVariableNames = {};
            _.each(unibuild.declaredExports, function (symbol) {
              if (_.has(packageVariableNames, symbol.name))
                return;
              packageVariables.push({
                name: symbol.name,
                export: symbol.testOnly? "tests" : true
              });
              packageVariableNames[symbol.name] = true;
            });

            if (jsResourcesForLegacyPrelink.length) {
              // Not originally legacy; let's run prelink to make it legacy.
              var results = linker.prelink({
                inputFiles: jsResourcesForLegacyPrelink,
                // I was confused about this, so I am leaving a comment -- the
                // combinedServePath is either [pkgname].js or [pluginName]:plugin.js.
                // XXX: If we change this, we can get rid of source arch names!
                combinedServePath: (
                  "/packages/" + colonConverter.convert(
                    unibuild.pkg.name +
                      (unibuild.kind === "main" ? "" : (":" + unibuild.kind)) +
                      ".js")),
                name: unibuild.pkg.name
              });
              if (results.files.length !== 1) {
                throw Error("prelink should return 1 file, not " +
                            results.files.length);
              }
              prelinkFile = results.files[0];
              prelinkData = new Buffer(prelinkFile.source, 'utf8');

              _.each(results.assignedVariables, function (name) {
                if (_.has(packageVariableNames, name))
                  return;
                packageVariables.push({
                  name: name
                });
                packageVariableNames[name] = true;
              });
            }
          }

          if (prelinkFile && prelinkData) {
            var prelinkResource = {
              type: 'prelink',
              file: builder.writeToGeneratedFilename(
                files.pathJoin(legacyDir, prelinkFile.servePath),
                { data: prelinkData }),
              length: prelinkData.length,
              offset: 0,
              servePath: prelinkFile.servePath || undefined
            };
            if (prelinkFile.sourceMap) {
              // Write the source map.
              prelinkResource.sourceMap = builder.writeToGeneratedFilename(
                files.pathJoin(legacyDir, prelinkFile.servePath + '.map'),
                { data: new Buffer(prelinkFile.sourceMap, 'utf8') }
              );
            }
            newResources.push(prelinkResource);
          }

          if (packageVariables.length) {
            unibuildJson.packageVariables = packageVariables;
          }

          unibuildJson.resources = newResources;
          delete unibuildJson.declaredExports;
          builder.writeJson(legacyFilename, unibuildJson);
        });

        // old unipackage.json format/filename.  no point to save this if
        // we can't even support isopack-1.
        // XXX COMPAT WITH 0.9.3
        builder.writeJson(
          "unipackage.json",
          Isopack.convertIsopackFormat(
            // Note that mainLegacyJson is isopack-1 (has no "source" resources)
            // rather than isopack-2.
            mainLegacyJson, "isopack-1", "unipackage-pre2"));
      }

      var isopackJson = {};
      isopackJson['isopack-2'] = mainJson;
      if (writeLegacyBuilds) {
        isopackJson['isopack-1'] = mainLegacyJson;
      }

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

    var pathsToCopy = utils.runGitInCheckout(
      'ls-tree',
      '-r',
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

    // Regexes matching paths to transpile using babel
    var transpileRegexes = [
      /^tools\/[^\/]+\.js$/, // General tools files
      /^tools\/isobuild\/[^\/]+\.js$/, // Isobuild files
      /^tools\/cli\/[^\/]+\.js$/, // CLI files
      /^tools\/tool-env\/[^\/]+\.js$/, // Tool initiation and clean up
      /^tools\/runners\/[^\/]+\.js$/, // Parts of tool process
      /^tools\/packaging\/[^\/]+\.js$/,
      /^tools\/packaging\/catalog\/[^\/]+\.js$/,
      /^tools\/utils\/[^\/]+\.js$/,
      /^tools\/fs\/[^\/]+\.js$/,
      /^tools\/meteor-services\/[^\/]+\.js$/,
      /^tools\/tool-testing\/[^\/]+\.js$/,
      /^tools\/console\/[^\/]+\.js$/,
      /^tools\/cordova\/[^\/]+\.js$/,
      // We don't support running self-test from an install anymore
    ];

    // Split pathsToCopy into two arrays - one of files that should be copied
    // directly, and one of files that should be transpiled with Babel
    var pathsToTranspile = [];
    var pathsToCopyStraight = [];
    pathsToCopy.forEach((path) => {
      var shouldTranspile =
        _.some(transpileRegexes, (regex) => path.match(regex));

      if (shouldTranspile) {
        pathsToTranspile.push(path);
      } else {
        pathsToCopyStraight.push(path);
      }
    });

    // Set up builder to write to the correct directory
    var toolPath = 'mt-' + archinfo.host();
    builder = builder.enter(toolPath);

    // Transpile the files we selected
    var babel = require("meteor-babel");
    pathsToTranspile.forEach((path) => {
      var fullPath = files.convertToOSPath(
        files.pathJoin(files.getCurrentToolsDir(), path));

      var inputFileContents = files.readFile(fullPath, "utf-8");

      // #RemoveInProd
      // We don't actually want to load the babel auto-transpiler when we are
      // in a Meteor installation where everything is already transpiled for us.
      // Therefore, strip out that line in main.js
      if (path === "tools/tool-env/install-babel.js" ||
          path === "tools/tool-env/source-map-retriever-stack.js") {
        inputFileContents = inputFileContents.replace(/^.*#RemoveInProd.*$/mg, "");
      }

      var babelOptions = babel.getDefaultOptions(
        require('../tool-env/babel-features.js')
      );

      _.extend(babelOptions, {
        filename: path,
        sourceFileName: "/" + path,
        sourceMapName: path + ".map",
        sourceMap: true
      });

      var transpiled = babel.compile(inputFileContents, babelOptions);

      var sourceMapUrlComment = "//# sourceMappingURL=" + files.pathBasename(path + ".map");

      builder.write(path, {
        data: new Buffer(transpiled.code + "\n" + sourceMapUrlComment, 'utf8')
      });

      builder.write(path + ".map", {
        data: new Buffer(JSON.stringify(transpiled.map), 'utf8')
      });
    });

    var gitSha = utils.runGitInCheckout('rev-parse', 'HEAD');
    builder.reserve('isopackets', {directory: true});
    builder.write('.git_version.txt', {data: new Buffer(gitSha, 'utf8')});

    builder.copyDirectory({
      from: files.getCurrentToolsDir(),
      to: '',
      specificFiles: pathsToCopyStraight,
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

  getClientWatchSet: Profile("Isopack#getClientWatchSet", function () {
    var watchSet = this.pluginWatchSet.clone();
    _.each(this.unibuilds, function (unibuild) {
      if (/^web\./.test(unibuild.arch)) {
        watchSet.merge(unibuild.watchSet);
      }
    });
    return watchSet;
  }),

  getServerWatchSet: Profile("Isopack#getServerWatchSet", function () {
    var watchSet = this.pluginWatchSet.clone();
    _.each(this.unibuilds, function (unibuild) {
      if (! /^web\./.test(unibuild.arch)) {
        watchSet.merge(unibuild.watchSet);
      }
    });
    return watchSet;
  }),

  // Similar to PackageSource.getPackagesToLoadFirst, but doesn't include
  // packages used by plugins, because plugin dependencies are already
  // statically included in this built Isopack. Used by
  // IsopackCache._ensurePackageLoaded.
  //
  // Like getPackagesToLoadFirst, it filters out isobuild:* pseudo-packages and
  // should not be used to create input to Version Solver.
  getStrongOrderedUsedAndImpliedPackages: Profile(
    "Isopack#getStrongOrderedUsedAndImpliedPackages", function () {
    var self = this;
    var packages = {};
    var processUse = function (use) {
      if (use.weak || use.unordered)
        return;
      // Only include real packages, not isobuild:* pseudo-packages.
      if (compiler.isIsobuildFeaturePackage(use.package)) {
        return;
      }
      packages[use.package] = true;
    };

    _.each(self.unibuilds, function (unibuild) {
      _.each(unibuild.uses, processUse);
      _.each(unibuild.implies, processUse);
    });
    return _.keys(packages);
  }),

  featureEnabled(featurePackageName) {
    return this.isobuildFeatures.indexOf(featurePackageName) !== -1;
  },

  _getServePath: function (pathInPackage) {
    var self = this;
    var serveRoot;
    if (self.name) {
      serveRoot = files.pathJoin('/packages/', self.name);
    } else {
      serveRoot = '/';
    }

    return colonConverter.convert(
      files.pathJoin(
        serveRoot,
        // XXX or should everything in this API use slash already?
        files.convertToStandardPath(pathInPackage, true)));
  },

  displayName() {
    return this.name === null ? 'the app' : this.name;
  }
});

exports.Isopack = Isopack;

exports.OldIsopackFormatError = function () {
  // This should always be caught anywhere where it can appear (ie, anywhere
  // that isn't definitely loading something from the tropohouse).
  this.toString = function () { return "old isopack format!" };
};
