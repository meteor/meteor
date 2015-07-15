Package.describe({
  name: 'less',
  version: '2.5.0_1',
  summary: 'Leaner CSS language',
  documentation: null  // XXX #BBPDocs
});

Package.registerBuildPlugin({
  name: "compileLessBatch",
  use: ['underscore'],
  sources: [
    'plugin/compile-less.js'
  ],
  npmDependencies: {
    // Fork of 2.5.0, deleted large unused files in dist directory.
    "less": "https://github.com/meteor/less.js/tarball/8130849eb3d7f0ecf0ca8d0af7c4207b0442e3f6",
    "lru-cache": "2.6.4"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
});

Package.onTest(function(api) {
  api.use('less');
  api.use(['tinytest', 'test-helpers']);
  api.addFiles(['tests/top.less',
                'tests/top2.less',
                'tests/top3.less',
                'tests/not-included.less',
                'tests/dir/in-dir.less',
                'tests/dir/in-dir2.less',
                'tests/dir/root.main.less',
                'tests/dir/subdir/in-subdir.less']);
  api.addFiles('less_tests.js', 'client');
});
