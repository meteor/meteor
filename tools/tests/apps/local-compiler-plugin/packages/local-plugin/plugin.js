Plugin.registerCompiler({
  extensions: ['printme'],
  archMatching: 'os'
}, function () {
  return new PrintmeCompiler();
});

var PrintmeCompiler = function () {
  var self = this;
  self.runCount = 0;
};
PrintmeCompiler.prototype.processFilesForTarget = function (inputFiles) {
  var self = this;
  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();
    inputFile.addJavaScript({
      path: inputFile.getPathInPackage() + ".js",
      sourcePath: inputFile.getPathInPackage(),
      data: "console.log('PMC: ' + " + JSON.stringify(source) + ");\n"
    });
  });
  console.log("PrintmeCompiler invocation", ++self.runCount);
};
