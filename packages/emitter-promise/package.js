Package.describe({
  name: 'emitter-promise',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'Implements functionality for use eventEmitter to resolve promise.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/meteor/meteor',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: null
});

Package.onUse(function(api) {
  api.use([
    'ecmascript'
  ]);
  api.addFiles('emitter-promise.js');
  api.export('EmitterPromise');
});

Package.onTest(function(api) {
  api.use('emitter-promise', 'server');
  api.use(['tinytest', 'ecmascript']);
  api.addFiles('emitter-promise-tests.js', 'server');
});
