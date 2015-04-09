exports.BatchBuildHandler = function (options, factory) {
  var self = this;
  self.extensions = options.extensions.slice();
  self.archMatching = !! options.archMatching;
  self.isTemplate = !! options.isTemplate;
  self.factory = factory;
};

exports.DEFAULT_PHASE = 200;
