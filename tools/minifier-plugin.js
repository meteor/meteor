var buildPluginModule = require('./build-plugin.js');
var util = require('util');
var _ = require('underscore');

var InputFile = exports.InputFile = function (source) {
  buildPluginModule.InputFile.call(this);

  var self = this;
  self._source = source;
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
  }
});

var JsFile = exports.JsFile = function (source) {
  InputFile.call(this, source);
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

var CssFile = exports.CssFile = function (source) {
  InputFile.call(this, source);
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

