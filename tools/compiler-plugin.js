var buildPluginModule = require('./build-plugin.js');
var files = require('./files.js');
var util = require('util');
var _ = require('underscore');

exports.CompilerPluginDefinition = function (options, factory) {
  buildPluginModule.BuildPluginDefintion.call(this, _.extend({
    type: "compiler"
  }, options), factory);
};

util.inherits(exports.CompilerPluginDefinition, buildPluginModule.BuildPluginDefintion);

_.extend(exports.CompilerPluginDefinition.prototype, {
  getInputFileClass: function () {
    return InputFile;
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

