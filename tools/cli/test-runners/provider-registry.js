const TEST_RUNNER_FEATURE = 'isobuild:test-runner-plugin';
const TEST_RUNNER_API_VERSION = 1;
const {
  normalizeIncompatiblePackages,
} = require('../../isobuild/test-runner-plugin.js');

function runnerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function architectureMatches(actual, pattern) {
  return actual.startsWith(pattern) &&
    (actual.length === pattern.length || actual[pattern.length] === '.');
}

function referenceApplies(reference, architectures) {
  if (!architectures || architectures.length === 0 || !reference.arch) {
    return true;
  }
  return architectures.some(architecture =>
    architectureMatches(architecture, reference.arch)
  );
}

function hasStrongOrderedDependency(
  versionRecord,
  dependencyNames,
  architectures
) {
  const dependencies = versionRecord && versionRecord.dependencies;
  return Boolean(dependencies && dependencyNames.some(name => {
    const dependency = dependencies[name];
    return dependency && Array.isArray(dependency.references) &&
      dependency.references.some(reference =>
        !reference.weak &&
        !reference.unordered &&
        referenceApplies(reference, architectures)
      );
  }));
}

class TestRunnerProviderRegistry {
  constructor(definitions = []) {
    this._byId = new Map();
    for (const definition of definitions) {
      const { registration, factory } = definition || {};
      if (!registration || registration.apiVersion !== TEST_RUNNER_API_VERSION) {
        throw runnerError(
          'METEOR_TEST_RUNNER_API_VERSION',
          `Test runner provider from ${definition && definition.packageName || 'unknown package'} ` +
            `must use apiVersion ${TEST_RUNNER_API_VERSION}.`
        );
      }
      if (typeof factory !== 'function') {
        throw runnerError(
          'METEOR_TEST_RUNNER_INVALID_PROVIDER',
          `Test runner provider "${registration.id}" has no factory.`
        );
      }
      if (this._byId.has(registration.id)) {
        throw runnerError(
          'METEOR_TEST_RUNNER_DUPLICATE',
          `Test runner provider id "${registration.id}" is registered more than once.`
        );
      }
      let incompatiblePackages;
      try {
        incompatiblePackages = normalizeIncompatiblePackages(
          registration.incompatiblePackages
        );
      } catch (error) {
        throw runnerError(
          'METEOR_TEST_RUNNER_INVALID_PROVIDER',
          `Test runner provider "${registration.id}" ${error.message}.`
        );
      }
      const normalizedRegistration = Object.freeze({
        ...registration,
        ...(incompatiblePackages === undefined ? {} : {
          incompatiblePackages,
        }),
      });
      this._byId.set(registration.id, Object.freeze({
        ...definition,
        registration: normalizedRegistration,
      }));
    }
  }

  get(id) {
    return this._byId.get(id);
  }

  values() {
    return [...this._byId.values()];
  }
}

function driverSelection(command, source = 'legacy-default', driverPackage) {
  return Object.freeze({
    id: 'driver',
    engine: 'driver',
    driverPackage: driverPackage === undefined
      ? command === 'test-packages' ? 'test-in-browser' : null
      : driverPackage,
    source,
  });
}

function providerSelection(definition, source) {
  return Object.freeze({
    id: definition.registration.id,
    engine: 'provider',
    driverPackage: null,
    source,
    definition,
  });
}

function packageCommandName(name) {
  return name.replace(/^local-test:/, '');
}

function assertNoPackageConflicts(definition, testPackages, architectures) {
  const incompatiblePackages =
    definition.registration.incompatiblePackages || [];
  for (const entry of testPackages) {
    const conflict = incompatiblePackages.find(({ name }) =>
      hasStrongOrderedDependency(entry.version, [name], architectures)
    );
    if (!conflict) continue;

    const packageName = packageCommandName(entry.name);
    throw runnerError(
      'METEOR_TEST_RUNNER_PACKAGE_CONFLICT',
      `Selected package tests "${entry.name}" activate test runner ` +
        `"${definition.registration.id}" but also depend on incompatible ` +
        `test package "${conflict.name}". Migrate or remove tests using ` +
        `"${conflict.name}", remove that dependency, then run ` +
        `\`meteor test-packages ${packageName}\`; to run legacy tests now, use ` +
        `\`meteor test-packages ${packageName} --driver-package ` +
        `${conflict.driverPackage}\`.`
    );
  }
}

function selectedPolicy({ explicitTestRunner, envTestRunner, packageJsonMeteor }) {
  return [
    [explicitTestRunner, '--test-runner'],
    [envTestRunner, 'METEOR_TEST_RUNNER'],
    [packageJsonMeteor && packageJsonMeteor.testRunner,
      'package.json#meteor.testRunner'],
  ].find(([value]) => value != null);
}

function resolveFromRegistry({
  registry,
  command,
  explicitTestRunner,
  envTestRunner,
  packageJsonMeteor,
  appPackageNames = [],
  testPackages = [],
  architectures,
}) {
  const policy = selectedPolicy({
    explicitTestRunner,
    envTestRunner,
    packageJsonMeteor,
  });
  if (policy) {
    const [id, source] = policy;
    if (id === 'driver') {
      return driverSelection(command, source);
    }
    const definition = registry.get(id);
    if (!definition) {
      throw runnerError(
        'METEOR_TEST_RUNNER_INVALID',
        `Unknown test runner "${id}" from ${source}. ` +
          `Available providers: ${registry.values().map(value =>
            value.registration.id
          ).join(', ') || 'none'}.`
      );
    }
    if (command === 'test-packages' && testPackages.length > 0) {
      const unclaimed = testPackages.filter(entry =>
        !hasStrongOrderedDependency(
          entry.version,
          definition.registration.activationPackages,
          architectures
        )
      );
      if (unclaimed.length > 0) {
        throw runnerError(
          'METEOR_TEST_RUNNER_INCOMPATIBLE_PACKAGE',
          `Test runner "${id}" does not own selected package tests: ` +
            `${unclaimed.map(entry => entry.name).join(', ')}.`
        );
      }
      assertNoPackageConflicts(
        definition,
        testPackages,
        architectures
      );
    }
    return providerSelection(definition, source);
  }

  if (command === 'test') {
    const activated = registry.values().filter(definition =>
      definition.registration.activationPackages.some(packageName =>
        appPackageNames.includes(packageName)
      )
    );
    if (activated.length > 1) {
      throw runnerError(
        'METEOR_TEST_RUNNER_AMBIGUOUS',
        `Multiple test runner providers are active: ${activated.map(
          definition => definition.registration.id
        ).join(', ')}.`
      );
    }
    return activated.length === 1
      ? providerSelection(activated[0], 'atmosphere-package')
      : driverSelection(command);
  }

  if (testPackages.length === 0) {
    return driverSelection(command);
  }

  const claims = testPackages.map(entry => ({
    name: entry.name,
    providers: registry.values().filter(definition =>
      hasStrongOrderedDependency(
        entry.version,
        definition.registration.activationPackages,
        architectures
      )
    ),
  }));
  const ambiguous = claims.filter(claim => claim.providers.length > 1);
  if (ambiguous.length > 0) {
    throw runnerError(
      'METEOR_TEST_RUNNER_AMBIGUOUS',
      `Multiple test runner providers claim package tests: ${ambiguous.map(
        claim => claim.name
      ).join(', ')}.`
    );
  }
  const claimed = claims.filter(claim => claim.providers.length === 1);
  if (claimed.length === 0) {
    return driverSelection(command);
  }
  const ids = new Set(claimed.map(claim =>
    claim.providers[0].registration.id
  ));
  if (claimed.length !== claims.length || ids.size !== 1) {
    const ownership = claims.map(claim => claim.providers.length === 1
      ? `${claim.name} (${claim.providers[0].registration.id})`
      : `${claim.name} (driver)`
    ).join(', ');
    throw runnerError(
      'METEOR_TEST_RUNNER_MIXED_PACKAGES',
      'Selected package tests are owned by different test runner engines. ' +
        `Ownership: ${ownership}. Run each engine group separately.`
    );
  }
  assertNoPackageConflicts(
    claimed[0].providers[0],
    testPackages,
    architectures
  );
  return providerSelection(
    claimed[0].providers[0],
    'selected-package-metadata'
  );
}

async function resolveTestRunnerProvider(options) {
  const policy = selectedPolicy(options);
  if (policy && policy[0] === 'driver' && policy[1] === '--test-runner') {
    throw runnerError(
      'METEOR_TEST_RUNNER_DRIVER_OPTION',
      '--test-runner selects a registered test-runner provider. ' +
        'Use --driver-package <name> to select the Meteor driver route.'
    );
  }
  if (options.driverPackage) {
    if (policy && policy[0] !== 'driver') {
      throw runnerError(
        'METEOR_TEST_RUNNER_CONFLICT',
        `${policy[1]} ${policy[0]} conflicts with --driver-package. Remove one selection.`
      );
    }
    return driverSelection(
      options.command,
      '--driver-package',
      options.driverPackage
    );
  }
  if (policy && policy[0] === 'driver') {
    return driverSelection(options.command, policy[1]);
  }

  const definitions = await options.discoverProviders();
  const registry = new TestRunnerProviderRegistry(definitions);
  return resolveFromRegistry({ ...options, registry });
}

async function discoverTestRunnerProviders({
  projectContext,
  packageRecords,
  architectures,
}) {
  const candidates = packageRecords.filter(entry =>
    hasStrongOrderedDependency(
      entry.version,
      [TEST_RUNNER_FEATURE],
      architectures
    )
  );
  if (candidates.length === 0) {
    return [];
  }

  const isopacks = await projectContext.loadPackagePlugins(
    candidates.map(candidate => candidate.name)
  );
  const definitions = [];
  for (let index = 0; index < isopacks.length; index += 1) {
    const packageName = candidates[index].name;
    for (const provider of isopacks[index].testRunnerProviders || []) {
      definitions.push({
        packageName,
        registration: provider.registration,
        factory: provider.factory,
      });
    }
  }
  // Validate duplicate ids and API versions during discovery, before any
  // provider factory or test process can run.
  return new TestRunnerProviderRegistry(definitions).values();
}

module.exports = {
  TestRunnerProviderRegistry,
  discoverTestRunnerProviders,
  hasStrongOrderedDependency,
  resolveTestRunnerProvider,
};
