Package.describe({
  summary: "Meteor UI Components framework"
});

Package.on_use(function (api) {
  api.add_files(['chunk.js', 'component.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['test-helpers', 'dom-utils'], 'client');

//  api.add_files([
//    'component_tests.js'
//  ], 'client');
});
