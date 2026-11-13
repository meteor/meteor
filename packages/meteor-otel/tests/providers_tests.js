import { createServer } from 'node:http';
import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';
import {
  initOtel, shutdown, getInvocationSpan, getTracer, context, propagation, trace,
} from 'meteor/meteor-otel';

Tinytest.addAsync('meteor-otel - providers - init observes existing handlers and shutdown flushes OTLP', async test => {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, body: JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      res.end('{}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const overrides = {
    OTEL_HOST_METRICS_ENABLED: '0', OTEL_RUNTIME_METRICS_ENABLED: '0',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${server.address().port}/v1/traces`,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `http://127.0.0.1:${server.address().port}/v1/metrics`,
  };
  const original = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  Meteor.methods({ 'otel.provider': function () {
    const span = getInvocationSpan();
    test.isTrue(!!span);
    return getTracer('manual').startActiveSpan('explicit-child', {},
      // Explicit parenting is needed because the observer never mutates context.
      // Use the same OTel API registry as the package.
      span ? trace.setSpan(context.active(), span) : context.active(), child => {
        const headers = {};
        propagation.inject(context.active(), headers);
        test.isTrue(typeof headers.traceparent === 'string');
        test.matches(headers.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
        child.end();
        return 42;
      });
  } });
  try {
    const providers = initOtel({ serviceName: 'otel-test' });
    test.equal(initOtel().tracerProvider, providers.tracerProvider);
    test.equal(await Meteor.callAsync('otel.provider'), 42);
    const firstShutdown = shutdown();
    test.equal(shutdown(), firstShutdown);
    await firstShutdown;
    const spans = requests.filter(r => r.url === '/v1/traces').flatMap(r => r.body.resourceSpans).flatMap(r => r.scopeSpans).flatMap(s => s.spans);
    test.equal(spans.filter(s => s.name === 'method:otel.provider').length, 1);
    test.equal(spans.filter(s => s.name === 'explicit-child').length, 1);
    test.isTrue(requests.some(r => r.url === '/v1/metrics'));
    test.isUndefined(getInvocationSpan());
    test.throws(() => initOtel());
  } finally {
    await shutdown();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise(resolve => server.close(resolve));
  }
});
