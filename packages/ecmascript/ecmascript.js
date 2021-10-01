ECMAScript = {
  compileForShell(command, cacheOptions) {
    const babelOptions = Babel.getDefaultOptions({
      nodeMajorVersion: parseInt(process.versions.node, 10),
      compileForShell: true
    });
    delete babelOptions.sourceMap;
    delete babelOptions.sourceMaps;
    babelOptions.ast = false;
    return Babel.compile(command, babelOptions, cacheOptions).code;
  }
};
