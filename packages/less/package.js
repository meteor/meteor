Package.describe({
  name: 'less',
  version: '2.5.0_3',
  summary: 'Leaner CSS language',
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "compileLessBatch",
  use: ['caching-compiler', 'ecmascript', 'underscore'],
  sources: [
    'plugin/compile-less.js'
  ],
  npmDependencies: {
    // Fork of 2.5.0, deleted large unused files in dist directory.
    "less": "https://github.com/meteor/less.js/tarball/8130849eb3d7f0ecf0ca8d0af7c4207b0442e3f6"
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
                'tests/imports/not-included.less',
                'tests/dir/in-dir.import.less',
                'tests/dir/in-dir2.import.less',
                'tests/dir/root.less',
                'tests/dir/subdir/in-subdir.import.less']);
  api.addFiles('tests/top2.less', 'client', {isImport: true});

  api.addFiles('less_tests.js', 'client');
});
