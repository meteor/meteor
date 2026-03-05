Package.describe({
  name: 'afs',
  version: '0.1.0',
  summary: 'Adaptive Federated Streams - Data source agnostic reactivity engine for Meteor',
  git: 'https://github.com/meteor/meteor.git',
  documentation: null,
});

Package.onUse(function (api) {
  api.versionsFrom(['3.0']);

  api.use([
    'ecmascript',
    'ejson',
    'random',
    'ddp',
    'tracker',
    'check',
    'minimongo',
    'diff-sequence',
    'mongo-id',
    'id-map',
    'callback-hook',
    'promise',
  ]);

  // Allow-deny is needed for FederatedCollection access control
  api.use('allow-deny');

  // Weak dependency on mongo - AFS works without it but integrates when available
  api.use('mongo', { weak: true });

  // Allow us to detect 'insecure' for allow/deny defaults
  api.use('insecure', { weak: true });

  // Allow us to detect 'autopublish' for automatic publishing
  api.use('autopublish', 'server', { weak: true });

  api.mainModule('afs-server.js', 'server');
  api.mainModule('afs-client.js', 'client');

  api.export('AFS');
});

Package.onTest(function (api) {
  api.use(['afs', 'ecmascript', 'tinytest', 'test-helpers', 'ejson', 'random', 'ddp', 'mongo', 'tracker']);
  api.addFiles('afs-tests.js', ['client', 'server']);
});
