Package.describe({
  name: 'afs',
  version: '0.1.0',
  summary: 'Adaptive Federated Streams - Data source agnostic reactivity engine for Meteor',
  git: 'https://github.com/meteor/meteor.git',
  documentation: null,
});

Package.onUse(function (api) {
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

  // Mongo's stream provider extends AFS.StreamProvider at module-eval time,
  // so mongo must load *after* afs. We declare no edge to mongo here — the
  // mongo→afs weak edge alone is enough to express "mongo integrates with
  // afs when both are present." Adding an afs→mongo edge here would form a
  // package-level cycle that Meteor's linker refuses (a dependency cannot
  // be both `weak` and `unordered`).

  // Allow us to detect 'insecure' for allow/deny defaults
  api.use('insecure', { weak: true });

  // Allow us to detect 'autopublish' for automatic publishing
  api.use('autopublish', 'server', { weak: true });

  api.mainModule('afs-server.js', 'server');
  api.mainModule('afs-client.js', 'client');

  api.addFiles([
    'query/errors.js',
    'query/paths.js',
    'query/ast.js',
    'query/parse-selector.js',
    'query/parse-modifier.js',
    'query/parse-sort.js',
    'query/parse-projection.js',
    'query/round-trip.js',
    'query/match.js',
    'query/apply-modifier.js',
    'query/walk.js',
    'query/index.js',
  ], ['client', 'server']);

  api.export('AFS');
});

Package.onTest(function (api) {
  api.use(['afs', 'ecmascript', 'tinytest', 'ejson', 'random', 'ddp', 'mongo', 'tracker']);
  api.addFiles('tests/core.js', ['client', 'server']);
  api.addFiles('tests/crud.js', 'server');
  api.addFiles('tests/observe.js', 'server');
  api.addFiles('tests/stream-provider.js', 'server');
  api.addFiles('tests/ddp.js', 'server');
  api.addFiles('tests/adaptive.js', 'server');
  api.addFiles('tests/registry-idgen.js', ['client', 'server']);
  api.addFiles('tests/chaos.js', 'server');
  api.addFiles('tests/teardown.js', 'server');
  api.addFiles('tests/query-paths.js', ['client', 'server']);
  api.addFiles('tests/query-parse.js', ['client', 'server']);
  api.addFiles('tests/query-round-trip.js', 'server');
  api.addFiles('tests/query-match.js', 'server');
  api.addFiles('tests/query-modify.js', 'server');
  api.addFiles('tests/query-walk.js', ['client', 'server']);
  api.addFiles('tests/query-coverage.js', 'server');
});
