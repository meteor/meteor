Package.describe({
  name: 'meteor-otel',
  version: '1.0.0',
  summary: 'OpenTelemetry instrumentation for Meteor applications',
  git: 'https://github.com/meteor/meteor.git',
  documentation: 'README.md',
});

Npm.depends({
  '@opentelemetry/api': '1.9.0',
  '@opentelemetry/sdk-metrics': '2.1.0',
  '@opentelemetry/sdk-trace-node': '2.1.0',
  '@opentelemetry/sdk-trace-base': '2.1.0',
  '@opentelemetry/exporter-trace-otlp-http': '0.206.0',
  '@opentelemetry/exporter-metrics-otlp-http': '0.206.0',
  '@opentelemetry/resources': '2.1.0',
  '@opentelemetry/semantic-conventions': '1.30.0',
  '@opentelemetry/host-metrics': '0.36.2',
  '@opentelemetry/instrumentation': '0.206.0',
  '@opentelemetry/instrumentation-runtime-node': '0.13.0',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use(['ddp-server', 'instrumentation@0.0.1-beta360.1'], 'server');

  api.mainModule('server/index.js', 'server');
  api.types('meteor-otel.d.ts');
});

Package.onTest(function (api) {
  api.use([
    'meteor-otel',
    'tinytest',
    'ecmascript',
    'test-helpers',
    'instrumentation',
    'ddp-client',
    'ddp-server',
  ]);

  api.addFiles('tests/config_tests.js', 'server');
  api.addFiles('tests/lifecycle_tests.js', 'server');
  api.addFiles('tests/providers_tests.js', 'server');
});
