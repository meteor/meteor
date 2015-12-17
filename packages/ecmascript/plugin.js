Plugin.registerCompiler({
  extensions: ['js'],
}, function () {
  return new BabelCompiler({
    asyncAwait: true,
    modules: true
  });
});

Plugin.registerCompiler({
  extensions: ['jsx'],
}, function () {
  return new BabelCompiler({
    asyncAwait: true,
    modules: true,
    react: true
  });
});
