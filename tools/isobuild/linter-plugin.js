var buildPluginModule = require('./build-plugin.js');
var util = require('util');
var _ = require('underscore');

exports.LinterPlugin = function (pluginDefinition, userPlugin) {
  var self = this;
  self.userPlugin = userPlugin;
  self.pluginDefinition = pluginDefinition;
};

var LintingFile = exports.LintingFile = function (source) {
  buildPluginModule.InputFile.call(this);

  var self = this;
  self._source = source;
};

util.inherits(LintingFile, buildPluginModule.InputFile);

_.extend(LintingFile.prototype, {
  getContentsAsBuffer: function () {
    return this._source.contents;
  },
  getPathInPackage: function () {
    return this._source.relPath;
  },
  getPackageName: function () {
    return this._source['package'];
  },
  getSourceHash: function () {
    return this._source.hash;
  },
  getArch: function () {
    return this._source.arch;
  }
});

