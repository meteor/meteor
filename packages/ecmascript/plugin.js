Plugin.registerCompiler({
  extensions: ['js', 'jsx', 'mjs'],
}, function () {
  return new BabelCompiler({
    react: true
  });
});
