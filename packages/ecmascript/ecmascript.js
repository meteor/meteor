ECMAScript = {
  compileForShell(command) {
    const babelOptions = Babel.getDefaultOptions();
    delete babelOptions.sourceMap;
    delete babelOptions.sourceMaps;
    babelOptions.ast = false;
    return Babel.compile(command, babelOptions).code;
  }
};
