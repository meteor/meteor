ECMAScript = {
  compileForShell(command) {
    const babelOptions = Babel.getDefaultOptions();
    babelOptions.sourceMap = false;
    babelOptions.ast = false;
    babelOptions.externalHelpers = true;
    return Babel.compile(command, babelOptions).code;
  }
};
