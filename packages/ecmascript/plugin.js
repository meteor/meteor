const reactRefreshPlugin = Npm.require('react-refresh/babel');

Plugin.registerCompiler({
  extensions: ['js', 'jsx', 'mjs'],
}, function () {
  return new BabelCompiler({
    react: true
  }, (babelOptions, file) => {
    // __hotState is set by the hot-module-reload package
    const hotReloadingAvailable = !!global.__hotState

    // TODO: this should also use the reloadable checks done by hot-module-reload
    const canReload = process.env.NODE_ENV !== 'production' &&
      file.getArch() === 'web.browser' &&
      !file.getPackageName()

    if (hotReloadingAvailable && canReload) {
      babelOptions.plugins = babelOptions.plugins || []
      babelOptions.plugins.push(reactRefreshPlugin)      
    }
  });
});
