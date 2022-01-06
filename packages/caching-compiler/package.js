Package.describe({
  name: 'caching-compiler',
  version: '1.2.2',
  summary: 'An easy way to make compiler plugins cache',
  documentation: 'README.md'
});

Npm.depends({
  "lru-native2": "1.2.5"
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'random']);
  api.addFiles(['caching-compiler.js'], 'server');
  api.addFiles(['multi-file-caching-compiler.js'], 'server');
  api.export(['CachingCompiler', 'MultiFileCachingCompiler'], 'server');
});
