Plugin.registerCompiler({
  extensions: ['printme']
}, function () {
  return new PrintmeCompiler();
});

var PrintmeCompiler = function () {
};
PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    inputFile.addAsset({
      path: inputFile.getPathInPackage(),
      data: inputFile.getContentsAsString()
    });
  });
};
