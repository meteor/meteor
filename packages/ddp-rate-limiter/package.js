Package.describe({
  name: 'ddp-rate-limiter',
  version: '1.2.1-beta300.3',
  // Brief, one-line summary of the package.
  summary: 'The DDPRateLimiter allows users to add rate limits to DDP' +
  ' methods and subscriptions.',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md',
});

Package.onUse(function(api) {
  api.use('rate-limit', 'server');
  api.use('ecmascript');
  api.addAssets('ddp-rate-limiter.d.ts', 'server');
  api.export('DDPRateLimiter', 'server');
  api.mainModule('ddp-rate-limiter.js', 'server');
});

Package.onTest(function(api) {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'check',
           'ddp', 'ecmascript', 'es5-shim']);
  api.use('ddp-rate-limiter');

  api.mainModule('ddp-rate-limiter-test-service.js', 'server');
  api.mainModule('ddp-rate-limiter-tests.js', 'client');
});
