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

function hasDir(path, dirName) {
  var pathParts = path.split('/');
  var index = pathParts.indexOf(dirName);

  return index > -1 && index < pathParts.length - 1;
}

CssCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    let path = inputFile.getPathInPackage();

    if (hasDir(path, 'node_modules')) {
      return;
    }

    inputFile.addStylesheet({
      data: inputFile.getContentsAsString(),
      path: path
    });
  });
};
