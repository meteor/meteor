Plugin.registerCompiler({
  extensions: ['js', 'jsx'],
}, function () {
  return new BabelCompiler({
    react: true
  });
});
