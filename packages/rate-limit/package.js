Package.describe({
  name: 'rate-limit',
  version: '1.0.9',
  // Brief, one-line summary of the package.
  summary: 'An algorithm for rate limiting anything',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md',
});

Package.onUse(function(api) {
  api.use('random');
  api.use('ecmascript');
  api.mainModule('rate-limit.js');
  api.export('RateLimiter');
});

Package.onTest(function(api) {
  api.use('test-helpers', ['client', 'server']);
  api.use('ecmascript');
  api.use('random');
  api.use('ddp-rate-limiter');
  api.use('tinytest');
  api.use('rate-limit');
  api.use('ddp-common');
  api.mainModule('rate-limit-tests.js');
});
