// XXX #3006: Put this file back into compiler.js.
var _ = require('underscore');
var path = require('path');

var archinfo = require('./archinfo.js');
var buildmessage = require('./buildmessage.js');
var bundler = require('./bundler.js');
var isopack = require('./isopack.js');
var isopackets = require('./isopackets.js');
var linker = require('./linker.js');
var meteorNpm = require('./meteor-npm.js');
var watch = require('./watch.js');

// Given an array of package names, returns an array of all package names
// reachable from it for a given arch (ignoring weak dependencies).
// Note that this function does NOT require the packages to be built:
// it only requires access to the catalog.
exports.getTransitiveClosureOfPackages = function (rootPackageNames,
                                                   arch, packageMap) {
  var usedPackages = {};  // Map from package name to true;
  var depArch = archinfo.withoutSpecificOs(arch);

  var addToUsed = function (packageName) {
    if (_.has(usedPackages, packageName))
      return;
    usedPackages[packageName] = true;

    var versionRecord = packageMap.getVersionCatalogRecord(packageName);
    // Look at every use and imply for this arch.
    _.each(versionRecord.dependencies, function (dep, depName) {
      _.each(dep.references, function (ref) {
        // We only care about dependencies for our arch (which is normalized to
        // not mention a specific OS).
        if (ref.arch !== depArch)
          return;
        // We don't care about weak dependencies
        if (ref.weak)
          return;
        addToUsed(depName);
      });
    });
  };
  _.each(rootPackageNames, addToUsed);
  return _.keys(usedPackages);
};

exports.compile = function (packageSource, options) {
  buildmessage.assertInCapture();

  var packageMap = options.packageMap;
  var isopackCache = options.isopackCache;

  var sources = [];
  var pluginWatchSet = packageSource.pluginWatchSet.clone();
  var plugins = {};

  // Build plugins
  _.each(packageSource.pluginInfo, function (info) {
    buildmessage.enterJob({
      title: "Building plugin `" + info.name +
        "` in package `" + packageSource.name + "`",
      rootPath: packageSource.sourceRoot
    }, function () {
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
        npmDir: path.resolve(path.join(packageSource.sourceRoot, '.npm',
                                       'plugin', info.name)),
        catalog: packageSource.catalog
      });

      // Add the plugin's sources to our list.
      _.each(info.sources, function (source) {
        sources.push(source);
      });

      // Add this plugin's dependencies to our "plugin dependency"
      // WatchSet. buildResult.watchSet will end up being the merged
      // watchSets of all of the unibuilds of the plugin -- plugins have
      // only one unibuild and this should end up essentially being just
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

  var pluginProviderPackageNames = {};

  _.each(packageSource.architectures, function (unibuild) {
    var unibuildResult = compileUnibuild({
      isopack: isopk,
      sourceArch: unibuild,
      isopackCache: isopackCache,
      nodeModulesPath: nodeModulesPath,
      isPortable: isPortable
    });
    sources.push.apply(sources, unibuildResult.sources);
    _.extend(pluginProviderPackageNames,
             unibuildResult.pluginProviderPackageNames);
  });

  // XXX #3006: We used to add build IDs here. Do we still need that?

  return {
    sources: _.uniq(sources),
    isopack: isopk,
    pluginProviderPackageNames: _.keys(pluginProviderPackageNames)
  };
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

  var isApp = ! inputSourceArch.pkg.name;
  var resources = [];
  var js = [];
  var sources = [];
  var pluginProviderPackageNames = {};
  var watchSet = inputSourceArch.watchSet.clone();

  // *** Determine and load active plugins

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
  // Note that we avoid even calling containsPlugins if we know there are no
  // sources; specifically, this avoids calling containsPlugins in the
  // isopacket-building case because in that case we might not know how to check
  // to see if a package has plugins.  (It's possible that this check is no
  // longer necessary.)
  //
  // eachUsedUnibuild takes care of pulling in implied dependencies for us (eg,
  // templating from standard-app-packages).
  //
  // We pass archinfo.host here, not self.arch, because it may be more specific,
  // and because plugins always have to run on the host architecture.
  if (!inputSourceArch.noSources) {
    // XXX we could do this just using the catalog too?
    exports.eachUsedUnibuild({
      dependencies: inputSourceArch.uses,
      arch: archinfo.host(),
      isopackCache: isopackCache,
      skipUnordered: true
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
      activePluginPackages.push(unibuild.pkg);
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

    var options = {
      data: compileStep.read().toString('utf8'),
      path: compileStep.inputPath,
      sourcePath: compileStep.inputPath
    };

    if (compileStep.fileOptions.hasOwnProperty("bare")) {
      options.bare = compileStep.fileOptions.bare;
    } else if (compileStep.fileOptions.hasOwnProperty("raw")) {
      // XXX eventually get rid of backward-compatibility "raw" name
      // XXX COMPAT WITH 0.6.4
      options.bare = compileStep.fileOptions.raw;
    }

    compileStep.addJavaScript(options);
  };

  _.each(activePluginPackages, function (otherPkg) {
    _.each(otherPkg.getSourceHandlers(), function (sourceHandler, ext) {
      // XXX comparing function text here seems wrong.
      if (_.has(allHandlers, ext) &&
          allHandlers[ext].toString() !== sourceHandler.handler.toString()) {
        buildmessage.error(
          "conflict: two packages included in " +
            (inputSourceArch.pkg.name || "the app") + ", " +
            (allHandlers[ext].pkg.name || "the app") + " and " +
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
      allHandlers[ext] = sourceHandler.handler;
      sourceExtensions[ext] = !!sourceHandler.isTemplate;
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
      servePath: path.join(inputSourceArch.pkg.serveRoot, relPath),
      hash: hash
    });
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
    // - rootOutputPath: on web targets, for resources such as
    //   stylesheet and static assets, this is the root URL that
    //   will get prepended to the paths you pick for your output
    //   files so that you get your own namespace, for example
    //   '/packages/foo'. null on non-web targets
    // - fileOptions: any options passed to "api.add_files"; for
    //   use by the plugin. The built-in "js" plugin uses the "bare"
    //   option for files that shouldn't be wrapped in a closure.
    // - declaredExports: An array of symbols exported by this unibuild, or null
    //   if it may not export any symbols (eg, test unibuilds). This is used by
    //   CoffeeScript to ensure that it doesn't close over those symbols, eg.
    // - read(n): read from the input file. If n is given it should
    //   be an integer, and you will receive the next n bytes of the
    //   file as a Buffer. If n is omitted you get the rest of the
    //   file.
    // - appendDocument({ section: "head", data: "my markup" })
    //   Browser targets only. Add markup to the "head" or "body"
    //   Web targets only. Add markup to the "head" or "body"
    //   section of the document.
    // - addStylesheet({ path: "my/stylesheet.css", data: "my css",
    //                   sourceMap: "stringified json sourcemap"})
    //   Web targets only. Add a stylesheet to the
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
    //   Add a file to serve as-is over HTTP (web targets) or
    //   to include as-is in the bundle (os targets).
    //   This time `data` is a Buffer rather than a string. For
    //   web targets, it will be served at the exact path you
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
    // (code that isn't dependent on the arch, other than 'web'
    // vs 'os') -- they can look at the arch that is provided
    // but they can't rely on the running on that particular arch
    // (in the end, an arch-specific unibuild will be emitted only if
    // there are native node modules). Obviously this should
    // change. A first step would be a setOutputArch() function
    // analogous to what we do with native node modules, but maybe
    // what we want is the ability to ask the plugin ahead of time
    // how specific it would like to force unibuilds to be.
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

    /**
     * The comments for this class aren't used to generate docs right now.
     * The docs live in the GitHub Wiki at: https://github.com/meteor/meteor/wiki/CompileStep-API-for-Build-Plugin-Source-Handlers
     * @class CompileStep
     * @summary The object passed into Plugin.registerSourceHandler
     * @global
     */
    var compileStep = {

      /**
       * @summary The total number of bytes in the input file.
       * @memberOf CompileStep
       * @instance
       * @type {Integer}
       */
      inputSize: contents.length,

      /**
       * @summary The filename and relative path of the input file.
       * Please don't use this filename to read the file from disk, instead
       * use [compileStep.read](CompileStep-read).
       * @type {String}
       * @instance
       * @memberOf CompileStep
       */
      inputPath: relPath,

      /**
       * @summary The filename and absolute path of the input file.
       * Please don't use this filename to read the file from disk, instead
       * use [compileStep.read](CompileStep-read).
       * @type {String}
       * @instance
       * @memberOf CompileStep
       */
      fullInputPath: absPath,

      // The below is used in the less and stylus packages... so it should be
      // public API.
      _fullInputPath: absPath, // avoid, see above..

      // XXX duplicates _pathForSourceMap() in linker
      /**
       * @summary If you are generating a sourcemap for the compiled file, use
       * this path for the original file in the sourcemap.
       * @type {String}
       * @memberOf CompileStep
       * @instance
       */
      pathForSourceMap: (inputSourceArch.pkg.name ?
        inputSourceArch.pkg.name + "/" + relPath : path.basename(relPath)),

      // null if this is an app. intended to be used for the sources
      // dictionary for source maps.
      /**
       * @summary The name of the package in which the file being built exists.
       * @type {String}
       * @memberOf CompileStep
       * @instance
       */
      packageName: inputSourceArch.pkg.name,

      /**
       * @summary On web targets, this will be the root URL prepended
       * to the paths you pick for your output files. For example,
       * it could be "/packages/my-package".
       * @type {String}
       * @memberOf CompileStep
       * @instance
       */
      rootOutputPath: inputSourceArch.pkg.serveRoot,

      /**
       * @summary The architecture for which we are building. Can be "os",
       * "web.browser", or "web.cordova".
       * @type {String}
       * @memberOf CompileStep
       * @instance
       */
      arch: inputSourceArch.arch,

      /**
       * @deprecated in 0.9.4
       * This is a duplicate API of the above, we don't need it.
       */
      archMatches: function (pattern) {
        return archinfo.matches(inputSourceArch.arch, pattern);
      },

      /**
       * @summary Any options passed to "api.addFiles".
       * @type {Object}
       * @memberOf CompileStep
       * @instance
       */
      fileOptions: fileOptions,

      /**
       * @summary The list of exports that the current package has defined.
       * Can be used to treat those symbols differently during compilation.
       * @type {Object}
       * @memberOf CompileStep
       * @instance
       */
      declaredExports: _.pluck(inputSourceArch.declaredExports, 'name'),

      /**
       * @summary Read from the input file. If `n` is specified, returns the
       * next `n` bytes of the file as a Buffer. XXX not sure if this actually
       * returns a String sometimes...
       * @param  {Integer} [n] The number of bytes to return.
       * @instance
       * @memberOf CompileStep
       */
      read: function (n) {
        if (n === undefined || readOffset + n > contents.length)
          n = contents.length - readOffset;
        var ret = contents.slice(readOffset, readOffset + n);
        readOffset += n;
        return ret;
      },

      /**
       * @summary Works in web targets only. Add markup to the `head` or `body`
       * section of the document.
       * @param  {Object} options
       * @param {String} options.section Which section of the document should
       * be appended to. Can only be "head" or "body".
       * @param {String} options.data The content to append.
       * @memberOf CompileStep
       * @instance
       */
      addHtml: function (options) {
        if (! archinfo.matches(inputSourceArch.arch, "web"))
          throw new Error("Document sections can only be emitted to " +
                          "web targets");
        if (options.section !== "head" && options.section !== "body")
          throw new Error("'section' must be 'head' or 'body'");
        if (typeof options.data !== "string")
          throw new Error("'data' option to appendDocument must be a string");
        resources.push({
          type: options.section,
          data: new Buffer(options.data, 'utf8')
        });
      },

      /**
       * @deprecated in 0.9.4
       */
      appendDocument: function (options) {
        this.addHtml(options);
      },

      /**
       * @summary Web targets only. Add a stylesheet to the document.
       * @param {Object} options
       * @param {String} path The requested path for the added CSS, may not be
       * satisfied if there are path conflicts.
       * @param {String} data The content of the stylesheet that should be
       * added.
       * @param {String} sourceMap A stringified JSON sourcemap, in case the
       * stylesheet was generated from a different file.
       * @memberOf CompileStep
       * @instance
       */
      addStylesheet: function (options) {
        if (! archinfo.matches(inputSourceArch.arch, "web"))
          throw new Error("Stylesheets can only be emitted to " +
                          "web targets");
        if (typeof options.data !== "string")
          throw new Error("'data' option to addStylesheet must be a string");
        resources.push({
          type: "css",
          refreshable: true,
          data: new Buffer(options.data, 'utf8'),
          servePath: path.join(inputSourceArch.pkg.serveRoot, options.path),
          sourceMap: options.sourceMap
        });
      },

      /**
       * @summary Add JavaScript code. The code added will only see the
       * namespaces imported by this package as runtime dependencies using
       * ['api.use'](#PackageAPI-use). If the file being compiled was added
       * with the bare flag, the resulting JavaScript won't be wrapped in a
       * closure.
       * @param {Object} options
       * @param {String} options.path The path at which the JavaScript file
       * should be inserted, may not be honored in case of path conflicts.
       * @param {String} options.data The code to be added.
       * @param {String} options.sourcePath The path that will be used in
       * any error messages generated by this file, e.g. `foo.js:4:1: error`.
       * @memberOf CompileStep
       * @instance
       */
      addJavaScript: function (options) {
        if (typeof options.data !== "string")
          throw new Error("'data' option to addJavaScript must be a string");
        if (typeof options.sourcePath !== "string")
          throw new Error("'sourcePath' option must be supplied to addJavaScript. Consider passing inputPath.");
        if (options.bare && ! archinfo.matches(inputSourceArch.arch, "web"))
          throw new Error("'bare' option may only be used for web targets");

        // By default, use fileOptions for the `bare` option but also allow
        // overriding it with the options
        var bare = fileOptions.bare;
        if (options.hasOwnProperty("bare")) {
          bare = options.bare;
        }

        js.push({
          source: options.data,
          sourcePath: options.sourcePath,
          servePath: path.join(inputSourceArch.pkg.serveRoot, options.path),
          bare: !! bare,
          sourceMap: options.sourceMap
        });
      },

      /**
       * @summary Add a file to serve as-is to the browser or to include on
       * the browser, depending on the target. On the web, it will be served
       * at the exact path requested. For server targets, it can be retrieved
       * using `Assets.getText` or `Assets.getBinary`.
       * @param {Object} options
       * @param {String} path The path at which to serve the asset.
       * @param {Buffer|String} data The data that should be placed in
       * the file.
       * @memberOf CompileStep
       * @instance
       */
      addAsset: function (options) {
        if (! (options.data instanceof Buffer)) {
          if (_.isString(options.data)) {
            options.data = new Buffer(options.data);
          } else {
            throw new Error("'data' option to addAsset must be a Buffer or String.");
          }
        }

        addAsset(options.data, options.path);
      },

      /**
       * @summary Display a build error.
       * @param  {Object} options
       * @param {String} message The error message to display.
       * @param {String} [sourcePath] The path to display in the error message.
       * @param {Integer} line The line number to display in the error message.
       * @param {String} func The function name to display in the error message.
       * @memberOf CompileStep
       * @instance
       */
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
    // Contains non-portable compiled npm modules, so set arch correctly
    arch = archinfo.host();
  }
  if (! archinfo.matches(arch, "os")) {
    // npm modules only work on server architectures
    nodeModulesPath = undefined;
  }

  // *** Output unibuild object
  isopk.addUnibuild({
    name: inputSourceArch.archName,
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
    sources: sources,
    pluginProviderPackageNames: pluginProviderPackageNames
  };
};

// Unlike getTransitiveClosureOfPackages, this one actually expects the packages
// that we iterate over to be built.
exports.eachUsedUnibuild = function (
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
