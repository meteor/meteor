var handler = function (compileStep) {
  var source = compileStep.read().toString('utf8');
  var outputFile = compileStep.inputPath + ".js";

  var result = Babel.transform(source, {
    whitelist: [
      'es6.templateLiterals'
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
