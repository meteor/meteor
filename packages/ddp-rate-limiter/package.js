Package.describe({
  name: 'ddp-rate-limiter',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'The DDPRateLimiter allows users to add rate limits to DDP' +
  ' methods and subscriptions.',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
//  api.versionsFrom('1.1.0.2');
  api.use('rate-limit');
  api.export('DDPRateLimiter');
  api.addFiles('ddp-rate-limiter.js');
});

Package.onTest(function(api) {
  api.use('underscore');
  api.use('ddp-rate-limiter');
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'underscore', 'check',
           'ddp']);
  api.addFiles('ddp-rate-limiter-test-service.js', 'server');
  api.addFiles('ddp-rate-limiter-server-tests.js', 'server');
  api.addFiles('ddp-rate-limiter-tests.js', 'client');
});
