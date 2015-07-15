Plugin.registerCompiler({
  filenames: ['foo.printme']
}, function () {
  return new PrintmeCompiler();
});

var PrintmeCompiler = function () {
};
PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    console.log("extension is", inputFile.getExtension());
    inputFile.addAsset({
      path: inputFile.getPathInPackage(),
      data: inputFile.getContentsAsString()
    });
  });
};
