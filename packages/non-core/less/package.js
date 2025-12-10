Package.describe({
  name: 'less',
  version: '4.1.1',
  summary: 'Leaner CSS language',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "compileLessBatch",
  use: [
    "caching-compiler@2.0.0",
    "ecmascript@0.16.9",
  ],
  sources: [
    'plugin/compile-less.js'
  ],
  npmDependencies: {
    "@babel/runtime": "7.14.8",
    "less": "4.1.1"
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
                'tests/dir/subdir/in-subdir.import.less'], 'client');

  api.addFiles('tests/imports/not-included.less', 'client', {
    lazy: true
  });

  api.addFiles('tests/top2.less', 'client', {isImport: true});

  api.addFiles('less_tests.js', 'client');
});
