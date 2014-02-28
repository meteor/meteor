var path = require('path');
var os = require('os');
var _ = require('underscore');
var files = require('./files.js');
var watch = require('./watch.js');
var bundler = require('./bundler.js');
var Builder = require('./builder.js');
var project = require('./project.js');
var buildmessage = require('./buildmessage.js');
var meteorNpm = require('./meteor-npm.js');
var archinfo = require(path.join(__dirname, 'archinfo.js'));
var linker = require(path.join(__dirname, 'linker.js'));
var unipackage = require('./unipackage.js');
var fs = require('fs');
var sourcemap = require('source-map');

// Whenever you change anything about the code that generates unipackages, bump
// this version number. The idea is that the "format" field of the unipackage
// JSON file only changes when the actual specified structure of the
// unipackage/slice changes, but this version (which is build-tool-specific) can
// change when the the contents (not structure) of the built output changes. So
// eg, if we improve the linker's static analysis, this should be bumped.
//
// You should also update this whenever you update any of the packages used
// directly by the unipackage creation process (eg js-analyze) since they do not
// end up as watched dependencies. (At least for now, packages only used in
// target creation (eg minifiers and dev-bundle-fetcher) don't require you to
// update BUILT_BY, though you will need to quit and rerun "meteor run".)
exports.BUILT_BY = 'meteor/10';

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
var quotemeta = function (str) {
    return String(str).replace(/(\W)/g, '\\$1');
};

var rejectBadPath = function (p) {
  if (p.match(/\.\./))
    throw new Error("bad path: " + p);
};

var parseSpec = function (spec) {
  var parts = spec.split(':');
  if (parts.length > 2 || parts.length === 0)
    throw new Error("Bad package spec: " + spec);
  var ret = {package: parts[0]};
  if (parts.length === 2)
    ret.slice = parts[1];
  return ret;
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
// Slice
///////////////////////////////////////////////////////////////////////////////

// Options:
// - name [required]
// - arch [required]
// - uses
// - implies
// - getSourcesFunc
// - exports
// - watchSet
// - nodeModulesPath
//
// Do not include the source files in watchSet. They will be
// added at compile time when the sources are actually read.
var Slice = function (pkg, options) {
  var self = this;
  options = options || {};
  self.pkg = pkg;

  // Name for this slice. For example, the "client" in "ddp.client"
  // (which, NB, we might load on server arches).
  self.sliceName = options.name;

  // The architecture (fully or partially qualified) that can use this
  // slice.
  self.arch = options.arch;

  // Unique ID for this slice. Unique across all slices of all
  // packages, but constant across reloads of this slice.
  self.id = pkg.id + "." + options.name + "@" + self.arch;

  // Packages used. The ordering is significant only for determining
  // import symbol priority (it doesn't affect load order), and a
  // given package could appear more than once in the list, so code
  // that consumes this value will need to guard appropriately. Each
  // element in the array has keys:
  // - package: the package name
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
  // In most places, you want to use slice.eachUsedSlice() instead of
  // slice.uses, which also takes into account implied packages.
  self.uses = options.uses;

  // Packages which are "implied" by using this package. If a slice X uses this
  // slice Y, and Y implies Z, then X will effectively use Z as well (and get
  // its imports and plugins).  An array of objects of the same type as the
  // elements of self.uses (although for now unordered and weak are not
  // allowed).
  self.implies = options.implies || [];

  // A function that returns the source files for this slice. Array of objects
  // with keys "relPath" and "fileOptions". Null if loaded from unipackage.
  //
  // fileOptions is optional and represents arbitrary options passed to
  // "api.add_files"; they are made available on to the plugin as
  // compileStep.fileOptions.
  //
  // This is a function rather than a literal array because for an
  // app, we need to know the file extensions registered by the
  // plugins in order to compute the sources list, so we have to wait
  // until build time (after we have loaded any plugins, including
  // local plugins in this package) to compute this.
  self.getSourcesFunc = options.getSourcesFunc || null;

  // True if this slice is not permitted to have any exports, and in fact should
  // not even define `Package.name` (ie, test slices).
  self.noExports = options.noExports || false;

  // Symbols that this slice should export. List of symbols (as strings). Null
  // on built packages (see packageVariables instead), or in packages where
  // noExports is set.
  self.declaredExports = options.declaredExports || null;

  // Files and directories that we want to monitor for changes in
  // development mode, such as source files and package.js, as a watch.WatchSet.
  self.watchSet = options.watchSet || new watch.WatchSet();

  // Has this slice been compiled?
  self.isBuilt = false;

  // Prelink output.
  //
  // 'prelinkFiles' is the partially linked JavaScript code (an
  // array of objects with keys 'source' and 'servePath', both strings -- see
  // prelink() in linker.js)
  //
  // 'packageVariables' are are variables that are syntactically globals in our
  // input files and which we capture with a package-scope closure. A list of
  // objects with keys 'name' (required) and 'export' (true, 'tests', or falsy).
  //
  // Both of these are saved into slices on disk, and are inputs into the final
  // link phase, which inserts the final JavaScript resources into
  // 'resources'. Set only when isBuilt is true.
  self.prelinkFiles = null;
  self.packageVariables = null;

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
  //
  // Set only when isBuilt is true.
  self.resources = null;

  // Absolute path to the node_modules directory to use at runtime to
  // resolve Npm.require() calls in this slice. null if this slice
  // does not have a node_modules.
  self.nodeModulesPath = options.nodeModulesPath;
};

_.extend(Slice.prototype, {
  // Move the slice to the 'built' state. Process all source files
  // through the appropriate handlers and run the prelink phase on any
  // resulting JavaScript. Also add all provided source files to the
  // package dependencies. Sets fields such as dependencies, exports,
  // prelinkFiles, packageVariables, and resources.
  build: function () {
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
        var pkg = self.pkg.library.get(u.package, /* throwOnError */ false);
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
    };

    _.each(self.getSourcesFunc(), function (source) {
      var relPath = source.relPath;
      var fileOptions = _.clone(source.fileOptions) || {};
      var absPath = path.resolve(self.pkg.sourceRoot, relPath);
      var filename = path.basename(relPath);
      var handler = !fileOptions.isAsset && self._getSourceHandler(filename);
      var file = watch.readAndWatchFileWithHash(self.watchSet, absPath);
      var contents = file.contents;

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
        library: self.pkg.library,
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
    _.each(self._activePluginPackages(), function (otherPkg) {
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
  },

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
  getResources: function (bundleArch) {
    var self = this;
    var library = self.pkg.library;

    if (! self.isBuilt)
      throw new Error("getting resources of unbuilt slice?" + self.pkg.name + " " + self.sliceName + " " + self.arch);

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
    self.eachUsedSlice(
      bundleArch, {skipWeak: true, skipUnordered: true}, function (otherSlice) {
        if (! otherSlice.isBuilt)
          throw new Error("dependency wasn't built?");
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
  },

  // Calls `callback` with each slice (of architecture matching `arch`) that is
  // "used" by this slice. This includes directly used slices, and slices that
  // are transitively "implied" by used slices. (But not slices that are used by
  // slices that we use!)  Options are skipWeak and skipUnordered, meaning to
  // ignore direct "uses" that are weak or unordered.
  eachUsedSlice: function (arch, options, callback) {
    var self = this;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    var processedSliceId = {};
    var usesToProcess = [];
    _.each(self.uses, function (use) {
      if (options.skipUnordered && use.unordered)
        return;
      if (options.skipWeak && use.weak)
        return;
      usesToProcess.push(use);
    });

    while (!_.isEmpty(usesToProcess)) {
      var use = usesToProcess.shift();

      var slices =
            self.pkg.library.getSlices(_.pick(use, 'package', 'spec'), arch);
      _.each(slices, function (slice) {
        if (_.has(processedSliceId, slice.id))
          return;
        processedSliceId[slice.id] = true;
        callback(slice, {
          unordered: !!use.unordered,
          weak: !!use.weak
        });

        _.each(slice.implies, function (implied) {
          usesToProcess.push(implied);
        });
      });
    }
  },

  // Return an array of all plugins that are active in this slice, as
  // a list of Packages.
  _activePluginPackages: function () {
    var self = this;

    // XXX we used to include our own extensions only if we were the
    // "use" role. now we include them everywhere because we don't
    // have a special "use" role anymore. it's not totally clear to me
    // what the correct behavior should be -- we need to resolve
    // whether we think about extensions as being global to a package
    // or particular to a slice.
    // (there's also some weirdness here with handling implies, because
    // the implies field is on the target slice, but we really only care
    // about packages.)
    var ret = [self.pkg];

    // We don't use plugins from weak dependencies, because the ability to
    // compile a certain type of file shouldn't depend on whether or not some
    // unrelated package in the target has a dependency.
    //
    // We pass archinfo.host here, not self.arch, because it may be more
    // specific, and because plugins always have to run on the host
    // architecture.
    self.eachUsedSlice(archinfo.host(), {skipWeak: true}, function (usedSlice) {
      ret.push(usedSlice.pkg);
    });

    // Only need one copy of each package.
    ret = _.uniq(ret);

    _.each(ret, function (pkg) {
      pkg._ensurePluginsInitialized();
    });

    return ret;
  },

  // Get all extensions handlers registered in this slice, as a map
  // from extension (no leading dot) to handler function. Throws an
  // exception if two packages are registered for the same extension.
  _allHandlers: function () {
    var self = this;
    var ret = {};

    // We provide a hardcoded handler for *.js files.. since plugins
    // are written in JavaScript we have to start somewhere.
    _.extend(ret, {
      js: function (compileStep) {
        compileStep.addJavaScript({
          data: compileStep.read().toString('utf8'),
          path: compileStep.inputPath,
          sourcePath: compileStep.inputPath,
          // XXX eventually get rid of backward-compatibility "raw" name
          // XXX COMPAT WITH 0.6.4
          bare: compileStep.fileOptions.bare || compileStep.fileOptions.raw
        });
      }
    });

    _.each(self._activePluginPackages(), function (otherPkg) {
      _.each(otherPkg.sourceHandlers, function (handler, ext) {
        if (ext in ret && ret[ext] !== handler) {
          buildmessage.error(
            "conflict: two packages included in " +
              (self.pkg.name || "the app") + ", " +
              (ret[ext].pkg.name || "the app") + " and " +
              (otherPkg.name || "the app") + ", " +
              "are both trying to handle ." + ext);
          // Recover by just going with the first handler we saw
        } else {
          ret[ext] = handler;
        }
      });
    });

    return ret;
  },

  // Return a list of all of the extension that indicate source files
  // for this slice, not including leading dots. Computed based on
  // this.uses, so should only be called once that has been set.
  registeredExtensions: function () {
    var self = this;
    return _.keys(self._allHandlers());
  },

  // Find the function that should be used to handle a source file for
  // this slice, or return null if there isn't one. We'll use handlers
  // that are defined in this package and in its immediate dependencies.
  _getSourceHandler: function (filename) {
    var self = this;
    var handlers = self._allHandlers();
    var parts = filename.split('.');
    for (var i = 0; i < parts.length; i++) {
      var extension = parts.slice(i).join('.');
      if (_.has(handlers, extension))
        return handlers[extension];
    }
    return null;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Packages
///////////////////////////////////////////////////////////////////////////////

// XXX This object conflates two things that now seem to be almost
// totally separate: source code for a package, and an actual built
// package that is ready to be used. In fact it contains a list of
// Slice objects about which the same thing can be said. To see the
// distinction, ask yourself, what fields are set when the package is
// initialized via initFromUnipackage?
//
// Package and Slice should each be split into two objects, eg
// PackageSource and SliceSource versus BuiltPackage and BuiltSlice
// (find better names, though).

var nextPackageId = 1;
var Package = function (library, packageDirectoryForBuildInfo) {
  var self = this;

  // A unique ID (guaranteed to not be reused in this process -- if
  // the package is reloaded, it will get a different id the second
  // time)
  self.id = nextPackageId++;

  // The name of the package, or null for an app pseudo-package or
  // collection. The package's exports will reside in Package.<name>.
  // When it is null it is linked like an application instead of like
  // a package.
  self.name = null;

  // The path relative to which all source file paths are interpreted
  // in this package. Also used to compute the location of the
  // package's .npm directory (npm shrinkwrap state). null if loaded
  // from unipackage.
  self.sourceRoot = null;

  // Path that will be prepended to the URLs of all resources emitted
  // by this package (assuming they don't end up getting
  // concatenated). For non-browser targets, the only effect this will
  // have is to change the actual on-disk paths of the files in the
  // bundle, for those that care to open up the bundle and look (but
  // it's still nice to get it right). null if loaded from unipackage.
  self.serveRoot = null;

  // The package's directory. This is used only by other packages that use this
  // package in their buildinfo.json (to detect that they need to be rebuilt if
  // the library's resolution of the package name changes); it is not used to
  // read files or anything else. Notably, it should be the same if a package is
  // read from a source tree or read from the .build unipackage inside that
  // source tree.
  self.packageDirectoryForBuildInfo = packageDirectoryForBuildInfo;

  // Package library that should be used to resolve this package's
  // dependencies
  self.library = library;

  // Package metadata. Keys are 'summary' and 'internal'.
  self.metadata = {};

  // Available editions/subpackages ("slices") of this package. Array
  // of Slice.
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

  // Plugins in this package. Map from plugin name to JsImage. Present only when
  // pluginsBuilt is true.
  self.plugins = {};

  // A WatchSet for the full transitive dependencies for all plugins in this
  // package, as well as this package's package.js. If any of these dependencies
  // change, our plugins need to be rebuilt... but also, any package that
  // directly uses this package needs to be rebuilt in case the change to
  // plugins affected compilation.
  //
  // Complete only when pluginsBuilt is true.
  self.pluginWatchSet = new watch.WatchSet();

  // Map from package name to packageDirectoryForBuildInfo of packages that are
  // directly used by this package. We use this to figure out that we need to
  // rebuild if the resolution of the package changes (eg, an app package is
  // added that overshadows a warehouse package, or the release changes).
  self.pluginProviderPackageDirs = {};

  // True if plugins have been initialized (if _ensurePluginsInitialized has
  // been called)
  self._pluginsInitialized = false;

  // Source file handlers registered by plugins. Map from extension
  // (without a dot) to a handler function that takes a
  // CompileStep. Valid only when _pluginsInitialized is true.
  self.sourceHandlers = null;

  // Is this package in a built state? If not (if you created it by
  // means that doesn't create it in a build state to start with) you
  // will need to call build() before you can use it. We break down
  // the two phases of the build process, plugin building and
  // slice building, into two flags.
  self.pluginsBuilt = false;
  self.slicesBuilt = false;
};

_.extend(Package.prototype, {
  // Make a dummy (empty) package that contains nothing of interest.
  initEmpty: function (name) {
    var self = this;
    self.name = name;
    self.defaultSlices = {'': []};
    self.testSlices = {'': []};
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

  // This is called on all packages at Meteor install time so they can
  // do any prep work necessary for the user's first Meteor run to be
  // fast, for example fetching npm dependencies. Currently thanks to
  // refactorings there's nothing to do here.
  // XXX remove?
  preheat: function () {
  },

  // If this package has plugins, initialize them (run the startup
  // code in them so that they register their extensions). Idempotent.
  _ensurePluginsInitialized: function () {
    var self = this;

    if (! self.pluginsBuilt)
      throw new Error("running plugins of unbuilt package?");

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
    _.each(self.plugins, function (plugin, name) {
      buildmessage.enterJob({
        title: "loading plugin `" + name +
          "` from package `" + self.name + "`"
        // don't necessarily have rootPath anymore
        // (XXX we do, if the unipackage was locally built, which is
        // the important case for debugging. it'd be nice to get this
        // case right.)
      }, function () {
        plugin.load({Plugin: Plugin});
      });
    });

    self._pluginsInitialized = true;
  },

  // Move a package to the built state (by running its source files
  // through the appropriate compiler plugins). Once build has
  // completed, any errors detected in the package will have been
  // emitted to buildmessage.
  //
  // build() may retrieve the package's dependencies from the library,
  // so it is illegal to call build() from library.get() (until the
  // package has actually been put in the loaded package list).
  build: function () {
    var self = this;

    if (self.pluginsBuilt || self.slicesBuilt)
      throw new Error("package already built?");

    // Build plugins
    _.each(self.pluginInfo, function (info) {
      buildmessage.enterJob({
        title: "building plugin `" + info.name +
          "` in package `" + self.name + "`",
        rootPath: self.sourceRoot
      }, function () {
        var buildResult = bundler.buildJsImage({
          name: info.name,
          library: self.library,
          use: info.use,
          sourceRoot: self.sourceRoot,
          sources: info.sources,
          npmDependencies: info.npmDependencies,
          // Plugins have their own npm dependencies separate from the
          // rest of the package, so they need their own separate npm
          // shrinkwrap and cache state.
          npmDir: path.resolve(path.join(self.sourceRoot, '.npm', 'plugin',
                                         info.name))
        });

        // Add this plugin's dependencies to our "plugin dependency" WatchSet.
        self.pluginWatchSet.merge(buildResult.watchSet);

        // Remember the library resolution of all packages used by the plugin.
        // XXX assumes that this merges cleanly
        _.extend(self.pluginProviderPackageDirs,
                 buildResult.pluginProviderPackageDirs);

        // Register the built plugin's code.
        self.plugins[info.name] = buildResult.image;
      });
    });
    self.pluginsBuilt = true;

    // Build slices. Might use our plugins, so needs to happen
    // second.
    _.each(self.slices, function (slice) {
      slice.build();
    });
    self.slicesBuilt = true;
  },

  // Programmatically initialized a package from scratch. For now,
  // cannot create browser packages. This function does not retrieve
  // the package's dependencies from the library, and on return,
  // the package will be in an unbuilt state.
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
      // may be a .npm directoryon disk to delete.
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
    var slice = new Slice(self, {
      name: options.sliceName,
      arch: arch,
      uses: _.map(options.use, parseSpec),
      getSourcesFunc: function () { return sources; },
      nodeModulesPath: nodeModulesPath
    });
    self.slices.push(slice);

    self.defaultSlices = {'os': [options.sliceName]};
  },

  // Initialize a package from a legacy-style (package.js) package
  // directory. This function does not retrieve the package's
  // dependencies from the library, and on return, the package will be
  // in an unbuilt state.
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
      // There used to be a third option documented here,
      // 'environments', but it was never implemented and no package
      // ever used it.
      describe: function (options) {
        _.extend(self.metadata, options);
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

        self.slices.push(new Slice(self, {
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

  // Initialize a package from a legacy-style application directory
  // (has .meteor/packages).  This function does not retrieve the
  // package's dependencies from the library, and on return, the
  // package will be in an unbuilt state.
  initFromAppDir: function (appDir, ignoreFiles) {
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
      var slice = new Slice(self, {
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
      slice.getSourcesFunc = function () {
        var sourceInclude = _.map(slice.registeredExtensions(), function (ext) {
          return new RegExp('\\.' + quotemeta(ext) + '$');
        });
        var sourceExclude = [/^\./].concat(ignoreFiles);

        // Wrapper around watch.readAndWatchDirectory which takes in and returns
        // sourceRoot-relative directories.
        var readAndWatchDirectory = function (relDir, filters) {
          filters = filters || {};
          var absPath = path.join(self.sourceRoot, relDir);
          var contents = watch.readAndWatchDirectory(slice.watchSet, {
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

    self.defaultSlices = { browser: ['client'], 'os': ['server'] };
  },

  // Initialize a package from a prebuilt Unipackage on disk. On
  // return, the package will be a built state. This function does not
  // retrieve the package's dependencies from the library (it is not
  // necessary).
  //
  // options:
  // - onlyIfUpToDate: if true, then first check the unipackage's
  //   dependencies (if present) to see if it's up to date. If not,
  //   return false without loading the package. Otherwise return
  //   true. (If onlyIfUpToDate is not passed, always return true.)
  // - buildOfPath: If present, the source directory (as an absolute
  //   path on local disk) of which we think this unipackage is a
  //   build. If it's not (it was copied from somewhere else), we
  //   consider it not up to date (in the sense of onlyIfUpToDate) so
  //   that we can rebuild it and correct the absolute paths in the
  //   dependency information.
  initFromUnipackage: function (name, dir, options) {
    var self = this;
    options = options || {};

    var mainJson =
      JSON.parse(fs.readFileSync(path.join(dir, 'unipackage.json')));

    if (mainJson.format !== "unipackage-pre1")
      throw new Error("Unsupported unipackage format: " +
                      JSON.stringify(mainJson.format));

    var buildInfoPath = path.join(dir, 'buildinfo.json');
    var buildInfoJson = fs.existsSync(buildInfoPath) ?
      JSON.parse(fs.readFileSync(buildInfoPath)) : {};

    // XXX should comprehensively sanitize (eg, typecheck) everything
    // read from json files

    // Read the watch sets for each slice; keep them separate (for passing to
    // the Slice constructor below) as well as merging them into one big
    // WatchSet.
    var mergedWatchSet = new watch.WatchSet();
    var sliceWatchSets = {};
    _.each(buildInfoJson.sliceDependencies, function (watchSetJSON, sliceTag) {
      var watchSet = watch.WatchSet.fromJSON(watchSetJSON);
      mergedWatchSet.merge(watchSet);
      sliceWatchSets[sliceTag] = watchSet;
    });

    // We do NOT put this (or anything!) onto self until we've passed the
    // onlyIfUpToDate check.
    var pluginWatchSet = watch.WatchSet.fromJSON(
      buildInfoJson.pluginDependencies);
    // This might be redundant (since pluginWatchSet was probably merged into
    // each slice watchSet when it was built) but shouldn't hurt.
    mergedWatchSet.merge(pluginWatchSet);
    var pluginProviderPackageDirs = buildInfoJson.pluginProviderPackages || {};

    // If we're supposed to check the dependencies, go ahead and do so
    if (options.onlyIfUpToDate) {
      // Do we think we'll generate different contents than the tool that built
      // this package?
      if (buildInfoJson.builtBy !== exports.BUILT_BY)
        return false;

      if (options.buildOfPath &&
          (buildInfoJson.source !== options.buildOfPath)) {
        // This catches the case where you copy a source tree that had
        // a .build directory and then modify a file. Without this
        // check you won't see a rebuild (even if you stop and restart
        // meteor), at least not until you modify the *original*
        // copies of the source files, because that is still where all
        // of the dependency info points.
        return false;
      }

      if (! self.checkUpToDate(mergedWatchSet, pluginProviderPackageDirs))
        return false;
    }

    self.name = name;
    self.metadata = {
      summary: mainJson.summary,
      internal: mainJson.internal
    };
    self.defaultSlices = mainJson.defaultSlices;
    self.testSlices = mainJson.testSlices;
    self.pluginWatchSet = pluginWatchSet;
    self.pluginProviderPackageDirs = pluginProviderPackageDirs;

    _.each(mainJson.plugins, function (pluginMeta) {
      rejectBadPath(pluginMeta.path);

      var plugin = bundler.readJsImage(path.join(dir, pluginMeta.path));

      if (! archinfo.matches(archinfo.host(), plugin.arch)) {
        buildmessage.error("package `" + name + "` is built for incompatible " +
                           "architecture: " + plugin.arch);
        // Recover by ignoring plugin
        return;
      }

      // XXX should refactor so that we can have plugins of multiple
      // different arches happily coexisting in memory, to match
      // slices. If this becomes a problem before we have a chance to
      // refactor, could just ignore plugins for arches that we don't
      // support, if we are careful to not then try to write out the
      // package and expect them to be intact..
      if (pluginMeta.name in self.plugins)
        throw new Error("Implementation limitation: this program " +
                        "cannot yet handle fat plugins, sorry");
      self.plugins[pluginMeta.name] = plugin;
    });
    self.pluginsBuilt = true;

    _.each(mainJson.slices, function (sliceMeta) {
      // aggressively sanitize path (don't let it escape to parent
      // directory)
      rejectBadPath(sliceMeta.path);
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

      var slice = new Slice(self, {
        name: sliceMeta.name,
        arch: sliceMeta.arch,
        watchSet: sliceWatchSets[sliceMeta.path],
        nodeModulesPath: nodeModulesPath,
        uses: sliceJson.uses,
        implies: sliceJson.implies
      });

      slice.isBuilt = true;
      slice.noExports = !!sliceJson.noExports;
      slice.packageVariables = sliceJson.packageVariables || [];
      slice.prelinkFiles = [];
      slice.resources = [];

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
          slice.prelinkFiles.push(prelinkFile);
        } else if (_.contains(["head", "body", "css", "js", "asset"],
                              resource.type)) {
          slice.resources.push({
            type: resource.type,
            data: data,
            servePath: resource.servePath || undefined,
            path: resource.path || undefined
          });
        } else
          throw new Error("bad resource type in unipackage: " +
                          JSON.stringify(resource.type));
      });

      self.slices.push(slice);
    });
    self.slicesBuilt = true;

    return true;
  },

  // Try to check if this package is up-to-date (that is, whether its source
  // files have been modified). True if we have dependency info and it says that
  // the package is up-to-date. False if a source file has changed.
  //
  // The arguments _watchSet and _pluginProviderPackageDirs are used when
  // reading from disk when there are no slices yet; don't pass them from
  // outside this file.
  checkUpToDate: function (_watchSet, _pluginProviderPackageDirs) {
    var self = this;

    if (!_watchSet) {
      // This call was on an already-fully-loaded Package and we just want to
      // see if it's changed. So we have some watchSets inside ourselves.
      _watchSet = new watch.WatchSet();
      _watchSet.merge(self.pluginWatchSet);
      _.each(self.slices, function (slice) {
        _watchSet.merge(slice.watchSet);
      });
    }
    if (!_pluginProviderPackageDirs) {
      _pluginProviderPackageDirs = self.pluginProviderPackageDirs;
    }

    // Are all of the packages we directly use (which can provide plugins which
    // affect compilation) resolving to the same directory? (eg, have we updated
    // our release version to something with a new version of a package?)
    var packageResolutionsSame = _.all(
      _pluginProviderPackageDirs, function (packageDir, name) {
        return self.library.findPackageDirectory(name) === packageDir;
      });
    if (!packageResolutionsSame)
      return false;

    return watch.isUpToDate(_watchSet);
  },

  // True if this package can be saved as a unipackage
  canBeSavedAsUnipackage: function () {
    var self = this;
    return true;
  },

  // options:
  //
  // - buildOfPath: Optional. The absolute path on local disk of the
  //   directory that was built to produce this package. Used as part
  //   of the dependency info to detect builds that were moved and
  //   then modified.
  saveAsUnipackage: function (outputPath, options) {
    var self = this;

    if (!self.pluginsBuilt || !self.slicesBuilt)
      throw new Error("Unbuilt packages cannot be saved");

    if (! self.canBeSavedAsUnipackage())
      throw new Error("This package can not yet be saved as a unipackage");

    var builder = new Builder({ outputPath: outputPath });

    try {

      var mainJson = {
        format: "unipackage-pre1",
        summary: self.metadata.summary,
        internal: self.metadata.internal,
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
        builtBy: exports.BUILT_BY,
        sliceDependencies: { },
        pluginDependencies: self.pluginWatchSet.toJSON(),
        pluginProviderPackages: self.pluginProviderPackageDirs,
        source: options.buildOfPath || undefined
      };

      builder.reserve("unipackage.json");
      builder.reserve("buildinfo.json");
      // These is where we put the NPM dependencies of the slices (but not of
      // plugins). The node_modules directory is nested inside "npm" so that it
      // is not visible from within plugins.
      builder.reserve("npm/node_modules", { directory: true });
      builder.reserve("head");
      builder.reserve("body");

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
        if (! slice.isBuilt)
          throw new Error("saving unbuilt slice?");

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

        // Construct slice metadata
        var sliceJson = {
          format: "unipackage-slice-pre1",
          noExports: slice.noExports || undefined,
          packageVariables: slice.packageVariables,
          uses: _.map(slice.uses, function (u) {
            return {
              'package': u.package,
              slice: u.slice || undefined,
              // For cosmetic value, leave false values for these options out of
              // the JSON file.
              unordered: u.unordered || undefined,
              weak: u.weak || undefined
            };
          }),
          implies: (_.isEmpty(slice.implies) ? undefined : slice.implies),
          node_modules: slice.nodeModulesPath ? 'npm/node_modules' : undefined,
          resources: []
        };

        // Output 'head', 'body' resources nicely
        var concat = {head: [], body: []};
        var offset = {head: 0, body: 0};
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
        if (slice.nodeModulesPath) {
          builder.copyDirectory({
            from: slice.nodeModulesPath,
            to: 'npm/node_modules'
          });
        }

        // Control file for slice
        builder.writeJson(sliceJsonFile, sliceJson);
      });

      // Plugins
      _.each(self.plugins, function (plugin, name) {
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

      builder.writeJson("unipackage.json", mainJson);
      builder.writeJson("buildinfo.json", buildInfoJson);
      builder.complete();
    } catch (e) {
      builder.abort();
      throw e;
    }
  }
});

var packages = exports;
_.extend(exports, {
  Package: Package,
  parseSpec: parseSpec
});
