Package.describe({
  name: 'caching-compiler',
  version: '1.1.11',
  summary: 'An easy way to make compiler plugins cache',
  documentation: 'README.md'
});

Npm.depends({
  'lru-cache': '2.6.4',
  'async': '1.4.0'
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'random']);
  api.addFiles(['caching-compiler.js'], 'server');
  api.addFiles(['multi-file-caching-compiler.js'], 'server');
  api.export(['CachingCompiler', 'MultiFileCachingCompiler'], 'server');
});
