Package.describe({
  summary: "Meteor UI Components framework"
});

Package.on_use(function (api) {
  api.use('deps');
  api.use('random');
  api.use('domutils');
  api.use('underscore');
  api.use('ejson');
  api.use('ordered-dict');

  api.add_files(['base.js',
                 'lifecycle.js',
                 'tree.js',
                 'attrs.js', 'render.js', 'dom.js',
                 'forms.js',
                 'each.js',
                 'components.js',
                 'lookup.js'], ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('ui');
  api.use(['test-helpers', 'domutils'], 'client');

//  api.add_files([
//    'component_tests.js'
//  ], 'client');
});
