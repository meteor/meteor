Package.describe({
  name: 'build-plugin',
});

Package.registerBuildPlugin({
  name: 'build-plugin',
  use: ['meteor', 'ecmascript'],
  sources: ['plugin.js']
});

Package.registerBuildPlugin({
  name: 'build-plugin-no-meteor',
  use: [],
  sources: ['plugin-without-meteor.js']
});

Package.onUse((api) => {
  api.use('isobuild:compiler-plugin@1.0.0')
})
