Package.describe({
  summary: "Meteor UI Components framework"
});

Package.on_use(function (api) {
  api.use('underscore', 'client');

  api.add_files(['chunk.js', 'component.js', 'html_builder.js'],
                'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('ui');
  api.use(['test-helpers', 'domutils'], 'client');

//  api.add_files([
//    'component_tests.js'
//  ], 'client');
});
