var fs = Npm.require('fs');
var stylus = Npm.require('stylus');
var nib = Npm.require('nib');
var path = Npm.require('path');
var Future = Npm.require('fibers/future');

Plugin.registerCompiler({
  extensions: ['styl'],
  archMatchin: 'web'
}, function () {
  return new StylusCompiler();
});

function StylusCompiler () {}
StylusCompiler.prototype.processFilesForTarget = function (files) {
  var filesByPackage = {};
  files.forEach(function (inputFile) {
    var packageName = inputFile.getPackageName() || '__app__';
    var filePath = inputFile.getPathInPackage();
    filesByPackage[packageName] = filesByPackage[packageName] || {};
    filesByPackage[packageName][filePath] = inputFile;
  });

  var pathParser = function (filePath) {
    // XXX match relative paths in the same package?
    var match = /^({.*})\/(.*)$/.exec(filePath);
    if (! match) { return null; }

    var packageName = match[1];
    if (!packageName || packageName === '{}')
      packageName = '__app__';
    else
      packageName = packageName.substr(1, packageName.length - 2);

    var pathInPackage = match[2];

    return {packageName: packageName, pathInPackage: pathInPackage};
  };
  var importer = {
    find: function (importPath, paths, importerPath) {
      var parsed = pathParser(importPath);

      if (! parsed) { return null; }

      var packageName = parsed.packageName;
      var pathInPackage = parsed.pathInPackage;

      return !!filesByPackage[packageName] &&
        !!filesByPackage[packageName][pathInPackage] ? [importPath] : null;
    },
    readFile: function (filePath) {
      var parsed = pathParser(filePath);
      var packageName = parsed.packageName;
      var pathInPackage = parsed.pathInPackage;

      return filesByPackage[packageName][pathInPackage].getContentsAsString();
    }
  };

  files.forEach(function (inputFile) {
    if (! inputFile.getPathInPackage().match(/\.main\.styl$/)) {
      return;
    }

    var f = new Future;
    var style = stylus(inputFile.getContentsAsString())
      .use(nib())
      .set('filename', inputFile.getPathInPackage())
      .set('sourcemap', { inline: false, comment: false })
      .set('importer', importer);

    style.render(f.resolver());

    try {
      var css = f.wait();
    } catch (e) {
      inputFile.error({
        message: "Stylus compiler error: " + e.message
      });
      return;
    }

    inputFile.addStylesheet({
      path: inputFile.getPathInPackage() + ".css",
      data: css,
      sourcemap: style.sourcemap
    });
  });
};

