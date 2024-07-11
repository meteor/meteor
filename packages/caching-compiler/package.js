Package.describe({
  name: 'caching-compiler',
  version: '2.0.0-rc300.5',
  summary: 'An easy way to make compiler plugins cache',
  documentation: 'README.md'
});

Npm.depends({
  'lru-cache': '6.0.0'
})

Package.onUse(function(api) {
  api.use(['ecmascript', 'random']);
  api.addFiles(['caching-compiler.js'], 'server');
  api.addFiles(['multi-file-caching-compiler.js'], 'server');
  api.export(['CachingCompiler', 'MultiFileCachingCompiler'], 'server');
});
