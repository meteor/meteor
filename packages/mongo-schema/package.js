Package.describe({
  name: 'mongo-schema',
  version: '1.0.0',
  summary: 'Native schema validation for MongoDB collections',
  git: 'https://github.com/meteor/meteor',
  documentation: null,
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.use('mongo', { weak: true });
  api.use('tracker', { weak: true });

  api.mainModule('index.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('test-helpers');
  api.use('mongo');
  api.use('tracker');
  api.use('ejson');
  api.use('mongo-schema');
  api.use('random');

  api.addFiles('tests/types_tests.js');
  api.addFiles('tests/schema_errors_tests.js');
  api.addFiles('tests/schema_definition_tests.js');
  api.addFiles('tests/schema_clean_tests.js');
  api.addFiles('tests/schema_validate_tests.js');
  api.addFiles('tests/schema_context_tests.js');
  api.addFiles('tests/schema_jsonschema_tests.js');
  api.addFiles('tests/collection_integration_tests.js');
  api.addFiles('tests/migration_compat_tests.js');
});
