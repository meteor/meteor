Plugin.registerCompiler({
  extensions: ['js'],
}, function () {
  return new BabelCompiler();
});

Plugin.registerCompiler({
  extensions: ['jsx'],
}, function () {
  return new BabelCompiler({
    react: true
  });
});
