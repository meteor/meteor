ECMAScript = {
  compileForShell(command) {
    const babelOptions = Babel.getDefaultOptions({asyncAwait: true});
    babelOptions.sourceMap = false;
    babelOptions.ast = false;
    babelOptions.externalHelpers = true;
    return Babel.compile(command, babelOptions).code;
  }
};
