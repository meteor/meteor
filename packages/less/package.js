Package.describe({
  name: 'less',
  version: '2.5.0_1',  // XXX BBP is this the right version number?
  summary: 'less???',  // XXX BBP do this
  documentation: null  // XXX BBP readme!
});

Package.registerBuildPlugin({
  name: "compileLessBatch",
  use: ['underscore'],
  sources: [
    'plugin/compile-less.js'
  ],
  npmDependencies: {
    // XXX BBP should we fork and delete some files?
    "less": "2.5.0"
  }
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
