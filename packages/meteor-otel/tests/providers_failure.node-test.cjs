// Run after Meteor has installed this package's Npm.depends:
// node --test packages/meteor-otel/tests/providers_failure.node-test.cjs
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const sdkRequire = createRequire(path.join(packageRoot, '.npm/package/package.json'));

// These server modules use named ESM imports plus exported functions. Resolve
// their actual SDK dependencies from Meteor's package-local install while
// replacing only the Meteor runtime event boundary in this standalone test.
function loadServerModule(filename, resolve, exports) {
  const source = readFileSync(path.join(packageRoot, 'server', filename), 'utf8')
    .replace(/import \{([^}]+)\} from '([^']+)';/g,
      (_, names, moduleName) => `const {${names}} = resolve(${JSON.stringify(moduleName)});`)
    .replace(/export function /g, 'function ');
  return new Function('resolve', `${source}\nreturn { ${exports.join(', ')} };`)(resolve);
}

function fixture() {
  const listeners = new Set();
  const Instrumentation = {
    on(type, listener) {
      const registration = { type, listener };
      listeners.add(registration);
      return { stop() { listeners.delete(registration); } };
    },
    currentContext() { return { kind: null, spanId: null }; },
  };
  const shutdowns = { meter: 0, tracer: 0 };
  const constructed = { meter: 0, tracer: 0 };
  const sdkMetrics = sdkRequire('@opentelemetry/sdk-metrics');
  const sdkTrace = sdkRequire('@opentelemetry/sdk-trace-node');
  class MeterProvider extends sdkMetrics.MeterProvider {
    constructor(options) {
      super(options);
      constructed.meter++;
    }
    async shutdown() {
      await super.shutdown();
      shutdowns.meter++;
    }
  }
  class NodeTracerProvider extends sdkTrace.NodeTracerProvider {
    constructor(options) {
      super(options);
      constructed.tracer++;
    }
    async shutdown() {
      await super.shutdown();
      shutdowns.tracer++;
    }
  }
  const observer = loadServerModule('ddp-instrumentation.js', name =>
    name === 'meteor/instrumentation' ? { Instrumentation } : sdkRequire(name),
  ['startInstrumentation']);
  const config = loadServerModule('config.js', sdkRequire, ['getConfig']);
  const api = loadServerModule('providers.js', name => {
    if (name === './config.js') return config;
    if (name === './ddp-instrumentation.js') return observer;
    if (name === '@opentelemetry/sdk-metrics') return { ...sdkMetrics, MeterProvider };
    if (name === '@opentelemetry/sdk-trace-node') return { ...sdkTrace, NodeTracerProvider };
    return sdkRequire(name);
  }, ['initOtel', 'shutdown', 'getInvocationSpan']);
  return { ...api, listeners, constructed, shutdowns };
}

function plugin(name, disabled, overrides = {}) {
  return {
    setTracerProvider() {},
    setMeterProvider() {},
    getConfig() { return { enabled: true }; },
    disable() { disabled.push(name); },
    ...overrides,
  };
}

const scenarios = {
  async registration() {
    const f = fixture();
    const disabled = [];
    const failure = new Error('plugin registration failed');
    const bad = plugin('bad', disabled, {
      setTracerProvider() { throw failure; },
    });
    assert.throws(() => f.initOtel({ instrumentations: [bad] }), error => error === failure);
    const shutdown = f.shutdown();
    assert.equal(f.shutdown(), shutdown, 'failed initialization retains one cleanup promise');
    await shutdown;
    assert.equal(f.listeners.size, 0, 'failed initialization removes lifecycle listeners');
    assert.deepEqual(disabled, ['bad']);
    assert.deepEqual(f.shutdowns, { meter: 1, tracer: 1 });
    assert.equal(f.getInvocationSpan(), undefined);
    assert.throws(() => f.initOtel(), /Already shut down/);
  },

  async endpoint() {
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'not a valid URL';
    const f = fixture();
    assert.throws(() => f.initOtel(), /Could not parse user-provided export URL/);
    await f.shutdown();
    assert.deepEqual(f.constructed, { meter: 1, tracer: 0 });
    assert.deepEqual(f.shutdowns, { meter: 1, tracer: 0 }, 'the allocated meter reader is shut down');
    assert.equal(f.listeners.size, 0);
    assert.throws(() => f.initOtel(), /Already shut down/);
  },

  async disable() {
    const f = fixture();
    const disabled = [];
    const failure = new Error('plugin disable failed');
    const first = plugin('first', disabled, {
      disable() { disabled.push('first'); throw failure; },
    });
    // The SDK accepts nested arrays of instrumentations as well.
    f.initOtel({ instrumentations: [first, [plugin('second', disabled)]] });
    assert.ok(f.listeners.size > 0, 'initialization attached lifecycle listeners');
    const shutdown = f.shutdown();
    assert.equal(f.shutdown(), shutdown);
    await assert.rejects(shutdown, error => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0].errors[0], failure);
      return true;
    });
    assert.deepEqual(disabled, ['first', 'second'], 'a failing disable does not skip later plugins');
    assert.equal(f.listeners.size, 0);
    assert.deepEqual(f.shutdowns, { meter: 1, tracer: 1 });
    assert.throws(() => f.initOtel(), /Already shut down/);
  },
};

if (process.argv[2]) {
  // Each scenario owns a fresh OTel global registry and once-per-process module
  // state. Avoid contacting an external collector; these cases create no data.
  scenarios[process.argv[2]]().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const { test } = require('node:test');
  for (const [scenario, description] of Object.entries({
    registration: 'failed plugin registration removes listeners and shuts down both providers',
    endpoint: 'invalid trace endpoint shuts down the already allocated meter provider',
    disable: 'throwing plugin disable still cleans remaining plugins and providers',
  })) {
    test(description, () => {
      const env = Object.fromEntries(Object.entries(process.env)
        .filter(([key]) => !key.startsWith('OTEL_')));
      const child = spawnSync(process.execPath, [__filename, scenario], {
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...env,
          OTEL_HOST_METRICS_ENABLED: '0',
          OTEL_RUNTIME_METRICS_ENABLED: '0',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
        },
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stdout + child.stderr);
    });
  }
}
