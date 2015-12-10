Plugin.registerCompiler({
  extensions: ['js'],
}, function () {
  return new BabelCompiler({
    asyncAwait: true,
    modules: true
  });
});
