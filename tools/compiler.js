// Process all source files through the appropriate handlers and run the
// prelink phase on any resulting JavaScript. Also add all provided source
// files to the package dependencies. Sets fields such as dependencies,
// exports, prelinkFiles, packageVariables, and resources.
//
// packageLoader is the PackageLoader to use to validate that the
// slice's dependencies actually exist (for cleaner error
// messages).
compileSlice = function (packageLoader) {
  var self = this;
  var isApp = ! self.pkg.name;

  if (self.isBuilt)
    throw new Error("slice built twice?");
  var resources = [];
  var js = [];

    // Preemptively check to make sure that each of the packages we
  // reference actually exist. If we find a package that doesn't
  // exist, emit an error and remove it from the package list. That
  // way we get one error about it instead of a new error at each
  // stage in the build process in which we try to retrieve the
  // package.
  _.each(['uses', 'implies'], function (field) {
      var scrubbed = [];
      _.each(self[field], function (u) {
          var pkg = packageLoader.getPackage(u.package,
                                             { throwOnError: false });
          if (! pkg) {
              buildmessage.error("no such package: '" + u.package + "'");
              // recover by omitting this package from the field
          } else
              scrubbed.push(u);
      });
      self[field] = scrubbed;
  });

  var addAsset = function (contents, relPath, hash) {
      // XXX hack
      if (!self.pkg.name)
          relPath = relPath.replace(/^(private|public)\//, '');

      resources.push({
          type: "asset",
          data: contents,
          path: relPath,
          servePath: path.join(self.pkg.serveRoot, relPath),
          hash: hash
      });

      self.pkg.sources.push(relPath);
  };

  _.each(self.getSourcesFunc(), function (source) {
      var relPath = source.relPath;
      var fileOptions = _.clone(source.fileOptions) || {};
      var absPath = path.resolve(self.pkg.sourceRoot, relPath);
      var filename = path.basename(relPath);
      var handler = !fileOptions.isAsset &&
              self._getSourceHandler(filename, packageLoader);
      var file = watch.readAndWatchFileWithHash(self.watchSet, absPath);
      var contents = file.contents;

      self.pkg.sources.push(relPath);

      if (contents === null) {
          buildmessage.error("File not found: " + source.relPath);
          // recover by ignoring
          return;
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
      // - declaredExports: An array of symbols exported by this slice, or null
      //   if it may not export any symbols (eg, test slices). This is used by
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
      // (in the end, an arch-specific slice will be emitted only if
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
              self.pkg.name
                  ? self.pkg.name + "/" + relPath
                  : path.basename(relPath)),
          // null if this is an app. intended to be used for the sources
          // dictionary for source maps.
          packageName: self.pkg.name,
          rootOutputPath: self.pkg.serveRoot,
          arch: self.arch,
          archMatches: function (pattern) {
              return archinfo.matches(self.arch, pattern);
          },
          fileOptions: fileOptions,
          declaredExports: _.pluck(self.declaredExports, 'name'),
          read: function (n) {
              if (n === undefined || readOffset + n > contents.length)
                  n = contents.length - readOffset;
              var ret = contents.slice(readOffset, readOffset + n);
              readOffset += n;
              return ret;
          },
          appendDocument: function (options) {
              if (! archinfo.matches(self.arch, "browser"))
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
              if (! archinfo.matches(self.arch, "browser"))
                  throw new Error("Stylesheets can only be emitted to " +
                                  "browser targets");
              if (typeof options.data !== "string")
                  throw new Error("'data' option to addStylesheet must be a string");
              resources.push({
                  type: "css",
                  data: new Buffer(options.data, 'utf8'),
                  servePath: path.join(self.pkg.serveRoot, options.path),
                  sourceMap: options.sourceMap
              });
          },
          addJavaScript: function (options) {
              if (typeof options.data !== "string")
                  throw new Error("'data' option to addJavaScript must be a string");
              if (typeof options.sourcePath !== "string")
                  throw new Error("'sourcePath' option must be supplied to addJavaScript. Consider passing inputPath.");
              if (options.bare && ! archinfo.matches(self.arch, "browser"))
                  throw new Error("'bare' option may only be used for browser targets");
              js.push({
                  source: options.data,
                  sourcePath: options.sourcePath,
                  servePath: path.join(self.pkg.serveRoot, options.path),
                  bare: !!options.bare,
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

  // Phase 1 link

  // Load jsAnalyze from the js-analyze package... unless we are the
  // js-analyze package, in which case never mind. (The js-analyze package's
  // default slice is not allowed to depend on anything!)
  var jsAnalyze = null;
  if (! _.isEmpty(js) && self.pkg.name !== "js-analyze") {
      jsAnalyze = unipackage.load({
          packages: ["js-analyze"]
      })["js-analyze"].JSAnalyze;
  }

  var results = linker.prelink({
      inputFiles: js,
      useGlobalNamespace: isApp,
      combinedServePath: isApp ? null :
          "/packages/" + self.pkg.name +
          (self.sliceName === "main" ? "" : (":" + self.sliceName)) + ".js",
      name: self.pkg.name || null,
      declaredExports: _.pluck(self.declaredExports, 'name'),
      jsAnalyze: jsAnalyze
  });

  // Add dependencies on the source code to any plugins that we could have
  // used. We need to depend even on plugins that we didn't use, because if
  // they were changed they might become relevant to us. This means that we
  // end up depending on every source file contributing to all plugins in the
  // packages we use (including source files from other packages that the
  // plugin program itself uses), as well as the package.js file from every
  // package we directly use (since changing the package.js may add or remove
  // a plugin).
  _.each(self._activePluginPackages(packageLoader), function (otherPkg) {
      self.watchSet.merge(otherPkg.pluginWatchSet);
      // XXX this assumes this is not overwriting something different
      self.pkg.pluginProviderPackageDirs[otherPkg.name] =
          otherPkg.packageDirectoryForBuildInfo;
  });

  self.prelinkFiles = results.files;

  self.packageVariables = [];
  var packageVariableNames = {};
  _.each(self.declaredExports, function (symbol) {
      if (_.has(packageVariableNames, symbol.name))
          return;
      self.packageVariables.push({
          name: symbol.name,
          export: symbol.testOnly? "tests" : true
      });
      packageVariableNames[symbol.name] = true;
  });
  _.each(results.assignedVariables, function (name) {
      if (_.has(packageVariableNames, name))
          return;
      self.packageVariables.push({
          name: name
      });
      packageVariableNames[name] = true;
  });
  // Forget about the *declared* exports; what matters is packageVariables
  // now.
  self.declaredExports = null;

  self.resources = resources;
  self.isBuilt = true;
};
