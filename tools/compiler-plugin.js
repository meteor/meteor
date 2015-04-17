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

var InputFile = function () {
  buildPluginModule.InputFile.apply(this, arguments);
};

util.inherits(InputFile, buildPluginModule.InputFile);

_.extend(InputFile.prototype, {
  // XXX BBP remove these, they are duplicated in build-plugin.js
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

