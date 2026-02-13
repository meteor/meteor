Package.describe({
  name: 'meteor-otel',
  version: '1.0.0',
  summary: 'OpenTelemetry instrumentation for Meteor applications',
  git: '',
  documentation: 'README.md',
});

Npm.depends({
  '@opentelemetry/api': '1.9.0',
  '@opentelemetry/api-logs': '0.206.0',
  '@opentelemetry/sdk-metrics': '2.1.0',
  '@opentelemetry/sdk-trace-node': '2.1.0',
  '@opentelemetry/sdk-logs': '0.206.0',
  '@opentelemetry/exporter-trace-otlp-http': '0.206.0',
  '@opentelemetry/exporter-metrics-otlp-http': '0.206.0',
  '@opentelemetry/exporter-logs-otlp-http': '0.206.0',
  '@opentelemetry/resources': '2.1.0',
  '@opentelemetry/semantic-conventions': '1.30.0',
  '@opentelemetry/host-metrics': '0.36.2',
  '@opentelemetry/instrumentation': '0.206.0',
  '@opentelemetry/instrumentation-runtime-node': '0.13.0',
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ddp-server', 'server');

  api.mainModule('server/index.js', 'server');
});

Package.onTest(function (api) {
  api.use([
    'meteor-otel',
    'tinytest',
    'ecmascript',
    'test-helpers',
  ]);

  api.addFiles('tests/config_tests.js', 'server');
  api.addFiles('tests/tracing_tests.js', 'server');
  api.addFiles('tests/metrics_tests.js', 'server');
  api.addFiles('tests/ddp_instrumentation_tests.js', 'server');
});
