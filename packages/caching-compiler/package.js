Package.describe({
  name: 'caching-compiler',
  version: '1.2.0',
  summary: 'An easy way to make compiler plugins cache',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'random']);
  api.addFiles(['caching-compiler.js'], 'server');
  api.addFiles(['multi-file-caching-compiler.js'], 'server');
  api.export(['CachingCompiler', 'MultiFileCachingCompiler'], 'server');
});
