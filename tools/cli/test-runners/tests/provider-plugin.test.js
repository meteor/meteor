const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = global.test || require('node:test');

const {
  createRegisterTestRunner,
} = require('../../../isobuild/test-runner-plugin.js');
const {
  clearTestRunnerContext,
  getTestRunnerBuildOptions,
  setTestRunnerContext,
} = require('../../../tool-env/test-runner-context.js');
const {
  createTestRunnerContext,
} = require('../provider-contract.js');
const {
  collectTestRunnerLocalPackages,
} = require('../local-packages.js');

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

test('provider fixture receives sorted physical package entries with source provenance', async t => {
  const harness = makeHarness();
  const repositoryRoot = path.resolve(__dirname, '../../../..');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-provider-packages-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const appPackageRoot = path.join(temporaryRoot, 'app', 'packages', 'cards');
  const externalPackageRoot = path.join(temporaryRoot, 'external', 'notes');
  fs.mkdirSync(appPackageRoot, { recursive: true });
  fs.mkdirSync(externalPackageRoot, { recursive: true });
  const meteorRoot = path.join(repositoryRoot, 'packages/meteor');
  const trackerRoot = path.join(repositoryRoot, 'packages/tracker');
  const missingRoot = path.join(repositoryRoot, 'packages/not-present');
  let receivedContext;
  harness.register(makeRegistration(), context => {
    receivedContext = context;
    return {};
  });

  const localCatalog = {
    async getAllPackageNames() {
      return ['tracker', 'notes', 'missing', 'meteor', 'cards'];
    },
    getPackageSource(name) {
      return {
        cards: { sourceRoot: appPackageRoot },
        notes: { sourceRoot: externalPackageRoot },
        tracker: { sourceRoot: path.relative(process.cwd(), trackerRoot) },
        missing: { sourceRoot: path.relative(process.cwd(), missingRoot) },
        meteor: { sourceRoot: path.relative(process.cwd(), meteorRoot) },
      }[name];
    },
  };
  const context = createTestRunnerContext({
    command: 'test-packages',
    localPackages: await collectTestRunnerLocalPackages(localCatalog, {
      exists: fs.existsSync,
      pathIsAbsolute: path.isAbsolute,
      pathRelative: path.relative,
      pathResolve: path.resolve,
    }, {
      checkoutPackageRoots: [path.join(repositoryRoot, 'packages')],
      selectedPackageNames: ['tracker'],
    }),
  });
  harness.isopack.testRunnerProviders[0].factory(context);

  assert.deepEqual(receivedContext.localPackages, [
    { name: 'cards', sourceRoot: appPackageRoot, sourceKind: 'project' },
    { name: 'meteor', sourceRoot: meteorRoot, sourceKind: 'checkout' },
    { name: 'notes', sourceRoot: externalPackageRoot, sourceKind: 'project' },
    { name: 'tracker', sourceRoot: trackerRoot, sourceKind: 'test-target' },
  ]);
  assert.equal(Object.isFrozen(receivedContext.localPackages), true);
});
