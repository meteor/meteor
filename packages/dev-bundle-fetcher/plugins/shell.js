var path = Npm.require('path');

var handler = function (compileStep) {
  compileStep.addAsset({
    path: compileStep.inputPath,
    data: compileStep.read()
  });
};

Plugin.registerSourceHandler('in', handler);
