Package.describe({
  name: 'rate-limit',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use('underscore');
  api.addFiles('rate-limit.js');
  api.export("RateLimiter");
});

Package.onTest(function(api) {
  api.use('test-helpers', ['client', 'server']);
  api.use('underscore');
  api.use('ddp-rate-limiter');
  api.use('tinytest');
  api.use('rate-limit');
  api.use('ddp-common');
  api.addFiles('rate-limit-tests.js');
});
