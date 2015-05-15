var _ = require('underscore');

var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var bundler = require('./bundler.js');
var isopack = require('./isopack.js');
var isopackets = require('./isopackets.js');
var linker = require('./linker.js');
var meteorNpm = require('./meteor-npm.js');
var watch = require('./watch.js');
var Console = require('./console.js').Console;
var files = require('./files.js');
var colonConverter = require('./colon-converter.js');
var linterPluginModule = require('./linter-plugin.js');
var compileStepModule = require('./compiler-deprecated-compile-step.js');

var compiler = exports;

// Whenever you change anything about the code that generates isopacks, bump
// this version number. The idea is that the "format" field of the isopack
// JSON file only changes when the actual specified structure of the
// isopack/unibuild changes, but this version (which is build-tool-specific)
// can change when the the contents (not structure) of the built output
// changes. So eg, if we improve the linker's static analysis, this should be
// bumped.
//
// You should also update this whenever you update any of the packages used
// directly by the isopack creation process (eg js-analyze) since they do not
// end up as watched dependencies. (At least for now, packages only used in
// target creation (eg minifiers) don't require you to update BUILT_BY, though
// you will need to quit and rerun "meteor run".)
compiler.BUILT_BY = 'meteor/17';

// This is a list of all possible architectures that a build can target. (Client
// is expanded into 'web.browser' and 'web.cordova')
compiler.ALL_ARCHES = [ "os", "web.browser", "web.cordova" ];

compiler.compile = function (packageSource, options) {
  buildmessage.assertInCapture();

  var packageMap = options.packageMap;
  var isopackCache = options.isopackCache;
  var includeCordovaUnibuild = options.includeCordovaUnibuild;

  var pluginWatchSet = packageSource.pluginWatchSet.clone();
  var plugins = {};

  var pluginProviderPackageNames = {};

  // Build plugins
  _.each(packageSource.pluginInfo, function (info) {
    buildmessage.enterJob({
      title: "building plugin `" + info.name +
        "` in package `" + packageSource.name + "`",
      rootPath: packageSource.sourceRoot
    }, function () {
      // XXX we should probably also pass options.noLineNumbers into
      //     buildJsImage so it can pass it back to its call to
      //     compiler.compile
      var buildResult = bundler.buildJsImage({
        name: info.name,
        packageMap: packageMap,
        isopackCache: isopackCache,
        use: info.use,
        sourceRoot: packageSource.sourceRoot,
        sources: info.sources,
        npmDependencies: info.npmDependencies,
        // Plugins have their own npm dependencies separate from the
        // rest of the package, so they need their own separate npm
        // shrinkwrap and cache state.
        npmDir: files.pathResolve(
          files.pathJoin(packageSource.sourceRoot, '.npm', 'plugin', info.name))
      });
      // Add this plugin's dependencies to our "plugin dependency"
      // WatchSet. buildResult.watchSet will end up being the merged
      // watchSets of all of the unibuilds of the plugin -- plugins have
      // only one unibuild and this should end up essentially being just
      // the source files of the plugin.
      //
      // Note that we do this even on error, so that you can fix the error
      // and have the runner restart.
      pluginWatchSet.merge(buildResult.watchSet);

      if (buildmessage.jobHasMessages())
        return;

      _.each(buildResult.usedPackageNames, function (packageName) {
        pluginProviderPackageNames[packageName] = true;
      });

      // Register the built plugin's code.
      if (!_.has(plugins, info.name))
        plugins[info.name] = {};
      plugins[info.name][buildResult.image.arch] = buildResult.image;
    });
  });

  // Grab any npm dependencies. Keep them in a cache in the package
  // source directory so we don't have to do this from scratch on
  // every build.
  //
  // Go through a specialized npm dependencies update process,
  // ensuring we don't get new versions of any (sub)dependencies. This
  // process also runs mostly safely multiple times in parallel (which
  // could happen if you have two apps running locally using the same
  // package).
  //
  // We run this even if we have no dependencies, because we might
  // need to delete dependencies we used to have.
  var isPortable = true;
  var nodeModulesPath = null;
  if (packageSource.npmCacheDirectory) {
    if (meteorNpm.updateDependencies(packageSource.name,
                                     packageSource.npmCacheDirectory,
                                     packageSource.npmDependencies)) {
      nodeModulesPath = files.pathJoin(packageSource.npmCacheDirectory,
                                  'node_modules');
      if (! meteorNpm.dependenciesArePortable(packageSource.npmCacheDirectory))
        isPortable = false;
    }
  }

  var isopk = new isopack.Isopack;
  isopk.initFromOptions({
    name: packageSource.name,
    metadata: packageSource.metadata,
    version: packageSource.version,
    isTest: packageSource.isTest,
    plugins: plugins,
    pluginWatchSet: pluginWatchSet,
    cordovaDependencies: packageSource.cordovaDependencies,
    npmDiscards: packageSource.npmDiscards,
    includeTool: packageSource.includeTool,
    debugOnly: packageSource.debugOnly
  });

  _.each(packageSource.architectures, function (architecture) {
    if (architecture.arch === 'web.cordova' && ! includeCordovaUnibuild)
      return;

    var unibuildResult = compileUnibuild({
      isopack: isopk,
      sourceArch: architecture,
      isopackCache: isopackCache,
      nodeModulesPath: nodeModulesPath,
      isPortable: isPortable,
      noLineNumbers: options.noLineNumbers
    });
    _.extend(pluginProviderPackageNames,
             unibuildResult.pluginProviderPackageNames);
  });

  if (options.includePluginProviderPackageMap) {
    isopk.setPluginProviderPackageMap(
      packageMap.makeSubsetMap(_.keys(pluginProviderPackageNames)));
  }

  return isopk;
};

compiler.lint = function (packageSource, options) {
  _.each(packageSource.architectures, function (architecture) {
    lintUnibuild({
      isopack: options.isopack,
      isopackCache: options.isopackCache,
      sourceArch: architecture
    });
  });
};

var lintUnibuild = function (options) {
  var isopack = options.isopack;
  var isopackCache = options.isopackCache;
  var inputSourceArch = options.sourceArch;
  var activePluginPackages = getActivePluginPackages(
    isopack,
    // pass sourceArch and isopackCache
    options);

  var allLinters = [];
  var sourceExtensions = {}; // maps source extension to isTemplate

  _.each(activePluginPackages, function (otherPkg) {
    otherPkg.ensurePluginsInitialized();

    _.each(otherPkg.sourceProcessors.linter, function (linterPlugin, id) {
      allLinters.push(linterPlugin);
      // memorize all used extensions
      _.each(linterPlugin.extensions, function (ext) {
        sourceExtensions[ext] = linterPlugin.isTemplate;
      });
    });
  });

  var watchSet = new watch.WatchSet;
  var sourceItems = inputSourceArch.getSourcesFunc(sourceExtensions, watchSet);
  var wrappedSourceItems = _.map(sourceItems, function (source) {
    var relPath = source.relPath;
    var absPath = files.pathResolve(inputSourceArch.pkg.sourceRoot, relPath);
    var fileWatchSet = new watch.WatchSet;
    var file = watch.readAndWatchFileWithHash(fileWatchSet, absPath);
    var hash = file.hash;
    var contents = file.contents;
    return {
      relPath: relPath,
      contents: contents,
      'package': isopack.name,
      hash: hash
    };
  });

  runLinters(inputSourceArch, isopackCache, wrappedSourceItems, allLinters);
};

// options.sourceArch is a SourceArch to compile.  Process all source files
// through the appropriate handlers and run the prelink phase on any resulting
// JavaScript. Create a new Unibuild and add it to options.isopack.
//
// Returns a list of source files that were used in the compilation.
var compileUnibuild = function (options) {
  buildmessage.assertInCapture();

  var isopk = options.isopack;
  var inputSourceArch = options.sourceArch;
  var isopackCache = options.isopackCache;
  var nodeModulesPath = options.nodeModulesPath;
  var isPortable = options.isPortable;
  var noLineNumbers = options.noLineNumbers;

  var isApp = ! inputSourceArch.pkg.name;
  var resources = [];
  var js = [];
  var pluginProviderPackageNames = {};
  // The current package always is a plugin provider. (This also means we no
  // longer need a buildOfPath entry in buildinfo.json.)
  pluginProviderPackageNames[isopk.name] = true;
  var watchSet = inputSourceArch.watchSet.clone();

  compiler.eachUsedUnibuild({
    dependencies: inputSourceArch.uses,
    arch: archinfo.host(),
    isopackCache: isopackCache,
    skipUnordered: true
    // implicitly skip weak deps by not specifying acceptableWeakPackages option
  }, function (unibuild) {
    if (unibuild.pkg.name === isopk.name)
      return;
    pluginProviderPackageNames[unibuild.pkg.name] = true;
    // If other package is built from source, then we need to rebuild this
    // package if any file in the other package that could define a plugin
    // changes.
    watchSet.merge(unibuild.pkg.pluginWatchSet);

    if (_.isEmpty(unibuild.pkg.plugins))
      return;
  });

  // *** Determine and load active plugins
  var activePluginPackages = getActivePluginPackages(isopk, {
    sourceArch: inputSourceArch,
    isopackCache: isopackCache
  });

  // *** Assemble the list of source file handlers from the plugins
  // XXX BBP redoc
  var allHandlersWithPkgs = {};
  var compilerPluginsByExtension = {};
  var sourceExtensions = {};  // maps source extensions to isTemplate

  sourceExtensions['js'] = false;
  allHandlersWithPkgs['js'] = {
    pkgName: null /* native handler */,
    handler: function (compileStep) {
      // This is a hardcoded handler for *.js files. Since plugins
      // are written in JavaScript we have to start somewhere.

      var options = {
        data: compileStep.read().toString('utf8'),
        path: compileStep.inputPath,
        sourcePath: compileStep.inputPath,
        _hash: compileStep._hash
      };

      if (compileStep.fileOptions.hasOwnProperty("bare")) {
        options.bare = compileStep.fileOptions.bare;
      } else if (compileStep.fileOptions.hasOwnProperty("raw")) {
        // XXX eventually get rid of backward-compatibility "raw" name
        // XXX COMPAT WITH 0.6.4
        options.bare = compileStep.fileOptions.raw;
      }

      compileStep.addJavaScript(options);
    }
  };

  _.each(activePluginPackages, function (otherPkg) {
    otherPkg.ensurePluginsInitialized();

    // Iterate over the legacy source handlers.
    _.each(otherPkg.getSourceHandlers(), function (sourceHandler, ext) {
      // XXX comparing function text here seems wrong.
      if (_.has(allHandlersWithPkgs, ext) &&
          allHandlersWithPkgs[ext].handler.toString() !== sourceHandler.handler.toString()) {
        buildmessage.error(
          "conflict: two packages included in " +
            (inputSourceArch.pkg.name || "the app") + ", " +
            (allHandlersWithPkgs[ext].pkgName || "the app") + " and " +
            (otherPkg.name || "the app") + ", " +
            "are both trying to handle ." + ext);
        // Recover by just going with the first handler we saw
        return;
      }
      // Is this handler only registered for, say, "web", and we're building,
      // say, "os"?
      if (sourceHandler.archMatching &&
          !archinfo.matches(inputSourceArch.arch, sourceHandler.archMatching)) {
        return;
      }
      allHandlersWithPkgs[ext] = {
        pkgName: otherPkg.name,
        handler: sourceHandler.handler
      };
      sourceExtensions[ext] = !!sourceHandler.isTemplate;
    });

    // Iterate over the compiler plugins.
    _.each(otherPkg.sourceProcessors.compiler, function (compilerPlugin, id) {
      _.each(compilerPlugin.extensions, function (ext) {
        if (_.has(allHandlersWithPkgs, ext) ||
            _.has(compilerPluginsByExtension, ext)) {
          buildmessage.error(
            "conflict: two packages included in " +
              (inputSourceArch.pkg.name || "the app") + ", " +
              (allHandlersWithPkgs[ext].pkgName || "the app") + " and " +
              (otherPkg.name || "the app") + ", " +
              "are both trying to handle ." + ext);
          // Recover by just going with the first one we found.
          return;
        }
        compilerPluginsByExtension[ext] = compilerPlugin;
        sourceExtensions[ext] = compilerPlugin.isTemplate;
      });
    });
  });

  // *** Determine source files
  // Note: sourceExtensions does not include leading dots
  // Note: the getSourcesFunc function isn't expected to add its
  // source files to watchSet; rather, the watchSet is for other
  // things that the getSourcesFunc consulted (such as directory
  // listings or, in some hypothetical universe, control files) to
  // determine its source files.
  var sourceItems = inputSourceArch.getSourcesFunc(sourceExtensions, watchSet);

  if (nodeModulesPath) {
    // If this slice has node modules, we should consider the shrinkwrap file
    // to be part of its inputs. (This is a little racy because there's no
    // guarantee that what we read here is precisely the version that's used,
    // but it's better than nothing at all.)
    //
    // Note that this also means that npm modules used by plugins will get
    // this npm-shrinkwrap.json in their pluginDependencies (including for all
    // packages that depend on us)!  This is good: this means that a tweak to
    // an indirect dependency of the coffee-script npm module used by the
    // coffeescript package will correctly cause packages with *.coffee files
    // to be rebuilt.
    var shrinkwrapPath = nodeModulesPath.replace(
        /node_modules$/, 'npm-shrinkwrap.json');
    watch.readAndWatchFile(watchSet, shrinkwrapPath);
  }

  // *** Process each source file
  var addAsset = function (contents, relPath, hash) {
    // XXX hack
    if (! inputSourceArch.pkg.name)
      relPath = relPath.replace(/^(private|public)\//, '');

    resources.push({
      type: "asset",
      data: contents,
      path: relPath,
      servePath: colonConverter.convert(
        files.pathJoin(inputSourceArch.pkg.serveRoot, relPath)),
      hash: hash
    });
  };

  _.each(sourceItems, function (source) {
    var relPath = source.relPath;
    var fileOptions = _.clone(source.fileOptions) || {};
    var absPath = files.pathResolve(inputSourceArch.pkg.sourceRoot, relPath);
    var filename = files.pathBasename(relPath);
    var fileWatchSet = new watch.WatchSet;
    // readAndWatchFileWithHash returns an object carrying a buffer with the
    // file-contents. The buffer contains the original data of the file (no EOL
    // transforms from the tools/files.js part).
    // We don't put this into the unibuild's watchSet immediately since we want
    // to avoid putting it there if it turns out not to be relevant to our
    // arch.
    var file = watch.readAndWatchFileWithHash(fileWatchSet, absPath);
    var hash = file.hash;
    var contents = file.contents;

    Console.nudge(true);

    if (contents === null) {
      // It really sucks to put this check here, since this isn't publish
      // code...
      if (source.relPath.match(/:/)) {
        buildmessage.error(
          "Couldn't build this package on Windows due to the following file " +
          "with a colon -- " + source.relPath + ". Please rename and " +
          "and re-publish the package.");
      } else {
        buildmessage.error("File not found: " + source.relPath);
      }

      // recover by ignoring (but still watching the file)
      watchSet.merge(fileWatchSet);
      return;
    }

    // Find the handler for source files with this extension.
    var handler = null;
    var buildPluginExtension = null;
    if (! fileOptions.isAsset) {
      var parts = filename.split('.');
      // don't use iteration functions, so we can return/break
      for (var i = 1; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(compilerPluginsByExtension, extension)) {
          var compilerPlugin = compilerPluginsByExtension[extension];
          if (! compilerPlugin.relevantForArch(inputSourceArch.arch)) {
            // This file is for a compiler plugin but not for this arch. Skip
            // it, and don't even watch it.  (eg, skip CSS preprocessor files on
            // the server.)
            return;
          }
          buildPluginExtension = extension;
          break;
        }
        if (_.has(allHandlersWithPkgs, extension)) {
          handler = allHandlersWithPkgs[extension].handler;
          break;
        }
      }
    }

    // OK, this is relevant to this arch, so watch it.
    watchSet.merge(fileWatchSet);

    if (buildPluginExtension !== null) {
      // This is source used by a new-style compiler plugin; it will be fully
      // processed later in the bundler.
      resources.push({
        type: "source",
        extension: buildPluginExtension,
        data: contents,
        path: relPath,
        hash: hash
      });
      return;
    }

    if (! handler) {
      // If we don't have an extension handler, serve this file as a
      // static resource on the client, or ignore it on the server.
      //
      // XXX This is pretty confusing, especially if you've
      // accidentally forgotten a plugin -- revisit?
      addAsset(contents, relPath, hash);
      return;
    }

    var compileStep = compileStepModule.makeCompileStep(source, file, inputSourceArch, {
      js: js,
      resources: resources,
      addAsset: addAsset
    });

    try {
      (buildmessage.markBoundary(handler))(compileStep);
    } catch (e) {
      e.message = e.message + " (compiling " + relPath + ")";
      buildmessage.exception(e);

      // Recover by ignoring this source file (as best we can -- the
      // handler might already have emitted resources)
    }
  });

  // *** Run Phase 1 link

  // Load jsAnalyze from the js-analyze package... unless we are the
  // js-analyze package, in which case never mind. (The js-analyze package's
  // default unibuild is not allowed to depend on anything!)
  var jsAnalyze = null;
  if (! _.isEmpty(js) && inputSourceArch.pkg.name !== "js-analyze") {
    jsAnalyze = isopackets.load('js-analyze')['js-analyze'].JSAnalyze;
  }

  var results = linker.prelink({
    inputFiles: js,
    useGlobalNamespace: isApp,
    // I was confused about this, so I am leaving a comment -- the
    // combinedServePath is either [pkgname].js or [pluginName]:plugin.js.
    // XXX: If we change this, we can get rid of source arch names!
    combinedServePath: isApp ? null :
      "/packages/" + colonConverter.convert(
        inputSourceArch.pkg.name +
        (inputSourceArch.kind === "main" ? "" : (":" + inputSourceArch.kind)) +
        ".js"),
    name: inputSourceArch.pkg.name || null,
    declaredExports: _.pluck(inputSourceArch.declaredExports, 'name'),
    jsAnalyze: jsAnalyze,
    noLineNumbers: noLineNumbers
  });

  // *** Determine captured variables
  var packageVariables = [];
  var packageVariableNames = {};
  _.each(inputSourceArch.declaredExports, function (symbol) {
    if (_.has(packageVariableNames, symbol.name))
      return;
    packageVariables.push({
      name: symbol.name,
      export: symbol.testOnly? "tests" : true
    });
    packageVariableNames[symbol.name] = true;
  });
  _.each(results.assignedVariables, function (name) {
    if (_.has(packageVariableNames, name))
      return;
    packageVariables.push({
      name: name
    });
    packageVariableNames[name] = true;
  });

  // *** Consider npm dependencies and portability
  var arch = inputSourceArch.arch;
  if (arch === "os" && ! isPortable) {
    // Contains non-portable compiled npm modules, so set arch correctly
    arch = archinfo.host();
  }
  if (! archinfo.matches(arch, "os")) {
    // npm modules only work on server architectures
    nodeModulesPath = undefined;
  }

  // *** Output unibuild object
  isopk.addUnibuild({
    kind: inputSourceArch.kind,
    arch: arch,
    uses: inputSourceArch.uses,
    implies: inputSourceArch.implies,
    watchSet: watchSet,
    nodeModulesPath: nodeModulesPath,
    prelinkFiles: results.files,
    packageVariables: packageVariables,
    resources: resources
  });

  return {
    pluginProviderPackageNames: pluginProviderPackageNames
  };
};

var runLinters = function (
  inputSourceArch,
  isopackCache,
  wrappedSourceItems,
  linters) {
  if (_.isEmpty(linters))
    return;

  // XXX BBP comment explaining at the very least that the imports might be
  // different when you actually bundle it!

  // We want to look at the arch of the used packages that matches the arch
  // we're compiling.  Normally when we call compiler.eachUsedUnibuild, we're
  // either specifically looking at archinfo.host() because we're doing
  // something related to plugins (which always run in the host environment), or
  // we're in the process of building a bundler Target (a program), which has a
  // specific arch which is never 'os'.  In this odd case, though, we're trying
  // to run eachUsedUnibuild at package-compile time (not bundle time), so the
  // only 'arch' we've heard of might be 'os', if we're building a portable
  // unibuild.  In that case, we should look for imports in the host arch if it
  // exists instead of failing because a dependency does not have an 'os'
  // unibuild.
  // XXX BBP make sure that comment is comprehensible
  var whichArch = inputSourceArch.arch === 'os'
        ? archinfo.host() : inputSourceArch.arch;

  // For linters, figure out what are the global imports from other packages
  // that we use directly, or are implied.
  var globalImports = ['Package'];

  if (archinfo.matches(inputSourceArch.arch, "os")) {
    globalImports = globalImports.concat(['Npm', 'Assets']);
  }

  compiler.eachUsedUnibuild({
    dependencies: inputSourceArch.uses,
    arch: whichArch,
    isopackCache: isopackCache,
    skipUnordered: true,
    skipDebugOnly: true
  }, function (unibuild) {
    if (unibuild.pkg.name === inputSourceArch.pkg.name)
      return;
    _.each(unibuild.packageVariables, function (symbol) {
      if (symbol.export === true)
        globalImports.push(symbol.name);
    });
  });

  var linterPluginsByExtension = {};
  _.each(linters, function (linterPlugin) {
    _.each(linterPlugin.extensions, function (ext) {
      linterPluginsByExtension[ext] = linterPluginsByExtension[ext] || [];
      linterPluginsByExtension[ext].push(linterPlugin);
    });
  });

  // For each file choose the longest extension handled by linters.
  var longestMatchingExt = {};
  _.each(wrappedSourceItems, function (wrappedSource) {
    var filename = files.pathBasename(wrappedSource.relPath);
    var parts = filename.split('.');
    for (var i = 1; i < parts.length; i++) {
      var extension = parts.slice(i).join('.');
      if (_.has(linterPluginsByExtension, extension)) {
        longestMatchingExt[wrappedSource.relPath] = extension;
        break;
      }
    }
  });

  // Run linters on files.
  _.each(linters, function (linterDef) {
    // skip linters not relevant to the arch we are compiling for
    if (! linterDef.relevantForArch(inputSourceArch.arch))
      return;

    var sourcesToLint = [];
    _.each(wrappedSourceItems, function (wrappedSource) {
      var relPath = wrappedSource.relPath;
      var hash = wrappedSource.hash;
      var fileWatchSet = wrappedSource.watchset;
      var source = wrappedSource.source;

      // only run linters matching the longest handled extension
      if (! _.contains(linterDef.extensions, longestMatchingExt[relPath]))
        return;

      sourcesToLint.push(new linterPluginModule.LintingFile(wrappedSource));
    });

    if (! sourcesToLint.length)
      return;

    var linter = linterDef.instantiatePlugin();

    var archToString = function (arch) {
      if (arch.match(/web\.cordova/))
        return "Cordova";
      if (arch.match(/web\..*/))
        return "Client";
      if (arch.match(/os.*/))
        return "Server";
      throw new Error("Don't know how to display the arch: " + arch);
    };
    buildmessage.enterJob({
      title: "linting files with " +
        linterDef.isopack.name +
        " for target: " +
        (inputSourceArch.pkg.name || "app") +
        " (" + archToString(inputSourceArch.arch) + ")"
    }, function () {
      try {
        var markedLinter = buildmessage.markBoundary(linter.run.bind(linter));
        markedLinter(sourcesToLint, globalImports);
      } catch (e) {
        buildmessage.exception(e);
      }
    });
  });
};

// takes an isopack and returns a list of packages isopack depends on,
// containing at least one plugin
var getActivePluginPackages = function (isopk, options) {
  var inputSourceArch = options.sourceArch;
  var isopackCache = options.isopackCache;

  // XXX we used to include our own extensions only if we were the
  // "use" role. now we include them everywhere because we don't have
  // a special "use" role anymore. it's not totally clear to me what
  // the correct behavior should be -- we need to resolve whether we
  // think about extensions as being global to a package or particular
  // to a unibuild.

  // (there's also some weirdness here with handling implies, because
  // the implies field is on the target unibuild, but we really only care
  // about packages.)
  var activePluginPackages = [isopk];

  // We don't use plugins from weak dependencies, because the ability
  // to compile a certain type of file shouldn't depend on whether or
  // not some unrelated package in the target has a dependency. And we
  // skip unordered dependencies, because it's not going to work to
  // have circular build-time dependencies.
  //
  // eachUsedUnibuild takes care of pulling in implied dependencies for us (eg,
  // templating from standard-app-packages).
  //
  // We pass archinfo.host here, not self.arch, because it may be more specific,
  // and because plugins always have to run on the host architecture.
  compiler.eachUsedUnibuild({
    dependencies: inputSourceArch.uses,
    arch: archinfo.host(),
    isopackCache: isopackCache,
    skipUnordered: true
    // implicitly skip weak deps by not specifying acceptableWeakPackages option
  }, function (unibuild) {
    if (unibuild.pkg.name === isopk.name)
      return;
    if (_.isEmpty(unibuild.pkg.plugins))
      return;
    activePluginPackages.push(unibuild.pkg);
  });

  activePluginPackages = _.uniq(activePluginPackages);
  return activePluginPackages;
};

// Iterates over each in options.dependencies as well as unibuilds implied by
// them. The packages in question need to already be built and in
// options.isopackCache.
compiler.eachUsedUnibuild = function (
  options, callback) {
  buildmessage.assertInCapture();
  var dependencies = options.dependencies;
  var arch = options.arch;
  var isopackCache = options.isopackCache;

  var acceptableWeakPackages = options.acceptableWeakPackages || {};

  var processedUnibuildId = {};
  var usesToProcess = [];
  _.each(dependencies, function (use) {
    if (options.skipUnordered && use.unordered)
      return;
    if (use.weak && !_.has(acceptableWeakPackages, use.package))
      return;
    usesToProcess.push(use);
  });

  while (! _.isEmpty(usesToProcess)) {
    var use = usesToProcess.shift();

    var usedPackage = isopackCache.getIsopack(use.package);

    // Ignore this package if we were told to skip debug-only packages and it is
    // debug-only.
    if (usedPackage.debugOnly && options.skipDebugOnly)
      continue;

    var unibuild = usedPackage.getUnibuildAtArch(arch);
    if (!unibuild) {
      // The package exists but there's no unibuild for us. A buildmessage has
      // already been issued. Recover by skipping.
      continue;
    }

    if (_.has(processedUnibuildId, unibuild.id))
      continue;
    processedUnibuildId[unibuild.id] = true;

    callback(unibuild, {
      unordered: !!use.unordered,
      weak: !!use.weak
    });

    _.each(unibuild.implies, function (implied) {
      usesToProcess.push(implied);
    });
  }
};
