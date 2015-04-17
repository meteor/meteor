var CompilerPluginDefinition = require('./compiler-plugin.js').CompilerPluginDefinition;
var buildPluginModule = require('./build-plugin.js');
var util = require('util');
var _ = require('underscore');

var LinterPluginDefinition = function () {
  CompilerPluginDefinition.call(this);
};

util.inherits(LinterPluginDefinition, CompilerPluginDefinition);

exports.LinterPluginDefinition = LinterPluginDefinition;

_.extend(exports.LinterPluginDefinition.prototype, {
  getInputFileClass: function () {
    return LintingFile;
  }
});


var LintingFile = function () {
  buildPluginModule.InputFile.apply(this, arguments);
};

util.inherits(LintingFile, buildPluginModule.InputFile);

_.extend(LintingFile.prototype, {
  // any extra APIs?
});

