function BabelCompiler() {}

var BCp = BabelCompiler.prototype;
var excludedFileExtensionPattern = /\.es5\.js$/i;

BCp.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();
    var inputFilePath = inputFile.getPathInPackage();
    var outputFilePath = inputFile.getPathInPackage();
    var fileOptions = inputFile.getFileOptions();
    var toBeAdded = {
      sourcePath: inputFilePath,
      path: outputFilePath,
      data: source,
      hash: inputFile.getSourceHash(),
      sourceMap: null,
      bare: !! fileOptions.bare
    };

    // If you need to exclude a specific file within a package from Babel
    // compilation, pass the { transpile: false } options to api.addFiles
    // when you add that file.
    if (fileOptions.transpile !== false &&
        // If you need to exclude a specific file within an app from Babel
        // compilation, give it the following file extension: .es5.js
        ! excludedFileExtensionPattern.test(inputFilePath)) {
      console.log(inputFilePath);

      var targetCouldBeInternetExplorer8 =
        inputFile.getArch() === "web.browser";

      var babelOptions = Babel.getDefaultOptions({
        // Perform some additional transformations to improve
        // compatibility in older browsers (e.g. wrapping named function
        // expressions, per http://kiro.me/blog/nfe_dilemma.html).
        jscript: targetCouldBeInternetExplorer8
      });

      babelOptions.sourceMap = true;
      babelOptions.filename = inputFilePath;
      babelOptions.sourceFileName = "/" + inputFilePath;
      babelOptions.sourceMapName = "/" + outputFilePath + ".map";

      try {
        var result = Babel.compile(source, babelOptions);
      } catch (e) {
        if (e.loc) {
          inputFile.error({
            message: e.message,
            sourcePath: inputFilePath,
            line: e.loc.line,
            column: e.loc.column,
          });

          return;
        }

        throw e;
      }

      toBeAdded.data = result.code;
      toBeAdded.hash = result.hash;
      toBeAdded.sourceMap = result.map;
    }

    inputFile.addJavaScript(toBeAdded);
  });
};

BCp.setDiskCacheDirectory = function (cacheDir) {
  Babel.setCacheDir(cacheDir);
};

Plugin.registerCompiler({
  extensions: ['js'],
}, function () {
  return new BabelCompiler();
});
