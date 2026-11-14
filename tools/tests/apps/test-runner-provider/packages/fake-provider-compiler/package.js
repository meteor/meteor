Package.describe({
  name: 'fake-provider-compiler',
  version: '1.0.0',
  summary: 'Detects premature dependency plugin initialization',
});

Package.registerBuildPlugin({
  name: 'fakeProviderCompiler',
  sources: ['plugin.js'],
  use: ['ecmascript'],
});
