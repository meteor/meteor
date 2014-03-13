
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
//
var UnipackageSlice = function (unipackage, options) {
  var self = this;
  options = options || {};
  self.pkg = unipackage;

  // These have the same meaning as they do in SourceSlice.
  self.sliceName = options.name;
  self.arch = options.arch;
  self.id = pkg.id + "." + options.name + "@" + self.arch;
  self.uses = options.uses;
  self.implies = options.implies || [];
  self.noExports = options.noExports;
  self.watchSet = options.watchSet || new watch.WatchSet();
  self.nodeModulesPath = options.nodeModulesPath;

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
      bundleArch, packageLoader,
      {skipWeak: true, skipUnordered: true}, function (otherSlice) {
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
  //
  // packageLoader is the PackageLoader that should be used to resolve
  // the package's bundle-time dependencies.
  eachUsedSlice: function (arch, packageLoader, options, callback) {
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
            packageLoader.getSlices(_.pick(use, 'package', 'spec'),
                                    arch);
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
  _activePluginPackages: function (packageLoader) {
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
    self.eachUsedSlice(
      archinfo.host(), packageLoader, {skipWeak: true},
      function (usedSlice) {
        ret.push(usedSlice.pkg);
      }
    );

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
  _allHandlers: function (packageLoader) {
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

    _.each(self._activePluginPackages(packageLoader), function (otherPkg) {
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
  _registeredExtensions: function (packageLoader) {
    var self = this;
    return _.keys(self._allHandlers(packageLoader));
  },

  // Find the function that should be used to handle a source file for
  // this slice, or return null if there isn't one. We'll use handlers
  // that are defined in this package and in its immediate dependencies.
  _getSourceHandler: function (filename, packageLoader) {
    var self = this;
    var handlers = self._allHandlers(packageLoader);
    var parts = filename.split('.');
    for (var i = 0; i < parts.length; i++) {
      var extension = parts.slice(i).join('.');
      if (_.has(handlers, extension))
        return handlers[extension];
    }
    return null;
  }
});
