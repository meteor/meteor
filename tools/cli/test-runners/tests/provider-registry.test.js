const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TestRunnerProviderRegistry,
  discoverTestRunnerProviders,
  resolveTestRunnerProvider,
} = require('../provider-registry.js');

function definition(
  id,
  activationPackages = [`${id}:runtime`],
  registration = {}
) {
  return {
    packageName: `${id}:tooling`,
    registration: {
      id,
      apiVersion: 1,
      activationPackages,
      ...registration,
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

function dependencies(entries) {
  return {
    dependencies: Object.fromEntries(entries.map(([name, overrides = {}]) => [
      name,
      { references: [{ arch: 'os', ...overrides }] },
    ])),
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

test('explicit driver policy bypasses provider discovery', async () => {
  let discoveries = 0;
  const selected = await resolveTestRunnerProvider({
    command: 'test-packages',
    packageJsonMeteor: { testRunner: 'driver' },
    discoverProviders: async () => {
      discoveries += 1;
      return [definition('example')];
    },
  });

  assert.equal(selected.id, 'driver');
  assert.equal(selected.source, 'package.json#meteor.testRunner');
  assert.equal(discoveries, 0);
});

test('CLI test-runner selector accepts providers, not driver packages', async () => {
  await assert.rejects(resolveTestRunnerProvider({
    command: 'test',
    explicitTestRunner: 'driver',
    discoverProviders: async () => {
      throw new Error('driver policy must fail before provider discovery');
    },
  }), error => {
    assert.equal(error.code, 'METEOR_TEST_RUNNER_DRIVER_OPTION');
    assert.match(error.message, /--driver-package/);
    return true;
  });
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
  }), error => {
    assert.equal(error.code, 'METEOR_TEST_RUNNER_MIXED_PACKAGES');
    assert.match(error.message, /local-test:one/);
    assert.match(error.message, /local-test:two/);
    return true;
  });
});

test('provider-declared package conflicts fail before selecting one package', async () => {
  const provider = definition('example', undefined, {
    incompatiblePackages: [{
      name: 'legacy:test-runtime',
      driverPackage: 'legacy:driver',
    }],
  });
  const selectedPackage = {
    name: 'local-test:one',
    version: dependencies([
      ['example:runtime'],
      ['legacy:test-runtime'],
    ]),
  };

  for (const selector of [{}, { explicitTestRunner: 'example' }]) {
    await assert.rejects(resolveTestRunnerProvider({
      command: 'test-packages',
      testPackages: [selectedPackage],
      architectures: ['os.osx.arm64'],
      discoverProviders: async () => [provider],
      ...selector,
    }), error => {
      assert.equal(error.code, 'METEOR_TEST_RUNNER_PACKAGE_CONFLICT');
      assert.match(error.message, /local-test:one/);
      assert.match(error.message, /legacy:test-runtime/);
      assert.match(error.message, /Migrate or remove tests using/);
      assert.match(error.message, /meteor test-packages one/);
      assert.match(
        error.message,
        /meteor test-packages one --driver-package legacy:driver/
      );
      return true;
    });
  }
});

test('weak, unordered, and non-applicable conflicts do not reject provider ownership', async () => {
  const provider = definition('example', undefined, {
    incompatiblePackages: [{
      name: 'legacy:test-runtime',
      driverPackage: 'legacy:driver',
    }],
  });

  for (const conflictReference of [
    { weak: true },
    { unordered: true },
    { arch: 'web.browser' },
  ]) {
    const selected = await resolveTestRunnerProvider({
      command: 'test-packages',
      testPackages: [{
        name: 'local-test:one',
        version: dependencies([
          ['example:runtime'],
          ['legacy:test-runtime', conflictReference],
        ]),
      }],
      architectures: ['os.osx.arm64'],
      discoverProviders: async () => [provider],
    });
    assert.equal(selected.id, 'example');
  }
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
