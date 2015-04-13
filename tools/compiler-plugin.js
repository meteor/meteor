var archinfo = require('./archinfo.js');
var colonConverter = require('./colon-converter.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var linker = require('./linker.js');
var _ = require('underscore');

// XXX BBP How bad is it that this CompilerPlugin is unrelated to compiler.js?
// Probably just rename compiler.js, which isn't user-exposed.

exports.CompilerPlugin = function (options, factoryFunction) {
  var self = this;
  self.id = options.id;
  self.extensions = options.extensions.slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = factoryFunction;
};
_.extend(exports.CompilerPlugin.prototype, {
  instantiateCompiler: function () {
    var self = this;
    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    var userCompiler = self.factoryFunction();
    return new Compiler(self, userCompiler);
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  }
});

var Compiler = function (compilerPlugin, userCompiler) {
  var self = this;
  // The actual object returned from the user-supplied factory.
  self.userCompiler = userCompiler;
  self.compilerPlugin = compilerPlugin;
};
_.extend(Compiler.prototype, {
  // XXX BBP full docs
  run: function (resourceSlots) {
    var self = this;

    var inputFiles = _.map(resourceSlots, function (resourceSlot) {
      return new InputFile(resourceSlot);
    });

    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    self.userCompiler.processFilesForTarget(inputFiles);
  }
});

// This is the object presented to the user's plugin code.
// XXX BBP actually design its API
// XXX BBP decide if the API always presents / to the code (it probably
// should because you're not supposed to do your own IO anyway)
var InputFile = function (resourceSlot) {
  var self = this;
  // We use underscored attributes here because this is user-visible code and we
  // don't want users to be accessing anything that we don't document.
  self._resourceSlot = resourceSlot;
};
_.extend(InputFile.prototype, {
  // XXX BBP we should have a better API
  xxxContentsAsBuffer: function () {
    var self = this;
    return self._resourceSlot.inputResource.data;
  },
  xxxPathInPackage: function () {
    var self = this;
    return self._resourceSlot.inputResource.path;
  },
  xxxBasename: function () {
    var self = this;
    return files.pathBasename(self.xxxPathInPackage());
  },
  xxxDirname: function () {
    var self = this;
    return files.pathDirname(self.xxxPathInPackage());
  },
  // XXX is this null for app?
  xxxPackageName: function () {
    var self = this;
    return self._resourceSlot.packageSourceBatch.unibuild.pkg.name;
  },
  addStylesheet: function (options) {
    var self = this;
    // XXX BBP validate input!!
    self._resourceSlot.addStylesheet(options);
  }
});

// XXX BBP doc
var ResourceSlot = function (unibuildResourceInfo,
                             compilerPlugin,
                             packageSourceBatch) {
  var self = this;
  self.inputResource = unibuildResourceInfo;  // XXX BBP prototype?
  self.outputResources = [];
  self.compilerPlugin = compilerPlugin;
  self.packageSourceBatch = packageSourceBatch;

  if (self.inputResource.type === "source") {
    if (! compilerPlugin) {
      throw Error("no compiler plugin for source? " +
                  JSON.stringify(unibuildResourceInfo));
    }
  } else {
    if (compilerPlugin) {
      throw Error("compiler plugin for non-source? " +
                  JSON.stringify(unibuildResourceInfo));
    }
    // Any resource that isn't handled by compiler plugins just gets passed
    // through.
    self.outputResources.push(self.inputResource);
  }
};
_.extend(ResourceSlot.prototype, {
  // XXX BBP check args
  addStylesheet: function (options) {
    var self = this;
    if (! self.compilerPlugin)
      throw Error("addStylesheet on non-source ResourceSlot?");

    // XXX BBP this is wrong (eg totally broken for in app) and is in the wrong
    // place
    var unibuild = self.packageSourceBatch.unibuild;
    var serveRoot;
    if (unibuild.pkg.name) {
      serveRoot = files.pathJoin('/packages/', unibuild.pkg.name);
    } else {
      serveRoot = '/';
    }

    // XXX BBP prototype?
    self.outputResources.push({
      type: "css",
      refreshable: true,
      data: new Buffer(files.convertToStandardLineEndings(options.data), 'utf8'),
      servePath: colonConverter.convert(
        files.pathJoin(
          serveRoot,
          // XXX BBP should we decide in our API that everything is / ?
          files.convertToStandardPath(options.path, true)))
    });
  }
});

// XXX BBP ???
var PackageSourceBatch = function (unibuild, processor) {
  var self = this;
  self.unibuild = unibuild;
  self.processor = processor;
  var compilerPluginsByExtension = self._getCompilerPluginsByExtension();
  self.resourceSlots = _.map(unibuild.resources, function (resource) {
    var compilerPlugin = null;
    if (resource.type === "source") {
      var basename = files.pathBasename(resource.path);
      var parts = basename.split('.');
      for (var i = 1; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(compilerPluginsByExtension, extension)) {
          compilerPlugin = compilerPluginsByExtension[extension];
          break;
        }
      }
      if (! compilerPlugin) {
        // XXX BBP better error handling
        throw Error("no plugin found for " + resource.path);
      }
    }
    return new ResourceSlot(resource, compilerPlugin, self);
  });
};
_.extend(PackageSourceBatch.prototype, {
  _getCompilerPluginsByExtension: function () {
    var self = this;
    var isopack = self.unibuild.pkg;
    // Packages always get plugins from themselves.
    var activePluginPackages = [isopack];

    // We don't use plugins from weak dependencies, because the ability to build
    // a certain type of file shouldn't depend on whether or not some unrelated
    // package in the target has a dependency. And we skip unordered
    // dependencies, because it's not going to work to have circular build-time
    // dependencies.
    //
    // eachUsedUnibuild takes care of pulling in implied dependencies for us
    // (eg, templating from standard-app-packages).
    //
    // We pass archinfo.host here, not self.arch, because it may be more
    // specific, and because plugins always have to run on the host
    // architecture.
    compiler.eachUsedUnibuild({
      dependencies: self.unibuild.uses,
      arch: archinfo.host(),
      isopackCache: self.processor.isopackCache,
      skipUnordered: true
    }, function (otherUnibuild) {
      if (! _.isEmpty(otherUnibuild.pkg.plugins)) {
        activePluginPackages.push(otherUnibuild.pkg);
      }
    });

    activePluginPackages = _.uniq(activePluginPackages);

    var compilerPluginsByExtension = {};
    _.each(activePluginPackages, function (otherPkg) {
      _.each(otherPkg.compilerPlugins, function (compilerPlugin, id) {
        if (! compilerPlugin.relevantForArch(self.processor.arch)) {
          return;
        }

        _.each(compilerPlugin.extensions, function (ext) {
          if (_.has(compilerPluginsByExtension, ext)) {
            // XXX BBP use buildmessage
            throw Error("duplicate extension " + JSON.stringify({
              package: isopack.name,
              ext: ext
            }));
          }
          compilerPluginsByExtension[ext] = compilerPlugin;
        });
      });
    });

    return compilerPluginsByExtension;
  },

  getResources: function () {
    var self = this;
    var resources = Array.prototype.concat.apply(
      [],
      _.pluck(self.resourceSlots, 'outputResources'));
    return resources.concat(self._getPrelinkedJsResources());
  },

  // XXX BBP copied from Unibuild.getResources, which should get deleted
  // XXX BBP this should also support JS resources produced by compiler plugins
  _getPrelinkedJsResources: function () {
    var self = this;
    var isopackCache = self.processor.isopackCache;
    var bundleArch = self.processor.arch;

    if (! archinfo.matches(bundleArch, self.unibuild.arch))
      throw new Error(
        "unibuild of arch '" + self.unibuild.arch + "' does not support '" +
          bundleArch + "'?");

    // Compute imports by merging the exports of all of the packages we
    // use. Note that in the case of conflicting symbols, later packages get
    // precedence.
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
            (symbol.export === "tests" && self.unibuild.pkg.isTest))
          imports[symbol.name] = depUnibuild.pkg.name;
      });
    };
    compiler.eachUsedUnibuild({
      dependencies: self.unibuild.uses,
      arch: bundleArch,
      isopackCache: isopackCache,
      skipUnordered: true,
      skipDebugOnly: true
    }, addImportsForUnibuild);

    // Phase 2 link
    var isApp = ! self.unibuild.pkg.name;
    var files = linker.link({
      imports: imports,
      useGlobalNamespace: isApp,
      // XXX report an error if there is a package called global-imports
      importStubServePath: isApp && '/packages/global-imports.js',
      prelinkFiles: self.unibuild.prelinkFiles,
      packageVariables: self.unibuild.packageVariables,
      includeSourceMapInstructions: archinfo.matches(self.unibuild.arch, "web"),
      name: self.unibuild.pkg.name || null
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
    return jsResources;
  }
});



exports.CompilerPluginProcessor = function (options) {
  var self = this;
  self.unibuilds = options.unibuilds;
  self.arch = options.arch;
  self.isopackCache = options.isopackCache;
  // id -> {compiler, resourceSlots}
  self.compilers = null;
};
_.extend(exports.CompilerPluginProcessor.prototype, {
  // XXX BBP don't re-instantiate compilers on every rebuild
  _loadPluginsAndInstantiateCompilers: function () {
    var self = this;
    self.compilers = {};
    _.each(self.unibuilds, function (unibuild) {
      var isopack = unibuild.pkg;
      isopack.ensurePluginsInitialized();
      _.each(isopack.compilerPlugins, function (compilerPlugin, id) {
        if (_.has(self.compilers, id)) {
            throw Error("duplicate compiler plugin ID! " + id);
        }
        self.compilers[id] = {
          compiler: compilerPlugin.instantiateCompiler(),
          resourceSlots: []
        };
      });
    });
  },

  runCompilerPlugins: function () {
    var self = this;
    self._loadPluginsAndInstantiateCompilers();

    var sourceBatches = _.map(self.unibuilds, function (unibuild) {
      return new PackageSourceBatch(unibuild, self);
    });

    // Find out which files go with which compilers.
    _.each(sourceBatches, function (sourceBatch) {
      _.each(sourceBatch.resourceSlots, function (resourceSlot) {
        var compilerPlugin = resourceSlot.compilerPlugin;
        // Skip non-sources.
        if (! compilerPlugin)
          return;

        if (! _.has(self.compilers, compilerPlugin.id)) {
          throw Error("uninstantiated compiler plugin " + compilerPlugin.id);
        }
        self.compilers[compilerPlugin.id].resourceSlots.push(resourceSlot);
      });
    });

      // Now actually run the handlers.
    _.each(self.compilers, function (compilerInfo, id) {
      var compiler = compilerInfo.compiler;
      var resourceSlots = compilerInfo.resourceSlots;
      // Don't run compilers with no files.
      if (! resourceSlots.length)
        return;

      compiler.run(resourceSlots);
    });

    return sourceBatches;
  }
});
