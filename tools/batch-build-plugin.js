var archinfo = require('./archinfo.js');
var compiler = require('./compiler.js');
var files = require('./files.js');
var _ = require('underscore');

exports.BatchBuildHandlerFactory = function (options, factory) {
  var self = this;
  self.id = options.id;
  self.extensions = options.extensions.slice();
  self.archMatching = !! options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factory = factory;
};

exports.DEFAULT_PHASE = 200;

// XXX BBP ???
var PackageSourceBatch = function (unibuild, processor) {
  var self = this;
  self.processor = processor;
  // XXX BBP maybe give these objects a prototype
  self.orderedSources = _.clone(unibuild.sources);
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
  eachFileInPhase: function (phase, f) {
    var self = this;

    // No handlers in this phase! Done.
    if (! _.has(self.activeHandlers, phase)) {
      return;
    }
    // ext -> factoryId
    var phaseHandlers = self.activeHandlers[phase];
    _.each(self.orderedSources, function (source, fileIndex) {
      var parts = files.pathBasename(source.path).split('.');
      for (var i = 1; i < parts.length; i++) {
        var extension = parts.slice(i).join('.');
        if (_.has(phaseHandlers, extension)) {
          f(fileIndex, phaseHandlers[extension]);
          break;
        }
      }
      // No handlers at this phase for this file! That's OK.
    });
  }
});



exports.BatchBuildProcessor = function (options) {
  var self = this;
  self.unibuilds = options.unibuilds;
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
          self.handlers[factory.id] = {
            factory: factory,
            phase: phase,
            // XXX BBP better error if this throws?
            handler: factory.factory()
          };
        });
      });
    });
  },

  _getSortedPhases: function () {
    var self = this;
    if (! self.handlers)
      throw Error("call _loadPluginsAndCreateHandlers first");

    var phaseSet = {};
    _.each(self.handlers, function (handlerInfo) {
      phaseSet[handlerInfo.phase] = true;
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
      // id -> [{ packageSourceBatch, fileIndex }]
      var handlersToRun = {};

      _.each(sourceBatches, function (sourceBatch) {
        sourceBatch.eachFileInPhase(phase, function (fileIndex, factoryId) {
          if (! _.has(handlersToRun, factoryId)) {
            handlersToRun[factoryId] = [];
          }
          handlersToRun[factoryId].push({
            packageSourceBatch: sourceBatch,
            fileIndex: fileIndex
          });
        });
      });
      console.log(phase, handlersToRun);
    });
  }
});
