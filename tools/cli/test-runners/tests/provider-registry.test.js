const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TestRunnerProviderRegistry,
  discoverTestRunnerProviders,
  resolveTestRunnerProvider,
} = require('../provider-registry.js');

function definition(id, activationPackages = [`${id}:runtime`]) {
  return {
    packageName: `${id}:tooling`,
    registration: {
      id,
      apiVersion: 1,
      activationPackages,
    },
    factory: context => ({
      async validate() {},
      async prepare() {
        return { mode: 'native-only', metadata: { command: context.command } };
      },
    }),
  };
}

function dependency(name, overrides = {}) {
  return {
    dependencies: {
      [name]: { references: [{ arch: 'os', ...overrides }] },
    },
  };
}

test('explicit driver package bypasses provider discovery', async () => {
  let discoveries = 0;
  const selected = await resolveTestRunnerProvider({
    command: 'test',
    driverPackage: 'meteortesting:mocha',
    discoverProviders: async () => {
      discoveries += 1;
      return [definition('example')];
    },
  });

  assert.deepEqual(selected, {
    id: 'driver',
    engine: 'driver',
    driverPackage: 'meteortesting:mocha',
    source: '--driver-package',
  });
  assert.equal(discoveries, 0);
});

test('selector precedence chooses explicit, environment, then package config', async () => {
  const discoverProviders = async () => [definition('example'), definition('other')];
  const cases = [
    [{ explicitTestRunner: 'other', envTestRunner: 'example', packageJsonMeteor: { testRunner: 'example' } }, 'other', '--test-runner'],
    [{ envTestRunner: 'other', packageJsonMeteor: { testRunner: 'example' } }, 'other', 'METEOR_TEST_RUNNER'],
    [{ packageJsonMeteor: { testRunner: 'example' } }, 'example', 'package.json#meteor.testRunner'],
  ];

  for (const [selectors, id, source] of cases) {
    const selected = await resolveTestRunnerProvider({
      command: 'test',
      discoverProviders,
      ...selectors,
    });
    assert.equal(selected.id, id);
    assert.equal(selected.engine, 'provider');
    assert.equal(selected.source, source);
  }
});

test('no provider falls back to unchanged driver defaults', async () => {
  assert.deepEqual(await resolveTestRunnerProvider({
    command: 'test-packages',
    discoverProviders: async () => [],
  }), {
    id: 'driver',
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
});

test('unknown selector and conflicting driver selector fail generically', async () => {
  await assert.rejects(resolveTestRunnerProvider({
    command: 'test',
    explicitTestRunner: 'missing',
    discoverProviders: async () => [definition('example')],
  }), error => error.code === 'METEOR_TEST_RUNNER_INVALID');

  await assert.rejects(resolveTestRunnerProvider({
    command: 'test',
    driverPackage: 'meteortesting:mocha',
    explicitTestRunner: 'example',
    discoverProviders: async () => {
      throw new Error('discovery must not run');
    },
  }), error => error.code === 'METEOR_TEST_RUNNER_CONFLICT');
});

test('one activated app provider is selected automatically', async () => {
  const selected = await resolveTestRunnerProvider({
    command: 'test',
    appPackageNames: ['meteor', 'example:runtime'],
    discoverProviders: async () => [definition('example')],
  });
  assert.equal(selected.id, 'example');
  assert.equal(selected.source, 'atmosphere-package');
});

test('package provider must claim every selected package', async () => {
  const providers = [definition('example')];
  const claimed = { name: 'local-test:one', version: dependency('example:runtime') };
  const unclaimed = { name: 'local-test:two', version: dependency('tinytest') };

  const selected = await resolveTestRunnerProvider({
    command: 'test-packages',
    testPackages: [claimed],
    architectures: ['os.osx.arm64'],
    discoverProviders: async () => providers,
  });
  assert.equal(selected.id, 'example');
  assert.equal(selected.source, 'selected-package-metadata');

  await assert.rejects(resolveTestRunnerProvider({
    command: 'test-packages',
    testPackages: [claimed, unclaimed],
    architectures: ['os.osx.arm64'],
    discoverProviders: async () => providers,
  }), error => error.code === 'METEOR_TEST_RUNNER_MIXED_PACKAGES');
});

test('weak, unordered, and non-applicable dependencies do not activate provider', async () => {
  for (const version of [
    dependency('example:runtime', { weak: true }),
    dependency('example:runtime', { unordered: true }),
    dependency('example:runtime', { arch: 'web.browser' }),
  ]) {
    const selected = await resolveTestRunnerProvider({
      command: 'test-packages',
      testPackages: [{ name: 'local-test:one', version }],
      architectures: ['os.osx.arm64'],
      discoverProviders: async () => [definition('example')],
    });
    assert.equal(selected.id, 'driver');
  }
});

test('overlapping or duplicate providers are rejected', async () => {
  await assert.rejects(resolveTestRunnerProvider({
    command: 'test-packages',
    testPackages: [{
      name: 'local-test:one',
      version: {
        dependencies: {
          'shared:runtime': { references: [{ arch: 'os' }] },
        },
      },
    }],
    architectures: ['os.osx.arm64'],
    discoverProviders: async () => [
      definition('example', ['shared:runtime']),
      definition('other', ['shared:runtime']),
    ],
  }), error => error.code === 'METEOR_TEST_RUNNER_AMBIGUOUS');

  assert.throws(() => new TestRunnerProviderRegistry([
    definition('example'),
    definition('example'),
  ]), error => error.code === 'METEOR_TEST_RUNNER_DUPLICATE');
  assert.throws(() => new TestRunnerProviderRegistry([
    { ...definition('example'), registration: { ...definition('example').registration, apiVersion: 2 } },
  ]), error => error.code === 'METEOR_TEST_RUNNER_API_VERSION');
});

test('discovery loads only strong feature candidates and returns their registrations', async () => {
  const loaded = [];
  const records = [
    { name: 'example:tooling', version: dependency('isobuild:test-runner-plugin') },
    { name: 'weak:tooling', version: dependency('isobuild:test-runner-plugin', { weak: true }) },
    { name: 'ordinary', version: dependency('ecmascript') },
  ];
  const definitions = [definition('example')];
  const discovered = await discoverTestRunnerProviders({
    packageRecords: records,
    architectures: ['os.osx.arm64'],
    projectContext: {
      async loadPackagePlugins(names) {
        loaded.push(...names);
        return [{ testRunnerProviders: definitions.map(({ registration, factory }) => ({
          registration,
          factory,
        })) }];
      },
    },
  });

  assert.deepEqual(loaded, ['example:tooling']);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].packageName, 'example:tooling');
  assert.equal(discovered[0].registration.id, 'example');
});
