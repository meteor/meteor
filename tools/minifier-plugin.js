var buildPluginModule = require('./build-plugin.js');
var util = require('util');
var _ = require('underscore');

var InputFile = exports.InputFile = function (source, options) {
  buildPluginModule.InputFile.call(this);

  var self = this;
  options = options || {};

  self._source = source;
  self._arch = options.arch;
  self._minifiedFiles = [];
};

util.inherits(InputFile, buildPluginModule.InputFile);

_.extend(InputFile.prototype, {
  getContentsAsBuffer: function () {
    return this._source.contents();
  },
  getPathInPackage: function () {
    return this._source.targetPath;
  },
  getPackageName: function () {
    throw new Error("Compiled files don't belong to any package");
  },
  getSourceHash: function () {
    return this._source.hash();
  },
  getArch: function () {
    return this._arch;
  }
});

var JsFile = exports.JsFile = function (source, options) {
  InputFile.apply(this, arguments);
};

util.inherits(JsFile, InputFile);

_.extend(JsFile.prototype, {
  // - data
  // - hash?
  addJavaScript: function (options) {
    var self = this;
    self._minifiedFiles.push({
      data: options.data.toString('utf8')
    });
  }
});

var CssFile = exports.CssFile = function (source, options) {
  InputFile.apply(this, arguments);
};

util.inherits(CssFile, InputFile);

_.extend(CssFile.prototype, {
  // - data
  // - hash?
  addStylesheet: function (options) {
    var self = this;
    self._minifiedFiles.push({
      data: options.data.toString('utf8')
    });
  }
});

