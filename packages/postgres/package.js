Package.describe({
  name: 'postgres',
  version: '0.1.0',
  summary: 'PostgreSQL as a first-class Meteor data source via AFS',
  git: 'https://github.com/meteor/meteor.git',
  documentation: null,
});

Npm.depends({
  'pg': '8.13.1',
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
    'promise',
    'logging',
    'allow-deny',
    'afs',
  ]);

  api.use(['insecure', 'autopublish'], { weak: true });

  api.mainModule('postgres-server.js', 'server');
  api.mainModule('postgres-client.js', 'client');

  api.export('Postgres');
});

Package.onTest(function (api) {
  api.use([
    'postgres',
    'ecmascript',
    'tinytest',
    'test-helpers',
    'ejson',
    'random',
    'ddp',
    'tracker',
    'minimongo',
  ]);
  api.addFiles('postgres-tests.js', 'server');
});
