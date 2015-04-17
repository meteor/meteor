var util = require('util');

var LinterPluginProcessor = function () {
  CompilerPluginProcessor.call(this);
};

util.inherits(LinterPluginProcessor, CompilerPluginProcessor);

exports.LinterPluginProcessor = LinterPluginProcessor;

