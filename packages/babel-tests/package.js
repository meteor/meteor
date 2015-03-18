Package.describe({
  summary: "Tests for the babel package",
  version: '1.0.0'
});

// These tests are in their own package because putting them in the
// `babel` or `babel-plugin` packages would create a build-time
// circular dependency.  A package containing `.es` files can only be
// built after `babel` and `babel-plugin` are already built.

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('underscore');
  api.use('babel', 'server');
  api.use('babel-plugin');

  // Tests that call the transpiler (which is only possible on the server)
  // and look at the result.  We could put these in a JS file, but
  // multiline strings are so darn useful!
  api.addFiles('transpile-tests.es6', 'server');

  // Tests of runtime behavior.  These confirm that the runtime library
  // is functioning correctly, among other things.
  api.addFiles('run-tests.es6', ['server', 'client']);
});
