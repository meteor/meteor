Package.describe({
  name: 'caching-compiler',
  version: '2.0.0-rc300.1',
  summary: 'An easy way to make compiler plugins cache',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'random']);
  api.addFiles(['caching-compiler.js'], 'server');
  api.addFiles(['multi-file-caching-compiler.js'], 'server');
  api.export(['CachingCompiler', 'MultiFileCachingCompiler'], 'server');
});
