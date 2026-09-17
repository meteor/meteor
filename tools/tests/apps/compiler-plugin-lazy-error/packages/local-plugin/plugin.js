// A minimal compiler plugin used to reproduce issue #10366. It compiles
// *.bork files into trivial CommonJS modules. When a file contains the marker
// THROW_COMPILE_ERROR, it mimics what real compilers (e.g. the Blaze
// templating-compiler or coagmano:stylus) do when they hit a syntax error:
// it reports the error via inputFile.error() and emits NO output resource for
// that file. For lazy files (anything under imports/) the build tool defers
// such errors until the file is imported, which is exactly the path that used
// to swallow the error.
Plugin.registerCompiler({
  extensions: ['bork']
}, function () {
  return new BorkCompiler();
});

function BorkCompiler() {}

BorkCompiler.prototype.processFilesForTarget = function (inputFiles) {
  inputFiles.forEach(function (inputFile) {
    var source = inputFile.getContentsAsString();

    if (source.indexOf('THROW_COMPILE_ERROR') >= 0) {
      inputFile.error({
        message: 'BorkCompiler: simulated compile error',
        line: 1
      });
      // Intentionally emit no addJavaScript: the compilation failed, so no
      // ES module wrapper is created for this file.
      return;
    }

    inputFile.addJavaScript({
      path: inputFile.getPathInPackage() + '.js',
      sourcePath: inputFile.getPathInPackage(),
      data: 'module.exports = ' + JSON.stringify(source) + ';\n'
    });
  });
};
