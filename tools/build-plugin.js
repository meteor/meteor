var archinfo = require('./archinfo.js');
var colonConverter = require('./colon-converter.js');
var files = require('./files.js');
var linker = require('./linker.js');
var compiler = require('./compiler.js');
var _ = require('underscore');

exports.BuildPluginDefintion = function (options, factoryFunction) {
  var self = this;
  self.id = options.id;
  self.type = options.type;
  self.extensions = options.extensions.slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = factoryFunction;
};
_.extend(exports.BuildPluginDefintion.prototype, {
  instantiatePlugin: function () {
    var self = this;
    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    var userPlugin = self.factoryFunction();
    return new BuildPlugin(self, userPlugin);
  },
  relevantForArch: function (arch) {
    var self = this;
    return ! self.archMatching || archinfo.matches(arch, self.archMatching);
  },
  getInputFileClass: function () {
    throw new Error("getInputFileClass should be implemented by a subclass of BuildPluginDefinition");
  }
});

var BuildPlugin = function (pluginDefinition, userPlugin) {
  var self = this;
  // The actual object returned from the user-supplied factory.
  self.userPlugin = userPlugin;
  self.pluginDefinition = pluginDefinition;
};
_.extend(BuildPlugin.prototype, {
  // XXX BBP full docs
  run: function (resourceSlots) {
    var self = this;

    var InputFile = self.pluginDefinition.getInputFileClass();
    var inputFiles = _.map(resourceSlots, function (resourceSlot) {
      return new InputFile(resourceSlot);
    });

    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    self.userPlugin.processFilesForTarget(inputFiles);
  }
});

exports.BuildPluginProcessor = function (options) {
  var self = this;
  self.type = options.type;
  self.unibuilds = options.unibuilds;
  self.arch = options.arch;
  self.isopackCache = options.isopackCache;
  // id -> {buildPlugin, resourceSlots}
  self.buildPlugins = null;
};
_.extend(exports.BuildPluginProcessor.prototype, {
  // XXX BBP don't re-instantiate buildPlugins on every rebuild
  _loadPluginsAndInstantiatePlugins: function () {
    var self = this;
    self.buildPlugins = {};
    _.each(self.unibuilds, function (unibuild) {
      var isopack = unibuild.pkg;
      isopack.ensurePluginsInitialized();
      _.each(isopack.sourceProcessors[self.type], function (buildPlugin, id) {
        if (_.has(self.buildPlugins, id)) {
            throw Error("duplicate buildPlugin plugin ID! " + id);
        }
        self.buildPlugins[id] = {
          buildPlugin: buildPlugin.instantiatePlugin(),
          resourceSlots: []
        };
      });
    });
  },

  runBuildPlugins: function () {
    var self = this;
    self._loadPluginsAndInstantiatePlugins();

    var sourceBatches = _.map(self.unibuilds, function (unibuild) {
      return new PackageSourceBatch(unibuild, self);
    });

    // Find out which files go with which buildPlugins.
    _.each(sourceBatches, function (sourceBatch) {
      _.each(sourceBatch.resourceSlots, function (resourceSlot) {
        var buildPlugin = resourceSlot.buildPlugin;
        // Skip non-sources.
        if (! buildPlugin)
          return;

        if (! _.has(self.buildPlugins, buildPlugin.id)) {
          throw Error("uninstantiated buildPlugin plugin " + buildPlugin.id);
        }
        self.buildPlugins[buildPlugin.id].resourceSlots.push(resourceSlot);
      });
    });

      // Now actually run the handlers.
    _.each(self.buildPlugins, function (buildPluginInfo, id) {
      var buildPlugin = buildPluginInfo.buildPlugin;
      var resourceSlots = buildPluginInfo.resourceSlots;
      // Don't run buildPlugins with no files.
      if (! resourceSlots.length)
        return;

      buildPlugin.run(resourceSlots);
    });

    return sourceBatches;
  }
});

// XXX BBP doc
var ResourceSlot = function (unibuildResourceInfo,
                             buildPlugin,
                             packageSourceBatch) {
  var self = this;
  self.inputResource = unibuildResourceInfo;  // XXX BBP prototype?
  self.outputResources = [];
  self.buildPlugin = buildPlugin;
  self.packageSourceBatch = packageSourceBatch;

  if (self.inputResource.type === "source") {
    if (! buildPlugin) {
      throw Error("no buildPlugin plugin for source? " +
                  JSON.stringify(unibuildResourceInfo));
    }
  } else {
    if (buildPlugin) {
      throw Error("buildPlugin plugin for non-source? " +
                  JSON.stringify(unibuildResourceInfo));
    }
    // Any resource that isn't handled by buildPlugin plugins just gets passed
    // through.
    self.outputResources.push(self.inputResource);
  }
};
_.extend(ResourceSlot.prototype, {
  // XXX BBP check args
  addStylesheet: function (options) {
    var self = this;
    if (! self.buildPlugin)
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
  self.type = processor.type;
  self.unibuild = unibuild;
  self.processor = processor;
  var buildPluginsByExtension = self._getBuildPluginsByExtension();
  self.resourceSlots = _.map(unibuild.resources, function (resource) {
    var buildPlugin = null;
    if (resource.type === "source") {
      var basename = files.pathBasename(resource.path);
      var parts = basename.split('.');
      for (var i = 1; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(buildPluginsByExtension, extension)) {
          buildPlugin = buildPluginsByExtension[extension];
          break;
        }
      }
      if (! buildPlugin) {
        // XXX BBP better error handling
        throw Error("no plugin found for " + resource.path);
      }
    }
    return new ResourceSlot(resource, buildPlugin, self);
  });
};
_.extend(PackageSourceBatch.prototype, {
  _getBuildPluginsByExtension: function () {
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

    var buildPluginsByExtension = {};
    _.each(activePluginPackages, function (otherPkg) {
      // self.type is "compiler" or "linter" or similar
      _.each(otherPkg.sourceProcessors[self.type], function (buildPlugin, id) {
        if (! buildPlugin.relevantForArch(self.processor.arch)) {
          return;
        }

        _.each(buildPlugin.extensions, function (ext) {
          if (_.has(buildPluginsByExtension, ext)) {
            // XXX BBP use buildmessage
            throw Error("duplicate extension " + JSON.stringify({
              package: isopack.name,
              ext: ext
            }));
          }
          buildPluginsByExtension[ext] = buildPlugin;
        });
      });
    });

    return buildPluginsByExtension;
  },

  getResources: function () {
    var self = this;
    var resources = Array.prototype.concat.apply(
      [],
      _.pluck(self.resourceSlots, 'outputResources'));
    return resources.concat(self._getPrelinkedJsResources());
  },

  // XXX BBP copied from Unibuild.getResources, which should get deleted
  // XXX BBP this should also support JS resources produced by buildPlugin plugins
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


