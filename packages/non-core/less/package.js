Package.describe({
  name: 'less',
  version: '3.0.2',
  summary: 'Leaner CSS language',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "compileLessBatch",
  use: [
    "caching-compiler@1.2.2",
    "ecmascript@0.15.1",
  ],
  sources: [
    'plugin/compile-less.js'
  ],
  npmDependencies: {
    "@babel/runtime": "7.14.6",
    "less": "3.11.3"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});

Package.onTest(function(api) {
  api.use('less');
  api.use(['tinytest', 'test-helpers']);
  api.addFiles(['tests/top.import.less',
                'tests/top3.import.less',
                'tests/dir/in-dir.import.less',
                'tests/dir/in-dir2.import.less',
                'tests/dir/root.less',
                'tests/dir/subdir/in-subdir.import.less']);

  api.addFiles('tests/imports/not-included.less', 'client', {
    lazy: true
  });

  api.addFiles('tests/top2.less', 'client', {isImport: true});

  api.addFiles('less_tests.js', 'client');
});
