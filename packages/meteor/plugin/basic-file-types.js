/* "js" handler is now hardcoded in packages.js.. necessarily, because
   we can't exactly define the *.js source file handler in a *.js
   source file. */

// NOTE: It's only OK for *this* package to call this function directly, because
// otherwise we'd end up with a circular dependency between meteor and
// compiler-plugin.  The issue we're trying to avoid by requiring an explicit
// dependency on compiler-plugin doesn't matter because css has some
// backwards-compatibility special-casing in the tool.
Plugin._doNotCallThisDirectly_registerCompiler({
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
