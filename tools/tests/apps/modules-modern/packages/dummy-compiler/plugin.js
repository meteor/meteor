Plugin.registerCompiler({
  extensions: ["dummy"]
}, function () {
  return new DummyCompiler();
});

function DummyCompiler() {}

DummyCompiler.prototype.processFilesForTarget = function (inputFiles) {
  var self = this;

  inputFiles.forEach(function (inputFile) {
    self.compileOneFile(inputFile);
  });
};

DummyCompiler.prototype.compileOneFile = function (inputFile) {
  var path = inputFile.getPathInPackage();

  inputFile.addJavaScript({
    path: path,
    data: 'exports.id = module.id;'
  });

  inputFile.addJavaScript({
    path: path + ".secondModule",
    data: 'exports.id = module.id;'
  });
};
