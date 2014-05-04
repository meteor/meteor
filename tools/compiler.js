var path = require('path');
var _ = require('underscore');
var watch = require('./watch.js');
var buildmessage = require('./buildmessage.js');
var archinfo = require(path.join(__dirname, 'archinfo.js'));
var linker = require('./linker.js');
var Unipackage = require('./unipackage.js');
var PackageLoader = require('./package-loader.js');
var uniload = require('./uniload.js');
var bundler = require('./bundler.js');
var catalog = require('./catalog.js');
var utils = require('./utils.js');
var meteorNpm = require('./meteor-npm.js');

var compiler = exports;

// Whenever you change anything about the code that generates unipackages, bump
// this version number. The idea is that the "format" field of the unipackage
// JSON file only changes when the actual specified structure of the
// unipackage/build changes, but this version (which is build-tool-specific) can
// change when the the contents (not structure) of the built output changes. So
// eg, if we improve the linker's static analysis, this should be bumped.
//
// You should also update this whenever you update any of the packages used
// directly by the unipackage creation process (eg js-analyze) since they do not
// end up as watched dependencies. (At least for now, packages only used in
// target creation (eg minifiers and dev-bundle-fetcher) don't require you to
// update BUILT_BY, though you will need to quit and rerun "meteor run".)
compiler.BUILT_BY = 'meteor/11';

// XXX where should this go? I'll make it a random utility function
// for now
//
// 'dependencies' is the 'uses' attribute from a Build. Call
// 'callback' with each build (of architecture matching `arch`)
// referenced by that dependency list. This includes directly used
// builds, and builds that are transitively "implied" by used
// builds. (But not builds that are used by builds that we use!)
//
// Options are:
//  - skipUnordered: ignore direct dependencies that are unordered
//  - acceptableWeakPackages: if set, include direct weak dependencies
//    that are on one of these packages (it's an object mapping
//    package name -> true). Otherwise skip all weak dependencies.
//
// (Why does we need to list acceptable weak packages here rather than just
// implement a skipWeak flag and allow the caller to filter the ones they care
// about? Well, we want to avoid even calling packageLoader.getBuild on
// dependencies that aren't going to get included, because in the uniload case,
// the weak dependency might not even be there at all.)
//
// packageLoader is the PackageLoader that should be used to resolve
// the dependencies.
compiler.eachUsedBuild = function (dependencies, arch, packageLoader, options,
                                   callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  var acceptableWeakPackages = options.acceptableWeakPackages || {};

  var processedBuildId = {};
  var usesToProcess = [];
  _.each(dependencies, function (use) {
    if (options.skipUnordered && use.unordered)
      return;
    if (use.weak && !_.has(acceptableWeakPackages, use.package))
      return;
    usesToProcess.push(use);
  });

  while (!_.isEmpty(usesToProcess)) {
    var use = usesToProcess.shift();

    var build = packageLoader.getBuild(use["package"], arch);

    if (_.has(processedBuildId, build.id))
      continue;
    processedBuildId[build.id] = true;

    callback(build, {
      unordered: !!use.unordered,
      weak: !!use.weak
    });

    _.each(build.implies, function (implied) {
      usesToProcess.push(implied);
    });
  }
};

// Pick a set of versions to use to satisfy a package's build-time
// dependencies. Emits buildmessages if this is impossible.
//
// Output is an object with keys:
// - directDependencies: map from package name to version string, for the
//   package's direct, ordered, strong, non-implied dependencies.
// - pluginDependencies: map from plugin name to complete (transitive)
//   version information for all packages used to build the plugin, as
//   a map from package name to version string.
// - packageDependencies: map from package name to version string to complete
//   transitive dependency in this package. We need for the version lock file
//   and to deal with implies.
//
// XXX You may get different results from this function depending on
// when you call it (if, for example, the packages in the catalog
// change). Should we have some kind of analog to .meteor/versions and
// 'meteor update' for package build-time dependencies?
//
// XXX deal with _makeBuildTimePackageLoader callsites
//
// XXX this function is probably going to get called a huge number of
// times. For example, the Catalog calls it on every local package
// every time the local package list changes. We could memoize the
// result on packageSource (and presumably make this a method on
// PackgeSource), or we could have some kind of cache (the ideal place
// for such a cache might be inside the constraint solver, since it
// will know how/when to invalidate it).
var determineBuildTimeDependencies = function (packageSource) {
  var ret = {};

  // There are some special cases where we know that the package has no source
  // files, which means it can't have any interesting build-time
  // dependencies. Specifically, the top-level wrapper package used by uniload
  // (via bundler.buildJsImage) works this way. This early return avoid calling
  // the constraint solver for uniload, which makes sense because it's supposed
  // to only look at the prebuilt packages.
  if (packageSource.noSources)
    return ret;

  // XXX If in any of these cases the constraint solver fails to find
  // a solution, we should emit a nice buildmessage and maybe find a
  // way to continue. For example, the pre-constraint-solver version
  // of this code had logic to detect if the user asked for a package
  // that just doesn't exist, and emit a message about that and then
  // continue with the build ignoring that dependency. It also had
  // code to do this for implies.

  // -- Direct & package dependencies --

  var dependencyMetadata =
    packageSource.getDependencyMetadata({
      logError: true,
      skipWeak: true,
      skipUnordered: true
    });

  if (! dependencyMetadata) {
    // If _computeDependencyMetadata failed, I guess we can try to
    // recover by returning a PackageLoader with no versions in
    // it. This will cause a lot of 'package not found' errors, so a
    // better approach would proabably be to actually have this
    // function return null and make the caller do a better job of
    // recovering.
    return ret;
  }

  var constraints = {};
  _.each(dependencyMetadata, function (info, packageName) {
    constraints[packageName] = info.constraint;
  });


  var versions = packageSource.dependencyVersions.dependencies;
  var constraintSolver = require('./constraint-solver.js');
  var resolver = new constraintSolver.Resolver;
  var sourceDeps = resolver.resolve(constraints);

  // We care about differentiating between all dependencies (which we save in
  // the version lock file) and the direct dependencies (which are packages that
  // we are exactly using) in order to optimize build id generation.
  ret.packageDependencies = sourceDeps;

  ret.directDependencies = {};
  _.each(sourceDeps, function (version, packageName) {
    // Take only direct dependencies.
    if (_.has(constraints, packageName)) {
      ret.directDependencies[packageName] = version;
    }
  });



  // -- Dependencies of Plugins --

  ret.pluginDependencies = {};
  var pluginVersions = packageSource.dependencyVersions.pluginDependencies;
  _.each(packageSource.pluginInfo, function (info) {
    var constraints = {};

    // info.uses is currently just an array of strings, and there's
    // no way to specify weak/unordered. Much like an app.
    _.each(info.use, function (spec) {
      var parsedSpec = utils.splitConstraint(spec);
      constraints[parsedSpec.package] = parsedSpec.constraint || null;
    });

    var resolver = new constraintSolver.Resolver;
    var pluginVersion = pluginVersions[info.name];
    ret.pluginDependencies[info.name] = resolver.resolve(constraints);
  });

  // Every time we run the constraint solver, we record the results. This has
  // two benefits -- first, it faciliatates repeatable builds, second,
  // memorizing results makes the constraint solver more efficient.
  var constraintResults = {
    dependencies: sourceDeps,
    pluginDependencies: ret.pluginDependencies
  };

  packageSource.recordDependencyVersions(constraintResults);

  return ret;
};

compiler.determineBuildTimeDependencies = determineBuildTimeDependencies;

// inputSourceArch is a SourceArch to compile. Process all source files through
// the appropriate handlers and run the prelink phase on any resulting
// JavaScript. Create a new Build and add it to 'unipackage'.
//
// packageLoader is a PackageLoader that can load our build-time
// direct dependencies at the correct versions. It is only used to
// load plugins so it does not need to be able to (and arguably should
// not be able to) load transitive dependencies of those packages.
//
// Returns a list of source files that were used in the compilation.
var compileBuild = function (unipackage, inputSourceArch, packageLoader,
                             nodeModulesPath, isPortable) {
  var isApp = ! inputSourceArch.pkg.name;
  var resources = [];
  var js = [];
  var sources = [];
  var watchSet = inputSourceArch.watchSet.clone();

  // *** Determine and load active plugins

  // XXX we used to include our own extensions only if we were the
  // "use" role. now we include them everywhere because we don't have
  // a special "use" role anymore. it's not totally clear to me what
  // the correct behavior should be -- we need to resolve whether we
  // think about extensions as being global to a package or particular
  // to a build.

  // (there's also some weirdness here with handling implies, because
  // the implies field is on the target build, but we really only care
  // about packages.)
  var activePluginPackages = [unipackage];

  // We don't use plugins from weak dependencies, because the ability
  // to compile a certain type of file shouldn't depend on whether or
  // not some unrelated package in the target has a dependency. And we
  // skip unordered dependencies, because it's not going to work to
  // have circular build-time dependencies.
  //
  // Note that we avoid even calling containsPlugins if we know there are no
  // sources; specifically, this avoids calling containsPlugins in the uniload
  // case because uniload doesn't know how to check to see if a package has
  // plugins.
  //
  // eachUsedBuild takes care of pulling in implied dependencies for us (eg,
  // templating from standard-app-packages).
  if (!inputSourceArch.noSource) {
    compiler.eachUsedBuild(
      inputSourceArch.uses, inputSourceArch.arch,
      packageLoader, {skipUnordered: true}, function (build) {
        if (build.pkg.name === unipackage.name)
          return;
        if (_.isEmpty(build.pkg.plugins))
          return;
        activePluginPackages.push(build.pkg);
      });
  }

  activePluginPackages = _.uniq(activePluginPackages);

  // *** Assemble the list of source file handlers from the plugins
  var allHandlers = {};
  var sourceExtensions = {};  // maps source extensions to isTemplate

  sourceExtensions['js'] = false;
  allHandlers['js'] = function (compileStep) {
    // This is a hardcoded handler for *.js files. Since plugins
    // are written in JavaScript we have to start somewhere.
    compileStep.addJavaScript({
      data: compileStep.read().toString('utf8'),
      path: compileStep.inputPath,
      sourcePath: compileStep.inputPath,
      // XXX eventually get rid of backward-compatibility "raw" name
      // XXX COMPAT WITH 0.6.4
      bare: compileStep.fileOptions.bare || compileStep.fileOptions.raw
    });
  };

  _.each(activePluginPackages, function (otherPkg) {
    _.each(otherPkg.getSourceHandlers(), function (sourceHandler, ext) {
      // XXX comparing function text here seems wrong.
      if (ext in allHandlers &&
          allHandlers[ext].toString() !== sourceHandler.handler.toString()) {
        buildmessage.error(
          "conflict: two packages included in " +
            (inputSourceArch.pkg.name || "the app") + ", " +
            (allHandlers[ext].pkg.name || "the app") + " and " +
            (otherPkg.name || "the app") + ", " +
            "are both trying to handle ." + ext);
        // Recover by just going with the first handler we saw
      } else {
        allHandlers[ext] = sourceHandler.handler;
        sourceExtensions[ext] = !!sourceHandler.isTemplate;
      }
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

  // *** Process each source file
  var addAsset = function (contents, relPath, hash) {
    // XXX hack
    if (! inputSourceArch.pkg.name)
      relPath = relPath.replace(/^(private|public)\//, '');

    resources.push({
      type: "asset",
      data: contents,
      path: relPath,
      servePath: path.join(inputSourceArch.pkg.serveRoot, relPath),
      hash: hash
    });

    sources.push(relPath);
  };

  _.each(sourceItems, function (source) {
    var relPath = source.relPath;
    var fileOptions = _.clone(source.fileOptions) || {};
    var absPath = path.resolve(inputSourceArch.pkg.sourceRoot, relPath);
    var filename = path.basename(relPath);
    var file = watch.readAndWatchFileWithHash(watchSet, absPath);
    var contents = file.contents;

    sources.push(relPath);

    if (contents === null) {
      buildmessage.error("File not found: " + source.relPath);
      // recover by ignoring
      return;
    }

    // Find the handler for source files with this extension.
    var handler = null;
    if (! fileOptions.isAsset) {
      var parts = filename.split('.');
      for (var i = 0; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(allHandlers, extension)) {
          handler = allHandlers[extension];
          break;
        }
      }
    }

    if (! handler) {
      // If we don't have an extension handler, serve this file as a
      // static resource on the client, or ignore it on the server.
      //
      // XXX This is pretty confusing, especially if you've
      // accidentally forgotten a plugin -- revisit?
      addAsset(contents, relPath, file.hash);
      return;
    }

    // This object is called a #CompileStep and it's the interface
    // to plugins that define new source file handlers (eg,
    // Coffeescript).
    //
    // Fields on CompileStep:
    //
    // - arch: the architecture for which we are building
    // - inputSize: total number of bytes in the input file
    // - inputPath: the filename and (relative) path of the input
    //   file, eg, "foo.js". We don't provide a way to get the full
    //   path because you're not supposed to read the file directly
    //   off of disk. Instead you should call read(). That way we
    //   can ensure that the version of the file that you use is
    //   exactly the one that is recorded in the dependency
    //   information.
    // - pathForSourceMap: If this file is to be included in a source map,
    //   this is the name you should use for it in the map.
    // - rootOutputPath: on browser targets, for resources such as
    //   stylesheet and static assets, this is the root URL that
    //   will get prepended to the paths you pick for your output
    //   files so that you get your own namespace, for example
    //   '/packages/foo'. null on non-browser targets
    // - fileOptions: any options passed to "api.add_files"; for
    //   use by the plugin. The built-in "js" plugin uses the "bare"
    //   option for files that shouldn't be wrapped in a closure.
    // - declaredExports: An array of symbols exported by this build, or null
    //   if it may not export any symbols (eg, test builds). This is used by
    //   CoffeeScript to ensure that it doesn't close over those symbols, eg.
    // - read(n): read from the input file. If n is given it should
    //   be an integer, and you will receive the next n bytes of the
    //   file as a Buffer. If n is omitted you get the rest of the
    //   file.
    // - appendDocument({ section: "head", data: "my markup" })
    //   Browser targets only. Add markup to the "head" or "body"
    //   section of the document.
    // - addStylesheet({ path: "my/stylesheet.css", data: "my css",
    //                   sourceMap: "stringified json sourcemap"})
    //   Browser targets only. Add a stylesheet to the
    //   document. 'path' is a requested URL for the stylesheet that
    //   may or may not ultimately be honored. (Meteor will add
    //   appropriate tags to cause the stylesheet to be loaded. It
    //   will be subject to any stylesheet processing stages in
    //   effect, such as minification.)
    // - addJavaScript({ path: "my/program.js", data: "my code",
    //                   sourcePath: "src/my/program.js",
    //                   bare: true })
    //   Add JavaScript code, which will be namespaced into this
    //   package's environment (eg, it will see only the exports of
    //   this package's imports), and which will be subject to
    //   minification and so forth. Again, 'path' is merely a hint
    //   that may or may not be honored. 'sourcePath' is the path
    //   that will be used in any error messages generated (eg,
    //   "foo.js:4:1: syntax error"). It must be present and should
    //   be relative to the project root. Typically 'inputPath' will
    //   do handsomely. "bare" means to not wrap the file in
    //   a closure, so that its vars are shared with other files
    //   in the module.
    // - addAsset({ path: "my/image.png", data: Buffer })
    //   Add a file to serve as-is over HTTP (browser targets) or
    //   to include as-is in the bundle (os targets).
    //   This time `data` is a Buffer rather than a string. For
    //   browser targets, it will be served at the exact path you
    //   request (concatenated with rootOutputPath). For server
    //   targets, the file can be retrieved by passing path to
    //   Assets.getText or Assets.getBinary.
    // - error({ message: "There's a problem in your source file",
    //           sourcePath: "src/my/program.ext", line: 12,
    //           column: 20, func: "doStuff" })
    //   Flag an error -- at a particular location in a source
    //   file, if you like (you can even indicate a function name
    //   to show in the error, like in stack traces). sourcePath,
    //   line, column, and func are all optional.
    //
    // XXX for now, these handlers must only generate portable code
    // (code that isn't dependent on the arch, other than 'browser'
    // vs 'os') -- they can look at the arch that is provided
    // but they can't rely on the running on that particular arch
    // (in the end, an arch-specific build will be emitted only if
    // there are native node modules). Obviously this should
    // change. A first step would be a setOutputArch() function
    // analogous to what we do with native node modules, but maybe
    // what we want is the ability to ask the plugin ahead of time
    // how specific it would like to force builds to be.
    //
    // XXX we handle encodings in a rather cavalier way and I
    // suspect we effectively end up assuming utf8. We can do better
    // than that!
    //
    // XXX addAsset probably wants to be able to set MIME type and
    // also control any manifest field we deem relevant (if any)
    //
    // XXX Some handlers process languages that have the concept of
    // include files. These are problematic because we need to
    // somehow instrument them to get the names and hashs of all of
    // the files that they read for dependency tracking purposes. We
    // don't have an API for that yet, so for now we provide a
    // workaround, which is that _fullInputPath contains the full
    // absolute path to the input files, which allows such a plugin
    // to set up its include search path. It's then on its own for
    // registering dependencies (for now..)
    //
    // XXX in the future we should give plugins an easy and clean
    // way to return errors (that could go in an overall list of
    // errors experienced across all files)
    var readOffset = 0;
    var compileStep = {
      inputSize: contents.length,
      inputPath: relPath,
      _fullInputPath: absPath, // avoid, see above..
      // XXX duplicates _pathForSourceMap() in linker
      pathForSourceMap: (
        inputSourceArch.pkg.name
          ? inputSourceArch.pkg.name + "/" + relPath
          : path.basename(relPath)),
      // null if this is an app. intended to be used for the sources
      // dictionary for source maps.
      packageName: inputSourceArch.pkg.name,
      rootOutputPath: inputSourceArch.pkg.serveRoot,
      arch: inputSourceArch.arch, // XXX: what is the story with arch?
      archMatches: function (pattern) {
        return archinfo.matches(inputSourceArch.arch, pattern);
      },
      fileOptions: fileOptions,
      declaredExports: _.pluck(inputSourceArch.declaredExports, 'name'),
      read: function (n) {
        if (n === undefined || readOffset + n > contents.length)
          n = contents.length - readOffset;
        var ret = contents.slice(readOffset, readOffset + n);
        readOffset += n;
        return ret;
      },
      appendDocument: function (options) {
        if (! archinfo.matches(inputSourceArch.arch, "browser"))
          throw new Error("Document sections can only be emitted to " +
                          "browser targets");
        if (options.section !== "head" && options.section !== "body")
          throw new Error("'section' must be 'head' or 'body'");
        if (typeof options.data !== "string")
          throw new Error("'data' option to appendDocument must be a string");
        resources.push({
          type: options.section,
          data: new Buffer(options.data, 'utf8')
        });
      },
      addStylesheet: function (options) {
        if (! archinfo.matches(inputSourceArch.arch, "browser"))
          throw new Error("Stylesheets can only be emitted to " +
                          "browser targets");
        if (typeof options.data !== "string")
          throw new Error("'data' option to addStylesheet must be a string");
        resources.push({
          type: "css",
          data: new Buffer(options.data, 'utf8'),
          servePath: path.join(inputSourceArch.pkg.serveRoot, options.path),
          sourceMap: options.sourceMap
        });
      },
      addJavaScript: function (options) {
        if (typeof options.data !== "string")
          throw new Error("'data' option to addJavaScript must be a string");
        if (typeof options.sourcePath !== "string")
          throw new Error("'sourcePath' option must be supplied to addJavaScript. Consider passing inputPath.");
        if (options.bare && ! archinfo.matches(inputSourceArch.arch, "browser"))
          throw new Error("'bare' option may only be used for browser targets");
        js.push({
          source: options.data,
          sourcePath: options.sourcePath,
          servePath: path.join(inputSourceArch.pkg.serveRoot, options.path),
          bare: !! options.bare,
          sourceMap: options.sourceMap
        });
      },
      addAsset: function (options) {
        if (! (options.data instanceof Buffer))
          throw new Error("'data' option to addAsset must be a Buffer");
        addAsset(options.data, options.path);
      },
      error: function (options) {
        buildmessage.error(options.message || ("error building " + relPath), {
          file: options.sourcePath,
          line: options.line ? options.line : undefined,
          column: options.column ? options.column : undefined,
          func: options.func ? options.func : undefined
        });
      }
    };

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
  // default build is not allowed to depend on anything!)
  var jsAnalyze = null;
  if (! _.isEmpty(js) && inputSourceArch.pkg.name !== "js-analyze") {
    jsAnalyze = uniload.load({
      packages: ["js-analyze"]
    })["js-analyze"].JSAnalyze;
  }

  var results = linker.prelink({
    inputFiles: js,
    useGlobalNamespace: isApp,
    // I was confused about this, so I am leaving a comment -- the
    // combinedServePath is either [pkgname].js or [pluginName]:plugin.js.
    // XXX: If we change this, we can get rid of source arch names!
    combinedServePath: isApp ? null :
      "/packages/" + inputSourceArch.pkg.name +
      (inputSourceArch.archName === "main" ? "" : (":" + inputSourceArch.archName)) + ".js",
    name: inputSourceArch.pkg.name || null,
    declaredExports: _.pluck(inputSourceArch.declaredExports, 'name'),
    jsAnalyze: jsAnalyze
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
    // Contains non-portable npm module builds, so set arch correctly
    arch = archinfo.host();
  }
  if (! archinfo.matches(arch, "os")) {
    // npm models only work on server architectures
    nodeModulesPath = undefined;
  }

  // *** Output build object
  unipackage.addBuild({
    name: inputSourceArch.archName,
    arch: inputSourceArch.arch,
    uses: inputSourceArch.uses,
    implies: inputSourceArch.implies,
    watchSet: watchSet,
    nodeModulesPath: nodeModulesPath,
    prelinkFiles: results.files,
    packageVariables: packageVariables,
    resources: resources
  });

  return sources;
};

// Build a PackageSource into a Unipackage by running its source files through
// the appropriate compiler plugins. Once build has completed, any errors
// detected in the package will have been emitted to buildmessage.
//
// Options:
//  - officialBuild: defaults to false. If false, then we will compute a
//    build identifier (a hash of the package's dependency versions and
//    source files) and include it as part of the unipackage's version
//    string. If true, then we will use the version that is contained in
//    the package's source. You should set it to true when you are
//    building a package to publish as an official build with the
//    package server.
//  - buildTimeDependencies: optional. If present with keys
//    'directDependencies' and 'pluginDependencies', it will be used
//    instead of calling 'determineBuildTimeDependencies'. This is used
//    when we already have a resolved set of build-time dependencies and
//    want to use that instead of resolving them again, e.g. when
//    running 'meteor publish-for-arch'.
//
// Returns an object with keys:
// - unipackage: the build Unipackage
// - sources: array of source files (identified by their path on local
//   disk) that were used by the build (the source files you'd have to
//   ship to a different machine to replicate the build there)
compiler.compile = function (packageSource, options) {
  var sources = [];
  var pluginWatchSet = packageSource.pluginWatchSet.clone();
  var plugins = {};

  options = _.extend({ officialBuild: false }, options);

  // Determine versions of build-time dependencies
  var buildTimeDeps;
  if (options.buildTimeDependencies &&
      options.buildTimeDependencies.directDependencies &&
      options.buildTImeDependencies.pluginDependencies) {
    buildTimeDeps = options.buildTimeDependencies;
  } else {
    buildTimeDeps = determineBuildTimeDependencies(packageSource);
  }

  // Build plugins
  _.each(packageSource.pluginInfo, function (info) {
    buildmessage.enterJob({
      title: "building plugin `" + info.name +
        "` in package `" + packageSource.name + "`",
      rootPath: packageSource.sourceRoot
    }, function () {

      var packageLoader = new PackageLoader({
        versions: buildTimeDeps.pluginDependencies[info.name]
      });

      var buildResult = bundler.buildJsImage({
        name: info.name,
        packageLoader: packageLoader,
        use: info.use,
        sourceRoot: packageSource.sourceRoot,
        sources: info.sources,
        npmDependencies: info.npmDependencies,
        // Plugins have their own npm dependencies separate from the
        // rest of the package, so they need their own separate npm
        // shrinkwrap and cache state.
        npmDir: path.resolve(path.join(packageSource.sourceRoot, '.npm',
                                       'plugin', info.name)),
        dependencyVersions: packageSource.dependencyVersions
      });

      // Add the plugin's sources to our list.
      _.each(info.sources, function (source) {
        sources.push(source);
      });

      // Add this plugin's dependencies to our "plugin dependency"
      // WatchSet. buildResult.watchSet will end up being the merged
      // watchSets of all of the builds of the plugin -- plugins have
      // only one build and this should end up essentially being just
      // the source files of the plugin.
      pluginWatchSet.merge(buildResult.watchSet);

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
      nodeModulesPath = path.join(packageSource.npmCacheDirectory,
                                  'node_modules');
      if (! meteorNpm.dependenciesArePortable(packageSource.npmCacheDirectory))
        isPortable = false;
    }
  }

  var unipackage = new Unipackage;
  unipackage.initFromOptions({
    name: packageSource.name,
    metadata: packageSource.metadata,
    version: packageSource.version,
    earliestCompatibleVersion: packageSource.earliestCompatibleVersion,
    isTest: packageSource.isTest,
    plugins: plugins,
    pluginWatchSet: pluginWatchSet,
    buildTimeDirectDependencies: buildTimeDeps.directDependencies,
    buildTimePluginDependencies: buildTimeDeps.pluginDependencies,
    includeTool: packageSource.includeTool
  });

  // Compile builds. Might use our plugins, so needs to happen second.
  var packageLoader = new PackageLoader({
    versions: buildTimeDeps.packageDependencies
  });

  _.each(packageSource.architectures, function (build) {
    var buildSources = compileBuild(unipackage, build, packageLoader,
                                    nodeModulesPath, isPortable);
    sources.push.apply(sources, buildSources);
  });

  // XXX what should we do if the PackageSource doesn't have a version?
  // (e.g. a plugin)
  if (! options.officialBuild && packageSource.version) {
    // XXX I have no idea if this should be using buildmessage.enterJob
    // or not. test what happens on error
    buildmessage.enterJob({
      title: "compute build identifier for package `" +
        packageSource.name + "`",
      rootPath: packageSource.sourceRoot
    }, function () {
      if (packageSource.version.indexOf("+") !== -1) {
        buildmessage.error("cannot compute build identifier for package `" +
                           packageSource.name + "` version " +
                           packageSource.version + "because it already " +
                           "has a build identifier");
      } else {
        unipackage.addBuildIdentifierToVersion({
          relativeTo: packageSource.sourceRoot
        });
      }
    });
  }

  return {
    sources: _.uniq(sources),
    unipackage: unipackage
  };
};

// Given an object mapping package name to version, return an object
// that includes all the packages that contain plugins, according to the
// catalog.
//
// XXX HACK: This IGNORES package versions that are not available in the
// catalog, which could happen if for example this is called during
// catalog initialization before +local versions have been updated with
// their real buildids. It so happens that this works out, because when
// we are calling it during catalog initialization, we are calling it
// for a package whose build-time dependencies have already been built,
// so any dependencies that contains plugins have real versions in the
// catalog already. Still, this seems very brittle and we should fix it.
var getPluginProviders = function (versions) {
  var result = {};
  _.each(versions, function (version, name) {
    // Direct dependencies only create a build-order constraint if
    // they contain a plugin.
    var catalogVersion = catalog.catalog.getVersion(name, version);
    if (catalogVersion && catalogVersion.containsPlugins) {
      result[name] = version;
    }
  });
  return result;
};

// Figure out what packages have to be compiled and available in the
// catalog before 'packageSource' can be compiled. Returns an array of
// objects with keys 'name', 'version' (the latter a version
// string). Yes, it is possible that multiple versions of some other
// package might be build-time dependencies (because of plugins).
compiler.getBuildOrderConstraints = function (packageSource) {
  var versions = {}; // map from package name to version to true
  var addVersion = function (version, name) {
    if (name !== packageSource.name) {
      if (! _.has(versions, name))
        versions[name] = {};
      versions[name][version] = true;
    }
  };

  var buildTimeDeps = determineBuildTimeDependencies(packageSource);

  // Direct dependencies only impose a build-order constraint if they
  // contain plugins.
  _.each(getPluginProviders(buildTimeDeps.directDependencies), addVersion);
  _.each(buildTimeDeps.pluginDependencies, function (versions, pluginName) {
    _.each(versions, addVersion);
  });

  var ret = [];
  _.each(versions, function (versionArray, name) {
    _.each(_.keys(versionArray), function (version) {
      ret.push({ name: name, version: version });
    });
  });

  return ret;
};

// Check to see if a particular build of a package is up to date (that
// is, if the source files haven't changed and the build-time
// dependencies haven't changed, and if we're a sufficiently similar
// version of Meteor to what built it that we believe we'd generate
// identical code). True if we have dependency info and it
// says that the package is up-to-date. False if a source file or
// build-time dependency has changed.
compiler.checkUpToDate = function (packageSource, unipackage) {
  if (unipackage.forceNotUpToDate) {
    return false;
  }

  // Do we think we'd generate different contents than the tool that
  // built this package?
  if (unipackage.builtBy !== compiler.BUILT_BY) {
    return false;
  }

  // Compute the unipackage's direct and plugin dependencies to
  // `buildTimeDeps`, by comparing versions (including build
  // identifiers). For direct dependencies, we only care if the set of
  // direct dependencies that provide plugins has changed.
  var buildTimeDeps = determineBuildTimeDependencies(packageSource);
  var sourcePluginProviders = getPluginProviders(
    buildTimeDeps.directDependencies
  );

  var unipackagePluginProviders = getPluginProviders(
    unipackage.buildTimeDirectDependencies
  );

  if (_.keys(sourcePluginProviders).length !==
      _.keys(unipackagePluginProviders).length) {
    return false;
  }

  var directDepsPackageLoader = new PackageLoader({
    versions: buildTimeDeps.directDependencies
  });
  var directDepsMatch = _.all(
    sourcePluginProviders,
    function (version, packageName) {
      var loadedPackage = directDepsPackageLoader.getPackage(packageName);
      // XXX Check that `versionWithBuildId` is the same as `version`
      // except for the build id?
      return (loadedPackage &&
              unipackagePluginProviders[packageName] ===
              loadedPackage.version);
    }
  );
  if (! directDepsMatch) {
    return false;
  }

  if (_.keys(buildTimeDeps.pluginDependencies).length !==
      _.keys(unipackage.buildTimePluginDependencies).length) {
    return false;
  }

  var pluginDepsMatch = _.all(
    buildTimeDeps.pluginDependencies,
    function (pluginDeps, pluginName) {
      // For each plugin, check that the resolved build-time deps for
      // that plugin match the unipackage's build time deps for it.
      var packageLoaderForPlugin = new PackageLoader(
        buildTimeDeps.pluginDependencies
      );
      var unipackagePluginDeps = unipackage.buildTimePluginDependencies[pluginName];
      if (! unipackagePluginDeps ||
          _.keys(pluginDeps).length !== _.keys(unipackagePluginDeps).length) {
        return false;
      }
      return _.all(pluginDeps, function (version, packageName) {
        var loadedPackage = packageLoaderForPlugin.getPackage(packageName);
        return loadedPackage &&
          unipackagePluginDeps[packageName] === loadedPackage.version;
      });
    }
  );

  if (! pluginDepsMatch) {
    return false;
  }

  var watchSet = new watch.WatchSet();
  watchSet.merge(unipackage.pluginWatchSet);
  _.each(unipackage.builds, function (build) {
    watchSet.merge(build.watchSet);
  });

  if (! watch.isUpToDate(watchSet)) {
    return false;
  }

  // XXX We don't actually pay attention to includeTool here. Changes that would
  // affect the output of includeTool never cause us to rebuild. We think we
  // will just force a rebuild any time we're actually publishing meteor-tool.
  //
  // We aren't bothering to do this because the code to check-up-to-date would
  // be pretty intricate (it has to check that none of the tools files from git
  // changed as well as *all transitive dependencies* of the packages we
  // include), and there's not much of an advantage to ensuring that the built
  // tool is up to date unless we're about to publish it anyway, since we don't
  // actually run the built tool during development. (And there would be a
  // runtime performance overhead to this extra check.)

  return true;
};
