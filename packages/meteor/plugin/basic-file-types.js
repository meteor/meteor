/* "js" handler is now hardcoded in packages.js.. necessarily, because
   we can't exactly define the *.js source file handler in a *.js
   source file. */

Plugin.registerCompiler({
  extensions: ['css'],
  archMatching: 'web'
}, function () {
  return new CssCompiler;
});

var CssCompiler = function () {
};
CssCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    inputFile.addStylesheet({
      data: inputFile.getContentsAsString(),
      path: inputFile.getPathInPackage()
    });
  });
};
