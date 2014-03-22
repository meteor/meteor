Package.describe({
  summary: "Doubly-linked list optimized for random access"
});

Package.on_use(function (api) {
  api.export('SqrtSkipList');
  api.add_files('sqrt-skip-list.js', ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('sqrt-skip-list', ['client', 'server']);
  api.use('tinytest');

  api.add_files('tests.js', ['client', 'server']);
});

