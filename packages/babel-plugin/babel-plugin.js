var handler = function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var outputFile = compileStep.inputPath + ".js";

  var result = Babel.transform(source, {
    whitelist: [
      'es6.arrowFunctions',
      'es6.templateLiterals',
      // we haven't completely finished support for these, but it
      // is looking good and we want to be able to write runtime tests:
      'es6.classes',
      'es6.blockScoping'
    ],
    externalHelpers: true,
    sourceMap: true,
    filename: compileStep.pathForSourceMap
  });

  compileStep.addJavaScript({
    path: outputFile,
    sourcePath: compileStep.inputPath,
    data: result.code,
    sourceMap: JSON.stringify(result.map)
  });
};

Plugin.registerSourceHandler('es6', handler);
