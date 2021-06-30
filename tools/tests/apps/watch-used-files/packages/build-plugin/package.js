Package.describe({
  name: 'build-plugin',
});

Package.registerBuildPlugin({
  name: 'build-plugin',
  use: ['modules'],
  sources: ['plugin.js']
});

Package.onUse((api) => {
  api.use('isobuild:compiler-plugin@1.0.0')
})
