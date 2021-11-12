Plugin.registerCompiler({
  extensions: ['js', 'jsx', 'mjs'],
}, function () {
  return new BabelCompiler({
    react: true
  }, (babelOptions, file) => {
    if (file.hmrAvailable()) {
      babelOptions.plugins = babelOptions.plugins || [];
      babelOptions.plugins.push(...ReactFastRefresh.getBabelPluginConfig());
    }
  });
});
