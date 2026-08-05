const assert = require('node:assert/strict');
const test = require('node:test');

const {
  hasStrongRstestDependency,
  resolvePackageTestRunner,
  resolveTestRunner,
} = require('../resolve.js');

test('explicit driver package always preserves driver route', () => {
  assert.deepEqual(resolveTestRunner({
    command: 'test',
    driverPackage: 'meteortesting:mocha',
    hasRstestPackage: true,
  }), {
    engine: 'driver',
    driverPackage: 'meteortesting:mocha',
    source: '--driver-package',
  });
});

test('explicit conflicting Rstest and driver selection fails', () => {
  assert.throws(
    () => resolveTestRunner({
      command: 'test',
      explicitTestRunner: 'rstest',
      driverPackage: 'meteortesting:mocha',
      hasRstestPackage: true,
    }),
    error => {
      assert.equal(error.code, 'METEOR_TEST_RUNNER_CONFLICT');
      assert.match(error.message, /--driver-package/);
      return true;
    }
  );
});

test('package configuration can opt out to existing driver behavior', () => {
  assert.deepEqual(resolveTestRunner({
    command: 'test-packages',
    packageJsonMeteor: { testRunner: 'driver' },
    hasRstestPackage: true,
  }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'package.json#meteor.testRunner',
  });
});

test('Rstest app capability selects Rstest only for app tests', () => {
  assert.deepEqual(resolveTestRunner({ command: 'test', hasRstestPackage: true }), {
    engine: 'rstest',
    driverPackage: 'rstest',
    source: 'atmosphere-package',
  });
  assert.deepEqual(resolveTestRunner({ command: 'test-packages', hasRstestPackage: true }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
});

test('apps without Rstest capability retain legacy selection', () => {
  assert.deepEqual(resolveTestRunner({ command: 'test', hasRstestPackage: false }), {
    engine: 'driver',
    driverPackage: null,
    source: 'legacy-default',
  });
  assert.deepEqual(resolveTestRunner({ command: 'test-packages', hasRstestPackage: false }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
});

test('selected package metadata enables Rstest only for strong dependencies', () => {
  assert.equal(hasStrongRstestDependency([{ dependencies: {
    rstest: { references: [{ arch: 'os' }, { arch: 'web.browser' }] },
  } }]), true);
  assert.equal(hasStrongRstestDependency([{ dependencies: {
    rstest: { references: [{ arch: 'os', weak: true }] },
  } }]), false);
  assert.equal(hasStrongRstestDependency([{ dependencies: {} }]), false);
});

test('package selection routes homogeneous Rstest packages through Rstest', () => {
  assert.deepEqual(resolvePackageTestRunner({
    selection: { engine: 'driver', source: 'legacy-default' },
    packages: [{
      name: 'local-test:modern',
      version: { dependencies: { rstest: { references: [{ arch: 'os' }] } } },
    }],
  }), {
    engine: 'rstest',
    driverPackage: 'rstest',
    source: 'selected-package-metadata',
  });
});

test('package selection rejects mixed Rstest and legacy package harnesses', () => {
  assert.throws(() => resolvePackageTestRunner({
    selection: { engine: 'driver', source: 'legacy-default' },
    packages: [
      {
        name: 'local-test:modern',
        version: { dependencies: { rstest: { references: [{ arch: 'os' }] } } },
      },
      {
        name: 'local-test:legacy',
        version: { dependencies: { tinytest: { references: [{ arch: 'os' }] } } },
      },
    ],
  }), error => {
    assert.equal(error.code, 'METEOR_TEST_RUNNER_MIXED_PACKAGES');
    assert.match(error.message, /local-test:modern/);
    assert.match(error.message, /local-test:legacy/);
    return true;
  });
});

test('explicit Rstest rejects package tests without Rstest dependency', () => {
  assert.throws(() => resolvePackageTestRunner({
    selection: { engine: 'rstest', source: '--test-runner' },
    packages: [{
      name: 'local-test:legacy',
      version: { dependencies: { tinytest: { references: [{ arch: 'os' }] } } },
    }],
  }), error => {
    assert.equal(error.code, 'METEOR_TEST_RUNNER_INCOMPATIBLE_PACKAGE');
    return true;
  });
});

test('package classification honors active architectures and ordered references', () => {
  const version = { dependencies: {
    rstest: { references: [
      { arch: 'os', weak: true },
      { arch: 'web.browser', unordered: true },
      { arch: 'web.cordova' },
    ] },
    tinytest: { references: [{ arch: 'os' }] },
  } };
  assert.deepEqual(resolvePackageTestRunner({
    selection: { engine: 'driver', source: 'legacy-default' },
    packages: [{ name: 'local-test:split', version }],
    architectures: ['os.osx.arm64'],
  }), {
    engine: 'driver',
    driverPackage: 'test-in-browser',
    source: 'legacy-default',
  });
  assert.deepEqual(resolvePackageTestRunner({
    selection: { engine: 'driver', source: 'legacy-default' },
    packages: [{ name: 'local-test:split', version }],
    architectures: ['web.cordova'],
  }), {
    engine: 'rstest',
    driverPackage: 'rstest',
    source: 'selected-package-metadata',
  });
});

test('automatic package selection rejects unknown and conflicting ownership', () => {
  for (const [version, expected] of [
    [{ dependencies: { ecmascript: { references: [{ arch: 'os' }] } } }, /unknown engines/],
    [{ dependencies: {
      rstest: { references: [{ arch: 'os' }] },
      tinytest: { references: [{ arch: 'os' }] },
    } }, /conflicting engines/],
  ]) {
    assert.throws(() => resolvePackageTestRunner({
      selection: { engine: 'driver', source: 'legacy-default' },
      packages: [{ name: 'local-test:ambiguous', version }],
      architectures: ['os.osx.arm64'],
    }), expected);
  }
});

test('explicit driver preserves precedence and warns for Rstest-owned packages', () => {
  const resolved = resolvePackageTestRunner({
    selection: {
      engine: 'driver',
      driverPackage: 'meteortesting:mocha',
      source: '--driver-package',
    },
    packages: [{
      name: 'local-test:modern',
      version: { dependencies: { rstest: { references: [{ arch: 'os' }] } } },
    }],
    architectures: ['os.osx.arm64'],
  });
  assert.equal(resolved.engine, 'driver');
  assert.equal(resolved.driverPackage, 'meteortesting:mocha');
  assert.match(resolved.warning, /local-test:modern/);
});

test('automatic compatibility selection chooses declared real Mocha driver', () => {
  assert.deepEqual(resolvePackageTestRunner({
    selection: { engine: 'driver', source: 'legacy-default' },
    packages: [{
      name: 'local-test:mocha-package',
      version: { dependencies: {
        'meteortesting:mocha': { references: [{ arch: 'os' }] },
      } },
    }],
    architectures: ['os.osx.arm64'],
  }), {
    engine: 'driver',
    driverPackage: 'meteortesting:mocha',
    source: 'legacy-default',
  });
});
