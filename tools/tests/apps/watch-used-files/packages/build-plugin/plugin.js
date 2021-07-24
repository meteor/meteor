require('./plugin-dep.js');

Plugin.registerCompiler({
  extensions: ['time', 'no-lazy-finalyzer'],
}, function () {
  return new Compiler();
});

var Compiler = function () {};
Compiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    let filePath = inputFile.getPathInPackage();
    if (filePath.endsWith('.time')) {
      inputFile.addJavaScript({
        path: inputFile.getPathInPackage(),
        sourcePath: filePath,
        data: "module.exports = Date.now();"
      });
    } else if(filePath.endsWith('.no-lazy-finalyzer')) {
      inputFile.addJavaScript({
        path: inputFile.getPathInPackage(),
        sourcePath: filePath,
        data: inputFile.getContentsAsString()
      });
    }
  });
};
