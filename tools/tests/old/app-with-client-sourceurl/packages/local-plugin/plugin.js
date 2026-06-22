Plugin.registerCompiler({
  extensions: ['printme'],
  archMatching: 'web'
}, function () {
  return new PrintmeCompiler();
});

var PrintmeCompiler = function () {};

PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();
    inputFile.addJavaScript({
      path: inputFile.getPathInPackage() + ".js",
      sourcePath: inputFile.getPathInPackage(),
      data:
        "console.log(" +
        JSON.stringify("PMC: " + source) +
        ");\n//# sourceURL=printme-compiler.js\n"
    });
  });
};
