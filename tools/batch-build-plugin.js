var archinfo = require('./archinfo.js');
var colonConverter = require('./colon-converter.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var _ = require('underscore');

// XXX BBP define Plugin.PHASE_LINKER etc
exports.DEFAULT_PHASE = 200;

exports.BatchBuildHandlerFactory = function (options, factoryFunction) {
  var self = this;
  self.id = options.id;
  self.phase = options.phase;
  self.extensions = options.extensions.slice();
  self.archMatching = options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factoryFunction = factoryFunction;
};
_.extend(exports.BatchBuildHandlerFactory.prototype, {
  createHandler: function () {
    var self = this;
    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    var batchHandler = self.factoryFunction();
    return new BatchBuildHandler(self, batchHandler);
  }
});

var BatchBuildHandler = function (factory, batchHandler) {
  var self = this;
  // The actual object returned from the user-supplied factory.
  self.batchHandler = batchHandler;
  self.factory = factory;
};
_.extend(BatchBuildHandler.prototype, {
  // XXX BBP full docs
  // files is an array of {packageSourceBatch, fileIndex}
  run: function (sourceSlots) {
    var self = this;

    var inputFiles = _.map(sourceSlots, function (sourceSlot) {
      // Register this file as being processed, so it gets replaced by its
      // output at the end of the phase.
      sourceSlot.activate();
      return new InputFile(sourceSlot);
    });

    // XXX BBP proper error handling --- this is running user-supplied plugin
    // code
    self.batchHandler.processFilesForTarget(inputFiles);
  }
});

// This is the object presented to the user's plugin code.
// XXX BBP actually design its API
// XXX BBP decide if the API always presents / to the code (it probably
// should because you're not supposed to do your own IO anyway)
var InputFile = function (sourceSlot) {
  var self = this;
  // We use underscored attributes here because this is user-visible code and we
  // don't want users to be accessing anything that we don't document.
  self._sourceSlot = sourceSlot;
};
_.extend(InputFile.prototype, {
  // XXX BBP we should have a better API
  xxxContentsAsBuffer: function () {
    var self = this;
    return self._sourceSlot.inputSource.data;
  },
  xxxPathInPackage: function () {
    var self = this;
    return self._sourceSlot.inputSource.path;
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
    return self._sourceSlot.packageSourceBatch.unibuild.pkg.name;
  },
  xxxOutput: function (sourceInfo) {
    var self = this;
    // XXX BBP validate input!!
    self._sourceSlot.outputSource(sourceInfo);
  }
});

// XXX BBBP doc
var SourceSlot = function (unibuildSourceInfo, packageSourceBatch) {
  var self = this;
  self.inputSource = unibuildSourceInfo;  // XXX BBP prototype?
  // When we activate this sourceSlot, this becomes a list.  Then at the end of
  // the phase, we replace this object with a new SourceSlot for each output
  // source, if any.  If this SourceSlot is not activated in a given phase, it
  // remains to the next phase.
  self.outputSources = null;
  self.packageSourceBatch = packageSourceBatch;
};
_.extend(SourceSlot.prototype, {
  activate: function () {
    var self = this;
    if (self.outputSources)
      throw Error("activate twice?");
    self.outputSources = [];
  },
  outputSource: function (source) {
    var self = this;
    if (! self.outputSources)
      throw Error("outputSource on unactivated SourceSlot?");

    // XXX BBP prototype?
    self.outputSources.push(source);
  }
});

// XXX BBP ???
var PackageSourceBatch = function (unibuild, processor) {
  var self = this;
  self.processor = processor;
  // XXX BBP maybe give these objects a prototype
  self.sourceSlots = _.map(unibuild.sources, function (source) {
    return new SourceSlot(source, self);
  });
  // Remember the unibuild too, so that we can pull out legacy resources
  // (js/css/etc that were placed into an Isopack by an
  // registerSourceHandler-style build plugin) later.
  self.unibuild = unibuild;
  // phase -> ext -> factory ID
  self.activeHandlers = self._generateActiveHandlers();
};
_.extend(PackageSourceBatch.prototype, {
  _generateActiveHandlers: function () {
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
    }, function (unibuild) {
      if (! _.isEmpty(unibuild.pkg.plugins)) {
        activePluginPackages.push(unibuild.pkg);
      }
    });

    activePluginPackages = _.uniq(activePluginPackages);

    var activeHandlers = {};
    _.each(activePluginPackages, function (otherPkg) {
      _.each(otherPkg.batchHandlerFactoriesByPhase, function (factories, phase) {
        if (! _.has(activeHandlers, phase)) {
          activeHandlers[phase] = {};
        }
        var phaseHandlers = activeHandlers[phase];
        _.each(factories, function (factory) {
          // Ignore factories which aren't for this arch (eg, ignore CSS
          // handlers on the server).
          // XXX BBP actually this is wrong, we should DROP these sources
          // (otherwise they last until the end and cause errors)
          // (maybe this should just be handled at getSources time)
          if (factory.archMatching &&
              ! archinfo.matches(self.processor.arch, factory.archMatching)) {
            return;
          }

          _.each(factory.extensions, function (ext) {
            if (_.has(phaseHandlers, ext)) {
              // XXX BBP use buildmessage
              throw Error("duplicate extension " + JSON.stringify({
                package: isopack.name,
                ext: ext,
                phase: phase
              }));
            }
            phaseHandlers[ext] = factory.id;
          });
        });
      });
    });

    return activeHandlers;
  },

  // XXX BBP doc? rename?
  eachSourceSlotWithPhaseFactoryId: function (phase, f) {
    var self = this;

    // No handlers in this phase! Done.
    if (! _.has(self.activeHandlers, phase)) {
      return;
    }
    // ext -> factoryId
    var phaseHandlers = self.activeHandlers[phase];
    _.each(self.sourceSlots, function (sourceSlot) {
      var parts = files.pathBasename(sourceSlot.inputSource.path).split('.');
      for (var i = 1; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(phaseHandlers, extension)) {
          f(sourceSlot, phaseHandlers[extension]);
          break;
        }
      }
      // No handlers at this phase for this file! That's OK.
    });
  },

  replaceSourceSlotsWithOutput: function () {
    var self = this;
    var newSourceSlots = [];
    _.each(self.sourceSlots, function (sourceSlot) {
      // If this source file wasn't processed in this phase, keep it around
      // until the next phase.
      if (! sourceSlot.outputSources) {
        newSourceSlots.push(sourceSlot);
        return;
      }
      // Otherwise, replace it with SourceSlots for the sources that it output
      // (if any).
      _.each(sourceSlot.outputSources, function (outputSource) {
        newSourceSlots.push(new SourceSlot(outputSource, self));
      });
    });

    self.sourceSlots = newSourceSlots;
  },

  getResources: function () {
    var self = this;
    // Start with legacy resources.
    var resources = self.unibuild.getResources(self.processor.arch, {
      isopackCache: self.processor.isopackCache
    });
    // XXX BBP this is wrong (eg totally broken for in app)
    var serveRoot;
    if (self.unibuild.pkg.name) {
      serveRoot = files.pathJoin('/packages/', self.unibuild.pkg.name);
    } else {
      serveRoot = '/';
    }
    // Now add resources from the batch plugins.
    _.each(self.sourceSlots, function (sourceSlot) {
      var source = sourceSlot.inputSource;
      // XXX BBP make less hacky
      if (! source.path.match(/\.css$/)) {
        throw Error("we only know how to output CSS! " + source.path);
      }
      resources.push({
        type: "css",
        refreshable: true,
        data: source.data,
        servePath: colonConverter.convert(
          files.pathJoin(
            serveRoot,
            // XXX BBP should we decide in our API that everything is / ?
            files.convertToStandardPath(source.path, true)))
      });
    });
    return resources;
  }
});



exports.BatchBuildProcessor = function (options) {
  var self = this;
  self.unibuilds = options.unibuilds;
  self.arch = options.arch;
  self.isopackCache = options.isopackCache;
  // id -> { factory, handler, phase }
  self.handlers = null;
};
_.extend(exports.BatchBuildProcessor.prototype, {
  _loadPluginsAndCreateHandlers: function () {
    var self = this;
    self.handlers = {};
    _.each(self.unibuilds, function (unibuild) {
      var isopack = unibuild.pkg;
      isopack.ensurePluginsInitialized();
      _.each(isopack.batchHandlerFactoriesByPhase, function (factories, phase) {
        _.each(factories, function (factory) {
          if (_.has(self.handlers, factory.id)) {
            throw Error("duplicate handler factory ID! " + factory.id);
          }
          self.handlers[factory.id] = factory.createHandler();
        });
      });
    });
  },

  _getSortedPhases: function () {
    var self = this;
    if (! self.handlers)
      throw Error("call _loadPluginsAndCreateHandlers first");

    var phaseSet = {};
    _.each(self.handlers, function (handler) {
      phaseSet[handler.factory.phase] = true;
    });
    return _.map(phaseSet, function (unused, phaseStr) {
      return +phaseStr;
    }).sort(function (a, b) { return a - b; });
  },

  runBatchHandlers: function () {
    var self = this;
    self._loadPluginsAndCreateHandlers();

    var sourceBatches = _.map(self.unibuilds, function (unibuild) {
      return new PackageSourceBatch(unibuild, self);
    });

    var phases = self._getSortedPhases(self.unibuilds);

    _.each(phases, function (phase) {
      // For each phase, figure out which files go with which handlers.
      // These should be disjoint sets (which don't necessarily include
      // every file in the target).
      // id -> [SourceSlot]
      var handlersToRun = {};

      _.each(sourceBatches, function (sourceBatch) {
        sourceBatch.eachSourceSlotWithPhaseFactoryId(phase, function (sourceSlot, factoryId) {
          if (! _.has(handlersToRun, factoryId)) {
            handlersToRun[factoryId] = [];
          }
          handlersToRun[factoryId].push(sourceSlot);
        });
      });

      // Now actually run the handlers.
      _.each(handlersToRun, function (sourceSlots, factoryId) {
        var handler = self.handlers[factoryId];
        if (! handler)
          throw Error("handler not created?");

        handler.run(sourceSlots);
      });

      // Now that we've run all the handlers, replace all source files with
      // their output.
      _.each(sourceBatches, function (sourceBatch) {
        sourceBatch.replaceSourceSlotsWithOutput();
      });
    });

    return sourceBatches;
  }
});
