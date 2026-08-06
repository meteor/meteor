const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRegisterTestRunner,
} = require('../../../isobuild/test-runner-plugin.js');
const {
  clearTestRunnerContext,
  getTestRunnerBuildOptions,
  setTestRunnerContext,
} = require('../../../tool-env/test-runner-context.js');

function makeRegistration(overrides = {}) {
  return {
    id: 'example',
    apiVersion: 1,
    activationPackages: ['example:test-runtime'],
    ...overrides,
  };
}

function makeHarness({ featureEnabled = true } = {}) {
  const errors = [];
  const isopack = {
    testRunnerProviders: [],
    featureEnabled(name) {
      return featureEnabled && name === 'isobuild:test-runner-plugin';
    },
  };
  return {
    errors,
    isopack,
    register: createRegisterTestRunner({
      isopack,
      buildmessage: {
        error(message) {
          errors.push(message);
        },
      },
    }),
  };
}

test('registration requires isobuild:test-runner-plugin feature', () => {
  const harness = makeHarness({ featureEnabled: false });
  harness.register(makeRegistration(), () => ({ run() {} }));

  assert.equal(harness.isopack.testRunnerProviders.length, 0);
  assert.match(harness.errors[0], /api\.use\('isobuild:test-runner-plugin@1\.0\.0'\)/);
});

test('registration rejects malformed descriptors and factories', () => {
  const cases = [
    [makeRegistration({ id: '' }), () => ({}), /non-empty id/],
    [makeRegistration({ id: 'Not Organic' }), () => ({}), /lowercase/],
    [makeRegistration({ apiVersion: 2 }), () => ({}), /apiVersion 1/],
    [makeRegistration({ activationPackages: [] }), () => ({}), /activationPackages/],
    [makeRegistration({ activationPackages: [''] }), () => ({}), /activationPackages/],
    [makeRegistration({ incompatiblePackages: {} }), () => ({}), /incompatiblePackages.*array/],
    [makeRegistration({ incompatiblePackages: [null] }), () => ({}), /incompatiblePackages.*name/],
    [makeRegistration({
      incompatiblePackages: [{ name: 'legacy:test-runtime', driverPackage: '' }],
    }), () => ({}), /incompatiblePackages.*driverPackage/],
    [makeRegistration({
      incompatiblePackages: [
        { name: 'legacy:test-runtime', driverPackage: 'legacy:driver' },
        { name: 'legacy:test-runtime', driverPackage: 'other:driver' },
      ],
    }), () => ({}), /incompatiblePackages.*unique names/],
    [makeRegistration(), null, /factory function/],
  ];

  for (const [registration, factory, expected] of cases) {
    const harness = makeHarness();
    harness.register(registration, factory);
    assert.equal(harness.isopack.testRunnerProviders.length, 0);
    assert.match(harness.errors[0], expected);
  }
});

test('registration stores one immutable lazy provider definition', () => {
  const harness = makeHarness();
  let factoryCalls = 0;
  const registration = makeRegistration({
    incompatiblePackages: [{
      name: 'legacy:test-runtime',
      driverPackage: 'legacy:driver',
    }],
  });
  const factory = () => {
    factoryCalls += 1;
    return {};
  };

  harness.register(registration, factory);
  registration.activationPackages.push('late:mutation');
  registration.incompatiblePackages[0].driverPackage = 'late:driver';
  registration.incompatiblePackages.push({
    name: 'late:test-runtime',
    driverPackage: 'late:driver',
  });

  assert.equal(factoryCalls, 0);
  assert.equal(harness.errors.length, 0);
  assert.equal(harness.isopack.testRunnerProviders.length, 1);
  assert.deepEqual(harness.isopack.testRunnerProviders[0].registration, {
    id: 'example',
    apiVersion: 1,
    activationPackages: ['example:test-runtime'],
    incompatiblePackages: [{
      name: 'legacy:test-runtime',
      driverPackage: 'legacy:driver',
    }],
  });
  assert.equal(Object.isFrozen(
    harness.isopack.testRunnerProviders[0].registration.activationPackages
  ), true);
  assert.equal(Object.isFrozen(
    harness.isopack.testRunnerProviders[0].registration.incompatiblePackages
  ), true);
  assert.equal(Object.isFrozen(
    harness.isopack.testRunnerProviders[0].registration.incompatiblePackages[0]
  ), true);
  assert.equal(harness.isopack.testRunnerProviders[0].factory, factory);
});

test('duplicate provider id in one isopack is rejected', () => {
  const harness = makeHarness();
  harness.register(makeRegistration(), () => ({}));
  harness.register(makeRegistration(), () => ({}));

  assert.equal(harness.isopack.testRunnerProviders.length, 1);
  assert.match(harness.errors[0], /already registered/);
});

test('command test-runner context is deeply frozen, scoped, and JSON-safe', () => {
  clearTestRunnerContext();
  const input = {
    providerId: 'example',
    buildPluginOptions: {
      rspack: { test: { mode: 'server' } },
    },
  };

  setTestRunnerContext(input);
  input.buildPluginOptions.rspack.test.mode = 'browser';

  const options = getTestRunnerBuildOptions('rspack');
  assert.deepEqual(options, { test: { mode: 'server' } });
  assert.equal(Object.isFrozen(options), true);
  assert.equal(Object.isFrozen(options.test), true);

  clearTestRunnerContext();
  assert.equal(getTestRunnerBuildOptions('rspack'), undefined);
  assert.throws(
    () => setTestRunnerContext({ buildPluginOptions: { rspack: { fn() {} } } }),
    /JSON-safe/
  );
});
