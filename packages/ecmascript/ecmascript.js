ECMAScript = {
  compileForShell(command) {
    const babelOptions = Babel.getDefaultOptions();
    babelOptions.sourceMap = false;
    babelOptions.ast = false;
    return Babel.compile(command, babelOptions).code;
  }
};
